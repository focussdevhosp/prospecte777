import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  getSubscription,
  handleCors,
  requireUserInternalOrApiKey,
} from "../_shared/auth.ts";


// Intelligent follow-up message templates based on context
const FOLLOW_UP_STRATEGIES = {
  // Day 1-2: Quick check-in
  early: [
    "Oi {empresa}! Vi que você ficou atolado(a), né? 😅 Sem pressa! Qualquer dúvida, tô por aqui!",
    "E aí, {empresa}! Conseguiu dar uma olhada no que conversamos? Posso te ajudar com alguma coisa?",
    "Opa! Passando rapidinho pra ver se surgiu alguma dúvida. Tô à disposição! 🙋",
  ],
  // Day 3-5: Value reminder
  mid: [
    "Oi {empresa}! Lembrei de você porque vi um case parecido com o seu. Empresas do segmento de {nicho} têm conseguido resultados incríveis. Bora conversar?",
    "{empresa}, tava pensando aqui... muita gente do seu setor enfrenta {dor_comum}. A gente pode resolver isso junto! Que tal um papo rápido?",
    "Ei {empresa}! Passando pra lembrar que tenho alguns horários essa semana. 15 minutinhos podem fazer diferença pro seu negócio! 🚀",
  ],
  // Day 7+: Last attempt
  late: [
    "{empresa}, última tentativa! 😊 Se não for o momento, tudo bem. Mas se quiser bater um papo sobre {beneficio}, me chama!",
    "Oi {empresa}! Sei que a rotina é corrida. Se mudar de ideia sobre {solucao}, estarei por aqui. Sucesso! 💪",
    "{empresa}, não quero ser chato(a), prometo! Só queria saber se posso ajudar de alguma forma. Qualquer coisa, é só chamar!",
  ],
  // Re-engagement after long silence
  reengagement: [
    "Oi {empresa}! Faz um tempinho que a gente conversou. Como estão as coisas por aí? Surgiu alguma novidade?",
    "{empresa}! Passando pra dar um oi e ver se posso ajudar com algo. Tivemos novidades que podem te interessar!",
    "E aí, {empresa}! Lembrei de você hoje. Como está o negócio? Bora tomar um café virtual? ☕",
  ],
};

// Common pain points by niche
const NICHE_PAIN_POINTS: Record<string, string> = {
  "Restaurantes": "dificuldade em atrair clientes nos dias de semana",
  "Salões de Beleza": "desafio de fidelizar clientes e preencher horários vagos",
  "Academias": "problema com retenção de alunos depois dos primeiros meses",
  "Clínicas Médicas": "agenda cheia de buracos e no-shows",
  "Imobiliárias": "leads frios que não respondem",
  "Pet Shops": "concorrência dos grandes marketplaces",
  "Escritórios de Advocacia": "dificuldade em captar clientes qualificados",
  "default": "desafio de crescer no mercado atual",
};

function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

function personalizeMessage(template: string, lead: any, settings: any): string {
  const niche = lead.niche || "seu segmento";
  const painPoint = NICHE_PAIN_POINTS[niche] || NICHE_PAIN_POINTS.default;
  
  return template
    .replace(/{empresa}/g, lead.business_name)
    .replace(/{nicho}/g, niche)
    .replace(/{dor_comum}/g, painPoint)
    .replace(/{beneficio}/g, "crescer seu negócio")
    .replace(/{solucao}/g, (settings.services_offered || ["nossas soluções"])[0]);
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  // O pg_cron chama esta função a cada 30 min mandando a anon key no
  // Authorization. Como o único caminho de auth era procurar essa key em
  // `hunter_api_token`, toda execução automática morria em 401 — nenhum
  // follow-up jamais foi disparado pelo agendamento.
  const auth = await requireUserInternalOrApiKey(req);
  if (auth.error) return auth.error;
  const ctx = auth.ctx;
  const supabase = ctx.supabase;

  try {
    // Chamada interna processa todo mundo; chamada de usuário, só a conta dele.
    let targets: any[] = [];

    if (ctx.kind === "internal") {
      const { data } = await supabase
        .from("user_settings")
        .select("*")
        .eq("whatsapp_connected", true);
      targets = data ?? [];
    } else {
      const { data } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", ctx.userId)
        .maybeSingle();
      targets = data ? [data] : [];
    }

    const now = new Date();
    const results = {
      users_processed: 0,
      checked: 0,
      sent: 0,
      skipped: 0,
      errors: 0,
      leads: [] as any[],
    };

    for (const settings of targets) {
      const userId = settings.user_id;
      results.users_processed++;

      // Quem não paga não dispara follow-up automático.
      const sub = await getSubscription(supabase, userId);
      if (!sub.active) {
        console.log(`Pulando ${userId}: ${sub.reason}`);
        continue;
      }

      // Cada usuário tem seu teto de envios por execução.
      let sentForUser = 0;

    // Find leads that need follow-up
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("*")
      .eq("user_id", userId)
      .in("stage", ["Contato", "Qualificado", "Proposta", "Negociação"])
      .order("last_contact_at", { ascending: true });

    if (leadsError) {
      console.error(`Falha ao buscar leads de ${userId}:`, leadsError.message);
      results.errors++;
      continue;
    }

    // Check if WhatsApp is connected
    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");
    const canSendWhatsApp = settings.whatsapp_connected && 
                            settings.whatsapp_instance_id && 
                            EVOLUTION_API_URL && 
                            EVOLUTION_API_KEY;

    // Get AI key for intelligent messages
    const DEEPSEEK_API_KEY = settings.deepseek_api_key || Deno.env.get("DEEPSEEK_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const AI_KEY = DEEPSEEK_API_KEY || LOVABLE_API_KEY;

    for (const lead of leads || []) {
      results.checked++;

      // Skip if lead responded after our last message
      if (lead.last_response_at) {
        const lastResponse = new Date(lead.last_response_at);
        const lastContact = new Date(lead.last_contact_at || lead.created_at);
        if (lastResponse > lastContact) {
          results.skipped++;
          continue; // Lead responded, skip
        }
      }

      // Calculate days since last contact
      const lastContact = new Date(lead.last_contact_at || lead.created_at);
      const daysSinceContact = Math.floor(
        (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Skip if too recent (less than 1 day)
      if (daysSinceContact < 1) {
        results.skipped++;
        continue;
      }

      // Skip if max follow-ups reached
      const followUpCount = lead.follow_up_count || 0;
      if (followUpCount >= 5) {
        console.log(`Lead ${lead.id} reached max follow-ups, marking as cold`);
        await supabase
          .from("leads")
          .update({ temperature: "frio" })
          .eq("id", lead.id);
        results.skipped++;
        continue;
      }

      // Determine follow-up strategy based on days and count
      let strategy: keyof typeof FOLLOW_UP_STRATEGIES;
      if (daysSinceContact <= 2) {
        strategy = "early";
      } else if (daysSinceContact <= 5) {
        strategy = "mid";
      } else if (daysSinceContact <= 14) {
        strategy = "late";
      } else {
        strategy = "reengagement";
      }

      // Check if we should follow up based on cadence
      const followUpDays = [1, 3, 5, 7, 14];
      if (!followUpDays.some(d => daysSinceContact >= d && daysSinceContact < d + 1)) {
        // Not in a follow-up window
        if (daysSinceContact < 14) {
          results.skipped++;
          continue;
        }
      }

      // Get chat history for context
      const { data: chatHistory } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("lead_id", lead.id)
        .order("sent_at", { ascending: false })
        .limit(5);

      let followUpMessage = "";

      // Try to generate intelligent message with AI
      if (AI_KEY && chatHistory && chatHistory.length > 0) {
        try {
          const lastMessages = chatHistory
            .reverse()
            .map(m => `${m.sender_type === "lead" ? "Cliente" : "Eu"}: ${m.content}`)
            .join("\n");

          const prompt = `Você é ${settings.agent_name || "um consultor de vendas"}.
${settings.agent_persona || ""}

O cliente ${lead.business_name} (${lead.niche || "negócio"}) não responde há ${daysSinceContact} dias.
Já foram feitos ${followUpCount} follow-ups anteriores.

Últimas mensagens:
${lastMessages}

Crie uma mensagem de follow-up CURTA (2-3 frases) que:
1. Seja natural e não pareça automática
2. NÃO repita abordagens anteriores
3. Traga algo novo ou diferente
4. Termine com uma pergunta simples
5. Use ${settings.emoji_usage === "frequente" ? "alguns emojis" : settings.emoji_usage === "moderado" ? "1-2 emojis" : "sem emojis"}

Responda APENAS com a mensagem.`;

          if (LOVABLE_API_KEY) {
            const aiResponse = await fetch(
              "https://ai.gateway.lovable.dev/v1/chat/completions",
              {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${LOVABLE_API_KEY}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                   model: "deepseek-chat",
                  messages: [{ role: "user", content: prompt }],
                  temperature: 0.9,
                }),
              }
            );

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              followUpMessage = aiData.choices?.[0]?.message?.content || "";
            }
          }
        } catch (e) {
          console.error("AI follow-up error:", e);
        }
      }

      // Fallback to template if AI failed
      if (!followUpMessage) {
        const templates = FOLLOW_UP_STRATEGIES[strategy];
        followUpMessage = personalizeMessage(getRandomItem(templates), lead, settings);
      }

      // Save follow-up message
      await supabase.from("chat_messages").insert({
        lead_id: lead.id,
        sender_type: "agent",
        content: followUpMessage,
        status: "pending",
      });

      // Send via WhatsApp if connected
      if (canSendWhatsApp) {
        try {
          let formattedPhone = lead.phone.replace(/\D/g, "");
          if (!formattedPhone.startsWith("55") && formattedPhone.length <= 11) {
            formattedPhone = "55" + formattedPhone;
          }

          // Random delay between messages (30-90 seconds)
          if (results.sent > 0) {
            const delay = Math.floor(Math.random() * 60000) + 30000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }

          const sendResponse = await fetch(
            `${EVOLUTION_API_URL}/message/sendText/${settings.whatsapp_instance_id}`,
            {
              method: "POST",
              headers: {
                "apikey": EVOLUTION_API_KEY!,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                number: formattedPhone,
                text: followUpMessage,
              }),
            }
          );

          if (sendResponse.ok) {
            console.log(`Follow-up sent to ${lead.business_name} (${lead.phone})`);
            
            await supabase
              .from("chat_messages")
              .update({ status: "sent" })
              .eq("lead_id", lead.id)
              .eq("content", followUpMessage);
          } else {
            console.error(`Failed to send to ${lead.phone}`);
            results.errors++;
          }
        } catch (e) {
          console.error("WhatsApp error:", e);
          results.errors++;
        }
      } else {
        console.log(`Would send to ${lead.phone}: ${followUpMessage.substring(0, 50)}...`);
      }

      // Update lead
      await supabase
        .from("leads")
        .update({
          last_contact_at: now.toISOString(),
          follow_up_count: followUpCount + 1,
          next_follow_up_at: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", lead.id);

      // Log activity
      await supabase.from("activity_log").insert({
        user_id: userId,
        lead_id: lead.id,
        activity_type: "follow_up_sent",
        description: `Follow-up #${followUpCount + 1} (${strategy}) enviado após ${daysSinceContact} dias`,
        metadata: { days_since_contact: daysSinceContact, strategy },
      });

      results.sent++;
      sentForUser++;
      results.leads.push({
        id: lead.id,
        business_name: lead.business_name,
        days_since_contact: daysSinceContact,
        follow_up_number: followUpCount + 1,
      });

      // Teto por usuário, não global: com o teto global, o primeiro usuário
      // da lista consumia a cota inteira e o resto nunca era atendido.
      if (sentForUser >= 10) {
        console.log(`Teto de 10 follow-ups atingido para ${userId}`);
        break;
      }
    }
    }

    console.log(`Follow-up completed: ${results.sent} sent, ${results.skipped} skipped, ${results.errors} errors`);

    return new Response(JSON.stringify({
      success: true,
      ...results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Follow-up error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

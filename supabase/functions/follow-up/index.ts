import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  getSubscription,
  handleCors,
  requireUserInternalOrApiKey,
} from "../_shared/auth.ts";
import { callAI, recordUsage } from "../_shared/ai.ts";
import { checkFactuality } from "../_shared/agents/quality-gate.ts";
import { buildConversationEvidence } from "../_shared/agents/conversation.ts";
import { decideFollowUp } from "../_shared/agents/follow-up-policy.ts";


// ============================================================
// OS NOVE TEXTOS FIXOS FORAM REMOVIDOS, NÃO SUBSTITUÍDOS
// ============================================================
// Um deles dizia: "Lembrei de você porque vi um case parecido com o seu.
// Empresas do segmento de {nicho} têm conseguido resultados incríveis."
// Um caso de sucesso e um resultado, os dois inventados, no código-fonte.
// Outro afirmava a dor do lead a partir de uma tabela por nicho —
// "muita gente do seu setor enfrenta {dor_comum}" — como se alguém tivesse
// perguntado a ele.
//
// E disparavam exatamente quando a IA falhava, ou seja, quando ninguém
// estava olhando. Não mandar nada custa um follow-up. Mandar aquilo custa a
// confiança do lead e, se ele conferir, a reputação de quem assina.


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
      // A cadência agora decide, então "pulado" deixou de contar a história
      // toda: encerrar por recusa e transferir para uma pessoa são desfechos,
      // não ausência de ação.
      closed: 0,
      escalated: 0,
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

    // Só a conexão importa aqui. Quem sabe se a Evolution está configurada é
    // o `whatsapp-send`, e ele responde 503 quando não está — não cabe a esta
    // função ter opinião própria sobre isso.
    const canSendWhatsApp = Boolean(
      settings.whatsapp_connected && settings.whatsapp_instance_id,
    );

    for (const lead of leads || []) {
      results.checked++;

      const lastContact = new Date(lead.last_contact_at || lead.created_at);
      const daysSinceContact = Math.floor(
        (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
      );
      const followUpCount = lead.follow_up_count || 0;

      // ---- O QUE O LEAD JÁ DISSE ----
      const { data: memories } = await supabase
        .from("lead_memory")
        .select("memory_type, key, value, confidence")
        .eq("lead_id", lead.id)
        .limit(20);

      // ---- DECIDIR ANTES DE ESCREVER ----
      // A regra antiga era só calendário: passou 1, 3, 5, 7 ou 14 dias, manda
      // mais uma. Nada olhava o que o lead tinha respondido — e o resultado
      // era a cobrança que todo mundo já recebeu: a pessoa escreve "me chama
      // em setembro" e leva três mensagens em agosto.
      const decision = decideFollowUp({
        now,
        daysSinceContact,
        followUpCount,
        maxFollowUps: 5,
        repliedAfterLastContact: Boolean(
          lead.last_response_at && new Date(lead.last_response_at) > lastContact,
        ),
        memories,
        temperature: lead.temperature,
      });

      if (decision.action === "esperar") {
        results.skipped++;
        if (decision.waitUntil) {
          await supabase
            .from("leads")
            .update({ next_follow_up_at: decision.waitUntil.toISOString() })
            .eq("id", lead.id);
        }
        continue;
      }

      if (decision.action === "encerrar") {
        results.closed++;
        await supabase
          .from("leads")
          .update({ temperature: "frio", next_follow_up_at: null })
          .eq("id", lead.id);

        await supabase.from("activity_log").insert({
          user_id: userId,
          lead_id: lead.id,
          activity_type: "follow_up_closed",
          description: `Cadência encerrada: ${decision.reason}`,
        });
        continue;
      }

      if (decision.action === "transferir") {
        results.escalated++;
        await supabase.from("agent_escalations").insert({
          user_id: userId,
          lead_id: lead.id,
          escalation_reason: "closing_opportunity",
          priority: "high",
          context: decision.reason,
          recommended_action: "Fale você com este lead — mais um follow-up automático desperdiça o melhor da carteira.",
          status: "pending",
        });

        await supabase
          .from("leads")
          .update({ next_follow_up_at: null })
          .eq("id", lead.id);
        continue;
      }

      // Get chat history for context
      const { data: chatHistory } = await supabase
        .from("chat_messages")
        .select("*")
        .eq("lead_id", lead.id)
        .order("sent_at", { ascending: false })
        .limit(5);

      let followUpMessage = "";

      // ---- ESCREVER ----
      // Passa pela camada comum de IA: provedor reserva, retentativa e
      // registro de custo. A versão anterior falava só com o gateway Lovable
      // e, se `LOVABLE_API_KEY` não existisse, caía direto no template sem
      // nem tentar — mesmo com o DeepSeek configurado.
      try {
        const lastMessages = (chatHistory ?? [])
          .slice()
          .reverse()
          .map((m) => `${m.sender_type === "lead" ? "Cliente" : "Eu"}: ${m.content}`)
          .join("\n");

        const memoriaTexto = (memories ?? [])
          .filter((m) => (m.confidence ?? 1) >= 0.7)
          .map((m) => `- [${m.memory_type}] ${m.key}: ${m.value}`)
          .join("\n");

        const prompt = `Você é ${settings.agent_name || "um consultor de vendas"}.
${settings.agent_persona || ""}

# A REGRA QUE VALE MAIS QUE TODAS AS OUTRAS
Só afirme o que estiver abaixo. NÃO invente estatística, percentual, valor,
caso de sucesso, cliente anterior nem resultado obtido. Se faltar material,
escreva menos. Curta e verdadeira é melhor que completa e inventada.

# O LEAD
- Empresa: ${lead.business_name}
- Nicho: ${lead.niche || "não identificado"}
- Sem responder há ${daysSinceContact} dias, após ${followUpCount} follow-up(s).

# O QUE ELE JÁ DISSE (use, é a diferença entre lembrar dele e cobrar)
${memoriaTexto || "Nada registrado ainda."}

# ÚLTIMAS MENSAGENS
${lastMessages || "Sem histórico."}

Escreva UM follow-up curto (2-3 frases) que:
1. não repita o que já foi dito acima;
2. traga um ângulo novo ou uma pergunta que ajude ELE, não você;
3. deixe claro que não tem problema não ter respondido;
4. ${settings.emoji_usage === "frequente" ? "use alguns emojis" : settings.emoji_usage === "moderado" ? "use no máximo 1 emoji" : "não use emoji"}.

Responda APENAS com a mensagem.`;

        const generated = await callAI({
          messages: [{ role: "user", content: prompt }],
          role: "primary",
          temperature: 0.9,
          max_tokens: 300,
          purpose: "follow_up",
        });

        await recordUsage(supabase, {
          userId,
          usage: generated.usage,
          purpose: "follow_up",
          leadId: lead.id,
          agent: "follow_up",
        });

        followUpMessage = generated.text.trim();
      } catch (e) {
        console.error("[follow-up] IA indisponível:", e);
      }

      // ---- NÃO EXISTE TEXTO DE RESERVA ----
      // Aqui havia um sorteio entre nove frases fixas, e uma delas dizia
      // "vi um case parecido com o seu, empresas do segmento têm conseguido
      // resultados incríveis" — um caso de sucesso e um resultado, os dois
      // inventados, disparados justamente quando a IA falha, que é quando
      // ninguém está olhando. Outra afirmava a dor do lead a partir de uma
      // tabela por nicho, como se alguém tivesse perguntado.
      //
      // Não mandar nada custa um follow-up. Mandar aquilo custa a confiança
      // do lead e, se ele conferir, a reputação de quem assina a mensagem.
      if (!followUpMessage) {
        results.skipped++;
        continue;
      }

      // ---- CONFERIR ANTES DE MANDAR ----
      const evidence = buildConversationEvidence({
        lead,
        memories,
        messages: chatHistory,
        portfolioCount: 0,
      });
      const factCheck = checkFactuality(followUpMessage, evidence);

      if (!factCheck.approved) {
        console.warn(
          `[follow-up] descartado para ${lead.business_name}: ` +
            factCheck.issues.filter((i) => i.severity === "block").map((i) => i.message).join(" | "),
        );
        results.skipped++;
        continue;
      }

      if (!canSendWhatsApp) {
        console.log(`[follow-up] WhatsApp indisponível; nada enviado para ${lead.phone}.`);
        results.skipped++;
        continue;
      }

      // ---- ENVIO PELO CAMINHO ÚNICO ----
      // Esta função também falava direto com a Evolution, e por isso não
      // consultava a lista de bloqueio nem a parada de emergência: o lead que
      // pediu "pare" continuava recebendo follow-up automático a cada rodada
      // do cron. O `whatsapp-send` já carrega blacklist, rotação de chip,
      // contagem por chip e checagem de conexão.
      //
      // Follow-up automático é automação por definição — o freio de
      // emergência precisa conseguir segurá-lo.
      let enviou = false;
      try {
        // Espaçamento entre envios: rajada é o que o WhatsApp lê como spam.
        if (results.sent > 0) {
          const delay = Math.floor(Math.random() * 60000) + 30000;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }

        const { error: sendError } = await supabase.functions.invoke("whatsapp-send", {
          body: {
            phone: lead.phone,
            message: followUpMessage,
            instance_id: settings.whatsapp_instance_id,
            user_id: userId,
            initiated_by: "automation",
          },
        });

        if (sendError) {
          console.error(`[follow-up] recusado para ${lead.phone}: ${sendError.message}`);
          results.errors++;
        } else {
          enviou = true;
        }
      } catch (e) {
        console.error("[follow-up] falha no envio:", e);
        results.errors++;
      }

      // A mensagem só entra no histórico depois de sair de verdade. Antes ela
      // era gravada como 'pending' e ficava lá mesmo quando o envio falhava —
      // o agente conversacional lia aquilo como se o lead tivesse recebido, e
      // a mensagem seguinte fazia referência a uma conversa que não houve.
      if (!enviou) continue;

      await supabase.from("chat_messages").insert({
        lead_id: lead.id,
        sender_type: "agent",
        content: followUpMessage,
        status: "sent",
      });

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
        description: `Follow-up #${followUpCount + 1} enviado após ${daysSinceContact} dias. ${decision.reason}`,
        metadata: {
          days_since_contact: daysSinceContact,
          follow_up_count: followUpCount + 1,
          decision: decision.action,
        },
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

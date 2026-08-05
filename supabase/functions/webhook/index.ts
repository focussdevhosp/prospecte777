import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, verifyWebhookSecret } from "../_shared/auth.ts";

// Fetch long-term memories for a lead
async function getLeadMemories(supabase: any, leadId: string): Promise<string> {
  const { data: memories } = await supabase
    .from("lead_memory")
    .select("memory_type, key, value, created_at")
    .eq("lead_id", leadId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (!memories || memories.length === 0) return "";

  const memoryGroups: Record<string, string[]> = {
    context: [],
    preference: [],
    commitment: [],
    personal: [],
    objection: [],
  };

  for (const m of memories) {
    const group = memoryGroups[m.memory_type] || memoryGroups.context;
    group.push(`- ${m.key}: ${m.value}`);
  }

  let memoryText = "";
  if (memoryGroups.personal.length > 0) {
    memoryText += "\n## Informações Pessoais do Lead\n" + memoryGroups.personal.join("\n");
  }
  if (memoryGroups.preference.length > 0) {
    memoryText += "\n## Preferências\n" + memoryGroups.preference.join("\n");
  }
  if (memoryGroups.commitment.length > 0) {
    memoryText += "\n## Compromissos/Promessas\n" + memoryGroups.commitment.join("\n");
  }
  if (memoryGroups.objection.length > 0) {
    memoryText += "\n## Objeções Anteriores\n" + memoryGroups.objection.join("\n");
  }
  if (memoryGroups.context.length > 0) {
    memoryText += "\n## Contexto Geral\n" + memoryGroups.context.join("\n");
  }

  return memoryText;
}

// Extract and save memories from conversation using AI
async function extractAndSaveMemories(
  supabase: any, 
  userId: string, 
  leadId: string, 
  messages: any[], 
  apiKey: string | null
): Promise<void> {
  if (!apiKey || messages.length < 2) return;

  try {
    const recentMessages = messages.slice(-10).map(m => 
      `${m.sender_type === "lead" ? "Cliente" : "Agente"}: ${m.content}`
    ).join("\n");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{
          role: "user",
          content: `Analise esta conversa e extraia informações importantes para lembrar sobre o cliente.
Retorne APENAS um JSON com arrays de objetos. Não inclua nada além do JSON.

Conversa:
${recentMessages}

Retorne este formato exato:
{
  "memories": [
    {"type": "personal", "key": "nome_contato", "value": "João"},
    {"type": "preference", "key": "horario_preferido", "value": "manhã"},
    {"type": "commitment", "key": "prometeu_retorno", "value": "ligar amanhã às 10h"},
    {"type": "objection", "key": "preocupacao_preco", "value": "achou caro inicialmente"},
    {"type": "context", "key": "interesse_servico", "value": "gestão de redes sociais"}
  ]
}

Tipos válidos: personal (nome, cargo), preference (horários, canais), commitment (promessas feitas), objection (objeções levantadas), context (interesses, necessidades)

Extraia apenas informações realmente mencionadas. Se não houver nada relevante, retorne {"memories": []}`
        }],
        max_tokens: 500,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      
      // Parse JSON from response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        const memories = parsed.memories || [];

        for (const mem of memories) {
          if (mem.type && mem.key && mem.value) {
            await supabase.rpc("upsert_lead_memory", {
              p_user_id: userId,
              p_lead_id: leadId,
              p_memory_type: mem.type,
              p_key: mem.key,
              p_value: mem.value,
              p_confidence: 0.9,
              p_source: "ai_analysis",
            });
          }
        }

        console.log(`Saved ${memories.length} memories for lead ${leadId}`);
      }
    }
  } catch (e) {
    console.error("Error extracting memories:", e);
  }
}

// Calculate days since first contact
function getDaysSinceFirstContact(firstContactAt: string | null): string {
  if (!firstContactAt) return "Primeiro contato";
  const days = Math.floor((Date.now() - new Date(firstContactAt).getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "Hoje";
  if (days === 1) return "Ontem";
  if (days < 7) return `${days} dias atrás`;
  if (days < 30) return `${Math.floor(days / 7)} semanas atrás`;
  return `${Math.floor(days / 30)} meses atrás`;
}

// Build comprehensive personality and behavior prompt
function buildAgentPrompt(settings: any, lead: any, conversationContext: any, longTermMemory: string = ""): string {
  const agentTypeDescriptions: Record<string, string> = {
    consultivo: "Você é um consultor que busca entender profundamente as necessidades antes de propor soluções. Faça perguntas abertas e escute ativamente.",
    agressivo: "Você é direto e focado em fechar negócios rapidamente. Crie senso de urgência, mas sem ser desrespeitoso.",
    amigavel: "Você prioriza construir relacionamento e confiança. Seja caloroso, use humor leve quando apropriado.",
    tecnico: "Você foca em detalhes técnicos e demonstra expertise profunda. Use dados e especificações.",
    empatico: "Você se coloca no lugar do cliente. Demonstre compreensão genuína das dores e desafios.",
  };

  const communicationDescriptions: Record<string, string> = {
    formal: "Use linguagem profissional e respeitosa. Evite gírias e coloquialismos.",
    casual: "Use tom descontraído e informal. Gírias leves são bem-vindas.",
    profissional: "Equilibre formalidade com acessibilidade. Seja respeitoso mas não rígido.",
    descontraido: "Seja muito informal, como se fosse um amigo. Use expressões do dia a dia.",
  };

  const emojiDescriptions: Record<string, string> = {
    nenhum: "Não use emojis em nenhuma circunstância.",
    minimo: "Use no máximo 1 emoji por mensagem, apenas no final.",
    moderado: "Use 2-3 emojis por mensagem para dar tom amigável.",
    frequente: "Use emojis frequentemente para expressividade e calor humano.",
  };

  const objectionDescriptions: Record<string, string> = {
    suave: "Quando houver objeção, valide o sentimento, aceite gentilmente e ofereça alternativas sem pressionar.",
    assertivo: "Contorne objeções com argumentos sólidos, dados e exemplos de sucesso.",
    persistente: "Não desista facilmente. Explore todas as possibilidades e mostre diferentes ângulos.",
  };

  // Get active personality traits
  const traits = (settings.personality_traits || [])
    .filter((t: any) => t.enabled)
    .map((t: any) => t.name)
    .join(", ");

  // Analyze conversation stage
  const messageCount = conversationContext.messageCount || 0;
  const lastLeadMessage = conversationContext.lastLeadMessage || "";
  const hasShownInterest = conversationContext.hasShownInterest || false;
  const mentionedPrice = conversationContext.mentionedPrice || false;
  const mentionedTime = conversationContext.mentionedTime || false;

  // Current date and time
  const now = new Date();
  const currentDate = now.toISOString().split('T')[0];
  const currentDateFormatted = now.toLocaleDateString('pt-BR', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const currentHour = now.getHours();

  // Time since first contact
  const timeSinceFirstContact = getDaysSinceFirstContact(lead.first_contact_at);

  return `# IDENTIDADE
Você é ${settings.agent_name || "um consultor de vendas"}, um ser humano real que trabalha como consultor.
${settings.agent_persona || ""}

# DATA E HORA ATUAL
- Data de HOJE: ${currentDateFormatted} (${currentDate})
- Hora atual: ${currentHour}h
- IMPORTANTE: Quando o cliente disser "hoje", use a data ${currentDate}. Quando disser "amanhã", some 1 dia.

# PERSONALIDADE
${agentTypeDescriptions[settings.agent_type] || agentTypeDescriptions.consultivo}
${communicationDescriptions[settings.communication_style] || communicationDescriptions.profissional}
${emojiDescriptions[settings.emoji_usage] || emojiDescriptions.moderado}
${traits ? `Seus traços marcantes: ${traits}` : ""}

# TRATAMENTO DE OBJEÇÕES
${objectionDescriptions[settings.objection_handling] || objectionDescriptions.assertivo}

# INFORMAÇÕES DO LEAD
- Nome da Empresa: ${lead.business_name}
- Nicho/Segmento: ${lead.niche || "Não identificado"}
- Localização: ${lead.location || "Não identificada"}
- Avaliação: ${lead.rating ? `${lead.rating} estrelas` : "N/A"}
- Status Atual: ${lead.stage} (${lead.temperature || "morno"})
- Primeiro contato: ${timeSinceFirstContact}
- Total de mensagens: ${lead.total_messages_exchanged || messageCount} mensagens trocadas

# MEMÓRIA DE LONGO PRAZO
IMPORTANTE: Use estas informações para personalizar a conversa. O cliente espera que você lembre de tudo que foi discutido anteriormente, mesmo que tenham passado semanas.
${longTermMemory || "Nenhuma memória anterior registrada."}

# SEUS SERVIÇOS
${(settings.services_offered || []).join(", ") || "Soluções personalizadas para negócios"}

# BASE DE CONHECIMENTO
${settings.knowledge_base || "Você oferece soluções que ajudam empresas a crescer e se destacar no mercado."}

# CONTEXTO DA CONVERSA ATUAL
${conversationContext.summary || "Primeiro contato ou conversa inicial."}

# SEU OBJETIVO PRINCIPAL
Seu objetivo é AGENDAR UMA REUNIÃO (call, videochamada ou presencial) com o lead.
Conduza a conversa naturalmente até chegar nesse ponto. Não force, mas guie.

# REGRAS DE COMPORTAMENTO HUMANIZADO

## ENTENDIMENTO
1. Leia TUDO que o lead escreve, mesmo mensagens curtas ou confusas
2. Se não entender, peça esclarecimento de forma natural
3. Considere gírias, abreviações, erros de digitação
4. Interprete o tom emocional (frustração, interesse, pressa, etc.)

## MEMÓRIA
1. NUNCA repita informações que você já disse
2. Lembre de tudo que foi mencionado na conversa
3. Faça referência a pontos anteriores quando relevante
4. Se o lead mencionou algo pessoal/importante, lembre depois

## NATURALIDADE
1. Varie o tamanho das respostas (às vezes curtas, às vezes médias)
2. Use expressões naturais: "hmm", "olha", "então", "pois é"
3. Não seja perfeito - humanos cometem pequenas hesitações
4. Responda de forma conversacional, não como um robô
5. Use o nome da empresa do lead ocasionalmente, não em toda mensagem

## ESTRATÉGIA DE ENGAJAMENTO
1. Faça 1 pergunta por mensagem (no máximo 2)
2. Ofereça valor antes de pedir algo
3. Compartilhe insights relevantes para o nicho
4. Mostre que você entende os desafios do setor

## LIDANDO COM RESPOSTAS CURTAS
Se o lead responder com "ok", "sim", "não", "talvez", etc:
- Não desanime, continue a conversa de forma natural
- Faça uma pergunta que exija mais elaboração
- Compartilhe algo interessante para reengajar

## LIDANDO COM OBJEÇÕES
"Não tenho tempo" → "Entendo perfeitamente! E se eu te mostrar em 15 minutinhos como [benefício]?"
"Está caro" → "Compreendo sua preocupação. O que você considera justo para [resultado esperado]?"
"Já tenho fornecedor" → "Que bom! E como tem sido a experiência? [demonstre curiosidade genuína]"
"Me manda por email" → "Claro! Mas antes, me conta um pouco mais sobre [necessidade] pra eu personalizar?"
"Não tenho interesse" → "Tudo bem! Só por curiosidade, o que seria útil pra você hoje?"

## FECHAMENTO PARA REUNIÃO
Quando sentir abertura, proponha de forma natural:
- "Que tal a gente bater um papo rápido de 15 minutos? Posso te mostrar como [benefício específico]"
- "Tenho alguns horários essa semana, qual funciona melhor pra você?"
- "Prefere uma call rápida ou videochamada?"

## FERRAMENTAS DISPONÍVEIS
Quando o lead CONFIRMAR data e hora para reunião, use a função scheduleMeeting.
Só use quando houver confirmação clara como: "pode ser quarta às 14h", "amanhã 10h tá bom", etc.

# RESPOSTA
Responda de forma natural e humanizada. Lembre-se: você é uma pessoa real tendo uma conversa real.
Seja conciso quando apropriado, mais elaborado quando necessário.
Adapte-se ao estilo de comunicação do lead.`;
}

// Analyze sentiment of lead messages using AI
async function analyzeSentiment(message: string, apiKey: string | null): Promise<'positive' | 'neutral' | 'negative'> {
  if (!apiKey) return 'neutral';

  const positivePatterns = /obrigad|perfeito|ótimo|excelente|adorei|gostei|interesse|quero|sim|pode|bom|maravilh|top|show|massa|legal|bacana|aceito|combinado|fechado|vamos|bora/i;
  const negativePatterns = /não quero|não preciso|não tenho interesse|para de|não me ligue|spam|bloquear|cancelar|desinscrever|chato|péssimo|ruim|nunca|jamais|desisto|esquece/i;
  
  if (negativePatterns.test(message)) return 'negative';
  if (positivePatterns.test(message)) return 'positive';
  
  // For ambiguous messages, use AI
  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [{
          role: "user",
          content: `Classifique o sentimento desta mensagem de um lead em uma conversa de vendas. Responda APENAS com: positive, neutral ou negative

Mensagem: "${message}"

Classificação:`
        }],
        max_tokens: 10,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      const result = data.choices?.[0]?.message?.content?.toLowerCase().trim();
      if (result?.includes('positive')) return 'positive';
      if (result?.includes('negative')) return 'negative';
    }
  } catch (e) {
    console.error("Sentiment analysis error:", e);
  }
  
  return 'neutral';
}

// Analyze conversation to extract context
async function analyzeConversation(messages: any[], apiKey: string | null): Promise<any> {
  const context = {
    messageCount: messages.length,
    lastLeadMessage: "",
    hasShownInterest: false,
    mentionedPrice: false,
    mentionedTime: false,
    mentionedCompetitor: false,
    isNegative: false,
    isPositive: false,
    summary: "",
    sentiment: 'neutral' as 'positive' | 'neutral' | 'negative',
  };

  if (messages.length === 0) return context;

  // Get last lead message
  const leadMessages = messages.filter(m => m.sender_type === "lead");
  if (leadMessages.length > 0) {
    context.lastLeadMessage = leadMessages[leadMessages.length - 1].content;
  }

  // Quick pattern analysis
  const allText = messages.map(m => m.content.toLowerCase()).join(" ");
  
  context.mentionedPrice = /preço|valor|cust|quanto custa|orçamento|barato|caro|investimento/i.test(allText);
  context.mentionedTime = /tempo|hora|dia|semana|quando|agora|depois|amanhã|hoje/i.test(allText);
  context.mentionedCompetitor = /outro|concorrente|já tenho|parceiro|fornecedor/i.test(allText);
  context.hasShownInterest = /interessante|gostei|quero|preciso|conte mais|como funciona|me explica/i.test(allText);
  
  // Negative signals
  const negativePatterns = /não quero|não preciso|não tenho interesse|para de|não me ligue|spam|bloquear/i;
  context.isNegative = negativePatterns.test(allText);
  
  // Positive signals
  const positivePatterns = /ótimo|perfeito|excelente|adorei|maravilha|top|show|massa|legal|bom/i;
  context.isPositive = positivePatterns.test(allText);

  // Generate summary if we have API key and enough messages
  if (apiKey && messages.length >= 3) {
    try {
      const conversationText = messages
        .slice(-10) // Last 10 messages
        .map(m => `${m.sender_type === "lead" ? "Cliente" : "Agente"}: ${m.content}`)
        .join("\n");

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [{
            role: "user",
            content: `Resuma em 2-3 frases o estado atual desta conversa de vendas. O que o cliente quer? Quais objeções teve? Está próximo de fechar?

${conversationText}

Resumo:`
          }],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        context.summary = data.choices?.[0]?.message?.content || "";
      }
    } catch (e) {
      console.error("Error generating summary:", e);
    }
  }

  return context;
}

// Update lead temperature and sentiment based on conversation analysis
async function updateLeadTemperature(leadId: string, context: any, supabase: any) {
  let newTemperature = "morno";
  
  if (context.isNegative || context.sentiment === 'negative') {
    newTemperature = "frio";
  } else if ((context.isPositive && context.hasShownInterest) || context.sentiment === 'positive') {
    newTemperature = "quente";
  } else if (context.hasShownInterest || context.mentionedPrice) {
    newTemperature = "quente";
  }

  // Determine analyzed_needs based on conversation
  const analyzedNeeds: any = {
    sentiment: context.sentiment,
    hasShownInterest: context.hasShownInterest,
    mentionedPrice: context.mentionedPrice,
    mentionedTime: context.mentionedTime,
    lastAnalyzed: new Date().toISOString(),
  };

  await supabase
    .from("leads")
    .update({ 
      temperature: newTemperature,
      conversation_summary: context.summary || null,
      analyzed_needs: analyzedNeeds,
    })
    .eq("id", leadId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Meta Lead Ads webhook verification (GET request)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token === "nexaprospect_meta_verify") {
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // A Evolution chama esta URL com `?s=<segredo>`, gravado na instância no
  // momento da conexão. Sem isso, qualquer um forjava resposta de lead e
  // fazia a IA responder (e gastar) por conta alheia.
  //
  // Instâncias conectadas antes desta mudança ainda não têm o segredo na
  // URL; elas são recadastradas sozinhas na próxima checagem de status feita
  // pelo app. Até lá seguem aceitas, e o log marca cada uma dessas.
  const authenticated = await verifyWebhookSecret(req);

  try {
    const body = await req.json();
    console.log("Webhook received:", JSON.stringify(body).substring(0, 500));

    // Meta Lead Ads webhook POST
    if (body.object === "page" && body.entry) {
      console.log("Meta Lead Ads webhook received");
      return new Response("OK", { status: 200, headers: corsHeaders });
    }

    if (!authenticated) {
      console.warn("[webhook] chamada sem segredo — instância legada aguardando recadastro");
    }

    // Support multiple webhook formats from Evolution API
    const remoteJid = body.data?.key?.remoteJid || "";
    
    // IGNORE GROUP MESSAGES - only respond to individual chats
    if (remoteJid.endsWith("@g.us") || remoteJid.includes("@g.us")) {
      console.log("Ignoring group message from:", remoteJid);
      return new Response(JSON.stringify({ status: "ignored_group_message" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let phone = body.phone || remoteJid.replace("@s.whatsapp.net", "") || "";
    let message = body.message || body.data?.message?.conversation || body.data?.message?.extendedTextMessage?.text || "";
    // Evolution API sends instance name as string in "instance" field
    const instanceId = body.instance_id || (typeof body.instance === 'string' ? body.instance : body.instance?.instanceName) || "";
    
    console.log("Extracted instanceId:", instanceId);

    // Clean phone number
    phone = phone.replace(/\D/g, "");
    
    if (!phone || !message) {
      console.log("Missing phone or message in webhook:", { phone: !!phone, message: !!message });
      return new Response(JSON.stringify({ error: "Missing phone or message" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Processing message from ${phone}: "${message.substring(0, 100)}..."`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find lead by phone number (try with and without country code)
    let lead = null;
    const phoneVariations = [phone, phone.replace(/^55/, ""), `55${phone}`];
    
    for (const phoneVar of phoneVariations) {
      const { data } = await supabase
        .from("leads")
        .select("*")
        .or(`phone.eq.${phoneVar},phone.ilike.%${phoneVar.slice(-9)}`)
        .limit(1)
        .single();
      
      if (data) {
        lead = data;
        break;
      }
    }

    // Get user by instance ID if lead not found
    let userId = lead?.user_id;
    let settings = null;

    if (!lead) {
      console.log("Lead not found for phone:", phone, "- will try to create automatically");
      
      // Find user by WhatsApp instance ID
      if (instanceId) {
        const { data: userSettings } = await supabase
          .from("user_settings")
          .select("*")
          .eq("whatsapp_instance_id", instanceId)
          .single();
        
        if (userSettings) {
          userId = userSettings.user_id;
          settings = userSettings;
          
          // Extract contact name from webhook data
          const contactName = body.data?.pushName || body.pushName || "Contato WhatsApp";
          
          // Create lead automatically
          const { data: newLead, error: createError } = await supabase
            .from("leads")
            .insert({
              user_id: userId,
              phone: phone.startsWith("55") ? phone : `55${phone}`,
              business_name: contactName,
              source: "whatsapp_inbound",
              stage: "Contato",
              temperature: "morno",
              notes: "Lead criado automaticamente via mensagem recebida no WhatsApp",
            })
            .select()
            .single();
          
          if (createError) {
            console.error("Error creating lead:", createError);
            return new Response(JSON.stringify({ error: "Failed to create lead" }), {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            });
          }
          
          lead = newLead;
          console.log(`Lead created automatically: ${lead.id} for ${phone}`);
          
          // Log activity
          await supabase.from("activity_log").insert({
            user_id: userId,
            lead_id: lead.id,
            activity_type: "lead_created",
            description: `Lead "${contactName}" criado automaticamente via mensagem recebida`,
            metadata: { phone, source: "whatsapp_inbound" },
          });
        }
      }
      
      // If still no lead found, return
      if (!lead) {
        console.log("Could not find user or create lead for phone:", phone);
        return new Response(JSON.stringify({ status: "lead_not_found_no_user" }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Get user settings if not already fetched
    if (!settings) {
      const { data: userSettings, error: settingsError } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", userId)
        .single();

      if (settingsError || !userSettings) {
        console.error("User settings not found:", settingsError);
        return new Response(JSON.stringify({ error: "User settings not found" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      settings = userSettings;
    }

    // Save incoming message
    await supabase.from("chat_messages").insert({
      lead_id: lead.id,
      sender_type: "lead",
      content: message,
      status: "delivered",
    });

    // Update lead's last response time and message count
    const messageCountUpdate = (lead.total_messages_exchanged || 0) + 1;
    await supabase
      .from("leads")
      .update({ 
        last_response_at: new Date().toISOString(),
        follow_up_count: 0, // Reset follow-up count since they responded
        first_contact_at: lead.first_contact_at || new Date().toISOString(),
        total_messages_exchanged: messageCountUpdate,
      })
      .eq("id", lead.id);

    // Fire intent-pipeline for automatic stage movement (fire-and-forget)
    if (userId && lead.id && message) {
      supabase.functions.invoke("intent-pipeline", {
        body: { lead_id: lead.id, message, user_id: userId },
      }).catch((e: any) => console.error("Intent pipeline invoke error:", e));
    }

    // Get full chat history for memory
    const { data: chatHistory } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("lead_id", lead.id)
      .order("sent_at", { ascending: true })
      .limit(50); // Get more history for better memory

    const messages = chatHistory || [];

    // Analyze conversation context
    const DEEPSEEK_API_KEY = settings.deepseek_api_key || Deno.env.get("DEEPSEEK_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const AI_KEY = DEEPSEEK_API_KEY || LOVABLE_API_KEY;

    const conversationContext = await analyzeConversation(messages, LOVABLE_API_KEY);

    // Get long-term memory for this lead
    const longTermMemory = await getLeadMemories(supabase, lead.id);
    console.log(`Long-term memory for ${lead.id}: ${longTermMemory.length} chars`);

    // Extract and save new memories from this conversation (async, don't wait)
    extractAndSaveMemories(supabase, userId, lead.id, messages, LOVABLE_API_KEY);

    // Format chat history for AI (last 20 messages for context)
    const formattedHistory = messages.slice(-20).map((msg) => ({
      role: msg.sender_type === "lead" ? "user" : "assistant",
      content: msg.content,
    }));

    // Build comprehensive agent prompt with long-term memory
    const systemPrompt = buildAgentPrompt(settings, lead, conversationContext, longTermMemory);

    // Generate response using AI
    let responseMessage = "";
    let meetingScheduled = false;

    if (DEEPSEEK_API_KEY) {
      // Use DeepSeek API
      try {
        const deepseekResponse = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${DEEPSEEK_API_KEY}`,
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: systemPrompt },
              ...formattedHistory,
            ],
            temperature: 0.9,
            max_tokens: 500,
          }),
        });

        if (deepseekResponse.ok) {
          const deepseekData = await deepseekResponse.json();
          responseMessage = deepseekData.choices?.[0]?.message?.content || "";
        }
      } catch (e) {
        console.error("DeepSeek error:", e);
      }
    }

    // Fallback to Lovable AI with function calling
    if (!responseMessage && LOVABLE_API_KEY) {
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
            messages: [
              { role: "system", content: systemPrompt },
              ...formattedHistory,
            ],
            tools: [
              {
                type: "function",
                function: {
                  name: "scheduleMeeting",
                  description: "Agenda uma reunião quando o lead CONFIRMAR explicitamente uma data e horário específicos",
                  parameters: {
                    type: "object",
                    properties: {
                      date: { type: "string", description: "Data no formato YYYY-MM-DD" },
                      time: { type: "string", description: "Horário no formato HH:MM" },
                      duration_minutes: { type: "number", description: "Duração em minutos (padrão 30)" },
                      notes: { type: "string", description: "Notas ou assunto da reunião" },
                    },
                    required: ["date", "time"],
                  },
                },
              },
            ],
            tool_choice: "auto",
            temperature: 0.9,
          }),
        }
      );

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error("AI API error:", errorText);
        
        if (aiResponse.status === 429 || aiResponse.status === 402) {
          // Rate limit or payment - use fallback message
          responseMessage = "Opa! Me dá um minutinho que já te respondo 😊";
        } else {
          throw new Error("Failed to generate response");
        }
      } else {
        const aiData = await aiResponse.json();
        const choice = aiData.choices?.[0];

        // Check if AI wants to schedule a meeting
        if (choice?.message?.tool_calls) {
          for (const toolCall of choice.message.tool_calls) {
            if (toolCall.function.name === "scheduleMeeting") {
              const args = JSON.parse(toolCall.function.arguments);
              
              // Fix date if AI sends a past year
              let dateStr = args.date;
              const now = new Date();
              const currentYear = now.getFullYear();
              const parsedYear = parseInt(dateStr.split('-')[0]);
              
              if (parsedYear < currentYear) {
                dateStr = `${currentYear}-${dateStr.slice(5)}`;
                console.log(`Fixed past year in date: ${args.date} -> ${dateStr}`);
              }
              
              let scheduledAt = new Date(`${dateStr}T${args.time}:00`);
              
              // If still in past, move to next occurrence
              if (scheduledAt < now) {
                // If it's "today" but the time already passed, schedule for tomorrow
                scheduledAt.setDate(scheduledAt.getDate() + 1);
                console.log(`Date was in past, moved to tomorrow: ${scheduledAt.toISOString()}`);
              }
              
              // Get Google Meet link from settings
              const meetLink = settings.google_meet_link || null;
              
              const { data: meeting, error: meetingError } = await supabase
                .from("meetings")
                .insert({
                  user_id: userId,
                  lead_id: lead.id,
                  title: `Reunião com ${lead.business_name}`,
                  description: args.notes || null,
                  scheduled_at: scheduledAt.toISOString(),
                  duration_minutes: args.duration_minutes || 30,
                  status: "scheduled",
                  meeting_link: meetLink,
                })
                .select()
                .single();

              if (!meetingError && meeting) {
                meetingScheduled = true;
                
                await supabase
                  .from("leads")
                  .update({ stage: "Ganho", temperature: "quente" })
                  .eq("id", lead.id);

                await supabase.from("activity_log").insert({
                  user_id: userId,
                  lead_id: lead.id,
                  activity_type: "meeting_scheduled",
                  description: `Reunião agendada: ${scheduledAt.toLocaleDateString("pt-BR")} às ${args.time}`,
                  metadata: { meeting_id: meeting.id, meeting_link: meetLink },
                });

                // Trigger webhook
                if (settings.webhook_url) {
                  try {
                    await fetch(settings.webhook_url, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        event: "meeting_scheduled",
                        meeting,
                        lead,
                        timestamp: new Date().toISOString(),
                      }),
                    });
                  } catch (e) {
                    console.error("Webhook error:", e);
                  }
                }

                const dayFormatted = scheduledAt.toLocaleDateString("pt-BR", { weekday: 'long', day: 'numeric', month: 'long' });
                
                // Build response with or without meeting link
                if (meetLink) {
                  responseMessage = `Perfeito! Confirmado então pra ${dayFormatted} às ${args.time}! 🎯\n\n📹 Link da reunião:\n${meetLink}\n\nVou te mandar um lembrete antes. Qualquer coisa é só me chamar aqui!`;
                } else {
                  responseMessage = `Perfeito! Confirmado então pra ${dayFormatted} às ${args.time}! 🎯\n\nVou te mandar um lembrete antes. Qualquer coisa é só me chamar aqui!`;
                }
              }
            }
          }
        }

        if (!responseMessage) {
          responseMessage = choice?.message?.content || "";
        }
      }
    }

    // Fallback if still no response
    if (!responseMessage) {
      responseMessage = "Opa! Recebi sua mensagem. Me conta mais sobre como posso te ajudar! 😊";
    }

    // Clean up response (remove markdown if present)
    responseMessage = responseMessage
      .replace(/^\*\*.*?\*\*\s*/gm, "") // Remove bold markers
      .replace(/^#+\s*/gm, "") // Remove headers
      .trim();

    // Save agent response
    await supabase.from("chat_messages").insert({
      lead_id: lead.id,
      sender_type: "agent",
      content: responseMessage,
      status: "pending",
    });

    // Update last contact
    await supabase
      .from("leads")
      .update({ last_contact_at: new Date().toISOString() })
      .eq("id", lead.id);

    // Update temperature based on conversation
    await updateLeadTemperature(lead.id, conversationContext, supabase);

    // Send response via WhatsApp
    if (settings.whatsapp_connected && settings.whatsapp_instance_id) {
      try {
        const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
        const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

        if (EVOLUTION_API_URL && EVOLUTION_API_KEY) {
          let formattedPhone = phone;
          if (!formattedPhone.startsWith("55") && formattedPhone.length <= 11) {
            formattedPhone = "55" + formattedPhone;
          }

          // Add slight delay to seem more human (1-3 seconds)
          const delay = Math.floor(Math.random() * 2000) + 1000;
          await new Promise(resolve => setTimeout(resolve, delay));

          const sendResponse = await fetch(
            `${EVOLUTION_API_URL}/message/sendText/${settings.whatsapp_instance_id}`,
            {
              method: "POST",
              headers: {
                "apikey": EVOLUTION_API_KEY,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                number: formattedPhone,
                text: responseMessage,
              }),
            }
          );

          if (sendResponse.ok) {
            console.log(`Response sent to ${phone}`);
            
            await supabase
              .from("chat_messages")
              .update({ status: "sent" })
              .eq("lead_id", lead.id)
              .eq("content", responseMessage)
              .eq("sender_type", "agent");
          } else {
            const errorText = await sendResponse.text();
            console.error(`Failed to send to ${phone}:`, errorText);
          }
        }
      } catch (e) {
        console.error("WhatsApp send error:", e);
      }
    }

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: userId,
      lead_id: lead.id,
      activity_type: "message_received",
      description: `Mensagem recebida e respondida automaticamente`,
      metadata: { 
        message_preview: message.substring(0, 100),
        response_preview: responseMessage.substring(0, 100),
        meeting_scheduled: meetingScheduled,
      },
    });

    return new Response(
      JSON.stringify({
        success: true,
        response: responseMessage,
        meeting_scheduled: meetingScheduled,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Webhook error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

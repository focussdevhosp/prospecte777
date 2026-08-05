import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  handleCors,
  json,
  requirePaidPlan,
  requireUserOrInternal,
  resolveUserId,
} from "../_shared/auth.ts";
import { runCaptureJob } from "../_shared/engine.ts";


Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  // A checagem antiga era `authHeader.includes(serviceKey)`: comparação por
  // substring, e o user_id vinha do corpo sem conferência nenhuma.
  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const paywall = await requirePaidPlan(auth.ctx);
  if (paywall) return paywall;

  const supabase = auth.ctx.supabase;

  try {
    const { action, data, user_id } = await req.json();

    const identity = resolveUserId(auth.ctx, user_id);
    if (identity.error) return identity.error;
    const effectiveUserId = identity.userId;

    // Use global API keys only (no per-user keys)
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Helper function to call AI via DeepSeek (primary), falls back to Lovable AI
    async function callAI(systemPrompt: string, userPrompt: string) {
      if (DEEPSEEK_API_KEY) {
        const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt },
            ],
          }),
        });

        if (response.ok) {
          const aiData = await response.json();
          return aiData.choices?.[0]?.message?.content || "";
        }
        console.error("DeepSeek error, trying fallback...");
      }

      // Fallback to Lovable AI
      if (!LOVABLE_API_KEY) {
        throw new Error("Nenhuma API de IA configurada (DeepSeek ou Lovable).");
      }

      const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error("AI API error");
      }

      const aiData = await response.json();
      return aiData.choices?.[0]?.message?.content || "";
    }

    // Action: Calculate lead quality score
    if (action === "calculate_quality_score") {
      const { lead } = data;
      
      let score = 50; // Base score

      // Rating factor (0-5 stars)
      if (lead.rating) {
        score += (lead.rating - 3) * 10; // +20 for 5 stars, -20 for 1 star
      }

      // Reviews factor
      if (lead.reviews_count) {
        if (lead.reviews_count > 100) score += 15;
        else if (lead.reviews_count > 50) score += 10;
        else if (lead.reviews_count > 20) score += 5;
      }

      // Has website (indicates more established business)
      if (lead.website) score += 10;

      // Has email (easier to follow up)
      if (lead.email) score += 5;

      // Response history
      if (lead.last_response_at) {
        score += 20; // They responded before
      }

      // Clamp score between 0 and 100
      score = Math.max(0, Math.min(100, score));

      return new Response(JSON.stringify({ score }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: Qualify leads by groups - AI analyzes leads and categorizes them
    if (action === "qualify_leads_by_group") {
      const { leads } = data;
      
      if (!leads || leads.length === 0) {
        return new Response(JSON.stringify({ qualified_leads: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const systemPrompt = `Você é um especialista em qualificação de leads para prospecção B2B no Brasil.

Sua tarefa é analisar uma lista de leads e para CADA um:
1. Classificar em um GRUPO baseado nas características (use exatamente estes grupos):
   - "Sem Site" - negócios sem website
   - "Avaliação Baixa" - rating abaixo de 3.5 estrelas
   - "Pequeno Porte" - poucos reviews (<20) indica menor porte
   - "Estabelecido" - muitos reviews (>50) e bom rating
   - "Premium" - rating excelente (>4.5) e muitos reviews
   - "Novo no Mercado" - poucos ou nenhum review
   
2. Identificar OPORTUNIDADES DE SERVIÇO baseado no que falta ao negócio:
   - Sem site = "Criação de Site", "Landing Page"
   - Avaliação baixa = "Gestão de Reputação", "Marketing Digital"
   - Pequeno porte = "Automação", "Chatbot", "WhatsApp Business"
   - Sem redes sociais = "Gestão de Redes Sociais"
   - Estabelecido = "Expansão Digital", "Sistema de Gestão"
   - Premium = "Fidelização", "Programa de Indicação"

Responda em JSON válido com o formato:
{
  "qualified": [
    {
      "id": "id_do_lead",
      "lead_group": "nome_do_grupo",
      "service_opportunities": ["serviço1", "serviço2"]
    }
  ]
}`;

      const userPrompt = `Analise estes ${leads.length} leads e qualifique cada um:

${leads.slice(0, 50).map((l: any, i: number) => `${i+1}. ${l.business_name}
   - ID: ${l.id}
   - Site: ${l.website ? 'Sim' : 'Não tem'}
   - Rating: ${l.rating || 'N/A'}
   - Reviews: ${l.reviews_count || 0}
   - Nicho: ${l.niche || 'N/A'}
`).join('\n')}

Retorne APENAS o JSON, sem explicações.`;

      try {
        const response = await callAI(systemPrompt, userPrompt);
        
        // Parse the JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error("Invalid AI response format");
        }
        
        const result = JSON.parse(jsonMatch[0]);
        
        return new Response(JSON.stringify({ 
          qualified_leads: result.qualified || [],
          total_analyzed: leads.length,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error: any) {
        console.error("Error qualifying leads:", error);
        
        // Fallback: do basic classification without AI
        const fallbackQualified = leads.slice(0, 50).map((lead: any) => {
          let group = "Novo no Mercado";
          const opportunities: string[] = [];
          
          if (!lead.website) {
            group = "Sem Site";
            opportunities.push("Criação de Site", "Landing Page");
          } else if (lead.rating && lead.rating < 3.5) {
            group = "Avaliação Baixa";
            opportunities.push("Gestão de Reputação", "Marketing Digital");
          } else if (lead.reviews_count && lead.reviews_count > 50 && lead.rating >= 4.5) {
            group = "Premium";
            opportunities.push("Fidelização", "Expansão Digital");
          } else if (lead.reviews_count && lead.reviews_count > 50) {
            group = "Estabelecido";
            opportunities.push("Sistema de Gestão", "Automação");
          } else if (!lead.reviews_count || lead.reviews_count < 20) {
            group = "Pequeno Porte";
            opportunities.push("Chatbot", "WhatsApp Business", "Automação");
          }
          
          return {
            id: lead.id,
            lead_group: group,
            service_opportunities: opportunities,
          };
        });
        
        return new Response(JSON.stringify({ 
          qualified_leads: fallbackQualified,
          total_analyzed: leads.length,
          used_fallback: true,
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Action: Suggest template improvements
    if (action === "suggest_improvements") {
      const { template, responseRate, niche } = data;

      const systemPrompt = `Você é um especialista em copywriting para prospecção via WhatsApp no Brasil.
              
Analise o template fornecido e sugira melhorias específicas para aumentar a taxa de resposta.
Considere:
- Personalização e uso de variáveis
- Tom de voz apropriado para o nicho
- Call-to-action claro
- Comprimento ideal (não muito longo)
- Gatilhos mentais sutis

Responda em português brasileiro com sugestões práticas e um template melhorado.`;

      const userPrompt = `Nicho: ${niche}
Taxa de resposta atual: ${responseRate}%

Template atual:
${template}

Por favor, analise e sugira melhorias.`;

      try {
        const suggestions = await callAI(systemPrompt, userPrompt);
        return new Response(JSON.stringify({ suggestions }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Action: Get best time recommendation
    if (action === "get_best_time") {
      const { niche, stats } = data;

      // Calculate best hours from stats
      const hourlyData: Record<number, { sent: number; responses: number }> = {};
      
      for (const stat of stats) {
        if (stat.hour_of_day !== null) {
          if (!hourlyData[stat.hour_of_day]) {
            hourlyData[stat.hour_of_day] = { sent: 0, responses: 0 };
          }
          hourlyData[stat.hour_of_day].sent += stat.messages_sent;
          hourlyData[stat.hour_of_day].responses += stat.responses_received;
        }
      }

      const hourlyRates = Object.entries(hourlyData)
        .map(([hour, data]) => ({
          hour: parseInt(hour),
          rate: data.sent > 0 ? (data.responses / data.sent) * 100 : 0,
          sample: data.sent,
        }))
        .filter(h => h.sample >= 3)
        .sort((a, b) => b.rate - a.rate);

      // If we have data, use it; otherwise, use AI to suggest based on niche
      if (hourlyRates.length > 0) {
        const bestHours = hourlyRates.slice(0, 3).map(h => h.hour);
        const recommendation = `Baseado nos seus dados: melhor horário às ${bestHours[0]}h (${hourlyRates[0].rate.toFixed(1)}% de resposta)`;

        return new Response(JSON.stringify({ 
          bestHours,
          recommendation,
          source: "data"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Use AI for initial recommendation
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          tools: [
            {
              type: "function",
              function: {
                name: "recommend_hours",
                description: "Recomenda os melhores horários para prospecção",
                parameters: {
                  type: "object",
                  properties: {
                    bestHours: {
                      type: "array",
                      items: { type: "number" },
                      description: "Lista dos 3 melhores horários (0-23)",
                    },
                    explanation: {
                      type: "string",
                      description: "Explicação breve do porquê",
                    },
                  },
                  required: ["bestHours", "explanation"],
                },
              },
            },
          ],
          tool_choice: { type: "function", function: { name: "recommend_hours" } },
          messages: [
            {
              role: "system",
              content: "Você é um especialista em prospecção B2B no Brasil. Recomende os melhores horários para contato via WhatsApp baseado no nicho.",
            },
            {
              role: "user",
              content: `Qual o melhor horário para contatar empresas do nicho "${niche}" via WhatsApp no Brasil? Considere horários comerciais e rotina típica do nicho.`,
            },
          ],
        }),
      });

      if (!aiResponse.ok) {
        // Fallback to default hours
        return new Response(JSON.stringify({
          bestHours: [10, 14, 16],
          recommendation: "Horários sugeridos: 10h, 14h e 16h (horário comercial padrão)",
          source: "default",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      
      if (toolCall) {
        const args = JSON.parse(toolCall.function.arguments);
        return new Response(JSON.stringify({
          bestHours: args.bestHours,
          recommendation: args.explanation,
          source: "ai",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        bestHours: [10, 14, 16],
        recommendation: "Horários sugeridos: 10h, 14h e 16h",
        source: "default",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: Generate personalized message
    if (action === "generate_message") {
      const { lead, template, agentSettings, isRemarketing } = data;

      // Check if this is direct AI mode (no template)
      const isDirectMode = !template || template === null || template.trim() === '';

      // Check if a specific service was selected
      const specificService = agentSettings?.specific_service;
      const servicesText = specificService 
        ? specificService 
        : (agentSettings?.services_offered?.length ? agentSettings.services_offered.join(', ') : 'soluções digitais personalizadas');

      let systemPrompt = '';
      let userPrompt = '';

      if (isRemarketing) {
        // Remarketing mode - SHORT follow-up message, humano e leve
        systemPrompt = `Você é ${agentSettings?.agent_name || "um consultor"}, escrevendo no WhatsApp.
${agentSettings?.agent_persona || ""}

Estilo: ${agentSettings?.communication_style || "direto e amigável"}
Emojis: ${agentSettings?.emoji_usage || "no máximo 1"}

CONTEXTO: Follow-up. O lead JÁ foi contatado antes — não se apresente de novo.

REGRAS:
1. Máximo 2 frases curtas (25-45 palavras no total)
2. Comece leve ("Oi", "Opa", "E aí") + reengaje com NOVIDADE, RESULTADO ou GATILHO
3. Termine com pergunta curta e fácil de responder ("faz sentido?", "posso te mandar?", "quer ver?")
4. Português brasileiro coloquial. Zero formalidade.
5. Nunca use "prezado", "venho por meio desta", "gostaria de", "tudo bem contigo?"
6. Nunca liste serviços

BONS EXEMPLOS:
"Oi! Fechei essa semana um resultado bacana com uma ${lead.niche || 'empresa'} parecida com a de vocês — quer que eu te mande o print?"
"E aí, tudo certo? Abriu uma condição nova que faz sentido pro perfil de vocês. Posso te passar rapidão?"`;

        userPrompt = `LEAD (follow-up):
• ${lead.business_name}${lead.niche ? ` — ${lead.niche}` : ''}
${lead.location ? `• ${lead.location}` : ''}

Escreva UMA mensagem curta de reengajamento. Responda APENAS com a mensagem, sem aspas, sem explicação.`;

      } else if (isDirectMode) {
        // Direct AI mode — mensagem 1:1, humana, específica, focada em CONVERSÃO
        systemPrompt = `Você é ${agentSettings?.agent_name || "um consultor especializado"}, escrevendo pessoalmente no WhatsApp do dono de um negócio local.
${agentSettings?.agent_persona || ""}

Estilo: ${agentSettings?.communication_style || "direto, humano, consultivo"}
Emojis: ${agentSettings?.emoji_usage || "no máximo 1, opcional"}
${agentSettings?.knowledge_base ? `Sua expertise: ${agentSettings.knowledge_base}` : ''}
${specificService ? `SERVIÇO A OFERECER: "${specificService}" (foque só nisso, não ofereça outros)` : `Serviços que você domina: ${servicesText}`}

# OBJETIVO ÚNICO
Fazer o lead RESPONDER. Não é vender, não é agendar reunião ainda. É gerar curiosidade suficiente pra ele dizer "manda", "como assim?", "me explica".
A melhor mensagem é aquela que ele lê e PRECISA responder.

# FÓRMULA DE ALTA CONVERSÃO (PAS adaptado)
1. GANCHO PESSOAL (1 frase): use o nome real da empresa + 1 observação específica e verdadeira sobre ELE (nicho, cidade, rating, ausência de site, poucos reviews). Mostre que você olhou de verdade.
2. PROBLEMA COM CUSTO (1-2 frases): traduza a observação em DINHEIRO PERDIDO ou OPORTUNIDADE que ele está deixando escapar. Use um número concreto (ex: "70% dos clientes desistem", "R$ 3-5 mil/mês em vendas perdidas", "cada review a menos = 12% menos ligação"). Nada abstrato tipo "melhorar presença digital".
3. CTA MICRO (1 frase): peça algo minúsculo — "posso te mandar?", "quer ver um print?", "faz sentido eu te explicar em 1 minuto?". NUNCA peça reunião, ligação ou horário na primeira mensagem.

# REGRAS DE OURO
• 45-80 palavras. 2 a 3 frases. Nada de textão.
• Português BR coloquial. Escreva como você falaria no WhatsApp com um conhecido.
• Comece com "Oi", "Opa", "E aí" ou o primeiro nome do negócio. NUNCA "Prezado", "Olá, meu nome é", "Espero que esteja bem", "Tudo bem?".
• UM foco só. Um problema, uma solução, um CTA. Não misture.
• Números > adjetivos. "40% mais agendamentos" > "muito mais agendamentos".
• Prova social sutil quando fizer sentido: "outro ${lead.niche || 'cliente'} daqui de ${lead.location || 'perto'}...", "acabei de fazer pra um...".
• Se o lead NÃO TEM SITE → esse é o gancho. Se tem RATING BAIXO/POUCOS REVIEWS → esse é o gancho. Escolha o mais forte.
• Não invente dados sobre o lead (faturamento, funcionários, concorrentes) — use SÓ o que está no LEAD abaixo.
• Nada de markdown, bullets, aspas, títulos, "assinatura".
• Não diga o preço. Não liste serviços. Não prometa "resultados garantidos".

# EXEMPLOS DE MENSAGENS QUE CONVERTEM
"Oi! Passei aqui na ${lead.business_name || '[empresa]'} e vi que vocês ainda não têm site — 8 em cada 10 clientes hoje pesquisam no Google antes de ligar, e sem site eles caem no concorrente que aparece primeiro.
Montei semana passada um pra uma ${lead.niche || 'empresa parecida'} e ele dobrou os contatos em 3 semanas. Posso te mandar o print pra você ver?"

"Opa, tô olhando aqui a ${lead.business_name || '[empresa]'} — 4.2★ com 18 reviews. Cada 10 reviews a mais rende em média +30% de ligação, e tem um jeito simples de pedir review no automático depois de cada atendimento.
Quer que eu te mostre como funciona rapidão?"`;

        userPrompt = `LEAD:
• Empresa: ${lead.business_name}
• Nicho: ${lead.niche || "negócio local"}
• Cidade: ${lead.location || "—"}
• Avaliação: ${lead.rating ? `${lead.rating}★ com ${lead.reviews_count || 0} reviews` : 'sem avaliações no Google'}
• Site: ${lead.website ? 'tem site' : 'NÃO TEM SITE'}
${specificService ? `\nOFEREÇA APENAS: ${specificService}` : ''}

Escolha O GANCHO mais forte disponível (sem site > rating baixo > poucos reviews > nicho + cidade).
Escreva UMA mensagem seguindo GANCHO → PROBLEMA COM CUSTO → CTA MICRO.
Use o nome real da empresa e pelo menos 1 número concreto.
Responda APENAS com a mensagem final, sem aspas, sem título, sem explicação.`;

      } else {
        // Template mode - personalize existing template
        systemPrompt = `Você é ${agentSettings?.agent_name || "um consultor de vendas"} escrevendo no WhatsApp.
${agentSettings?.agent_persona || "Você ajuda empresas locais a crescerem com soluções digitais."}

Estilo: ${agentSettings?.communication_style || "direto e amigável"}
Emojis: ${agentSettings?.emoji_usage || "no máximo 1"}

TAREFA: adaptar o template abaixo para este lead específico, mantendo a INTENÇÃO e o CTA, mas:
• Substitua variáveis ({empresa}, {nicho}, {cidade}) pelos dados reais
• Reescreva de forma NATURAL — não pareça template. Ajuste 1-2 palavras pra soar humano
• Se o lead tem uma característica marcante (sem site, rating baixo, muitos reviews), incorpore sutilmente
• Mantenha CURTO (máx 3 frases, 40-80 palavras)
• Zero formalidade ("prezado", "gostaria"). Comece leve ("Oi", "Opa", "E aí")
• Nunca use markdown, bullets ou aspas na saída`;

        userPrompt = `LEAD:
• Empresa: ${lead.business_name}
• Nicho: ${lead.niche || "não especificado"}
• Cidade: ${lead.location || "não especificada"}
• Rating: ${lead.rating ? `${lead.rating}★ (${lead.reviews_count || 0} reviews)` : "sem avaliações"}
• Site: ${lead.website ? 'tem' : 'NÃO TEM'}

TEMPLATE BASE:
${template}

Retorne APENAS a mensagem final personalizada, sem aspas, sem explicação.`;
      }

      try {
        const message = await callAI(systemPrompt, userPrompt);
        
        // Clean up the message - remove any markdown or extra formatting
        const cleanMessage = message
          .replace(/^["']|["']$/g, '') // Remove quotes at start/end
          .replace(/^\*\*|\*\*$/g, '') // Remove bold markdown
          .trim();

        return new Response(JSON.stringify({ message: cleanMessage }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error: any) {
        console.error("AI API error:", error);
        
        // Fallback for template mode
        if (!isDirectMode) {
          const fallbackMessage = template
            .replace(/\{empresa\}/gi, lead.business_name)
            .replace(/\{nicho\}/gi, lead.niche || 'seu segmento')
            .replace(/\{cidade\}/gi, lead.location || 'sua região');
          
          return new Response(JSON.stringify({ message: fallbackMessage }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        
        throw new Error("Falha ao gerar mensagem. Verifique sua chave API.");
      }
    }

    // Action: Search leads - MÁXIMA COBERTURA SEM LIMITES
    if (action === "search_leads") {
      const { niche, location, maxResults = 300, minQuality = 0 } = data;

      if (!niche || !location) {
        return json({ error: "niche e location são obrigatórios." }, 400);
      }

      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("serpapi_api_key, serper_api_key")
        .eq("user_id", effectiveUserId)
        .maybeSingle();

      const normalize = (v: string) =>
        v.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");

      // Cache comunitário: se outro usuário já capturou este nicho nesta
      // cidade, entrega uma prévia na hora em vez de esperar a captura.
      const { data: cached } = await supabase
        .from("community_leads")
        .select("*")
        .eq("niche_normalized", normalize(niche))
        .eq("location_normalized", normalize(location))
        .limit(maxResults);

      // A captura leva mais tempo que o limite de uma requisição, então
      // roda como job e o front acompanha pelo progresso.
      const { data: job, error: jobError } = await supabase
        .from("background_jobs")
        .insert({
          user_id: effectiveUserId,
          job_type: "search_leads",
          status: "pending",
          payload: { niche, location, maxResults },
          total_items: maxResults,
          priority: 5,
        })
        .select()
        .single();

      if (jobError || !job) {
        console.error("Falha ao criar job de captura:", jobError);
        return json({ error: "Não foi possível iniciar a captura." }, 500);
      }

      EdgeRuntime.waitUntil(
        runCaptureJob(supabase, job.id, effectiveUserId, {
          niche,
          location,
          maxResults,
          minQuality,
          serpApiKey: userSettings?.serpapi_api_key ?? null,
          serperApiKey: userSettings?.serper_api_key ?? null,
        }),
      );

      return json({
        job_id: job.id,
        status: "running",
        cached_preview: (cached ?? []).slice(0, 50),
        cached_total: cached?.length ?? 0,
      });
    }

    // Action: Check job status
    if (action === "check_job_status") {
      const { job_id } = data;
      
      const { data: job, error } = await supabase
        .from("background_jobs")
        .select("*")
        .eq("id", job_id)
        .single();

      if (error || !job) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        job_id: job.id,
        status: job.status,
        processed_items: job.processed_items,
        total_items: job.total_items,
        result: job.result,
        error_message: job.error_message,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: Analyze lead pain points and generate personalized message
    if (action === "analyze_and_personalize") {
      const { lead, agentSettings } = data;

      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `Você é um especialista em análise de negócios e vendas consultivas no Brasil.

Analise o negócio fornecido e:
1. Identifique 2-4 dores/problemas comuns que esse tipo de negócio enfrenta
2. Crie uma mensagem de primeiro contato altamente personalizada que:
   - Mencione a empresa pelo nome
   - Identifique uma dor específica do nicho
   - Ofereça uma solução relevante de forma sutil
   - Termine com uma pergunta aberta

Considere:
- Nicho: ${lead.niche}
- Localização: ${lead.location}
- Avaliação: ${lead.rating ? `${lead.rating} estrelas` : "não disponível"}
- Quantidade de reviews: ${lead.reviews_count || 0}
- Tem website: ${lead.website ? "Sim" : "Não"}

Serviços oferecidos pelo vendedor: ${(agentSettings?.services_offered || []).join(", ")}
Estilo de comunicação: ${agentSettings?.communication_style || "profissional"}
Uso de emojis: ${agentSettings?.emoji_usage || "moderado"}

Responda em JSON com:
{
  "painPoints": ["dor1", "dor2", ...],
  "message": "mensagem personalizada"
}`,
            },
            {
              role: "user",
              content: `Analise e crie uma mensagem para: ${lead.business_name}`,
            },
          ],
        }),
      });

      if (!aiResponse.ok) {
        console.error("AI error:", await aiResponse.text());
        return new Response(JSON.stringify({ 
          painPoints: ["Falta de presença digital", "Dificuldade em captar clientes"],
          message: `Olá! Vi que a ${lead.business_name} atua no segmento de ${lead.niche}. Posso ajudar a aumentar sua visibilidade online?`
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content || "{}";

      try {
        const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ""));
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch {
        return new Response(JSON.stringify({ 
          painPoints: ["Falta de presença digital", "Dificuldade em captar clientes"],
          message: `Olá! Vi que a ${lead.business_name} atua no segmento de ${lead.niche}. Posso ajudar a aumentar sua visibilidade online?`
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Action: Batch analyze multiple leads
    if (action === "batch_analyze") {
      const { leads, agentSettings, prospectingType } = data;

      const results = await Promise.all(
        leads.slice(0, 5).map(async (lead: any) => {
          try {
            const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${LOVABLE_API_KEY}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "deepseek-chat",
                response_format: { type: "json_object" },
                messages: [
                  {
                    role: "system",
                    content: `Você é um especialista em vendas B2B no Brasil.

Crie uma mensagem de prospecção para o negócio abaixo.

Estilo: ${prospectingType?.settings?.messageStyle || "Profissional e direto"}
Tom: ${prospectingType?.settings?.tone || "moderado"}

Serviços oferecidos: ${(agentSettings?.services_offered || []).join(", ")}

Responda em JSON: {"painPoints": ["dor1"], "message": "mensagem curta"}`,
                  },
                  {
                    role: "user",
                    content: `Empresa: ${lead.business_name}, Nicho: ${lead.niche}, Rating: ${lead.rating || "N/A"}`,
                  },
                ],
              }),
            });

            if (!aiResponse.ok) {
              return {
                leadId: lead.id,
                painPoints: ["Falta de presença digital"],
                message: `Olá! Vi que a ${lead.business_name} pode crescer mais. Posso ajudar?`,
              };
            }

            const aiData = await aiResponse.json();
            const content = aiData.choices?.[0]?.message?.content || "{}";
            const parsed = JSON.parse(content.replace(/```json\n?|\n?```/g, ""));

            return {
              leadId: lead.id,
              painPoints: parsed.painPoints || ["Falta de presença digital"],
              message: parsed.message || `Olá! Posso ajudar a ${lead.business_name}?`,
            };
          } catch {
            return {
              leadId: lead.id,
              painPoints: ["Falta de presença digital"],
              message: `Olá! Vi que a ${lead.business_name} pode crescer mais. Posso ajudar?`,
            };
          }
        })
      );

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: Generate A/B test variants
    if (action === "generate_ab_variants") {
      const { baseTemplate, niche, testType } = data;

      const systemPrompt = `Você é um especialista em copywriting e testes A/B para prospecção via WhatsApp.

Crie ${testType === "opening" ? "3 variações de abertura" : testType === "cta" ? "3 variações de call-to-action" : "3 variações completas"} para o template base.

Cada variante deve:
- Manter a essência da mensagem
- Testar um elemento específico diferente
- Ser adequada ao nicho ${niche}

Responda em JSON:
{
  "variants": [
    {"name": "Variant A", "content": "...", "hypothesis": "..."},
    {"name": "Variant B", "content": "...", "hypothesis": "..."},
    {"name": "Variant C", "content": "...", "hypothesis": "..."}
  ]
}`;

      try {
        const aiText = await callAI(systemPrompt, baseTemplate);
        const parsed = JSON.parse(aiText.replace(/```json\n?|\n?```/g, ""));
        
        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (error: any) {
        return new Response(JSON.stringify({ 
          variants: [
            { name: "Variant A", content: baseTemplate, hypothesis: "Controle" },
          ],
          error: error.message 
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Default error response
    return new Response(JSON.stringify({ error: "Unknown action: " + action }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Edge function error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

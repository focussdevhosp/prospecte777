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
import { callAI as aiCall, completeJson as aiCompleteJson, recordUsage } from "../_shared/ai.ts";
import { buildDossier } from "../_shared/agents/dossier.ts";
import { qualify } from "../_shared/agents/qualifier.ts";
import { matchOffer } from "../_shared/agents/offer-matcher.ts";
import { buildStrategy } from "../_shared/agents/strategist.ts";
import { buildCopyPrompt, buildRewritePrompt, cleanMessage } from "../_shared/agents/copywriter.ts";
import { evaluate as evaluateQuality } from "../_shared/agents/quality-gate.ts";
import { loadCatalog } from "../_shared/agents/orchestrator.ts";
import { bestHours } from "../_shared/agents/timing.ts";


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

    /**
     * Ações auxiliares (classificação de grupos, sugestão de template,
     * variantes de A/B).
     *
     * Antes esta função tinha o próprio `fetch` sem AbortController: uma
     * chamada pendurada travava o item do job até a edge function morrer por
     * tempo, e o usuário só via a barra parada. Agora delega para a camada
     * única, que traz timeout, retry, troca de provedor e registro de custo.
     */
    async function callAI(systemPrompt: string, userPrompt: string): Promise<string> {
      const result = await aiCall({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        role: "fast",
        max_tokens: 2000,
      });

      await recordUsage(supabase, {
        userId: effectiveUserId,
        usage: result.usage,
        purpose: `ai-prospecting:${action}`,
        agent: "assistant",
      });

      return result.text;
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

    // Action: recomendacao de horario
    //
    // A versao anterior somava `stat.responses_received`, uma coluna que
    // NUNCA foi incrementada por nenhum codigo -- so escrita com o valor 0
    // pelo job-processor. Toda hora empatava em 0,0%, a ordenacao virava
    // acaso, e o produto respondia "Baseado nos seus dados: melhor horario as
    // 9h (0.0% de resposta)". A frase fazia a pessoa reorganizar a operacao em
    // cima de ruido.
    //
    // Os numeros agora vem de `prospecting_hour_stats`, derivada da conversa
    // real, e a decisao de recomendar-ou-nao mora em `_shared/agents/timing`,
    // com teste.
    if (action === "get_best_time") {
      const { niche } = data;

      const { data: horas } = await supabase.rpc("prospecting_hour_stats", {
        p_user_id: effectiveUserId,
        p_days: 90,
      });

      const advice = bestHours(
        (horas ?? []).map((h: { hour_of_day: number; sent: number; replied: number }) => ({
          hour: Number(h.hour_of_day),
          sent: Number(h.sent),
          replied: Number(h.replied),
        })),
      );

      if (advice.fromData) {
        return json({
          bestHours: advice.hours,
          recommendation: advice.reason,
          source: "data",
        });
      }

      // Sem evidencia propria, o motivo vai junto da sugestao generica. Dizer
      // POR QUE ainda nao da para recomendar pelos dados vale mais que um
      // numero bonito: informa quanto falta para a resposta ser confiavel.
      const semDados = advice.reason;

      // Sem dado próprio ainda: pergunta à IA uma sugestão inicial.
      // Passa pela camada única (timeout, fallback, custo) em vez de falar
      // com o gateway Lovable direto, que era o único caminho aqui e não
      // tinha DeepSeek nem reserva.
      const DEFAULT_HOURS = {
        bestHours: [10, 14, 16],
        recommendation:
          `${semDados} Enquanto isso: 10h, 14h e 16h, que é horário comercial padrão.`,
        source: "default",
      };

      try {
        const { data: parsed } = await aiCompleteJson<{ bestHours: number[]; explanation: string }>(
          "Você é especialista em prospecção B2B no Brasil. Responda em JSON: " +
            '{"bestHours": [h1, h2, h3], "explanation": "motivo curto"}. Horas de 0 a 23.',
          `Qual o melhor horário para contatar empresas do nicho "${niche}" via WhatsApp no Brasil? ` +
            "Considere horário comercial e a rotina típica desse tipo de negócio.",
          { role: "fast", max_tokens: 300 },
        );

        const hours = (parsed.bestHours ?? [])
          .map(Number)
          .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
          .slice(0, 3);

        if (hours.length === 0) return json(DEFAULT_HOURS);

        return json({
          bestHours: hours,
          // O motivo de nao haver dado proprio vem primeiro. Sem isso, a
          // sugestao da IA seria lida como se fosse medicao da conta.
          recommendation: `${semDados} Sugestão geral para o nicho: ${parsed.explanation || DEFAULT_HOURS.recommendation}`,
          source: "ai",
        });
      } catch (error) {
        console.error("[ai-prospecting] sugestão de horário falhou:", error);
        return json(DEFAULT_HOURS);
      }
    }

    // ------------------------------------------------------------
    // Action: gerar a mensagem de abordagem
    // ------------------------------------------------------------
    // Reescrito para passar pela mesma esteira da missão: dossiê com
    // procedência -> estratégia -> copy factual -> Quality Gate.
    //
    // O prompt anterior exigia "pelo menos 1 número concreto" e dava como
    // exemplo estatísticas que não existiam em lugar nenhum ("R$ 3-5 mil/mês
    // em vendas perdidas"). O modelo obedecia e inventava, e a mensagem saía
    // afirmando isso ao dono de um negócio real.
    //
    // O caminho por template continua abaixo, intocado: quando o usuário
    // escreveu o texto, o texto é dele.
    if (action === "generate_message") {
      const { lead, template, agentSettings, isRemarketing } = data;

      const isTemplateMode = !!(template && String(template).trim().length > 0);

      if (!isTemplateMode) {
        const { data: leadRow } = lead?.id
          ? await supabase.from("leads").select("*").eq("id", lead.id)
            .eq("user_id", effectiveUserId).maybeSingle()
          : { data: null };

        // Sem lead gravado, monta o dossiê com o que veio no corpo. O dossiê
        // fica mais pobre, e a mensagem sai mais curta — que é o certo.
        const source = leadRow ?? {
          id: lead?.id ?? "preview",
          business_name: lead?.business_name ?? "",
          phone: lead?.phone ?? "0",
          niche: lead?.niche ?? null,
          location: lead?.location ?? null,
          website: lead?.website ?? null,
          rating: lead?.rating ?? null,
          reviews_count: lead?.reviews_count ?? null,
          source: lead?.source ?? null,
        };

        const [memoryResult, messageResult] = leadRow
          ? await Promise.all([
            supabase.from("lead_memory")
              .select("memory_type, key, value, confidence").eq("lead_id", leadRow.id).limit(20),
            supabase.from("chat_messages")
              .select("sender_type, content, sent_at").eq("lead_id", leadRow.id)
              .order("sent_at", { ascending: false }).limit(10),
          ])
          : [{ data: [] }, { data: [] }];

        const dossier = buildDossier({
          lead: source,
          memories: memoryResult.data ?? [],
          messages: (messageResult.data ?? []).slice().reverse(),
        });

        const catalog = await loadCatalog(
          supabase,
          effectiveUserId,
          Array.isArray(data.offer_ids) ? data.offer_ids : [],
        );

        // Respeita a escolha manual de serviço que já existia na tela.
        const preferred = agentSettings?.specific_service
          ? catalog.filter((o) =>
            o.name.toLowerCase().includes(String(agentSettings.specific_service).toLowerCase())
          )
          : [];

        const match = matchOffer(dossier, preferred.length > 0 ? preferred : catalog);
        const qualification = qualify(dossier, {});

        const strategy = buildStrategy({
          dossier,
          qualification,
          match,
          goal: data.goal ?? "agendar_demonstracao",
        });

        // Remarketing é follow-up: o ângulo muda, o contrato de veracidade não.
        if (isRemarketing) strategy.angle = "reativacao";

        const copyContext = {
          dossier,
          strategy,
          sender: {
            agentName: agentSettings?.agent_name ?? "um consultor",
            persona: agentSettings?.agent_persona ?? null,
            communicationStyle: agentSettings?.communication_style ?? null,
            emojiUsage: agentSettings?.emoji_usage ?? null,
            companyName: null,
          },
        };

        let message = "";
        let verdict: ReturnType<typeof evaluateQuality> | null = null;

        for (let attempt = 0; attempt <= 2; attempt++) {
          const prompt = attempt === 0
            ? buildCopyPrompt(copyContext)
            : buildRewritePrompt(
              copyContext,
              message,
              verdict!.issues.filter((i) => i.severity === "block"),
            );

          const result = await aiCall({
            messages: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user },
            ],
            role: "primary",
            temperature: attempt === 0 ? 0.8 : 0.4,
            max_tokens: 400,
          });

          await recordUsage(supabase, {
            userId: effectiveUserId,
            usage: result.usage,
            purpose: attempt === 0 ? "copy" : "copy_rewrite",
            leadId: leadRow?.id ?? null,
            agent: "copy",
          });

          message = cleanMessage(result.text);
          verdict = evaluateQuality({ message, dossier, strategy });
          if (verdict.approved) break;
        }

        // Reprovado depois das reescritas: devolve o motivo em vez de um
        // texto genérico. Quem chamou decide — e o job-processor pula o lead.
        if (!verdict?.approved) {
          return json({
            error: "A mensagem não passou na revisão de qualidade.",
            code: "quality_gate_blocked",
            quality: verdict?.scores ?? null,
            issues: verdict?.issues ?? [],
            draft: message,
          }, 422);
        }

        return json({
          message,
          quality: verdict.scores,
          overall: verdict.overall,
          strategy: { angle: strategy.angle, hook: strategy.hook, offer: strategy.offer?.name ?? null },
          offer_match: { offer: match.offer?.name ?? null, confidence: match.confidence, reasons: match.reasons },
          score: qualification.score,
          facts_used: dossier.facts.length,
        });
      }

      // ------------------------------------------------------------
      // MODO TEMPLATE
      // ------------------------------------------------------------
      // O usuário escreveu o texto. A IA só adapta as variáveis ao lead —
      // não acrescenta afirmação nova, porque o que ele escreveu é
      // responsabilidade dele e o que a IA inventaria não seria.
      const systemPrompt = `Você é ${agentSettings?.agent_name || "um consultor de vendas"} escrevendo no WhatsApp.
${agentSettings?.agent_persona || ""}

Estilo: ${agentSettings?.communication_style || "direto e amigável"}
Emojis: ${agentSettings?.emoji_usage || "no máximo 1"}

TAREFA: adaptar o template abaixo para este lead, mantendo a INTENÇÃO e o CTA.
• Substitua as variáveis ({empresa}, {nicho}, {cidade}) pelos dados reais
• Ajuste 1 ou 2 palavras para soar natural — não pareça formulário preenchido
• Mantenha curto (máximo 3 frases)
• Comece leve ("Oi", "Opa", "E aí"). Sem "prezado", sem "gostaria de"
• Sem markdown, sem bullets, sem aspas em volta

PROIBIDO, sem exceção:
• Acrescentar estatística, percentual, valor em reais ou prazo que não esteja no template
• Acrescentar caso de sucesso, cliente anterior ou resultado obtido
• Afirmar qualquer coisa sobre a operação interna da empresa
Se o template não traz um dado, a mensagem adaptada também não traz.`;

      const userPrompt = `LEAD:
• Empresa: ${lead.business_name}
• Nicho: ${lead.niche || "não especificado"}
• Cidade: ${lead.location || "não especificada"}
• Site: ${lead.website ? "tem site" : "não tem site"}

TEMPLATE BASE:
${template}

Retorne APENAS a mensagem final adaptada.`;

      try {
        const result = await aiCall({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          role: "fast",
          temperature: 0.6,
          max_tokens: 400,
        });

        await recordUsage(supabase, {
          userId: effectiveUserId,
          usage: result.usage,
          purpose: "template_personalization",
          leadId: lead?.id ?? null,
          agent: "copy",
        });

        return json({ message: cleanMessage(result.text) });
      } catch (error) {
        // Aqui o fallback é legítimo: o texto é do próprio usuário, e trocar
        // as variáveis não inventa nada. É o único caso em que seguir sem IA
        // não coloca uma afirmação falsa no WhatsApp de ninguém.
        console.error("[ai-prospecting] IA indisponível, aplicando template cru:", error);

        const fallback = String(template)
          .replace(/\{(empresa|nome_empresa|nome)\}/gi, lead.business_name ?? "")
          .replace(/\{nicho\}/gi, lead.niche ?? "seu segmento")
          .replace(/\{(cidade|localização|localizacao)\}/gi, lead.location ?? "sua região")
          .replace(/\{telefone\}/gi, lead.phone ?? "");

        return json({ message: fallback, used_fallback: true });
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

    // ------------------------------------------------------------
    // Análise de dores + mensagem (uma ou várias empresas)
    // ------------------------------------------------------------
    // As duas ações antigas ("analyze_and_personalize" e "batch_analyze")
    // faziam a mesma coisa com prompts diferentes, chamavam o gateway Lovable
    // direto — sem DeepSeek e sem fallback — e, quando falhavam, devolviam
    // "Olá! Vi que a X pode crescer mais. Posso ajudar?".
    //
    // Agora as duas passam pela esteira. As dores deixam de ser adivinhadas:
    // vêm da auditoria do site e do que o lead já disse.
    if (action === "analyze_and_personalize" || action === "batch_analyze") {
      const targets = action === "batch_analyze"
        ? (Array.isArray(data.leads) ? data.leads.slice(0, 5) : [])
        : [data.lead].filter(Boolean);

      if (targets.length === 0) {
        return json({ error: "Informe ao menos um lead." }, 400);
      }

      const agentSettings = data.agentSettings ?? {};
      const catalog = await loadCatalog(supabase, effectiveUserId, []);

      const analyzeOne = async (input: Record<string, unknown>) => {
        const leadId = typeof input.id === "string" ? input.id : null;

        const { data: stored } = leadId
          ? await supabase.from("leads").select("*").eq("id", leadId)
            .eq("user_id", effectiveUserId).maybeSingle()
          : { data: null };

        const source = stored ?? {
          id: leadId ?? "preview",
          business_name: String(input.business_name ?? ""),
          phone: String(input.phone ?? "0"),
          niche: (input.niche as string) ?? null,
          location: (input.location as string) ?? null,
          website: (input.website as string) ?? null,
          rating: (input.rating as number) ?? null,
          reviews_count: (input.reviews_count as number) ?? null,
        };

        const dossier = buildDossier({ lead: source });
        const qualification = qualify(dossier, {});
        const match = matchOffer(dossier, catalog);
        const strategy = buildStrategy({
          dossier, qualification, match, goal: "agendar_demonstracao",
        });

        // As "dores" agora são o que foi observado, não o que a IA supôs.
        // Quando não há nada observado, o campo volta vazio — e vazio é a
        // resposta honesta para uma empresa sobre a qual não se sabe nada.
        const painPoints = dossier.observedNeeds.slice(0, 4);

        try {
          const prompt = buildCopyPrompt({
            dossier,
            strategy,
            sender: {
              agentName: (agentSettings.agent_name as string) ?? "um consultor",
              persona: (agentSettings.agent_persona as string) ?? null,
              communicationStyle: (agentSettings.communication_style as string) ?? null,
              emojiUsage: (agentSettings.emoji_usage as string) ?? null,
              companyName: null,
            },
          });

          const result = await aiCall({
            messages: [
              { role: "system", content: prompt.system },
              { role: "user", content: prompt.user },
            ],
            role: "primary",
            temperature: 0.8,
            max_tokens: 400,
          });

          await recordUsage(supabase, {
            userId: effectiveUserId,
            usage: result.usage,
            purpose: "analyze_and_personalize",
            leadId,
            agent: "copy",
          });

          const message = cleanMessage(result.text);
          const verdict = evaluateQuality({ message, dossier, strategy });

          return {
            leadId,
            painPoints,
            hypotheses: dossier.hypotheses.map((h) => h.statement).slice(0, 3),
            message: verdict.approved ? message : null,
            blocked: !verdict.approved,
            quality: verdict.scores,
            issues: verdict.issues,
            score: qualification.score,
            offer: match.offer?.name ?? null,
          };
        } catch (error) {
          console.error("[ai-prospecting] análise falhou:", error);
          return {
            leadId,
            painPoints,
            hypotheses: dossier.hypotheses.map((h) => h.statement).slice(0, 3),
            message: null,
            blocked: true,
            error: "IA indisponível. Nenhuma mensagem genérica foi gerada no lugar.",
            score: qualification.score,
            offer: match.offer?.name ?? null,
          };
        }
      };

      const results = await Promise.all(targets.map(analyzeOne));

      // Compatibilidade: a tela de diagnóstico espera o objeto direto.
      return action === "batch_analyze"
        ? json({ results })
        : json(results[0]);
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

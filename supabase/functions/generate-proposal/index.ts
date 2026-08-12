import { createClient } from "npm:@supabase/supabase-js@2";
import { complete } from "../_shared/ai.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = userData.user.id;
    const { lead_id, service_name } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "lead_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get lead data
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .eq("user_id", userId)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get lead qualification
    const { data: qualification } = await supabase
      .from("lead_qualification")
      .select("*")
      .eq("lead_id", lead_id)
      .single();

    // Get conversation history
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("content, sender_type")
      .eq("lead_id", lead_id)
      .order("sent_at", { ascending: true })
      .limit(30);

    // Get service intelligence
    const { data: serviceIntelligence } = await supabase
      .from("service_intelligence")
      .select("*")
      .eq("user_id", userId);

    const targetService = service_name 
      ? serviceIntelligence?.find(s => s.service_name.toLowerCase().includes(service_name.toLowerCase()))
      : serviceIntelligence?.[0];

    // Get user settings
    const { data: settings } = await supabase
      .from("user_settings")
      .select("knowledge_base, agent_persona, services_offered")
      .eq("user_id", userId)
      .single();

    // Get buying signals
    const { data: buyingSignals } = await supabase
      .from("buying_signals")
      .select("*")
      .eq("lead_id", lead_id)
      .order("signal_strength", { ascending: false })
      .limit(5);


    // Build conversation context
    const conversationContext = messages?.map(m => 
      `${m.sender_type === "lead" ? "Cliente" : "Agente"}: ${m.content}`
    ).join("\n") || "Sem histórico de conversa";

    // Build prompt
    const systemPrompt = `Você é um especialista em criar propostas comerciais personalizadas e persuasivas.
Sua tarefa é gerar uma proposta completa em formato JSON baseada no contexto do cliente e nas necessidades identificadas.

A proposta deve ser:
- Personalizada para o negócio do cliente
- Focada nas dores e necessidades identificadas
- Clara nos entregáveis e benefícios
- Profissional mas acessível

IMPORTANTE: Retorne APENAS um JSON válido, sem explicações ou markdown.`;

    const userPrompt = `Gere uma proposta comercial para:

# CLIENTE
- Empresa: ${lead.business_name}
- Nicho: ${lead.niche || "Não especificado"}
- Localização: ${lead.location || "Não especificada"}
- Website: ${lead.website || "Não possui"}
- Avaliação: ${lead.rating ? `${lead.rating}★` : "N/A"}

# QUALIFICAÇÃO BANT
- Budget: ${qualification?.budget_status || "desconhecido"} - ${qualification?.budget_details || ""}
- Authority: ${qualification?.authority_status || "desconhecido"} - ${qualification?.authority_details || ""}
- Need: ${qualification?.need_status || "desconhecido"} - ${qualification?.need_details || ""}
- Timeline: ${qualification?.timeline_status || "desconhecido"} - ${qualification?.timeline_details || ""}
- Valor estimado: ${qualification?.deal_value_estimate ? `R$${qualification.deal_value_estimate}` : "A definir"}

# DORES IDENTIFICADAS
${lead.pain_points?.join(", ") || "Não identificadas"}

# SINAIS DE COMPRA
${buyingSignals?.map(s => `- ${s.signal_type}: "${s.signal_text}"`).join("\n") || "Nenhum"}

# HISTÓRICO DA CONVERSA
${conversationContext}

# SERVIÇO ALVO
${targetService ? `
Nome: ${targetService.service_name}
Descrição: ${targetService.description}
Benefícios: ${targetService.benefits?.join(", ")}
Preço: ${targetService.pricing_info}
` : service_name || "Serviço geral"}

# CONHECIMENTO DA EMPRESA
${settings?.knowledge_base || ""}

Retorne um JSON com esta estrutura:
{
  "proposal_title": "Título atraente da proposta",
  "executive_summary": "Resumo executivo de 2-3 parágrafos",
  "identified_needs": ["necessidade 1", "necessidade 2", ...],
  "proposed_solution": "Descrição detalhada da solução proposta",
  "deliverables": [
    {"item": "Entregável 1", "description": "Descrição"},
    {"item": "Entregável 2", "description": "Descrição"}
  ],
  "benefits": ["Benefício 1", "Benefício 2", ...],
  "pricing_breakdown": {
    "setup": {"description": "Setup inicial", "value": 1000},
    "monthly": {"description": "Mensalidade", "value": 2000}
  },
  "total_investment": 3000,
  "timeline": "Descrição do cronograma",
  "guarantee": "Garantia ou condições especiais",
  "next_steps": ["Passo 1", "Passo 2", ...],
  "valid_until": "Data de validade"
}`;

    // Pela camada comum: ela percorre OpenAI, DeepSeek e Lovable na ordem,
    // repete o que vale a pena repetir e registra o consumo. Falar direto com
    // um provedor deixava esta tela sem reserva e fora do painel de custo.
    const ai = await complete(systemPrompt, userPrompt, {
      temperature: 0.7,
      max_tokens: 3000,
    });

    const rawContent = ai.text;

    // Parse JSON from response
    let proposalData;
    try {
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        proposalData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", rawContent);
      throw new Error("Failed to parse proposal data");
    }

    // Save proposal to database
    const { data: savedProposal, error: saveError } = await supabase
      .from("generated_proposals")
      .insert({
        lead_id,
        user_id: userId,
        service_id: targetService?.id || null,
        proposal_title: proposalData.proposal_title,
        executive_summary: proposalData.executive_summary,
        identified_needs: proposalData.identified_needs,
        proposed_solution: proposalData.proposed_solution,
        deliverables: proposalData.deliverables,
        pricing_breakdown: {
          ...proposalData.pricing_breakdown,
          total: proposalData.total_investment,
        },
        timeline: proposalData.timeline,
        terms_conditions: `Garantia: ${proposalData.guarantee}\nVálido até: ${proposalData.valid_until}`,
        status: "draft",
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving proposal:", saveError);
      throw new Error("Failed to save proposal");
    }

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: userId,
      lead_id,
      activity_type: "proposal_generated",
      description: `Proposta "${proposalData.proposal_title}" gerada automaticamente`,
      metadata: { proposal_id: savedProposal.id },
    });

    console.log(`Proposal generated for lead ${lead_id}: ${savedProposal.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        proposal: {
          ...savedProposal,
          full_data: proposalData,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Generate proposal error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate proposal" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

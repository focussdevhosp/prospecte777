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

    const { service_name, context } = await req.json();

    if (!service_name) {
      return new Response(
        JSON.stringify({ error: "service_name is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;
    const serviceSlug = service_name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_|_$/g, "");

    // Check if service already exists
    const { data: existing } = await supabase
      .from("service_intelligence")
      .select("id")
      .eq("user_id", userId)
      .eq("service_slug", serviceSlug)
      .single();

    if (existing) {
      return new Response(
        JSON.stringify({ 
          error: "Service already exists", 
          service_id: existing.id,
          message: "Este serviço já foi cadastrado. Use a edição para atualizar."
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's knowledge base for additional context
    const { data: settings } = await supabase
      .from("user_settings")
      .select("knowledge_base, agent_persona, services_offered")
      .eq("user_id", userId)
      .single();


    console.log(`Generating intelligence for service: ${service_name}`);

    // Generate comprehensive service intelligence using AI
    const systemPrompt = `Você é um especialista em vendas e marketing digital B2B no Brasil.
Sua tarefa é criar uma base de conhecimento completa sobre um serviço para treinar um agente de vendas.

O resultado deve ser um JSON válido com a seguinte estrutura:
{
  "description": "Descrição clara e vendedora do serviço (2-3 frases)",
  "benefits": ["benefício 1", "benefício 2", "benefício 3", "benefício 4", "benefício 5"],
  "pain_points": ["dor que resolve 1", "dor que resolve 2", "dor que resolve 3"],
  "objection_responses": {
    "price": "Resposta para objeção de preço",
    "timing": "Resposta para 'não é o momento'",
    "need": "Resposta para 'não preciso'",
    "trust": "Resposta para desconfiança",
    "competition": "Resposta quando cita concorrência"
  },
  "pricing_info": "Informação sobre modelo de preço (ex: 'A partir de R$X/mês' ou 'Projeto sob consulta')",
  "case_studies": ["Resultado real ou fictício 1", "Resultado real ou fictício 2"],
  "faq": [
    {"question": "Pergunta frequente 1", "answer": "Resposta"},
    {"question": "Pergunta frequente 2", "answer": "Resposta"},
    {"question": "Pergunta frequente 3", "answer": "Resposta"}
  ],
  "opening_templates": [
    "Template de abertura 1 (curto, máx 2 frases)",
    "Template de abertura 2 (curto, máx 2 frases)"
  ],
  "follow_up_templates": [
    "Template de follow-up 1 (curto)",
    "Template de follow-up 2 (curto)"
  ],
  "closing_templates": [
    "Template de fechamento 1",
    "Template de fechamento 2"
  ],
  "remarketing_templates": [
    "Template para remarketing 1",
    "Template para remarketing 2"
  ],
  "target_niches": ["nicho ideal 1", "nicho ideal 2", "nicho ideal 3", "nicho ideal 4", "nicho ideal 5"],
  "ideal_client_profile": "Descrição do cliente ideal para este serviço (2-3 frases)"
}

REGRAS:
- Templates devem ser CURTOS (máx 2-3 frases)
- Templates devem mostrar DOR → SOLUÇÃO → CTA
- Benefícios devem ser concretos e mensuráveis
- Objeções devem ter respostas persuasivas mas honestas
- Cases devem ser realistas para o mercado brasileiro
- FAQs devem cobrir as dúvidas mais comuns
- Nichos devem ser específicos e relevantes`;

    const userPrompt = `Gere a inteligência completa para o serviço: "${service_name}"

${context ? `Contexto adicional fornecido pelo usuário: ${context}` : ''}
${settings?.knowledge_base ? `Base de conhecimento da empresa: ${settings.knowledge_base}` : ''}
${settings?.agent_persona ? `Persona do agente: ${settings.agent_persona}` : ''}

Retorne APENAS o JSON válido, sem explicações ou markdown.`;

    // Pela camada comum: OpenAI, DeepSeek e Lovable na ordem, com repetição
    // do que vale a pena repetir e registro de consumo.
    const ai = await complete(systemPrompt, userPrompt, {
      temperature: 0.8,
      max_tokens: 3000,
    });

    const rawContent = ai.text;

    // Parse JSON from response
    let intelligence;
    try {
      // Try to extract JSON from the response
      const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        intelligence = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No JSON found in response");
      }
    } catch (parseError) {
      console.error("Failed to parse AI response:", rawContent);
      throw new Error("Failed to parse service intelligence");
    }

    // Insert into database
    const { data: serviceData, error: insertError } = await supabase
      .from("service_intelligence")
      .insert({
        user_id: userId,
        service_name: service_name,
        service_slug: serviceSlug,
        description: intelligence.description,
        benefits: intelligence.benefits,
        pain_points: intelligence.pain_points,
        objection_responses: intelligence.objection_responses,
        pricing_info: intelligence.pricing_info,
        case_studies: intelligence.case_studies,
        faq: intelligence.faq,
        opening_templates: intelligence.opening_templates,
        follow_up_templates: intelligence.follow_up_templates,
        closing_templates: intelligence.closing_templates,
        remarketing_templates: intelligence.remarketing_templates,
        target_niches: intelligence.target_niches,
        ideal_client_profile: intelligence.ideal_client_profile,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Database insert error:", insertError);
      throw new Error(`Failed to save service: ${insertError.message}`);
    }

    // Also update user_settings.services_offered to include the new service
    const currentServices = settings?.services_offered || [];
    if (!currentServices.includes(service_name)) {
      await supabase
        .from("user_settings")
        .update({
          services_offered: [...currentServices, service_name],
        })
        .eq("user_id", userId);
    }

    console.log(`Service intelligence created: ${service_name} (${serviceSlug})`);

    return new Response(
      JSON.stringify({
        success: true,
        service: serviceData,
        message: `Inteligência criada para "${service_name}" com templates e contexto completo.`,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Generate service intelligence error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate intelligence" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

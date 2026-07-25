import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Background processing function for search_leads
async function processSearchLeadsInBackground(
  supabaseUrl: string,
  supabaseServiceKey: string,
  jobId: string,
  userId: string,
  niche: string,
  location: string,
  maxResults: number,
  _serpApiKey: string,
  _serperApiKey: string | null,
  _preferredApi: string
) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Update job status to running
    await supabase
      .from("background_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);

    // Define subniches for each main niche to expand search coverage
    const SUBNICHES: Record<string, string[]> = {
      "Restaurantes": ["restaurante", "restaurantes", "comida", "gastronomia", "self-service", "rodízio", "buffet", "lanchonete", "cantina", "bistrô", "comida caseira", "comida japonesa", "comida italiana", "comida mexicana", "comida árabe", "comida chinesa", "churrascaria", "seafood", "frutos do mar"],
      "Salões de Beleza": ["salão de beleza", "salão", "cabeleireiro", "cabeleireira", "cabelo", "hair stylist", "manicure", "pedicure", "esmalteria", "nail designer", "alongamento de unhas", "maquiagem", "maquiador", "estética", "centro de estética", "sobrancelha", "design de sobrancelhas", "depilação", "massagem"],
      "Academias": ["academia", "fitness", "musculação", "crossfit", "pilates", "yoga", "funcional", "treino", "personal trainer", "ginástica", "spinning", "natação", "artes marciais", "luta", "boxe", "muay thai", "jiu jitsu", "karate"],
      "Clínicas Médicas": ["clínica médica", "clínica", "consultório médico", "médico", "centro médico", "policlínica", "clínica geral", "dermatologista", "cardiologista", "ortopedista", "ginecologista", "pediatra", "oftalmologista", "neurologista", "psiquiatra", "endocrinologista"],
      "Clínicas Odontológicas": ["clínica odontológica", "dentista", "odontologia", "consultório dentário", "ortodontista", "implante dentário", "clareamento dental", "prótese dentária", "endodontia", "periodontia", "odontopediatra", "cirurgião dentista"],
      "Escritórios de Advocacia": ["escritório de advocacia", "advogado", "advocacia", "advogados", "escritório jurídico", "consultoria jurídica", "advogado trabalhista", "advogado criminal", "advogado civil", "advogado família", "advogado empresarial", "advogado imobiliário"],
      "Imobiliárias": ["imobiliária", "imobiliárias", "corretor de imóveis", "corretor", "imóveis", "venda de imóveis", "aluguel de imóveis", "locação", "casas à venda", "apartamentos", "empreendimentos"],
      "Pet Shops": ["pet shop", "petshop", "loja de animais", "banho e tosa", "clínica veterinária", "veterinário", "ração", "acessórios pet", "hotel para pets", "creche para cães", "adestramento", "dog walker"],
      "Oficinas Mecânicas": ["oficina mecânica", "mecânica", "mecânico", "auto center", "autocenter", "funilaria", "pintura automotiva", "elétrica automotiva", "troca de óleo", "alinhamento", "balanceamento", "suspensão", "freios", "ar condicionado automotivo"],
      "Escolas e Cursos": ["escola", "curso", "cursos", "escola de idiomas", "inglês", "espanhol", "escola de música", "aula de música", "escola de dança", "informática", "curso técnico", "preparatório", "vestibular", "reforço escolar", "educação infantil"],
      "Lojas de Roupas": ["loja de roupas", "roupas", "moda", "boutique", "vestuário", "confecção", "loja feminina", "loja masculina", "moda feminina", "moda masculina", "moda infantil", "loja de calçados", "sapatos", "acessórios", "bolsas"],
      "Farmácias": ["farmácia", "drogaria", "farmácia de manipulação", "medicamentos", "perfumaria", "dermocosméticos"],
      "Hotéis e Pousadas": ["hotel", "pousada", "hospedagem", "motel", "resort", "hostel", "albergue", "flat", "apart hotel", "airbnb", "chalé"],
      "Estúdios de Tatuagem": ["estúdio de tatuagem", "tatuagem", "tattoo", "tatuador", "piercing", "body piercing", "micropigmentação"],
      "Barbearias": ["barbearia", "barbeiro", "barber shop", "barba", "corte masculino", "cabelo masculino"],
      "Floriculturas": ["floricultura", "flores", "florista", "arranjos florais", "buquê", "decoração floral", "plantas", "jardim", "paisagismo"],
      "Padarias": ["padaria", "panificadora", "pão", "confeitaria", "bolos", "tortas", "doces", "salgados", "café da manhã"],
      "Pizzarias": ["pizzaria", "pizza", "delivery pizza", "rodízio de pizza", "pizza artesanal"],
      "Hamburguerias": ["hamburgueria", "hambúrguer", "burger", "lanchonete", "fast food", "smash burger", "artesanal"],
      "Cafeterias": ["cafeteria", "café", "coffee shop", "expresso", "cappuccino", "latte", "brunch", "confeitaria"],
    };

    const allLeads: any[] = [];
    const seenPhones = new Set<string>();
    const seenNames = new Set<string>();

    // Get subniches for this niche, or use the niche itself
    const searchTerms = SUBNICHES[niche] || [niche.toLowerCase()];
    
    // Increased to 10 terms for better coverage
    const limitedSearchTerms = searchTerms.slice(0, 10);
    
    console.log(`[Job ${jobId}] Searching for ${niche} with ${limitedSearchTerms.length} variations in ${location} (max: ${maxResults})`);

    let processedTerms = 0;
    const totalTerms = limitedSearchTerms.length;

    for (const searchTerm of limitedSearchTerms) {
      // Stop if we have enough leads
      if (allLeads.length >= maxResults) break;

      // Single search per term (DuckDuckGo doesn't paginate like SerpAPI)
      {
        const searchQuery = `${searchTerm} em ${location} telefone contato`;
        console.log(`[Job ${jobId}] Searching DDG: "${searchQuery}"`);
        
        try {
          const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}&kl=br-pt`;
          const serpResponse = await fetch(ddgUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html',
            },
          });

          if (!serpResponse.ok) {
            console.error(`[Job ${jobId}] DDG error:`, serpResponse.status);
            continue;
          }

          const html = await serpResponse.text();
          const blocks = html.split('class="result__body"');
          
          if (blocks.length <= 1) break;

          console.log(`[Job ${jobId}] Found ${blocks.length - 1} results for "${searchTerm}"`);

          for (let bi = 1; bi < blocks.length; bi++) {
            const block = blocks[bi];
            const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
            const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').trim() : '';
            
            const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
            const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
            
            const linkMatch = block.match(/href="([^"]+)"[^>]*class="result__a"/);
            let link = linkMatch ? linkMatch[1] : '';
            if (link.includes('uddg=')) {
              link = decodeURIComponent(link.split('uddg=')[1]?.split('&')[0] || '');
            }

            const combinedText = `${title} ${snippet}`;
            const phoneMatch = combinedText.match(/\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/);
            if (!phoneMatch) continue;
            
            const phone = phoneMatch[0];
            const normalizedPhone = phone.replace(/\D/g, "");
            if (seenPhones.has(normalizedPhone)) continue;
            
            const normalizedName = title.toLowerCase().trim();
            if (normalizedName && seenNames.has(normalizedName)) continue;

            seenPhones.add(normalizedPhone);
            if (normalizedName) seenNames.add(normalizedName);

            allLeads.push({
              business_name: title || "Empresa",
              phone: phone,
              address: snippet.substring(0, 100) || null,
              rating: null,
              reviews_count: null,
              website: link || null,
              google_maps_url: null,
              place_id: null,
              type: null,
              subtype: searchTerm,
            });
          }

          // Small delay to respect rate limits
          await new Promise(r => setTimeout(r, 150));
        } catch (error) {
          console.error(`[Job ${jobId}] Search error for ${searchTerm}:`, error);
        }
      }

      processedTerms++;
      
      // Update job progress
      const progress = Math.round((processedTerms / totalTerms) * 100);
      await supabase
        .from("background_jobs")
        .update({ 
          processed_items: allLeads.length,
          current_index: processedTerms,
          last_heartbeat_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    }

    console.log(`[Job ${jobId}] Total unique leads found: ${allLeads.length}`);

    // Update job as completed with results
    await supabase
      .from("background_jobs")
      .update({ 
        status: "completed",
        completed_at: new Date().toISOString(),
        processed_items: allLeads.length,
        result: { 
          leads: allLeads,
          total: allLeads.length,
          searchTermsUsed: limitedSearchTerms,
        },
      })
      .eq("id", jobId);

  } catch (error: any) {
    console.error(`[Job ${jobId}] Background processing failed:`, error);
    
    await supabase
      .from("background_jobs")
      .update({ 
        status: "failed",
        error_message: error.message || "Unknown error",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Check if this is a service role call (internal from job-processor)
    const isServiceRoleCall = authHeader.includes(supabaseServiceKey);
    
    let user: any = null;
    let supabase: any;

    if (isServiceRoleCall) {
      // Internal call from job-processor - use service role client
      supabase = createClient(supabaseUrl, supabaseServiceKey);
      // User ID should be passed in the body for internal calls
      const body = await req.clone().json();
      if (body.user_id) {
        user = { id: body.user_id };
      }
    } else {
      // Normal user call - authenticate with JWT
      supabase = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData?.user) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      user = userData.user;
    }

    const { action, data, user_id } = await req.json();
    
    // For internal calls, use provided user_id
    const effectiveUserId = user?.id || user_id;
    
    if (!effectiveUserId) {
      return new Response(JSON.stringify({ error: "User ID required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
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
        // Direct AI mode — mensagem 1:1, humana, específica
        systemPrompt = `Você é ${agentSettings?.agent_name || "um consultor especializado"}, escrevendo pessoalmente no WhatsApp de um dono de negócio.
${agentSettings?.agent_persona || ""}

Estilo: ${agentSettings?.communication_style || "direto e amigável"}
Emojis: ${agentSettings?.emoji_usage || "no máximo 1, opcional"}
${agentSettings?.knowledge_base ? `Sua expertise: ${agentSettings.knowledge_base}` : ''}
${specificService ? `SERVIÇO A OFERECER: "${specificService}" (foque só nisso, não ofereça outros)` : `Serviços que você domina: ${servicesText}`}

OBJETIVO: iniciar uma conversa, não vender. A resposta ideal do lead é "me conta mais".

ESTRUTURA OBRIGATÓRIA (3 partes, 3 frases curtas):
1. ABERTURA PERSONALIZADA — cite algo específico do negócio dele (nome + um detalhe real: nicho, cidade, rating, falta de site, poucos reviews). Evite "vi seu perfil".
2. DOR + PROVA — mostre um problema concreto que empresas como a dele enfrentam OU um dado/resultado que gera curiosidade. Seja específico, não genérico.
3. CTA LEVE — uma pergunta simples que peça só um "sim/não" ou "pode mandar". Nada de agendar reunião ainda.

REGRAS DE FORMATO:
• 40 a 75 palavras no total. Nunca mais.
• 2 a 3 frases. Uma linha em branco pode separar a última.
• Português BR coloquial. Escreva como fala.
• Comece com "Oi", "Opa", "E aí" ou o primeiro nome do negócio. NUNCA "Prezado", "Olá, meu nome é", "Espero que esteja bem".
• Não liste serviços. Não use bullet points. Não use markdown.
• Não invente dados (não diga "vi que vocês faturam X", "seus concorrentes fazem Y") — use só o que está no LEAD.
• Se o lead NÃO TEM SITE, mencione isso. Se tem RATING BAIXO ou POUCOS REVIEWS, mencione. Use o dado real.

EXEMPLOS DE MENSAGENS BOAS:
"Oi! Passei aqui na ${lead.business_name || '[empresa]'} e reparei que vocês ainda não têm site — hoje quase todo cliente pesquisa no Google antes de comprar, e isso tá custando vendas.
Consigo montar uma página profissional pra vocês em 5 dias, otimizada pra converter. Posso te mandar 2 exemplos que fiz pra ${lead.niche || 'negócios parecidos'}?"

"Opa, tudo bem? Vi a ${lead.business_name || '[empresa]'} aqui em ${lead.location || 'sua região'} e curti o trabalho. Só que 90% dos clientes só respondem no WhatsApp e sem um atendimento rápido você perde uns 40% deles.
Tenho um sistema que responde na hora 24h e agenda sozinho. Faz sentido eu te mostrar como funciona em 2 minutos?"`;

        userPrompt = `LEAD:
• Empresa: ${lead.business_name}
• Nicho: ${lead.niche || "negócio local"}
• Cidade: ${lead.location || "—"}
• Avaliação: ${lead.rating ? `${lead.rating}★ com ${lead.reviews_count || 0} reviews` : 'sem avaliações no Google'}
• Site: ${lead.website ? 'tem site' : 'NÃO TEM SITE'}
${specificService ? `\nOFEREÇA APENAS: ${specificService}` : ''}

Escreva UMA mensagem seguindo a estrutura DOR → SOLUÇÃO → CTA.
Use o nome real da empresa e pelo menos 1 dado real do lead acima.
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
      const { niche, location, maxResults = 1000 } = data;
      
      // Get user's own API keys from settings
      const { data: userSettings } = await supabase
        .from("user_settings")
        .select("serpapi_api_key, serper_api_key, preferred_search_api")
        .eq("user_id", effectiveUserId)
        .single();
      
      const serpApiKey = userSettings?.serpapi_api_key || null;
      const serperApiKey = userSettings?.serper_api_key || null;
      const preferredApi = userSettings?.preferred_search_api || (serperApiKey ? 'serper' : serpApiKey ? 'serpapi' : 'duckduckgo');
      
      // Normalize niche and location for community DB matching
      const nicheNormalized = niche.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const locationNormalized = location.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      
      // STEP 1: Check community database first
      let communityLeads: any[] = [];
      try {
        const { data: cached } = await supabase
          .from("community_leads")
          .select("*")
          .eq("niche_normalized", nicheNormalized)
          .eq("location_normalized", locationNormalized);
        
        if (cached && cached.length > 0) {
          communityLeads = cached.map((cl: any) => ({
            business_name: cl.business_name,
            phone: cl.phone,
            address: cl.address,
            rating: cl.rating ? Number(cl.rating) : null,
            reviews_count: cl.reviews_count,
            website: cl.website,
            google_maps_url: cl.google_maps_url,
            place_id: null,
            type: null,
            subtype: cl.niche,
            source: 'community_db',
          }));
          console.log(`📦 Found ${communityLeads.length} leads in community database for ${niche} in ${location}`);
        }
      } catch (err) {
        console.error("Community DB check error:", err);
      }

      // MAPEAMENTO COMPLETO DE BAIRROS - TODAS AS CAPITAIS E PRINCIPAIS CIDADES DO BRASIL
      const CITY_REGIONS: Record<string, string[]> = {
        // ==================== REGIÃO SUDESTE ====================
        
        // SÃO PAULO - Capital e Região Metropolitana
        "São Paulo": [
          // Centro e regiões nobres
          "Centro", "Paulista", "Jardins", "Itaim Bibi", "Pinheiros", "Vila Madalena", "Perdizes",
          "Higienópolis", "Consolação", "Bela Vista", "Liberdade", "Aclimação", "Paraíso",
          // Zona Sul
          "Moema", "Vila Mariana", "Brooklin", "Campo Belo", "Santo Amaro", "Morumbi", "Vila Olímpia",
          "Saúde", "Jabaquara", "Ipiranga", "Cursino", "Vila Clementino", "Chácara Klabin",
          "Interlagos", "Cidade Dutra", "Grajaú", "Socorro", "Jurubatuba", "Campo Limpo",
          "Capão Redondo", "Jardim São Luís", "Jardim Ângela", "Parelheiros", "Marsilac",
          // Zona Oeste
          "Butantã", "Lapa", "Vila Leopoldina", "Jaguaré", "Rio Pequeno", "Raposo Tavares",
          "Pirituba", "Perus", "Jaraguá", "Freguesia do Ó", "Casa Verde", "Cachoeirinha",
          "Limão", "Vila Jaguara", "São Domingos", "Anhanguera",
          // Zona Norte
          "Santana", "Tucuruvi", "Mandaqui", "Tremembé", "Jaçanã", "Vila Guilherme",
          "Vila Maria", "Vila Medeiros", "Lauzane Paulista", "Parada Inglesa",
          "Horto Florestal", "Vila Nova Cachoeirinha", "Brasilândia",
          // Zona Leste
          "Tatuapé", "Mooca", "Penha", "Vila Prudente", "Vila Formosa", "Carrão",
          "Aricanduva", "Vila Matilde", "Água Rasa", "Belém", "Brás", "Pari",
          "São Miguel", "Itaquera", "Guaianases", "São Mateus", "Sapopemba",
          "Ermelino Matarazzo", "Cangaíba", "Ponte Rasa", "Artur Alvim", "Cidade Líder",
          "Vila Curuçá", "Lajeado", "Iguatemi", "São Rafael", "Jardim Helena",
          "Itaim Paulista", "Cidade Tiradentes", "José Bonifácio",
          // Região Metropolitana
          "Guarulhos", "Osasco", "Santo André", "São Bernardo do Campo", "São Caetano do Sul",
          "Diadema", "Mauá", "Suzano", "Mogi das Cruzes", "Barueri", "Alphaville",
          "Cotia", "Taboão da Serra", "Embu das Artes", "Itapecerica da Serra",
          "Ferraz de Vasconcelos", "Poá", "Itaquaquecetuba", "Arujá", "Carapicuíba",
          "Jandira", "Itapevi", "Santana de Parnaíba", "Franco da Rocha", "Caieiras",
          "Francisco Morato", "Ribeirão Pires", "Rio Grande da Serra", "Vargem Grande Paulista"
        ],
        
        // Interior de SP - Principais cidades
        "Campinas": [
          "Centro", "Cambuí", "Taquaral", "Barão Geraldo", "Sousas", "Nova Campinas",
          "Guanabara", "Jardim das Paineiras", "Jardim Chapadão", "Vila Industrial",
          "Ponte Preta", "Bosque", "Alto de Pinheiros", "Jardim Flamboyant",
          "Parque Prado", "Jardim Proença", "Mansões Santo Antônio", "Cidade Universitária",
          "Valinhos", "Vinhedo", "Sumaré", "Hortolândia", "Paulínia", "Americana", "Indaiatuba"
        ],
        "Santos": [
          "Centro", "Gonzaga", "Boqueirão", "Embaré", "Aparecida", "Pompéia", "Ponta da Praia",
          "José Menino", "Campo Grande", "Vila Belmiro", "Marapé", "Encruzilhada",
          "São Vicente", "Guarujá", "Praia Grande", "Cubatão", "Bertioga"
        ],
        "Ribeirão Preto": [
          "Centro", "Jardim Irajá", "Jardim Sumaré", "Alto da Boa Vista", "Jardim Canadá",
          "Jardim São Luiz", "Jardim América", "Vila Tibério", "Campos Elíseos",
          "Jardim Macedo", "Ribeirânia", "Lagoinha", "Santa Cruz", "Jardim Califórnia",
          "Sertãozinho", "Jardinópolis", "Cravinhos", "Brodowski"
        ],
        "São José dos Campos": [
          "Centro", "Jardim Aquarius", "Jardim das Indústrias", "Vila Adyana", "Urbanova",
          "Jardim Esplanada", "Jardim São Dimas", "Santana", "Vila Industrial",
          "Bosque dos Eucaliptos", "Jardim Satélite", "Eugênio de Melo",
          "Jacareí", "Caçapava", "Taubaté", "Pindamonhangaba"
        ],
        "Sorocaba": [
          "Centro", "Jardim Faculdade", "Campolim", "Parque Campolim", "Jardim Europa",
          "Alto da Boa Vista", "Jardim Santa Rosália", "Jardim Vergueiro", "Vila Haro",
          "Votorantim", "Itu", "Salto", "Araçoiaba da Serra"
        ],
        "Jundiaí": [
          "Centro", "Anhangabaú", "Vila Arens", "Jardim Tamoio", "Chácara Urbana",
          "Jardim São Bento", "Ponte São João", "Eloy Chaves", "Várzea Paulista", "Campo Limpo Paulista"
        ],
        "Piracicaba": [
          "Centro", "São Dimas", "Cidade Alta", "Alto", "Vila Rezende", "Nova América",
          "Castelinho", "Paulicéia", "Água Branca", "Jardim Elite"
        ],
        "Bauru": [
          "Centro", "Jardim Estoril", "Jardim América", "Altos da Cidade", "Vila Universitária",
          "Jardim Bela Vista", "Jardim Europa", "Vila Santa Tereza"
        ],
        "São José do Rio Preto": [
          "Centro", "Jardim Vivendas", "Boa Vista", "Jardim Redentor", "Redentora",
          "Higienópolis", "Jardim Yolanda", "Jardim Nazareth"
        ],
        "Franca": ["Centro", "Jardim Palma", "São José", "Jardim Francano", "Cidade Nova"],
        "Marília": ["Centro", "Barbosa", "Palmital", "Jardim Cavalari", "Fragata"],
        "Presidente Prudente": ["Centro", "Jardim Aviação", "Jardim das Rosas", "Vila Marcondes"],
        "Araraquara": ["Centro", "Jardim das Hortênsias", "Carmo", "Santana", "Vila Xavier"],
        "São Carlos": ["Centro", "Jardim São Carlos", "Vila Nery", "Parque Faber"],
        "Limeira": ["Centro", "Jardim Piratininga", "Vila Claudia", "Jardim Morro Azul"],
        "Taubaté": ["Centro", "Jardim das Nações", "Barranco", "Estiva", "Vila São José"],
        "Guaratinguetá": ["Centro", "Pedregulho", "Santa Luzia", "Jardim do Vale"],
        
        // RIO DE JANEIRO - Capital e Região Metropolitana
        "Rio de Janeiro": [
          // Zona Sul
          "Centro", "Copacabana", "Ipanema", "Leblon", "Botafogo", "Flamengo", "Catete",
          "Laranjeiras", "Humaitá", "Lagoa", "Gávea", "Jardim Botânico", "São Conrado",
          "Leme", "Urca", "Glória", "Santa Teresa", "Vidigal",
          // Zona Norte
          "Tijuca", "Grajaú", "Vila Isabel", "Maracanã", "Andaraí", "Méier", "Engenho Novo",
          "Lins de Vasconcelos", "Cachambi", "Del Castilho", "Maria da Graça", "Higienópolis",
          "Madureira", "Penha", "Olaria", "Ramos", "Bonsucesso", "Piedade", "Cascadura",
          "Irajá", "Vicente de Carvalho", "Colégio", "Rocha Miranda", "Turiaçu", "Oswaldo Cruz",
          "Vila da Penha", "Brás de Pina", "Cordovil", "Parada de Lucas",
          // Zona Oeste
          "Barra da Tijuca", "Recreio dos Bandeirantes", "Jacarepaguá", "Taquara", "Freguesia",
          "Pechincha", "Tanque", "Curicica", "Gardênia Azul", "Cidade de Deus",
          "Campo Grande", "Santa Cruz", "Bangu", "Realengo", "Padre Miguel", "Deodoro",
          "Senador Camará", "Cosmos", "Inhoaíba", "Paciência", "Sepetiba", "Guaratiba",
          // Centro e Portuária
          "Lapa", "Caju", "Santo Cristo", "Saúde", "Gamboa",
          // Região Metropolitana
          "Niterói", "São Gonçalo", "Duque de Caxias", "Nova Iguaçu", "Nilópolis",
          "Belford Roxo", "São João de Meriti", "Mesquita", "Magé", "Itaboraí",
          "Maricá", "Queimados", "Japeri", "Seropédica", "Paracambi"
        ],
        "Niterói": [
          "Centro", "Icaraí", "Ingá", "Santa Rosa", "São Francisco", "Charitas",
          "Piratininga", "Itaipu", "São Domingos", "Fonseca", "Barreto", "Pendotiba"
        ],
        "Campos dos Goytacazes": ["Centro", "Pelinca", "Parque Tamandaré", "Flamboyant", "Guarus"],
        "Petrópolis": ["Centro", "Quitandinha", "Itaipava", "Corrêas", "Alto da Serra"],
        "Volta Redonda": ["Centro", "Vila Santa Cecília", "Retiro", "Aterrado", "Niterói"],
        "Nova Friburgo": ["Centro", "Olaria", "Cônego", "Conselheiro Paulino", "Mury"],
        
        // MINAS GERAIS - Capital e principais cidades
        "Belo Horizonte": [
          "Centro", "Savassi", "Funcionários", "Lourdes", "Sion", "Santo Antônio",
          "Pampulha", "Buritis", "Belvedere", "Cidade Nova", "Santa Efigênia",
          "Gutierrez", "Padre Eustáquio", "Prado", "Barroca", "Nova Suíça",
          "Anchieta", "Carmo", "Cruzeiro", "Floresta", "Santa Teresa", "Serra",
          "Barro Preto", "Carlos Prates", "Coração Eucarístico", "Caiçaras",
          "São Bento", "Santo Agostinho", "Sagrada Família", "Jaraguá", "Castelo",
          "Ouro Preto", "Cidade Jardim", "Mangabeiras", "Santa Lúcia", "São Pedro",
          "São Lucas", "Horto", "Santa Inês", "Silveira", "União",
          // Região Metropolitana
          "Contagem", "Betim", "Nova Lima", "Lagoa Santa", "Santa Luzia",
          "Ribeirão das Neves", "Vespasiano", "Pedro Leopoldo", "Sabará", "Ibirité"
        ],
        "Uberlândia": [
          "Centro", "Santa Mônica", "Tibery", "Martins", "Saraiva", "Jardim Karaíba",
          "Vigilato Pereira", "Santa Maria", "Brasil", "Umuarama", "Luizote de Freitas"
        ],
        "Juiz de Fora": [
          "Centro", "São Mateus", "Cascatinha", "Bom Pastor", "Alto dos Passos",
          "São Pedro", "Costa Carvalho", "Jardim Glória", "Granbery"
        ],
        "Contagem": ["Centro", "Eldorado", "Industrial", "Riacho", "Ressaca", "Jardim Riacho"],
        "Betim": ["Centro", "Jardim Teresópolis", "Citrolândia", "Imbiruçu", "Angola"],
        "Montes Claros": ["Centro", "Major Prates", "Ibituruna", "Santos Reis", "Todos os Santos"],
        "Uberaba": ["Centro", "Mercês", "São Benedito", "Fabrício", "Estados Unidos"],
        "Governador Valadares": ["Centro", "São Paulo", "Vila Bretas", "Santos Dumont"],
        "Ipatinga": ["Centro", "Cidade Nobre", "Iguaçu", "Veneza", "Horto"],
        "Sete Lagoas": ["Centro", "Várzea", "Progresso", "Santa Delfina", "Jardim Cambuí"],
        "Divinópolis": ["Centro", "Niterói", "Afonso Pena", "Porto Velho", "Serra Verde"],
        "Poços de Caldas": ["Centro", "Jardim Quisisana", "Jardim Country Club", "Santa Rosália"],
        "Pouso Alegre": ["Centro", "Fátima", "São João", "São Geraldo", "Medicina"],
        "Varginha": ["Centro", "Jardim Andere", "São Geraldo", "Centenário"],
        "Barbacena": ["Centro", "São José", "Boa Morte", "Boa Vista"],
        
        // ESPÍRITO SANTO
        "Vitória": [
          "Centro", "Jardim da Penha", "Praia do Canto", "Jardim Camburi", "Mata da Praia",
          "Santa Lúcia", "Bento Ferreira", "Enseada do Suá", "Ilha do Boi", "Santa Helena",
          "Goiabeiras", "Barro Vermelho", "Consolação", "Jucutuquara", "Maruípe"
        ],
        "Vila Velha": [
          "Centro", "Praia da Costa", "Itapuã", "Itaparica", "Praia de Itapoã",
          "Glória", "Coqueiral de Itaparica", "Divino Espírito Santo", "Araçás"
        ],
        "Serra": ["Centro", "Laranjeiras", "Jacaraípe", "Manguinhos", "Carapina", "Novo Horizonte"],
        "Cariacica": ["Centro", "Campo Grande", "Jardim América", "Itacibá", "Flexal"],
        "Cachoeiro de Itapemirim": ["Centro", "Gilberto Machado", "Ferroviários", "BNH"],
        "Linhares": ["Centro", "Movelar", "Interlagos", "Shell", "Três Barras"],
        "Colatina": ["Centro", "São Silvano", "Marista", "Esplanada"],
        
        // ==================== REGIÃO SUL ====================
        
        // PARANÁ
        "Curitiba": [
          "Centro", "Batel", "Água Verde", "Bigorrilho", "Champagnat", "Juvevê",
          "Portão", "Santa Felicidade", "Cabral", "Alto da Glória", "Cristo Rei",
          "Boa Vista", "Bacacheri", "Ahú", "Mercês", "Campo Comprido", "Rebouças",
          "Alto da XV", "Jardim Botânico", "Pilarzinho", "São Francisco", "Centro Cívico",
          "Prado Velho", "Jardim Social", "Tarumã", "Capão Raso", "Xaxim",
          "Novo Mundo", "Fazendinha", "Cidade Industrial", "Hauer", "Seminário",
          // Região Metropolitana
          "Colombo", "São José dos Pinhais", "Araucária", "Pinhais", "Campo Largo",
          "Almirante Tamandaré", "Piraquara", "Fazenda Rio Grande", "Quatro Barras", "Campina Grande do Sul"
        ],
        "Londrina": [
          "Centro", "Gleba Palhano", "Bela Suíça", "Jardim Higienópolis", "Vila Brasil",
          "Jardim Cláudia", "Antares", "Petrópolis", "Aurora", "Cadeião", "Shangri-lá",
          "Cambé", "Ibiporã", "Rolândia"
        ],
        "Maringá": [
          "Centro", "Zona 7", "Zona 5", "Zona 3", "Novo Centro", "Vila Esperança",
          "Jardim Alvorada", "Jardim Aclimação", "Parque das Grevíleas", "Vila Morangueira",
          "Sarandi", "Paiçandu", "Mandaguari"
        ],
        "Ponta Grossa": [
          "Centro", "Estrela", "Jardim Carvalho", "Uvaranas", "Nova Rússia", "Olarias",
          "Oficinas", "Ronda", "Boa Vista", "Neves"
        ],
        "Cascavel": [
          "Centro", "Pioneiros Catarinenses", "Recanto Tropical", "Country", "São Cristóvão",
          "Neva", "Tropical", "Esmeralda", "Brasília"
        ],
        "Foz do Iguaçu": [
          "Centro", "Vila Portes", "Jardim América", "Morumbi", "Porto Meira",
          "Jardim Central", "Vila Carimã", "Itaipu"
        ],
        "São José dos Pinhais": ["Centro", "Afonso Pena", "Boneca do Iguaçu", "Del Rey", "Guatupê"],
        "Colombo": ["Centro", "Maracanã", "Atuba", "Jardim Guaraituba", "Alto Maracanã"],
        "Guarapuava": ["Centro", "Trianon", "Batel", "Santa Cruz", "Alto da XV"],
        "Paranaguá": ["Centro", "Vila Cruzeiro", "Tuiuti", "Leblon", "Vila Guarani"],
        
        // RIO GRANDE DO SUL
        "Porto Alegre": [
          "Centro", "Moinhos de Vento", "Cidade Baixa", "Menino Deus", "Petrópolis",
          "Mont Serrat", "Bela Vista", "Bom Fim", "Floresta", "Independência",
          "Rio Branco", "Auxiliadora", "Boa Vista", "Higienópolis", "Passo da Areia",
          "Três Figueiras", "Jardim Botânico", "Cristal", "Santana", "Partenon",
          "Ipanema", "Tristeza", "Cavalhada", "Vila Assunção", "Camaquã",
          "Nonoai", "Teresópolis", "Azenha", "Praia de Belas", "Farroupilha",
          // Região Metropolitana
          "Canoas", "Novo Hamburgo", "São Leopoldo", "Gravataí", "Viamão",
          "Cachoeirinha", "Alvorada", "Sapucaia do Sul", "Esteio", "Guaíba"
        ],
        "Caxias do Sul": [
          "Centro", "São Pelegrino", "Lourdes", "Pio X", "Exposição", "Panazzolo",
          "Universitário", "Santa Catarina", "Nossa Senhora de Fátima", "Rio Branco"
        ],
        "Pelotas": [
          "Centro", "Areal", "Laranjal", "Três Vendas", "Fragata", "Porto",
          "Zona Norte", "São Gonçalo", "Simões Lopes"
        ],
        "Santa Maria": [
          "Centro", "Nossa Senhora de Fátima", "Camobi", "Patronato", "Itararé",
          "Medianeira", "Urlândia", "Tomazetti", "Passo d'Areia"
        ],
        "Novo Hamburgo": ["Centro", "Canudos", "Ideal", "Rio Branco", "Hamburgo Velho", "Primavera"],
        "São Leopoldo": ["Centro", "Cristo Rei", "Scharlau", "Feitoria", "Rio dos Sinos"],
        "Rio Grande": ["Centro", "Cidade Nova", "Cassino", "Parque", "Vila São João"],
        "Passo Fundo": ["Centro", "Vera Cruz", "Petrópolis", "Boqueirão", "São José"],
        "Canoas": ["Centro", "Nossa Senhora das Graças", "Marechal Rondon", "Niterói", "Mathias Velho"],
        "Gravataí": ["Centro", "Barnabé", "Cohab", "Morada do Vale", "São Jerônimo"],
        
        // SANTA CATARINA
        "Florianópolis": [
          "Centro", "Trindade", "Itacorubi", "Lagoa da Conceição", "Ingleses",
          "Canasvieiras", "Jurerê", "Jurerê Internacional", "Campeche", "Coqueiros",
          "Estreito", "Abraão", "Capoeiras", "Córrego Grande", "Santa Mônica",
          "Saco dos Limões", "Costeira", "Rio Tavares", "Tapera", "Ribeirão da Ilha",
          "Santo Antônio de Lisboa", "Ratones", "Vargem Grande", "Vargem Pequena",
          // Continente e Região
          "São José", "Palhoça", "Biguaçu", "Santo Amaro da Imperatriz"
        ],
        "Joinville": [
          "Centro", "América", "Bucarein", "Anita Garibaldi", "Santo Antônio",
          "Glória", "Iririú", "Saguaçu", "Atiradores", "Bom Retiro", "Floresta",
          "Costa e Silva", "Pirabeiraba", "Aventureiro", "Paranaguamirim"
        ],
        "Blumenau": [
          "Centro", "Victor Konder", "Ponta Aguda", "Velha", "Itoupava Norte",
          "Itoupava Seca", "Vila Nova", "Fortaleza", "Garcia", "Progresso",
          "Gaspar", "Indaial", "Timbó"
        ],
        "São José": ["Centro", "Kobrasol", "Campinas", "Barreiros", "Forquilhinhas", "Ipiranga"],
        "Criciúma": ["Centro", "Comerciário", "Michel", "Santa Bárbara", "Pinheirinho", "Pio Corrêa"],
        "Chapecó": ["Centro", "Maria Goretti", "Presidente Médici", "São Cristóvão", "Efapi"],
        "Itajaí": ["Centro", "Fazenda", "Dom Bosco", "São Vicente", "Ressacada"],
        "Balneário Camboriú": ["Centro", "Pioneiros", "Barra Sul", "Vila Real", "Nações"],
        "Lages": ["Centro", "Universitário", "Coral", "Santa Helena", "Copacabana"],
        "Jaraguá do Sul": ["Centro", "Amizade", "Czerniewicz", "Rau", "Vila Lalau"],
        "Palhoça": ["Centro", "Pagani", "Aririu", "São Sebastião", "Ponte do Imaruim"],
        
        // ==================== REGIÃO NORDESTE ====================
        
        // BAHIA
        "Salvador": [
          "Centro", "Barra", "Pituba", "Itaigara", "Ondina", "Rio Vermelho",
          "Brotas", "Graça", "Federação", "Caminho das Árvores", "Stiep",
          "Paralela", "Imbuí", "Patamares", "Piatã", "Stella Maris", "Jaguaribe",
          "Costa Azul", "Armação", "Boca do Rio", "Iguatemi", "Cabula",
          "Pernambués", "Sussuarana", "Cajazeiras", "Mussurunga", "Itapuã",
          "Bairro da Paz", "Liberdade", "Nazaré", "Garcia", "Canela", "Vitória",
          // Região Metropolitana
          "Lauro de Freitas", "Camaçari", "Simões Filho", "Dias d'Ávila", "Candeias"
        ],
        "Feira de Santana": [
          "Centro", "Santa Mônica", "Tomba", "Cidade Nova", "Capuchinhos",
          "SIM", "Ponto Central", "Sobradinho", "Brasília", "Santo Antônio dos Prazeres"
        ],
        "Vitória da Conquista": ["Centro", "Recreio", "Candeias", "Jurema", "Brasil"],
        "Camaçari": ["Centro", "Nova Vitória", "Phoc I", "Abrantes", "Catu de Abrantes"],
        "Itabuna": ["Centro", "Pontalzinho", "Jardim Primavera", "Sarinha", "Conceição"],
        "Juazeiro": ["Centro", "Country Club", "Alto do Cruzeiro", "João Paulo II"],
        "Ilhéus": ["Centro", "Malhado", "Pontal", "São Francisco", "Conquista"],
        "Lauro de Freitas": ["Centro", "Vilas do Atlântico", "Buraquinho", "Itinga", "Portão"],
        
        // PERNAMBUCO
        "Recife": [
          "Centro", "Boa Viagem", "Casa Forte", "Espinheiro", "Derby", "Graças",
          "Aflitos", "Madalena", "Torre", "Encruzilhada", "Tamarineira", "Jaqueira",
          "Parnamirim", "Santana", "Poço", "Casa Amarela", "Apipucos", "Monteiro",
          "Imbiribeira", "Pina", "Brasília Teimosa", "Arruda", "Campo Grande",
          "Várzea", "Cidade Universitária", "Tejipió", "Barro", "Jordão", "Ibura",
          // Região Metropolitana
          "Olinda", "Jaboatão dos Guararapes", "Paulista", "Camaragibe", "Cabo de Santo Agostinho",
          "Igarassu", "Abreu e Lima", "São Lourenço da Mata", "Moreno"
        ],
        "Olinda": ["Centro", "Casa Caiada", "Bairro Novo", "Carmo", "Rio Doce", "Jardim Atlântico"],
        "Jaboatão dos Guararapes": ["Centro", "Piedade", "Candeias", "Cavaleiro", "Prazeres"],
        "Caruaru": ["Centro", "Maurício de Nassau", "Universitário", "Indianópolis", "Salgado"],
        "Petrolina": ["Centro", "Centro", "Areia Branca", "Cohab Massangano", "Maria Auxiliadora"],
        "Paulista": ["Centro", "Maranguape", "Pau Amarelo", "Janga", "Arthur Lundgren"],
        "Cabo de Santo Agostinho": ["Centro", "Ponte dos Carvalhos", "Suape", "Gaibu"],
        "Garanhuns": ["Centro", "Heliópolis", "Santo Antônio", "Boa Vista"],
        
        // CEARÁ
        "Fortaleza": [
          "Centro", "Aldeota", "Meireles", "Fátima", "Papicu", "Cocó",
          "Dionísio Torres", "Varjota", "Mucuripe", "Praia de Iracema", "Joaquim Távora",
          "Messejana", "Parangaba", "Montese", "Benfica", "Parquelândia",
          "Luciano Cavalcante", "Guararapes", "Edson Queiroz", "Cambeba", "Água Fria",
          "Jacarecanga", "Monte Castelo", "Barra do Ceará", "Carlito Pamplona",
          "Maraponga", "Itaperi", "Serrinha", "Bom Jardim", "Mondubim",
          // Região Metropolitana
          "Caucaia", "Maracanaú", "Maranguape", "Pacatuba", "Eusébio", "Aquiraz"
        ],
        "Caucaia": ["Centro", "Jurema", "Parque Leblon", "Icaraí", "Cumbuco"],
        "Maracanaú": ["Centro", "Jereissati", "Industrial", "Piratininga", "Pajuçara"],
        "Juazeiro do Norte": ["Centro", "Triângulo", "Lagoa Seca", "Tiradentes", "Romeirão"],
        "Sobral": ["Centro", "Derby", "Junco", "Dom Expedito", "Terrenos Novos"],
        
        // RIO GRANDE DO NORTE
        "Natal": [
          "Centro", "Ponta Negra", "Petrópolis", "Tirol", "Lagoa Nova", "Capim Macio",
          "Candelária", "Alecrim", "Ribeira", "Cidade Alta", "Rocas",
          "Cidade da Esperança", "Felipe Camarão", "Dix-Sept Rosado", "Nossa Senhora de Nazaré",
          // Região Metropolitana
          "Parnamirim", "São Gonçalo do Amarante", "Macaíba", "Extremoz", "Ceará-Mirim"
        ],
        "Parnamirim": ["Centro", "Nova Parnamirim", "Emaús", "Passagem de Areia", "Liberdade"],
        "Mossoró": ["Centro", "Nova Betânia", "Alto de São Manoel", "Abolição", "Doze Anos"],
        
        // PARAÍBA
        "João Pessoa": [
          "Centro", "Manaíra", "Tambaú", "Cabo Branco", "Brisamar", "Bessa",
          "Estados", "Expedicionários", "Tambiá", "Torre", "Jardim Luna",
          "Bancários", "Mangabeira", "Valentina", "Cristo Redentor", "Água Fria",
          // Região Metropolitana
          "Cabedelo", "Santa Rita", "Bayeux", "Conde"
        ],
        "Campina Grande": ["Centro", "Catolé", "Alto Branco", "Sandra Cavalcante", "Liberdade"],
        
        // PIAUÍ
        "Teresina": [
          "Centro", "Jóquei", "Fátima", "Ilhotas", "Cabral", "Piçarra",
          "Ininga", "Morros", "Noivos", "São Cristóvão", "Primavera",
          "Lourival Parente", "Santa Maria da Codipi", "Mocambinho", "Dirceu Arcoverde",
          // Região Metropolitana
          "Timon"
        ],
        "Parnaíba": ["Centro", "Piauí", "Nova Parnaíba", "Bom Princípio", "São Judas Tadeu"],
        
        // MARANHÃO
        "São Luís": [
          "Centro", "São Francisco", "Renascença", "Calhau", "Ponta d'Areia",
          "Cohama", "Turu", "Cohab", "Vinhais", "Olho d'Água", "Ipase", "Anil",
          "Jardim São Cristóvão", "Bequimão", "Angelim", "Aurora", "Cidade Operária",
          // Região Metropolitana
          "São José de Ribamar", "Paço do Lumiar", "Raposa"
        ],
        "Imperatriz": ["Centro", "Nova Imperatriz", "Três Poderes", "Santa Inês", "Juçara"],
        "São José de Ribamar": ["Centro", "Cohabiano", "Araçagi", "Panaquatira"],
        "Timon": ["Centro", "Parque Piauí", "São Benedito", "Formosa"],
        
        // ALAGOAS
        "Maceió": [
          "Centro", "Pajuçara", "Ponta Verde", "Jatiúca", "Mangabeiras",
          "Farol", "Jaraguá", "Stella Maris", "Cruz das Almas", "Gruta de Lourdes",
          "Jacintinho", "Serraria", "Benedito Bentes", "Tabuleiro", "Cidade Universitária"
        ],
        "Arapiraca": ["Centro", "Baixão", "Brasília", "Primavera", "Santa Esmeralda"],
        
        // SERGIPE
        "Aracaju": [
          "Centro", "Jardins", "Grageru", "Treze de Julho", "Salgado Filho",
          "Farolândia", "Luzia", "Inácio Barbosa", "Atalaia", "Coroa do Meio",
          "Aruana", "Jabotiana", "Ponto Novo", "Suíssa", "São José"
        ],
        
        // ==================== REGIÃO NORTE ====================
        
        // AMAZONAS
        "Manaus": [
          "Centro", "Adrianópolis", "Parque 10", "Vieiralves", "Nossa Senhora das Graças",
          "Praça 14 de Janeiro", "Chapada", "Flores", "Aleixo", "Dom Pedro",
          "Ponta Negra", "Tarumã", "Cidade Nova", "Compensa", "Santo Antônio",
          "São Jorge", "Alvorada", "Redenção", "Coroado", "Japiim", "Petrópolis",
          "Cachoeirinha", "São Francisco", "Educandos", "Santa Luzia", "Morro da Liberdade",
          "Betânia", "Colônia Oliveira Machado", "Novo Israel", "Monte das Oliveiras",
          "Lírio do Vale", "Planalto", "Nova Cidade", "Cidade de Deus"
        ],
        "Parintins": ["Centro", "Palmares", "Francesa", "Santa Rita", "São José"],
        "Itacoatiara": ["Centro", "Jauari", "Pedreiras", "São Francisco", "Colônia"],
        
        // PARÁ
        "Belém": [
          "Centro", "Nazaré", "Umarizal", "Batista Campos", "Marco",
          "Pedreira", "Telégrafo", "Sacramenta", "Fátima", "São Brás", "Canudos",
          "Marambaia", "Val-de-Cans", "Guamá", "Terra Firme", "Cremação",
          "Jurunas", "Condor", "Benguí", "Coqueiro", "Parque Verde", "Cidade Nova",
          "Curió-Utinga", "Mangueirão", "Souza", "Tapanã", "Pratinha",
          // Região Metropolitana
          "Ananindeua", "Marituba", "Benevides", "Santa Bárbara do Pará", "Castanhal"
        ],
        "Ananindeua": ["Centro", "Cidade Nova", "Coqueiro", "Guajará", "Águas Lindas", "PAAR"],
        "Santarém": ["Centro", "Aldeia", "Aeroporto Velho", "Jardim Santarém", "Laguinho"],
        "Marabá": ["Centro", "Nova Marabá", "Cidade Nova", "São Félix", "Morada Nova"],
        "Parauapebas": ["Centro", "Rio Verde", "Cidade Nova", "Palmares", "Beira Rio"],
        "Castanhal": ["Centro", "Ianetama", "Nova Olinda", "Saudade", "Apeú"],
        
        // TOCANTINS
        "Palmas": [
          "Centro", "Plano Diretor Norte", "Plano Diretor Sul", "Taquaralto",
          "Aureny I", "Aureny II", "Aureny III", "Aureny IV", "Santa Bárbara",
          "Jardim Aurora", "Setor Morada do Sol", "Arne", "Arso", "Taquari"
        ],
        "Araguaína": ["Centro", "Setor Central", "JK", "Urbano", "Couto Magalhães"],
        "Gurupi": ["Centro", "Waldir Lins", "Sol Nascente", "Parque das Acácias"],
        
        // RONDÔNIA
        "Porto Velho": [
          "Centro", "Nossa Senhora das Graças", "Pedrinhas", "Olaria", "Caiari",
          "Embratel", "Costa e Silva", "São Cristóvão", "Industrial", "Tancredo Neves",
          "Cohab", "Nova Porto Velho", "Arigolândia", "Liberdade", "Lagoa"
        ],
        "Ji-Paraná": ["Centro", "Nova Brasília", "Dois de Abril", "Colina Park"],
        "Ariquemes": ["Centro", "Setor Institucional", "Setor 1", "BNH", "Jardim Jorge Teixeira"],
        
        // ACRE
        "Rio Branco": [
          "Centro", "Bosque", "Estação Experimental", "Base", "Cadeia Velha",
          "Bahia", "Bahia Nova", "Preventório", "Aviário", "Aeroporto Velho",
          "Jardim Primavera", "Tucumã", "Abraão Alab", "Placas", "Quinze"
        ],
        
        // RORAIMA
        "Boa Vista": [
          "Centro", "São Vicente", "Mecejana", "Canarinho", "São Francisco",
          "Aparecida", "Primavera", "Paraviana", "Nova Cidade", "Jardim Floresta",
          "Cambará", "Cauamé", "Pricumã", "Santa Tereza", "Asa Branca"
        ],
        
        // AMAPÁ
        "Macapá": [
          "Centro", "Santa Rita", "Laguinho", "Trem", "Pacoval", "Buritizal",
          "Jesus de Nazaré", "Central", "Beirol", "Novo Horizonte", "Fazendinha",
          "Jardim Marco Zero", "Universidade", "Zerão", "Brasil Novo", "Congós",
          // Região Metropolitana
          "Santana"
        ],
        "Santana": ["Centro", "Área Portuária", "Remédios", "Fonte Nova", "Paraíso"],
        
        // ==================== REGIÃO CENTRO-OESTE ====================
        
        // DISTRITO FEDERAL
        "Brasília": [
          "Asa Sul", "Asa Norte", "Lago Sul", "Lago Norte", "Sudoeste", "Noroeste",
          "Taguatinga", "Águas Claras", "Guará I", "Guará II", "Cruzeiro", "Octogonal",
          "Ceilândia", "Samambaia", "Planaltina", "Gama", "Sobradinho", "Sobradinho II",
          "Santa Maria", "Recanto das Emas", "Riacho Fundo", "Riacho Fundo II",
          "Núcleo Bandeirante", "Candangolândia", "Park Way", "Jardim Botânico",
          "Vicente Pires", "SIA", "SCIA", "Varjão", "Fercal", "Itapoã", "Paranoá",
          "São Sebastião", "Brazlândia"
        ],
        
        // GOIÁS
        "Goiânia": [
          "Centro", "Setor Oeste", "Setor Bueno", "Setor Marista", "Jardim Goiás",
          "Setor Central", "Setor Sul", "Setor Leste Universitário", "Setor Coimbra",
          "Setor Aeroporto", "Setor Nova Suíça", "Setor Bela Vista", "Setor Alto da Glória",
          "Setor Jardim América", "Setor Pedro Ludovico", "Setor Cidade Jardim",
          "Setor dos Funcionários", "Setor Campinas", "Vila Nova", "Parque Anhanguera",
          "Jardim Europa", "Parque Amazônia", "Jardim Atlântico", "Eldorado",
          // Região Metropolitana
          "Aparecida de Goiânia", "Senador Canedo", "Trindade", "Goianira", "Nerópolis"
        ],
        "Aparecida de Goiânia": ["Centro", "Cidade Livre", "Garavelo", "Jardim Luz", "Papillon Park"],
        "Anápolis": ["Centro", "Jundiaí", "Maracanã", "Vila São Jorge", "Jaiara"],
        "Rio Verde": ["Centro", "Morada do Sol", "Jardim Goiás", "Promissão"],
        "Luziânia": ["Centro", "Jardim Zuleika", "Parque JK", "Setor Sul"],
        "Águas Lindas de Goiás": ["Centro", "Jardim Barragem", "Parque da Barragem"],
        "Valparaíso de Goiás": ["Centro", "Parque São Bernardo", "Chácaras Anhanguera"],
        "Catalão": ["Centro", "Santa Cruz", "Ipanema", "Setor Central"],
        "Itumbiara": ["Centro", "Afonso Pena", "Jardim Goiás", "Santos Dumont"],
        
        // MATO GROSSO
        "Cuiabá": [
          "Centro", "Goiabeiras", "Jardim das Américas", "Bosque da Saúde", "Quilombo",
          "Boa Esperança", "Araés", "Bandeirantes", "Popular", "Lixeira",
          "Santa Rosa", "CPA I", "CPA II", "CPA III", "Morada do Ouro",
          "Coxipó", "Pedra 90", "Jardim Imperial", "Barra do Pari", "Dom Aquino",
          // Região Metropolitana
          "Várzea Grande"
        ],
        "Várzea Grande": ["Centro", "Água Limpa", "Jardim Glória", "Marajoara", "Santa Maria"],
        "Rondonópolis": ["Centro", "Vila Aurora", "Sagrada Família", "Jardim Iguaçu"],
        "Sinop": ["Centro", "Jardim Botânico", "Setor Comercial", "Jardim Imperial"],
        "Tangará da Serra": ["Centro", "Jardim Europa", "Vila Alta", "Jardim Paraíso"],
        "Cáceres": ["Centro", "Jardim São Luiz", "COHAB Nova", "Marajoara"],
        "Sorriso": ["Centro", "Bela Vista", "Jardim Carolina", "Industrial"],
        
        // MATO GROSSO DO SUL
        "Campo Grande": [
          "Centro", "Jardim dos Estados", "Chácara Cachoeira", "Vilas Boas", "Carandá Bosque",
          "Santa Fé", "Tiradentes", "Monte Castelo", "São Francisco", "Coophatrabalho",
          "Mata do Jacinto", "Taveirópolis", "Jardim Leblon", "Pioneiros", "Coronel Antonino",
          "Nova Lima", "Santo Antônio", "Vila Alba", "Guanandi", "Aero Rancho",
          "Los Angeles", "Moreninha", "Rita Vieira", "Parque do Lageado"
        ],
        "Dourados": ["Centro", "Jardim América", "Altos do Indaiá", "Vila Industrial", "Parque das Nações"],
        "Três Lagoas": ["Centro", "Colinos", "Santa Rita", "Santa Luzia", "Vila Nova"],
        "Corumbá": ["Centro", "Popular", "Dom Bosco", "Cristo Redentor"],
        "Ponta Porã": ["Centro", "Jardim Europa", "Jardim Brasil", "Vila Militar"],
        "Naviraí": ["Centro", "Centro", "Jardim União", "Boa Vista"],
        "Nova Andradina": ["Centro", "Jardim América", "Jardim Europa", "Bairro Novo"],
        
        // ==================== CIDADES MÉDIAS ADICIONAIS ====================
        
        // SÃO PAULO - Interior adicional
        "Osasco": ["Centro", "Presidente Altino", "Bela Vista", "Km 18", "Helena Maria", "Rochdale"],
        "Guarulhos": ["Centro", "Vila Galvão", "Gopoúva", "Macedo", "Torres Tibagy", "Taboão", "Bonsucesso"],
        "Mogi das Cruzes": ["Centro", "Mogilar", "Vila Oliveira", "Vila Industrial", "César de Souza"],
        "Diadema": ["Centro", "Eldorado", "Conceição", "Serraria", "Canhema"],
        "Carapicuíba": ["Centro", "COHAB II", "Vila Dirce", "Jardim Planalto"],
        "Itaquaquecetuba": ["Centro", "Vila Virgínia", "Monte Belo", "Jardim Mônica"],
        "Suzano": ["Centro", "Jardim Imperador", "Vila Amorim", "Miguel Badra"],
        "Taboão da Serra": ["Centro", "Jardim América", "Parque Pinheiros", "Intercap"],
        "Barueri": ["Centro", "Jardim Belval", "Jardim Silveira", "Jardim dos Camargos"],
        "Embu das Artes": ["Centro", "Jardim São Vicente", "Jardim Pinheirinho"],
        "São Vicente": ["Centro", "Itararé", "Gonzaguinha", "Nautica III"],
        "Praia Grande": ["Centro", "Boqueirão", "Guilhermina", "Aviação", "Ocian", "Tupi"],
        "Guarujá": ["Centro", "Pitangueiras", "Enseada", "Vicente de Carvalho"],
        "Cubatão": ["Centro", "Vila Nova", "Jardim Casqueiro", "Pilões"],
        "Mauá": ["Centro", "Jardim Zaíra", "Vila Assis Brasil", "Parque São Vicente"],
        "Santo André": ["Centro", "Vila Assunção", "Jardim", "Campestre", "Vila Bastos"],
        "São Bernardo do Campo": ["Centro", "Rudge Ramos", "Baeta Neves", "Assunção", "Planalto"],
        "São Caetano do Sul": ["Centro", "Santa Paula", "Barcelona", "Santo Antônio", "Osvaldo Cruz"],
        "Atibaia": ["Centro", "Jardim Cerejeiras", "Alvinópolis", "Jardim Imperial"],
        "Bragança Paulista": ["Centro", "Jardim Europa", "Santa Luzia", "Vila Aparecida"],
        "Mogi Guaçu": ["Centro", "Jardim Santo Antônio", "Martinho Prado", "Fantinato"],
        "Itapetininga": ["Centro", "Vila São Luiz", "Vila Nastri", "Jardim Fogaça"],
        "Jaú": ["Centro", "Jardim Jorge Atalla", "Chácara Braz Miraglia"],
        "Botucatu": ["Centro", "Jardim Paraíso", "Vila dos Médicos", "Rubião Júnior"],
        "Assis": ["Centro", "Vila Operária", "Jardim Paraná"],
        "Ourinhos": ["Centro", "Jardim Matilde", "Vila Brasil"],
        "Americana": ["Centro", "Jardim São Paulo", "Cidade Jardim", "Frezzarin"],
        "Santa Bárbara d'Oeste": ["Centro", "Jardim Europa", "Planalto do Sol"],
        "Indaiatuba": ["Centro", "Jardim Morada do Sol", "City", "Recreio"],
        "Salto": ["Centro", "Jardim Santa Cruz", "Vila Nova"],
        "Itu": ["Centro", "Jardim Paulistano", "Vila São José"],
        "Hortolândia": ["Centro", "Jardim Amanda", "Parque Ortolândia"],
        "Sumaré": ["Centro", "Jardim Bela Vista", "Nova Veneza"],
        "Valinhos": ["Centro", "Jardim São Marcos", "Paiquerê"],
        "Vinhedo": ["Centro", "Aquário", "Capela", "Jardim Três Irmãos"],
        "Paulínia": ["Centro", "João Aranha", "Betel"],
        "Itatiba": ["Centro", "Jardim México", "Parque São Francisco"],
        "Batatais": ["Centro", "Jardim América", "Vila Zelina"],
        "Bebedouro": ["Centro", "Centro", "Jardim América"],
        "Catanduva": ["Centro", "Higienópolis", "Jardim Soto"],
        "Votuporanga": ["Centro", "Patrimônio Velho", "Jardim Alvorada"],
        "Fernandópolis": ["Centro", "Jardim Universitário", "São João"],
        "Lençóis Paulista": ["Centro", "Jardim Cruzeiro", "Vila Antônio Gazzola"],
        "Jaboticabal": ["Centro", "Jardim América", "Nova Jaboticabal"],
        "Sertãozinho": ["Centro", "Jardim Brasil", "Vila Brasília"],
        "Matão": ["Centro", "Jardim Paraná", "Novo Matão"],
        "Mococa": ["Centro", "Jardim Dr. Paulo Gomes Romeo"],
        "São João da Boa Vista": ["Centro", "Jardim Primavera", "Chácara"],
        "Registro": ["Centro", "Vila São Francisco", "São Pedro"],
        "Jacareí": ["Centro", "Jardim Paraíso", "Cidade Salvador"],
        "Pindamonhangaba": ["Centro", "Jardim Rosália", "Alto do Cardoso"],
        "Lorena": ["Centro", "Centro", "Santa Edwiges"],
        "Cruzeiro": ["Centro", "Jardim Marilíce", "Vila Celestina"],
        "Caraguatatuba": ["Centro", "Martim de Sá", "Indaiá"],
        "Ubatuba": ["Centro", "Itaguá", "Perequê-Açu"],
        "São Sebastião": ["Centro", "Maresias", "Juquehy"],
        "Ilhabela": ["Centro", "Perequê", "Barra Velha"],
        
        // RIO DE JANEIRO - Interior adicional
        "Macaé": ["Centro", "Cavaleiros", "Imbetiba", "Jardim Guanabara"],
        "Cabo Frio": ["Centro", "Braga", "Peró", "Ogiva"],
        "Angra dos Reis": ["Centro", "Praia do Jardim", "Parque Mambucaba"],
        "Resende": ["Centro", "Jardim Jalisco", "Manejo"],
        "Barra Mansa": ["Centro", "Centro", "Ano Bom"],
        "Teresópolis": ["Centro", "Várzea", "Alto"],
        "Magé": ["Centro", "Piabetá", "Fragoso"],
        "Itaguaí": ["Centro", "Mazomba", "Brisamar"],
        "Araruama": ["Centro", "Iguabinha", "Praia Seca"],
        "Saquarema": ["Centro", "Bacaxá", "Itaúna"],
        "Rio das Ostras": ["Centro", "Costazul", "Barra de São João"],
        "Búzios": ["Centro", "Rasa", "Ferradura"],
        "Itaperuna": ["Centro", "Cidade Nova", "Cehab"],
        "Santo Antônio de Pádua": ["Centro", "Cólonia", "Monte Alegre"],
        "Três Rios": ["Centro", "Purys", "Centro"],
        "Paraíba do Sul": ["Centro", "Werneck", "Inema"],
        "Vassouras": ["Centro", "Residência", "Andrade Pinto"],
        
        // MINAS GERAIS - Interior adicional
        "Ouro Preto": ["Centro", "Pilar", "Saramenha"],
        "Mariana": ["Centro", "Colina", "Cabanas"],
        "Itabirito": ["Centro", "São José", "Mario de Paula"],
        "Congonhas": ["Centro", "Pires", "Lobo Leite"],
        "Conselheiro Lafaiete": ["Centro", "Campo Alegre", "São Sebastião"],
        "São João del-Rei": ["Centro", "Matosinhos", "Colônia do Marçal"],
        "Tiradentes": ["Centro", "Parque das Abelhas"],
        "Lavras": ["Centro", "Dona Amélia", "Cruzeiro"],
        "Três Corações": ["Centro", "Jardim América", "Santo Antônio"],
        "Alfenas": ["Centro", "Jardim São Carlos", "Residencial Oliveira"],
        "Passos": ["Centro", "São Francisco", "Bela Vista"],
        "Araxá": ["Centro", "Vila Silvéria", "Bom Jardim"],
        "Patos de Minas": ["Centro", "Alto Caiçaras", "Jardim Aquárius"],
        "Araguari": ["Centro", "Brasília", "Miranda"],
        "Ituiutaba": ["Centro", "Progresso", "Ipiranga"],
        "Paracatu": ["Centro", "Alto do Córrego", "Amoreiras"],
        "João Monlevade": ["Centro", "Carneirinhos", "Santa Bárbara"],
        "Itabira": ["Centro", "Praia", "Major Lage"],
        "Coronel Fabriciano": ["Centro", "Giovanini", "Santa Terezinha"],
        "Timóteo": ["Centro", "Ana Rita", "Limoeiro"],
        "Caratinga": ["Centro", "Zacarias", "Santa Cruz"],
        "Muriaé": ["Centro", "Barra", "Aeroporto"],
        "Cataguases": ["Centro", "Leonardo Diniz", "Santa Rita"],
        "Leopoldina": ["Centro", "Fábrica", "Artur Bernardes"],
        "Viçosa": ["Centro", "Ramos", "Santa Clara"],
        "Ponte Nova": ["Centro", "Triângulo", "Palmeiras"],
        "Manhuaçu": ["Centro", "Matinha", "São Vicente"],
        "Teófilo Otoni": ["Centro", "Grã-Duquesa", "São Jacinto"],
        "Janaúba": ["Centro", "Santa Cruz", "São Geraldo"],
        "Pirapora": ["Centro", "Santos Dumont", "Cidade Jardim"],
        "Curvelo": ["Centro", "Goiabeiras", "Santa Rita"],
        
        // PARANÁ - Interior adicional
        "Toledo": ["Centro", "Jardim La Salle", "Vila Industrial"],
        "Umuarama": ["Centro", "Zona 7", "Parque Industrial"],
        "Campo Mourão": ["Centro", "Jardim Pio XII", "Industrial"],
        "Paranavaí": ["Centro", "Centro", "Vila Alta"],
        "Apucarana": ["Centro", "Núcleo Habitacional Adriano Correia", "Jardim Ponta Grossa"],
        "Arapongas": ["Centro", "Jardim Bandeirantes", "Zona Norte"],
        "Cianorte": ["Centro", "Zona 7", "Zona 6"],
        "Francisco Beltrão": ["Centro", "Cristo Rei", "Alvorada"],
        "Pato Branco": ["Centro", "Centro", "La Salle"],
        "Telêmaco Borba": ["Centro", "Vila Matilde", "Jardim Alegre"],
        "União da Vitória": ["Centro", "Centro", "São Cristóvão"],
        "Irati": ["Centro", "Rio Bonito", "Vila Nova"],
        "Prudentópolis": ["Centro", "Centro", "Barra Mansa"],
        
        // RIO GRANDE DO SUL - Interior adicional
        "Bagé": ["Centro", "Getúlio Vargas", "Centro"],
        "Uruguaiana": ["Centro", "Centro", "São Miguel"],
        "Alegrete": ["Centro", "Centro", "Cidade Alta"],
        "Santana do Livramento": ["Centro", "Centro", "Prado"],
        "Cruz Alta": ["Centro", "Centro", "Jardim Primavera"],
        "Ijuí": ["Centro", "Centro", "Getúlio Vargas"],
        "Santo Ângelo": ["Centro", "Centro", "Aliança"],
        "Erechim": ["Centro", "Centro", "Progresso"],
        "Lajeado": ["Centro", "Centro", "Moinhos"],
        "Bento Gonçalves": ["Centro", "São Roque", "Cidade Alta"],
        "Vacaria": ["Centro", "Centro", "Cel. Fioravante"],
        "Torres": ["Centro", "Praia Grande", "Predial"],
        "Tramandaí": ["Centro", "Cruzeiro", "Centro"],
        "Capão da Canoa": ["Centro", "Centro", "Zona Nova"],
        
        // SANTA CATARINA - Interior adicional
        "Tubarão": ["Centro", "São João", "Passagem"],
        "Laguna": ["Centro", "Centro", "Magalhães"],
        "Imbituba": ["Centro", "Centro", "Vila Nova"],
        "Brusque": ["Centro", "Primeiro de Maio", "São Luiz"],
        "Rio do Sul": ["Centro", "Canta Galo", "Laranjeiras"],
        "Concórdia": ["Centro", "Centro", "Nazaré"],
        "Videira": ["Centro", "Centro", "Alvorada"],
        "Caçador": ["Centro", "Centro", "Santa Catarina"],
        "Canoinhas": ["Centro", "Centro", "Piedade"],
        "São Bento do Sul": ["Centro", "Centro", "Rio Negro"],
        "Mafra": ["Centro", "Centro", "Vista Alegre"],
        "Xanxerê": ["Centro", "Centro", "Jardim Tarumã"],
        "Araranguá": ["Centro", "Centro", "Cidade Alta"],
        "São Miguel do Oeste": ["Centro", "Centro", "Agostini"],
        
        // BAHIA - Interior adicional
        "Barreiras": ["Centro", "Barreirinhas", "Santa Luzia"],
        "Teixeira de Freitas": ["Centro", "Centro", "Vila Verde"],
        "Eunápolis": ["Centro", "Centro", "Pequi"],
        "Porto Seguro": ["Centro", "Centro", "Arraial d'Ajuda"],
        "Jequié": ["Centro", "Centro", "Jequiezinho"],
        "Paulo Afonso": ["Centro", "Centro", "Tancredo Neves"],
        "Serrinha": ["Centro", "Centro", "Cidade Nova"],
        "Valença": ["Centro", "Centro", "São Roque"],
        "Santo Antônio de Jesus": ["Centro", "Centro", "São Paulo"],
        "Cruz das Almas": ["Centro", "Centro", "Tabela"],
        "Alagoinhas": ["Centro", "Centro", "Santa Terezinha"],
        
        // CEARÁ - Interior adicional
        "Crato": ["Centro", "Centro", "Pimenta"],
        "Iguatu": ["Centro", "Centro", "Vila Neuma"],
        "Quixadá": ["Centro", "Centro", "Campo Novo"],
        "Canindé": ["Centro", "Centro", "Sítio Lagoa"],
        "Russas": ["Centro", "Centro", "Alto São João"],
        "Limoeiro do Norte": ["Centro", "Centro", "Antônio Holanda"],
        "Aracati": ["Centro", "Centro", "Canoa Quebrada"],
        "Tianguá": ["Centro", "Centro", "Betânia"],
        "Crateús": ["Centro", "Centro", "São Vicente"],
        
        // PERNAMBUCO - Interior adicional
        "Arcoverde": ["Centro", "Centro", "São Cristóvão"],
        "Gravatá": ["Centro", "Centro", "Salgadinho"],
        "Bezerros": ["Centro", "Centro", "Encruzilhada"],
        "Serra Talhada": ["Centro", "Centro", "Nossa Senhora da Penha"],
        "Salgueiro": ["Centro", "Centro", "Santo Antônio"],
        "Araripina": ["Centro", "Centro", "Alto da Boa Vista"],
        "Belo Jardim": ["Centro", "Centro", "São Pedro"],
        "Santa Cruz do Capibaribe": ["Centro", "Centro", "Malhada Grande"],
        "Vitória de Santo Antão": ["Centro", "Centro", "Matriz"],
        
        // PARAÍBA - Interior adicional
        "Patos": ["Centro", "Centro", "Monte Castelo"],
        "Sousa": ["Centro", "Centro", "Centro"],
        "Cajazeiras": ["Centro", "Centro", "Capoeiras"],
        "Guarabira": ["Centro", "Centro", "Nordeste"],
        "Santa Rita": ["Centro", "Centro", "Tibiri"],
        "Sapé": ["Centro", "Centro", "Centro"],
        
        // RIO GRANDE DO NORTE - Interior adicional
        "Caicó": ["Centro", "Centro", "Paraíba"],
        "Açu": ["Centro", "Centro", "Conjunto Elizeu Maia"],
        "Currais Novos": ["Centro", "Centro", "JK"],
        "Pau dos Ferros": ["Centro", "Centro", "Riacho do Meio"],
        "Macau": ["Centro", "Centro", "Aeroporto"],
        "Apodi": ["Centro", "Centro", "Malvinas"],
        
        // MARANHÃO - Interior adicional
        "Caxias": ["Centro", "Centro", "Nova Caxias"],
        "Codó": ["Centro", "Centro", "São Francisco"],
        "Bacabal": ["Centro", "Centro", "Centro"],
        "Santa Inês": ["Centro", "Centro", "Cohab"],
        "Açailândia": ["Centro", "Centro", "Vila Ildemar"],
        "Balsas": ["Centro", "Centro", "Trezidela"],
        "Chapadinha": ["Centro", "Centro", "São José"],
        "Presidente Dutra": ["Centro", "Centro", "Centro"],
        
        // PIAUÍ - Interior adicional
        "Floriano": ["Centro", "Centro", "Irapuã"],
        "Picos": ["Centro", "Centro", "Canto da Várzea"],
        "Piripiri": ["Centro", "Centro", "Morro da FEBEM"],
        "Campo Maior": ["Centro", "Centro", "Vermelha"],
        "Barras": ["Centro", "Centro", "Centro"],
        "Corrente": ["Centro", "Centro", "Centro"],
        
        // ALAGOAS - Interior adicional
        "Penedo": ["Centro", "Centro", "Santa Luzia"],
        "União dos Palmares": ["Centro", "Centro", "Centro"],
        "Palmeira dos Índios": ["Centro", "Centro", "Palmeira de Fora"],
        "Santana do Ipanema": ["Centro", "Centro", "Centro"],
        "Delmiro Gouveia": ["Centro", "Centro", "Centro"],
        
        // SERGIPE - Interior adicional
        "Estância": ["Centro", "Centro", "Porto d'Areia"],
        "Lagarto": ["Centro", "Centro", "Centro"],
        "Itabaiana": ["Centro", "Centro", "Centro"],
        "Nossa Senhora do Socorro": ["Centro", "Marcos Freire", "Conjunto Marcos Freire"],
        "Nossa Senhora da Glória": ["Centro", "Centro", "Centro"],
        
        // AMAZONAS - Interior adicional
        "Manacapuru": ["Centro", "Centro", "Morada do Sol"],
        "Tefé": ["Centro", "Centro", "Santa Teresa"],
        "Coari": ["Centro", "Centro", "Tauá-Mirim"],
        "Tabatinga": ["Centro", "Centro", "Cidade Nova"],
        "Humaitá": ["Centro", "Centro", "São Domingos"],
        
        // PARÁ - Interior adicional
        "Altamira": ["Centro", "Centro", "Brasília"],
        "Bragança": ["Centro", "Centro", "Cereja"],
        "Abaetetuba": ["Centro", "Centro", "São José"],
        "Cametá": ["Centro", "Centro", "Bairro do Una"],
        "Tucuruí": ["Centro", "Centro", "Terra Prometida"],
        "Redenção": ["Centro", "Centro", "Setor Novo"],
        "Itaituba": ["Centro", "Centro", "Jardim das Araras"],
        "Barcarena": ["Centro", "Centro", "Vila do Conde"],
        
        // TOCANTINS - Interior adicional
        "Porto Nacional": ["Centro", "Centro", "Setor Aeroporto"],
        "Paraíso do Tocantins": ["Centro", "Centro", "Jardim Paulista"],
        "Colinas do Tocantins": ["Centro", "Centro", "Setor Norte"],
        "Miracema do Tocantins": ["Centro", "Centro", "Setor Oeste"],
        
        // RONDÔNIA - Interior adicional
        "Cacoal": ["Centro", "Centro", "Jardim Clodoaldo"],
        "Vilhena": ["Centro", "Centro", "Cristo Rei"],
        "Rolim de Moura": ["Centro", "Centro", "Cidade Alta"],
        "Jaru": ["Centro", "Centro", "Setor 01"],
        "Ouro Preto do Oeste": ["Centro", "Centro", "Jardim Tropical"],
        
        // ACRE - Interior adicional
        "Cruzeiro do Sul": ["Centro", "Centro", "Miritizal"],
        "Sena Madureira": ["Centro", "Centro", "Pista"],
        "Tarauacá": ["Centro", "Centro", "Centro"],
        "Feijó": ["Centro", "Centro", "Centro"],
        
        // RORAIMA - Interior adicional
        "Rorainópolis": ["Centro", "Centro", "Centro"],
        "Caracaraí": ["Centro", "Centro", "Centro"],
        "Alto Alegre": ["Centro", "Centro", "Centro"],
        
        // AMAPÁ - Interior adicional
        "Laranjal do Jari": ["Centro", "Centro", "Centro"],
        "Oiapoque": ["Centro", "Centro", "Centro"],
        "Mazagão": ["Centro", "Centro", "Centro"],
        
        // GOIÁS - Interior adicional
        "Caldas Novas": ["Centro", "Centro", "Bandeirantes"],
        "Jataí": ["Centro", "Centro", "Centro"],
        "Formosa": ["Centro", "Centro", "JK"],
        "Planaltina": ["Centro", "Centro", "Setor Tradicional"],
        "Novo Gama": ["Centro", "Centro", "Pedregal"],
        "Cidade Ocidental": ["Centro", "Centro", "Centro"],
        "Santo Antônio do Descoberto": ["Centro", "Centro", "Centro"],
        "Mineiros": ["Centro", "Centro", "Centro"],
        "Cristalina": ["Centro", "Centro", "Centro"],
        "Inhumas": ["Centro", "Centro", "Centro"],
        "Goianésia": ["Centro", "Centro", "Centro"],
        "Uruaçu": ["Centro", "Centro", "Centro"],
        "Porangatu": ["Centro", "Centro", "Centro"],
        "Niquelândia": ["Centro", "Centro", "Centro"],
        "Ceres": ["Centro", "Centro", "Centro"],
        "Jaraguá": ["Centro", "Centro", "Centro"],
        "Pirenópolis": ["Centro", "Centro", "Centro"],
        "Goiás Velho": ["Centro", "Centro", "Centro"],
        
        // MATO GROSSO - Interior adicional
        "Barra do Garças": ["Centro", "Centro", "São João"],
        "Primavera do Leste": ["Centro", "Centro", "Jardim Riva"],
        "Lucas do Rio Verde": ["Centro", "Centro", "Cidade Nova"],
        "Nova Mutum": ["Centro", "Centro", "Centro"],
        "Alta Floresta": ["Centro", "Centro", "Cidade Alta"],
        "Pontes e Lacerda": ["Centro", "Centro", "Centro"],
        "Juína": ["Centro", "Centro", "Módulo 01"],
        "Colíder": ["Centro", "Centro", "Centro"],
        "Guarantã do Norte": ["Centro", "Centro", "Centro"],
        "Juara": ["Centro", "Centro", "Centro"],
        "Água Boa": ["Centro", "Centro", "Centro"],
        "Querência": ["Centro", "Centro", "Centro"],
        
        // MATO GROSSO DO SUL - Interior adicional
        "Aquidauana": ["Centro", "Centro", "Guanandy"],
        "Paranaíba": ["Centro", "Centro", "Jardim Redentora"],
        "Coxim": ["Centro", "Centro", "Piracema"],
        "Maracaju": ["Centro", "Centro", "Vila Margarida"],
        "Sidrolândia": ["Centro", "Centro", "Vila Pernambuco"],
        "Chapadão do Sul": ["Centro", "Centro", "Centro"],
        "Rio Brilhante": ["Centro", "Centro", "Centro"],
        "Jardim": ["Centro", "Centro", "Centro"],
        "Bonito": ["Centro", "Centro", "Centro"],
        "Miranda": ["Centro", "Centro", "Centro"],
        "Anastácio": ["Centro", "Centro", "Centro"],
        "Ladário": ["Centro", "Centro", "Centro"]
      };

      // Helper function to search with DuckDuckGo (FREE - no API key needed)
      async function searchWithDDG(searchQuery: string): Promise<any[]> {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery + ' telefone contato')}&kl=br-pt`;
        const response = await fetch(ddgUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html',
            'Accept-Language': 'pt-BR,pt;q=0.9',
          },
        });

        if (!response.ok) {
          throw new Error(`DuckDuckGo error: ${response.status}`);
        }

        const html = await response.text();
        const results: any[] = [];
        const blocks = html.split('class="result__body"');
        
        for (let i = 1; i < blocks.length; i++) {
          const block = blocks[i];
          const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
          const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').trim() : '';
          
          const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
          const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
          
          const linkMatch = block.match(/href="([^"]+)"[^>]*class="result__a"/);
          let link = linkMatch ? linkMatch[1] : '';
          if (link.includes('uddg=')) {
            link = decodeURIComponent(link.split('uddg=')[1]?.split('&')[0] || '');
          }

          const combinedText = `${title} ${snippet}`;
          const phoneMatch = combinedText.match(/\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/);
          
          if (phoneMatch) {
            results.push({
              title,
              phone: phoneMatch[0],
              phoneNumber: phoneMatch[0],
              address: snippet.substring(0, 100),
              website: link,
              link: link,
              rating: null,
              reviews: null,
              ratingCount: null,
              category: null,
              placeId: null,
              type: null,
            });
          }
        }

        return results;
      }

      // Helper: Search with Serper.dev (user's key)
      async function searchWithSerper(query: string, apiKey: string): Promise<any[]> {
        const response = await fetch('https://google.serper.dev/maps', {
          method: 'POST',
          headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ q: query, gl: 'br', hl: 'pt-br', num: 20 }),
        });
        if (!response.ok) throw new Error(`Serper error: ${response.status}`);
        const data = await response.json();
        return (data.places || []).map((p: any) => ({
          title: p.title || '',
          phone: p.phoneNumber || '',
          phoneNumber: p.phoneNumber || '',
          address: p.address || '',
          website: p.website || '',
          link: p.link || '',
          rating: p.rating || null,
          reviews: p.ratingCount || null,
          ratingCount: p.ratingCount || null,
          category: p.category || null,
          placeId: p.placeId || null,
          type: p.type || null,
        }));
      }

      // Helper: Search with SerpAPI (user's key)
      async function searchWithSerpApi(query: string, apiKey: string, start = 0): Promise<any[]> {
        const params = new URLSearchParams({
          engine: 'google_maps',
          q: query,
          hl: 'pt-br',
          gl: 'br',
          type: 'search',
          start: String(start),
          api_key: apiKey,
        });
        const response = await fetch(`https://serpapi.com/search.json?${params}`);
        if (!response.ok) throw new Error(`SerpAPI error: ${response.status}`);
        const data = await response.json();
        return (data.local_results || []).map((r: any) => ({
          title: r.title || '',
          phone: r.phone || '',
          phoneNumber: r.phone || '',
          address: r.address || '',
          website: r.website || '',
          link: r.link || '',
          rating: r.rating || null,
          reviews: r.reviews || null,
          ratingCount: r.reviews || null,
          category: r.type || null,
          placeId: r.place_id || null,
          type: r.type || null,
        }));
      }

      const allLeads: any[] = [];
      const seenPhones = new Set<string>();
      const seenNames = new Set<string>();
      
      // Seed with community leads
      for (const cl of communityLeads) {
        const normalizedPhone = cl.phone.replace(/\D/g, "");
        if (!seenPhones.has(normalizedPhone)) {
          seenPhones.add(normalizedPhone);
          seenNames.add((cl.business_name || "").toLowerCase().trim());
          allLeads.push(cl);
        }
      }

      // EXTENSIVE subniches for MAXIMUM coverage - all variations and subcategories
      const SUBNICHES: Record<string, string[]> = {
        // Alimentação
        "Restaurantes": ["restaurante", "restaurantes", "comida", "gastronomia", "self-service", "rodízio", "buffet", "lanchonete", "cantina", "bistrô", "comida caseira", "comida japonesa", "sushi", "temaki", "comida italiana", "comida mexicana", "comida árabe", "comida chinesa", "churrascaria", "frutos do mar", "seafood", "comida vegana", "vegetariano", "marmita", "quentinha", "delivery comida", "food truck"],
        "Pizzarias": ["pizzaria", "pizza", "delivery pizza", "rodízio de pizza", "pizza artesanal", "pizza delivery", "pizzaria delivery", "esfiha", "esfiharia"],
        "Hamburguerias": ["hamburgueria", "hambúrguer", "burger", "lanchonete", "fast food", "smash burger", "artesanal", "hot dog", "cachorro quente", "sanduíche", "sanduicheria"],
        "Cafeterias": ["cafeteria", "café", "coffee shop", "expresso", "cappuccino", "latte", "brunch", "confeitaria", "doceria", "casa de chá", "padaria café"],
        "Padarias": ["padaria", "panificadora", "pão", "confeitaria", "bolos", "tortas", "doces", "salgados", "café da manhã", "padoca", "panificação", "padaria artesanal"],
        "Bares": ["bar", "bares", "boteco", "pub", "choperia", "cervejaria", "happy hour", "drinks", "coquetelaria", "balada", "boate", "casa noturna", "lounge"],
        "Açougues": ["açougue", "casa de carnes", "carnes", "frigorífico", "boutique de carnes", "churrasco"],
        "Sorveterias": ["sorveteria", "sorvete", "açaí", "gelato", "frozen", "milkshake", "picolé", "açaiteria"],
        
        // Beleza e Estética
        "Salões de Beleza": ["salão de beleza", "salão", "cabeleireiro", "cabeleireira", "cabelo", "hair stylist", "manicure", "pedicure", "esmalteria", "nail designer", "alongamento de unhas", "unhas em gel", "maquiagem", "maquiador", "estética", "centro de estética", "sobrancelha", "design de sobrancelhas", "depilação", "massagem", "spa", "day spa", "limpeza de pele", "peeling", "botox", "preenchimento", "harmonização facial", "escova progressiva", "coloração", "penteado"],
        "Barbearias": ["barbearia", "barbeiro", "barber shop", "barba", "corte masculino", "cabelo masculino", "barbershop", "navalha", "aparar barba"],
        "Estúdios de Tatuagem": ["estúdio de tatuagem", "tatuagem", "tattoo", "tatuador", "piercing", "body piercing", "micropigmentação", "tattoo studio", "tatuagens"],
        "Clínicas de Estética": ["clínica de estética", "estética avançada", "procedimentos estéticos", "drenagem linfática", "massagem modeladora", "criolipólise", "lipocavitação", "radiofrequência", "carboxiterapia"],
        
        // Saúde
        "Clínicas Médicas": ["clínica médica", "clínica", "consultório médico", "médico", "centro médico", "policlínica", "clínica geral", "dermatologista", "cardiologista", "ortopedista", "ginecologista", "pediatra", "oftalmologista", "neurologista", "psiquiatra", "endocrinologista", "urologista", "otorrino", "clínica popular", "pronto atendimento", "urgência", "emergência"],
        "Clínicas Odontológicas": ["clínica odontológica", "dentista", "odontologia", "consultório dentário", "ortodontista", "implante dentário", "clareamento dental", "prótese dentária", "endodontia", "periodontia", "odontopediatra", "cirurgião dentista", "odonto", "aparelho dentário", "facetas", "lentes de contato dental"],
        "Farmácias": ["farmácia", "drogaria", "farmácia de manipulação", "medicamentos", "perfumaria", "dermocosméticos", "farmácia popular", "farmácia 24h"],
        "Óticas": ["ótica", "óculos", "lentes", "lentes de contato", "armações", "optometrista", "oftalmologista"],
        "Psicólogos": ["psicólogo", "psicóloga", "psicologia", "terapia", "terapeuta", "psicanálise", "consultório psicológico", "saúde mental"],
        "Nutricionistas": ["nutricionista", "nutrição", "consultório nutricional", "dieta", "emagrecimento", "reeducação alimentar"],
        "Fisioterapia": ["fisioterapia", "fisioterapeuta", "clínica de fisioterapia", "reabilitação", "pilates clínico", "RPG", "quiropraxia", "osteopatia", "acupuntura"],
        
        // Fitness
        "Academias": ["academia", "fitness", "musculação", "crossfit", "pilates", "yoga", "funcional", "treino", "personal trainer", "ginástica", "spinning", "natação", "artes marciais", "luta", "boxe", "muay thai", "jiu jitsu", "karate", "judô", "taekwondo", "mma", "academia 24h", "smart fit", "bio ritmo", "bodytech"],
        "Estúdios de Pilates": ["pilates", "estúdio de pilates", "pilates solo", "pilates reformer", "mat pilates"],
        "Estúdios de Yoga": ["yoga", "estúdio de yoga", "meditação", "mindfulness", "hatha yoga", "vinyasa", "ashtanga"],
        "Personal Trainer": ["personal trainer", "personal", "treinador pessoal", "treino personalizado", "treino funcional", "treino ao ar livre"],
        
        // Serviços Profissionais
        "Escritórios de Advocacia": ["escritório de advocacia", "advogado", "advocacia", "advogados", "escritório jurídico", "consultoria jurídica", "advogado trabalhista", "advogado criminal", "advogado civil", "advogado família", "advogado empresarial", "advogado imobiliário", "defensoria", "assessoria jurídica"],
        "Contadores": ["contador", "contabilidade", "escritório de contabilidade", "contábil", "assessoria contábil", "abertura de empresa", "declaração de imposto", "IRPF", "MEI"],
        "Arquitetos": ["arquiteto", "arquitetura", "escritório de arquitetura", "design de interiores", "decoração", "decorador", "paisagismo", "projeto arquitetônico"],
        "Engenheiros": ["engenheiro", "engenharia", "escritório de engenharia", "projeto estrutural", "laudo técnico", "ART", "RRT"],
        "Consultórios": ["consultório", "médico", "profissional de saúde", "especialista"],
        
        // Imóveis e Construção
        "Imobiliárias": ["imobiliária", "imobiliárias", "corretor de imóveis", "corretor", "imóveis", "venda de imóveis", "aluguel de imóveis", "locação", "casas à venda", "apartamentos", "empreendimentos", "lançamentos", "imóveis comerciais", "galpão"],
        "Construtoras": ["construtora", "construção", "empreiteira", "obras", "reforma", "mestre de obras", "pedreiro", "construção civil"],
        "Lojas de Materiais de Construção": ["material de construção", "loja de construção", "ferragens", "tintas", "pisos", "revestimentos", "elétrica", "hidráulica", "cimento", "areia", "madeireira"],
        "Marcenarias": ["marcenaria", "marceneiro", "móveis planejados", "móveis sob medida", "armários", "cozinha planejada"],
        "Vidraçarias": ["vidraçaria", "vidraceiro", "vidros", "espelhos", "box", "janelas", "portas de vidro", "blindex"],
        "Serralheria": ["serralheria", "serralheiro", "portão", "grades", "ferro", "metalúrgica", "estrutura metálica"],
        
        // Pets
        "Pet Shops": ["pet shop", "petshop", "loja de animais", "banho e tosa", "clínica veterinária", "veterinário", "ração", "acessórios pet", "hotel para pets", "creche para cães", "adestramento", "dog walker", "pet", "cachorro", "gato", "animais"],
        "Clínicas Veterinárias": ["veterinário", "clínica veterinária", "hospital veterinário", "vet", "cirurgia veterinária", "castração", "vacinas pet"],
        
        // Automotivo
        "Oficinas Mecânicas": ["oficina mecânica", "mecânica", "mecânico", "auto center", "autocenter", "funilaria", "pintura automotiva", "elétrica automotiva", "troca de óleo", "alinhamento", "balanceamento", "suspensão", "freios", "ar condicionado automotivo", "injeção eletrônica", "escapamento", "retífica", "borracharia"],
        "Lava Rápido": ["lava rápido", "lava jato", "lavagem de carro", "estética automotiva", "polimento", "vitrificação", "higienização"],
        "Concessionárias": ["concessionária", "revenda de carros", "seminovos", "carros usados", "veículos", "multimarcas", "loja de carros"],
        "Autopeças": ["autopeças", "peças automotivas", "peças de carro", "acessórios automotivos", "som automotivo", "rodas", "pneus"],
        
        // Educação
        "Escolas e Cursos": ["escola", "curso", "cursos", "escola de idiomas", "inglês", "espanhol", "escola de música", "aula de música", "escola de dança", "informática", "curso técnico", "preparatório", "vestibular", "reforço escolar", "educação infantil", "creche", "berçário", "colégio", "faculdade", "centro educacional", "aulas particulares"],
        "Autoescolas": ["autoescola", "auto escola", "cfc", "habilitação", "CNH", "aula de direção", "simulador"],
        
        // Varejo
        "Lojas de Roupas": ["loja de roupas", "roupas", "moda", "boutique", "vestuário", "confecção", "loja feminina", "loja masculina", "moda feminina", "moda masculina", "moda infantil", "loja de calçados", "sapatos", "acessórios", "bolsas", "lingerie", "moda praia", "fitness wear", "plus size", "brechó"],
        "Supermercados": ["supermercado", "mercado", "mercearia", "atacado", "atacarejo", "minimercado", "empório", "hortifruti", "sacolão", "feira"],
        "Lojas de Móveis": ["loja de móveis", "móveis", "colchões", "estofados", "sofá", "cama", "eletrodomésticos", "móveis usados", "decoração"],
        "Papelarias": ["papelaria", "livraria", "material escolar", "escritório", "xerox", "gráfica rápida", "impressão"],
        "Floriculturas": ["floricultura", "flores", "florista", "arranjos florais", "buquê", "decoração floral", "plantas", "jardim", "paisagismo", "garden center"],
        "Joalherias": ["joalheria", "joias", "relógios", "semi joias", "bijuterias", "ótica joalheria", "conserto de relógios", "ourives"],
        "Óticas": ["ótica", "óculos", "lentes de contato", "armação", "óculos de sol"],
        
        // Hospedagem
        "Hotéis e Pousadas": ["hotel", "pousada", "hospedagem", "motel", "resort", "hostel", "albergue", "flat", "apart hotel", "airbnb", "chalé", "camping", "glamping"],
        
        // Tecnologia e Serviços
        "Assistência Técnica": ["assistência técnica", "conserto de celular", "manutenção de computador", "informática", "reparo", "conserto", "técnico"],
        "Gráficas": ["gráfica", "impressão", "banner", "adesivos", "cartão de visita", "panfletos", "plotagem", "comunicação visual"],
        "Fotógrafos": ["fotógrafo", "fotografia", "estúdio fotográfico", "fotos", "ensaio fotográfico", "foto e vídeo", "filmagem", "casamento", "eventos"],
        
        // Outros Serviços
        "Lavanderias": ["lavanderia", "lava e seca", "lavagem de roupa", "passadoria", "tinturaria"],
        "Despachantes": ["despachante", "documentação", "licenciamento", "transferência", "emplacamento", "detran"],
        "Chaveiros": ["chaveiro", "chaves", "fechaduras", "cópias de chave", "cofres", "carimbos"],
        "Dedetizadoras": ["dedetizadora", "dedetização", "controle de pragas", "descupinização", "desratização"],
        "Seguradoras": ["seguradora", "seguros", "corretor de seguros", "seguro auto", "seguro vida", "plano de saúde"],
        "Escritórios Virtuais": ["escritório virtual", "coworking", "sala de reunião", "endereço comercial", "espaço compartilhado"],
      };

      // Get base search terms
      let searchTerms = SUBNICHES[niche] || [];
      
      // If niche not in predefined list, use it as main term and try to find related terms
      if (searchTerms.length === 0) {
        const nicheNorm = niche.toLowerCase().trim();
        for (const [category, terms] of Object.entries(SUBNICHES)) {
          if (category.toLowerCase().includes(nicheNorm) || 
              terms.some(t => t.includes(nicheNorm))) {
            searchTerms = [...searchTerms, ...terms];
          }
        }
        if (searchTerms.length === 0) {
          searchTerms = [nicheNorm, `${nicheNorm}s`, `loja de ${nicheNorm}`, `empresa de ${nicheNorm}`];
        }
      }
      
      // Remove duplicates - SEM LIMITE de termos para cobertura MÁXIMA
      const uniqueTerms = [...new Set(searchTerms)];
      // Use TODOS os termos disponíveis (até 50 para garantir cobertura total)
      const limitedSearchTerms = uniqueTerms.slice(0, 50);

      // Determine which API to use based on user's keys
      const hasSerpApi = !!serpApiKey;
      const hasSerper = !!serperApiKey;
      let apiUsed = 'duckduckgo_free';
      
      if (preferredApi === 'serper' && hasSerper) apiUsed = 'serper';
      else if (preferredApi === 'serpapi' && hasSerpApi) apiUsed = 'serpapi';
      else if (hasSerper) apiUsed = 'serper';
      else if (hasSerpApi) apiUsed = 'serpapi';

      // Get city regions if available
      const cityName = Object.keys(CITY_REGIONS).find(city => 
        location.toLowerCase().includes(city.toLowerCase())
      );
      const regions = cityName ? CITY_REGIONS[cityName] : [];

      const searchLocations: string[] = [location];
      if (regions.length > 0) {
        const regionLimit = apiUsed === 'duckduckgo_free' ? 10 : 20;
        for (const region of regions.slice(0, regionLimit)) {
          searchLocations.push(`${region}, ${cityName}`);
        }
      }

      console.log(`🚀 BUSCA via ${apiUsed.toUpperCase()} para ${niche} em ${location}`);
      console.log(`- ${limitedSearchTerms.length} termos | ${searchLocations.length} localizações`);
      console.log(`- ${communityLeads.length} leads do banco comunitário | Meta: ${maxResults}`);

      const newLeadsForCommunity: any[] = [];

      for (const searchTerm of limitedSearchTerms) {
        if (allLeads.length >= maxResults) break;

        for (const searchLocation of searchLocations) {
          if (allLeads.length >= maxResults) break;

          try {
            let results: any[] = [];
            
            if (apiUsed === 'serper') {
              results = await searchWithSerper(`${searchTerm} ${searchLocation}`, serperApiKey!);
            } else if (apiUsed === 'serpapi') {
              results = await searchWithSerpApi(`${searchTerm} ${searchLocation}`, serpApiKey!);
            } else {
              results = await searchWithDDG(`${searchTerm} em ${searchLocation}`);
            }
            
            for (const result of results) {
              if (allLeads.length >= maxResults) break;
              const phone = result.phone || result.phoneNumber;
              if (!phone) continue;
              
              const normalizedPhone = phone.replace(/\D/g, "");
              if (seenPhones.has(normalizedPhone)) continue;
              
              const normalizedName = (result.title || "").toLowerCase().trim();
              if (seenNames.has(normalizedName)) continue;

              seenPhones.add(normalizedPhone);
              seenNames.add(normalizedName);

              const lead = {
                business_name: result.title || "Empresa",
                phone, address: result.address || null,
                rating: result.rating || null,
                reviews_count: result.reviews || result.ratingCount || null,
                website: result.website || null,
                google_maps_url: result.link || null,
                place_id: result.placeId || null,
                type: result.category || result.type || null,
                subtype: searchTerm,
              };
              allLeads.push(lead);
              newLeadsForCommunity.push(lead);
            }
            
            await new Promise(r => setTimeout(r, apiUsed === 'duckduckgo_free' ? 300 : 100));
          } catch (error) {
            console.error(`${apiUsed} error:`, error);
            if (apiUsed !== 'duckduckgo_free') {
              try {
                const fallback = await searchWithDDG(`${searchTerm} em ${searchLocation}`);
                for (const r of fallback) {
                  if (allLeads.length >= maxResults) break;
                  const phone = r.phone || r.phoneNumber;
                  if (!phone) continue;
                  const np = phone.replace(/\D/g, "");
                  if (seenPhones.has(np)) continue;
                  seenPhones.add(np);
                  const lead = { business_name: r.title || "Empresa", phone, address: r.address || null, rating: null, reviews_count: null, website: r.website || null, google_maps_url: r.link || null, place_id: null, type: null, subtype: searchTerm };
                  allLeads.push(lead);
                  newLeadsForCommunity.push(lead);
                }
              } catch {}
            }
          }
        }
      }

      // Save to community database
      if (newLeadsForCommunity.length > 0) {
        try {
          const inserts = newLeadsForCommunity.filter(l => l.phone && l.business_name).map(l => ({
            business_name: l.business_name, phone: l.phone, address: l.address,
            rating: l.rating, reviews_count: l.reviews_count, website: l.website,
            google_maps_url: l.google_maps_url, niche, location,
            niche_normalized: nicheNormalized, location_normalized: locationNormalized,
            source: apiUsed, contributed_by: effectiveUserId,
          }));
          for (let i = 0; i < inserts.length; i += 50) {
            await supabase.from("community_leads").upsert(inserts.slice(i, i + 50), { onConflict: 'phone,niche_normalized,location_normalized', ignoreDuplicates: true });
          }
          console.log(`💾 ${inserts.length} leads salvos no banco comunitário`);
        } catch (err) { console.error("Community DB save error:", err); }
      }

      console.log(`Total: ${allLeads.length} leads (${communityLeads.length} comunitário + ${newLeadsForCommunity.length} novos via ${apiUsed})`);

      return new Response(JSON.stringify({ 
        leads: allLeads, total: allLeads.length,
        searchTermsUsed: limitedSearchTerms, apiUsed,
        communityLeadsCount: communityLeads.length,
        freshLeadsCount: newLeadsForCommunity.length,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
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

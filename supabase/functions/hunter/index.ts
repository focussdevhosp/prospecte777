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
    // Verify Bearer token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Find user by hunter_api_token
    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("*")
      .eq("hunter_api_token", token)
      .single();

    if (settingsError || !settings) {
      console.error("Invalid token or user not found:", settingsError);
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = settings.user_id;
    console.log(`Hunter agent started for user: ${userId}`);

    // Parse request body to get optional niches and locations
    let requestNiches: string[] = [];
    let requestLocations: string[] = [];
    
    try {
      const body = await req.json();
      requestNiches = body.niches || [];
      requestLocations = body.locations || [];
      console.log(`Request body received - niches: ${requestNiches.length}, locations: ${requestLocations.length}`);
    } catch {
      // No body or invalid JSON - will use settings
      console.log("No request body, using user settings");
    }

    // Get target niches and locations (prefer request body, fallback to user settings)
    const niches = requestNiches.length > 0 ? requestNiches : (settings.target_niches || []);
    const locations = requestLocations.length > 0 ? requestLocations : (settings.target_locations || []);

    console.log(`Using niches: ${niches.join(', ')} | locations: ${locations.join(', ')}`);

    if (niches.length === 0 || locations.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: "No niches or locations configured",
          hint: "Passe 'niches' e 'locations' no body da requisição ou configure target_niches e target_locations nas suas configurações.",
          hasNiches: niches.length > 0,
          hasLocations: locations.length > 0,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use DuckDuckGo (FREE - no API key needed)
    const searchQuery = `${niches[0]} em ${locations[0]} telefone contato`;
    console.log(`Searching DuckDuckGo (FREE) for: ${searchQuery}`);

    const ddgResponse = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(searchQuery)}&kl=br-pt`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
        },
      }
    );

    if (!ddgResponse.ok) {
      throw new Error("Failed to search businesses with DuckDuckGo");
    }

    const html = await ddgResponse.text();
    const blocks = html.split('class="result__body"');
    const localResults: any[] = [];

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];
      const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
      const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').trim() : '';
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
      const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
      const phoneMatch = `${title} ${snippet}`.match(/\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/);
      if (phoneMatch) {
        localResults.push({ title, phone: phoneMatch[0], address: snippet.substring(0, 100) });
      }
    }

    console.log(`Found ${localResults.length} businesses from DuckDuckGo (FREE)`);

    // Map SerpAPI results to our lead format
    const foundLeads = localResults.slice(0, 5).map((result: any) => ({
      business_name: result.title || "Empresa",
      phone: result.phone || null,
      niche: niches[0],
      location: locations[0],
      address: result.address || null,
      google_maps_url: result.place_id 
        ? `https://www.google.com/maps/place/?q=place_id:${result.place_id}`
        : result.gps_coordinates 
          ? `https://www.google.com/maps?q=${result.gps_coordinates.latitude},${result.gps_coordinates.longitude}`
          : null,
      website: result.website || null,
      rating: result.rating || null,
      reviews: result.reviews || null,
    }));

    // Filter leads that have phone numbers
    const leadsWithPhone = foundLeads.filter((lead: any) => lead.phone);
    console.log(`${leadsWithPhone.length} leads have phone numbers`);

    // As chaves e a ordem dos provedores moram em `_shared/ai.ts`. Esta
    // function tinha a própria escada DeepSeek -> Lovable, com o prompt
    // escrito DUAS VEZES em formatos diferentes: um mandava tudo como
    // `user`, o outro separava `system` e `user`. Dois textos que deveriam
    // ser o mesmo, divergindo em silêncio conforme um dos dois era editado.
    if (messageVariations.length > 0) {
      // Use A/B test variation
      const randomVariation =
        messageVariations[Math.floor(Math.random() * messageVariations.length)];
      firstMessage = randomVariation.template || randomVariation;
    } else {
      const ai = await complete(
        `Você é ${settings.agent_name}, um especialista em vendas consultivas.
${settings.agent_persona}

Seu objetivo é criar uma primeira mensagem de prospecção que:
1. Seja pessoal e não pareça automática
2. Identifique uma dor comum do nicho
3. Ofereça uma solução de forma sutil
4. Termine com uma pergunta aberta para engajar

Serviços oferecidos: ${(settings.services_offered || []).join(", ")}
Base de conhecimento: ${settings.knowledge_base || ""}

Responda APENAS com a mensagem, sem explicações.`,
        `Crie uma mensagem de primeiro contato para uma empresa do nicho "${niches[0]}" localizada em "${locations[0]}".`,
        { temperature: 0.9, max_tokens: 500 },
      );

      firstMessage = ai.text;
    }

    // Create leads and log messages
    const createdLeads = [];
    for (const leadData of leadsWithPhone) {
      // Check if lead already exists
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .eq("user_id", userId)
        .eq("phone", leadData.phone)
        .single();

      if (existingLead) {
        console.log(`Lead already exists: ${leadData.phone}`);
        continue;
      }

      // Create lead
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .insert({
          user_id: userId,
          business_name: leadData.business_name,
          phone: leadData.phone,
          niche: leadData.niche,
          location: leadData.location,
          address: leadData.address,
          google_maps_url: leadData.google_maps_url,
          stage: "Contato",
          temperature: "morno",
          source: "google_maps",
          last_contact_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (leadError) {
        console.error("Error creating lead:", leadError);
        continue;
      }

      // Log first message
      await supabase.from("chat_messages").insert({
        lead_id: lead.id,
        sender_type: "agent",
        content: firstMessage,
        status: "sent",
      });

      // Log activity
      await supabase.from("activity_log").insert({
        user_id: userId,
        lead_id: lead.id,
        activity_type: "lead_created",
        description: `Novo lead prospectado: ${leadData.business_name}`,
        metadata: { source: "hunter_agent" },
      });

      createdLeads.push(lead);

      // Vira `true` só quando o envio foi aceito. É o que o webhook consulta.
      let enviouDeVerdade = false;

      // ---- PRIMEIRA ABORDAGEM ----
      // Vai pelo `whatsapp-send` como todo o resto. Falando direto com a
      // Evolution, esta função não consultava a lista de bloqueio: um número
      // que já tinha pedido para sair de outra campanha voltava a receber
      // abordagem só por ter sido capturado de novo. Também não respeitava a
      // parada de emergência nem a rotação de chip.
      if (settings.whatsapp_connected && settings.whatsapp_instance_id) {
        try {
          const { error: sendError } = await supabase.functions.invoke("whatsapp-send", {
            body: {
              phone: leadData.phone,
              message: firstMessage,
              instance_id: settings.whatsapp_instance_id,
              user_id: userId,
              initiated_by: "automation",
            },
          });

          if (sendError) {
            console.error(`[hunter] envio recusado para ${leadData.phone}: ${sendError.message}`);
          } else {
            enviouDeVerdade = true;
            await supabase
              .from("chat_messages")
              .update({ status: "delivered" })
              .eq("lead_id", lead.id)
              .eq("sender_type", "agent");
          }
        } catch (whatsappError) {
          console.error("[hunter] falha no envio:", whatsappError);
        }
      } else {
        console.log(
          `[hunter] WhatsApp desconectado — nada foi enviado para ${leadData.phone}.`,
        );
      }

      // O WEBHOOK SO DISPARA SE A MENSAGEM SAIU.
      //
      // Ele avisava "lead_contacted" em TODOS os caminhos: WhatsApp
      // desconectado, envio recusado, excecao no meio. O sistema do cliente
      // do outro lado — CRM, automacao, planilha — registrava um contato que
      // nunca aconteceu, e ninguem tinha como perceber a diferenca.
      //
      // Um webhook e um contrato com um sistema de terceiro. Mentir para ele
      // e pior que mentir para uma tela: a tela alguem confere.
      if (settings.webhook_url && enviouDeVerdade) {
        try {
          await fetch(settings.webhook_url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              event: "lead_contacted",
              lead,
              message: firstMessage,
              timestamp: new Date().toISOString(),
            }),
          });
        } catch (webhookError) {
          console.error("Webhook error:", webhookError);
        }
      }
    }

    console.log(`Hunter agent completed. Created ${createdLeads.length} leads.`);

    return new Response(
      JSON.stringify({
        success: true,
        leads_created: createdLeads.length,
        leads: createdLeads,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Hunter agent error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

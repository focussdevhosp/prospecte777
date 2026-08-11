// `npm:@supabase/supabase-js@2/cors` não existe — esse import derrubava a
// function inteira no boot, então nenhuma campanha chegava a executar.
import {
  corsHeaders,
  handleCors,
  json,
  requirePaidPlan,
  requireUserOrInternal,
  resolveUserId,
} from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const paywall = await requirePaidPlan(auth.ctx);
  if (paywall) return paywall;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const campaign_id = body.campaign_id;
    if (!campaign_id) {
      return json({ error: "campaign_id é obrigatório" }, 400);
    }

    const identity = resolveUserId(auth.ctx, body.user_id);
    if (identity.error) return identity.error;
    const user_id = identity.userId;

    const supabase = auth.ctx.supabase;

    // Busca campanha
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("*")
      .eq("id", campaign_id)
      .eq("user_id", user_id)
      .single();

    if (cErr || !campaign) {
      return new Response(JSON.stringify({ error: "Campanha não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Busca settings do usuário
    const { data: settings } = await supabase
      .from("user_settings")
      .select("whatsapp_instance_id, whatsapp_connected")
      .eq("user_id", user_id)
      .single();

    if (!settings?.whatsapp_connected || !settings?.whatsapp_instance_id) {
      await supabase.from("campaigns").update({ status: "failed", completed_at: new Date().toISOString() }).eq("id", campaign_id);
      return new Response(JSON.stringify({ error: "WhatsApp não conectado" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Atualiza status para running
    await supabase.from("campaigns").update({ status: "running", started_at: new Date().toISOString() }).eq("id", campaign_id);

    // Cria background job para processar a campanha
    const { data: job } = await supabase.from("background_jobs").insert({
      user_id,
      job_type: "campaign_execution",
      status: "pending",
      payload: {
        campaign_id,
        campaign_type: campaign.campaign_type,
        niches: campaign.niches || [],
        locations: campaign.locations || [],
        message_template: campaign.message_template,
      },
      priority: 3,
    }).select().single();

    // Fase 1: Prospectar leads (campanhas automáticas)
    let leadsToSend: any[] = [];

    if (campaign.campaign_type === "automatic" && campaign.niches?.length > 0 && campaign.locations?.length > 0) {
      try {
        const prospectResponse = await fetch(`${supabaseUrl}/functions/v1/ai-prospecting`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            user_id,
            niche: campaign.niches[0],
            location: campaign.locations[0],
            quantity: 20,
          }),
        });

        const prospectData = await prospectResponse.json();
        const leadsCreated = prospectData?.leads_created || prospectData?.total_saved || 0;

        await supabase.from("campaigns").update({ leads_found: leadsCreated }).eq("id", campaign_id);

        // Busca leads recém criados
        const { data: newLeads } = await supabase
          .from("leads")
          .select("id, phone, business_name, niche")
          .eq("user_id", user_id)
          .eq("message_sent", false)
          .order("created_at", { ascending: false })
          .limit(leadsCreated || 20);

        leadsToSend = newLeads || [];
      } catch (e) {
        console.error("Erro na prospecção:", e);
      }
    } else {
      // Manual: busca leads não contactados
      const { data: existingLeads } = await supabase
        .from("leads")
        .select("id, phone, business_name, niche")
        .eq("user_id", user_id)
        .eq("message_sent", false)
        .order("created_at", { ascending: false })
        .limit(50);

      leadsToSend = existingLeads || [];
      await supabase.from("campaigns").update({ leads_found: leadsToSend.length }).eq("id", campaign_id);
    }

    // Fase 2: Enviar mensagens
    let contacted = 0;
    for (const lead of leadsToSend) {
      // Check if campaign was paused
      const { data: currentCampaign } = await supabase
        .from("campaigns")
        .select("status")
        .eq("id", campaign_id)
        .single();

      if (currentCampaign?.status === "paused") break;

      try {
        // Sem template, a campanha não inventa texto. O padrão antigo era
        // "Olá! Vi seu trabalho e fiquei interessado. Podemos conversar?" —
        // uma frase que serve para qualquer empresa e por isso não converte
        // em nenhuma, além de afirmar um interesse que ninguém teve.
        if (!campaign.message_template) {
          console.warn(`[campaign ${campaign_id}] sem template — nada enviado para ${lead.id}`);
          continue;
        }

        const messageBody = campaign.message_template
          .replace(/\{(nome|empresa|nome_empresa)\}/gi, lead.business_name || "")
          .replace(/\{nicho\}/gi, lead.niche || "")
          .replace(/\{(cidade|localizacao|localização)\}/gi, lead.location || "");

        const sendResponse = await fetch(`${supabaseUrl}/functions/v1/whatsapp-send`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          body: JSON.stringify({
            user_id,
            lead_id: lead.id,
            phone: lead.phone,
            message: messageBody,
          }),
        });

        if (sendResponse.ok) {
          contacted++;
          await supabase.from("campaigns").update({ leads_contacted: contacted }).eq("id", campaign_id);
        }

        // Delay anti-ban entre mensagens (15-30s)
        const delay = Math.floor(Math.random() * 15000) + 15000;
        await new Promise((r) => setTimeout(r, delay));
      } catch (e) {
        console.error(`Erro ao enviar para ${lead.phone}:`, e);
      }
    }

    // Finaliza
    const finalStatus = contacted > 0 ? "completed" : "failed";
    await supabase.from("campaigns").update({
      status: finalStatus,
      completed_at: new Date().toISOString(),
      leads_contacted: contacted,
    }).eq("id", campaign_id);

    if (job?.id) {
      await supabase.from("background_jobs").update({
        status: "completed",
        completed_at: new Date().toISOString(),
        processed_items: contacted,
        total_items: leadsToSend.length,
      }).eq("id", job.id);
    }

    return new Response(JSON.stringify({
      success: true,
      leads_found: leadsToSend.length,
      leads_contacted: contacted,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Campaign executor error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

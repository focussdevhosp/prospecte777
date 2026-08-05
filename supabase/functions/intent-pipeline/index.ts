import {
  corsHeaders,
  handleCors,
  json,
  requireUserOrInternal,
  resolveUserId,
} from "../_shared/auth.ts";

const POSITIVE_INTENT = /quero|interesse|sim|pode|vamos|quando|como funciona|me conta|topo|top|show|ótimo|gostei|gostaria|falar mais|saber mais|adorei|perfeito|excelente|combinado|bora/i;
const PRICE_INTENT = /quanto custa|valor|preço|preços|investimento|orçamento|quanto é|quanto fica|proposta|tabela de preços|planos/i;
const SCHEDULE_INTENT = /agendar|reunião|call|videoconferência|quando posso|visita|apresentação|demo|me liga|ligar/i;
const CLOSING_INTENT = /fechado|contratado|vamos em frente|pode começar|aceito|confirmado|assinar|contrato/i;
const NEGATIVE_INTENT = /não tenho interesse|não quero|não preciso|para de|chega|stop|sair|bloquear|cancelar|spam|me tira da lista|não me mande/i;

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;

  try {
    const supabase = auth.ctx.supabase;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const { lead_id, message } = body;
    if (!lead_id || !message) {
      return json({ error: "lead_id e message são obrigatórios" }, 400);
    }

    const identity = resolveUserId(auth.ctx, body.user_id);
    if (identity.error) return identity.error;
    const user_id = identity.userId;

    // O lead precisa ser desta conta — o pipeline move estágio e dispara
    // mensagem, então aceitar lead_id solto seria mexer no funil alheio.
    const { data: ownedLead } = await supabase
      .from("leads")
      .select("id")
      .eq("id", lead_id)
      .eq("user_id", user_id)
      .maybeSingle();
    if (!ownedLead) return json({ error: "Lead não encontrado." }, 404);

    const { data: settings } = await supabase
      .from("user_settings")
      .select("auto_pipeline_enabled")
      .eq("user_id", user_id)
      .single();

    if (!settings?.auto_pipeline_enabled) {
      return new Response(
        JSON.stringify({ skipped: true, reason: "auto_pipeline disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: lead } = await supabase.from("leads").select("*").eq("id", lead_id).single();
    if (!lead) {
      return new Response(JSON.stringify({ error: "Lead not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = message.toLowerCase();
    let newStage = lead.stage;
    let newTemperature = lead.temperature;
    let action = "";

    if (NEGATIVE_INTENT.test(text)) {
      newStage = "Perdido";
      newTemperature = "frio";
      action = "negative_intent";
    } else if (CLOSING_INTENT.test(text)) {
      newStage = "Ganho";
      newTemperature = "quente";
      action = "closing_intent";
    } else if (SCHEDULE_INTENT.test(text) && lead.stage !== "Negociação" && lead.stage !== "Ganho") {
      newStage = "Negociação";
      newTemperature = "quente";
      action = "schedule_intent";
    } else if (PRICE_INTENT.test(text) && lead.stage === "Contato") {
      newStage = "Proposta";
      newTemperature = "quente";
      action = "price_intent";
    } else if (POSITIVE_INTENT.test(text) && lead.stage === "Contato") {
      newStage = "Qualificado";
      newTemperature = "morno";
      action = "positive_intent";
    }

    if (newStage !== lead.stage || newTemperature !== lead.temperature) {
      await supabase
        .from("leads")
        .update({
          stage: newStage,
          temperature: newTemperature,
          last_contact_at: new Date().toISOString(),
        })
        .eq("id", lead_id);

      await supabase.from("activity_log").insert({
        user_id,
        lead_id,
        activity_type: "auto_stage_change",
        description: `Pipeline automático: ${lead.stage} → ${newStage} (${action})`,
      });

      if (newStage === "Ganho" || newStage === "Perdido") {
        await supabase.from("leads").update({ next_follow_up_at: null }).eq("id", lead_id);
      }
    } else {
      await supabase
        .from("leads")
        .update({ last_contact_at: new Date().toISOString() })
        .eq("id", lead_id);
    }

    return new Response(
      JSON.stringify({
        lead_id,
        previous_stage: lead.stage,
        new_stage: newStage,
        action,
        changed: newStage !== lead.stage,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Intent pipeline error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

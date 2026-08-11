import { corsHeaders, handleCors, requireInternal } from "../_shared/auth.ts";

// Varre todas as contas e dispara a primeira mensagem — só o cron chama.
Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireInternal(req);
  if (auth.error) return auth.error;

  try {
    const supabase = auth.ctx.supabase;

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    // Get users with auto first message enabled
    const { data: usersWithAutoMsg } = await supabase
      .from("user_settings")
      .select("user_id, whatsapp_connected, whatsapp_instance_id, onboarding_niche, auto_start_hour, auto_end_hour, work_days_only, auto_first_message_enabled")
      .eq("auto_first_message_enabled", true)
      .eq("whatsapp_connected", true);

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();
    const results: any[] = [];

    for (const userSettings of usersWithAutoMsg || []) {
      const startHour = userSettings.auto_start_hour || 9;
      const endHour = userSettings.auto_end_hour || 18;
      const workDaysOnly = userSettings.work_days_only !== false;

      if (workDaysOnly && (currentDay === 0 || currentDay === 6)) continue;
      if (currentHour < startHour || currentHour >= endHour) continue;

      // Get new leads for this user
      const { data: newLeads } = await supabase
        .from("leads")
        .select("*")
        .eq("user_id", userSettings.user_id)
        .eq("message_sent", false)
        .eq("stage", "Contato")
        .gte("created_at", oneHourAgo)
        .not("phone", "is", null)
        .limit(10);

      for (const lead of newLeads || []) {
        // Get first contact template
        const { data: template } = await supabase
          .from("message_templates")
          .select("content")
          .eq("user_id", lead.user_id)
          .ilike("name", "1º Contato%")
          .single();

        // Sem template de 1º contato cadastrado, o lead é pulado. O padrão
        // antigo — "Olá! Vi o X e gostaria de apresentar uma solução que pode
        // te interessar" — é exatamente a mensagem genérica que faz o lead
        // ignorar e o número ser denunciado.
        if (!template?.content) {
          console.log(`[auto-first-message] ${lead.business_name} pulado: sem template de 1º contato.`);
          continue;
        }

        const message = template.content
          .replace(/\{(nome_empresa|empresa|nome)\}/gi, lead.business_name)
          .replace(/\{(localização|localizacao|cidade)\}/gi, lead.location || "")
          .replace(/\{nicho\}/gi, lead.niche || "");

        const { error } = await supabase.functions.invoke("whatsapp-send", {
          body: {
            phone: lead.phone,
            message,
            instance_id: userSettings.whatsapp_instance_id,
            user_id: userSettings.user_id,
            initiated_by: "automation",
          },
        });

        if (!error) {
          await supabase
            .from("leads")
            .update({
              message_sent: true,
              first_contact_at: now.toISOString(),
              last_contact_at: now.toISOString(),
              next_follow_up_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            })
            .eq("id", lead.id);

          await supabase.from("activity_log").insert({
            user_id: lead.user_id,
            lead_id: lead.id,
            activity_type: "automated_message",
            description: `Primeira mensagem automática enviada para ${lead.business_name}`,
          });

          results.push({ lead_id: lead.id, name: lead.business_name, status: "sent" });
        }
      }
    }

    return new Response(
      JSON.stringify({ sent: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Auto first message error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

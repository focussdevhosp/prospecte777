import {
  corsHeaders,
  handleCors,
  requirePaidPlan,
  requireUserOrInternal,
} from "../_shared/auth.ts";

// Inline niche reactivation templates (can't import from src/)
const REACTIVATION_TEMPLATES: Record<string, string> = {
  restaurantes: "Olá {nome_empresa}! Tudo bem por aí? 😊\n\nPassou um tempo desde nosso último contato. Tenho novidades que podem interessar vocês — lançamos um sistema de delivery próprio sem taxas do iFood.\n\nTem interesse em saber mais?",
  clinicas: "Olá {nome_empresa}! Tudo bem? 😊\n\nFazem alguns meses desde nosso contato. Lançamos uma integração nova com o WhatsApp que permite agendar consultas direto pelo aplicativo.\n\nTem interesse em conhecer?",
  academias: "Fala {nome_empresa}! Tudo certo? 💪\n\nPassou um tempo do nosso contato. Lançamos um app de treino que os alunos usam em casa também — aumenta engajamento e retém mais.\n\nTem interesse?",
  saloes: "Oi {nome_empresa}! Tudo bem? 😊\n\nFazem alguns meses do nosso contato. Lançamos uma integração nova com Instagram para agendamento direto pelo stories.\n\nTem interesse em ver?",
  advocacia: "Prezado(a) {nome_empresa},\n\nRetomo o contato após algum tempo. Lançamos uma solução de triagem inicial de clientes que economiza horas de consultas improdutivas.\n\nHá interesse em conhecer?",
  imoveis: "Olá {nome_empresa}! Tudo bem? 😊\n\nRetomo contato com uma novidade — integração com portais como ZAP e VivaReal para captar leads automaticamente.\n\nTem interesse?",
  contabilidade: "Olá {nome_empresa}! Tudo bem? 😊\n\nRetomo contato com uma novidade — ferramenta de captura de MEIs que precisam regularizar situação fiscal.\n\nTem interesse em ver?",
  ecommerce: "Oi {nome_empresa}! Tudo bem? 😊\n\nPassou um tempo do nosso contato. Lançamos automação de pós-venda por WhatsApp que aumenta recompra em 25%.\n\nTem interesse?",
};

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const paywall = await requirePaidPlan(auth.ctx);
  if (paywall) return paywall;

  try {
    const supabase = auth.ctx.supabase;

    // O cron varre todas as contas; um usuário logado só pode disparar a
    // reativação da própria — senão uma chamada manual mandaria mensagem
    // pela conta de todo mundo.
    const usersQuery = supabase
      .from("user_settings")
      .select("user_id, whatsapp_instance_id, onboarding_niche, auto_reactivation_enabled")
      .eq("auto_reactivation_enabled", true)
      .eq("whatsapp_connected", true);

    if (auth.ctx.kind === "user") usersQuery.eq("user_id", auth.ctx.userId);

    const { data: usersWithReactivation } = await usersQuery;

    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const results: any[] = [];

    for (const userSetting of usersWithReactivation || []) {
      const { data: coldLeads } = await supabase
        .from("leads")
        .select("*")
        .eq("user_id", userSetting.user_id)
        .in("stage", ["Contato", "Qualificado"])
        .lt("last_contact_at", twentyDaysAgo)
        .not("phone", "is", null)
        .limit(10);

      for (const lead of coldLeads || []) {
        const template = userSetting.onboarding_niche
          ? REACTIVATION_TEMPLATES[userSetting.onboarding_niche]
          : null;

        const reactivationMsg = template
          ? template.replace(/\{nome_empresa\}/g, lead.business_name)
          : `Olá ${lead.business_name}! Tudo bem? 😊\n\nPassou um tempo desde nosso contato. Tenho novidades que podem te interessar. Ainda faz sentido conversar?`;

        await supabase.functions.invoke("whatsapp-send", {
          body: {
            phone: lead.phone,
            message: reactivationMsg,
            instance_id: userSetting.whatsapp_instance_id,
          },
        });

        await supabase.from("activity_log").insert({
          user_id: userSetting.user_id,
          lead_id: lead.id,
          activity_type: "automated_message",
          description: `Reativação automática enviada para ${lead.business_name}`,
        });

        const newFollowUpCount = (lead.follow_up_count || 0) + 1;
        const updates: any = {
          last_contact_at: new Date().toISOString(),
          follow_up_count: newFollowUpCount,
        };

        if (newFollowUpCount >= 3) {
          updates.stage = "Perdido";
          updates.next_follow_up_at = null;
        } else {
          updates.next_follow_up_at = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
        }

        await supabase.from("leads").update(updates).eq("id", lead.id);
        results.push({ lead_id: lead.id, name: lead.business_name, attempt: newFollowUpCount });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Cold reactivation error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

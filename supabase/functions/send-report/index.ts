import { corsHeaders, handleCors, json, requireUserOrInternal } from "../_shared/auth.ts";
import { complete } from "../_shared/ai.ts";

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const ctx = auth.ctx;
  const supabase = ctx.supabase;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));

    // O cron manda user_id no corpo; o app manda o JWT do dono da conta.
    // Antes só existia o caminho do hunter_api_token, então o relatório
    // diário disparado pelo cron caía em 401 e nunca era enviado.
    let userId: string | null = null;

    if (ctx.kind === "internal") {
      userId = typeof body.user_id === "string" ? body.user_id : null;
      if (!userId) return json({ error: "user_id é obrigatório em chamada interna." }, 400);
    } else {
      userId = ctx.userId;
    }

    const { data: settings, error: settingsError } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (settingsError || !settings) {
      console.error("Configurações não encontradas:", settingsError);
      return json({ error: "Configurações do usuário não encontradas." }, 404);
    }

    if (!settings.daily_report_enabled) {
      return new Response(JSON.stringify({ success: true, message: "Reports disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Generating report for user: ${userId}`);

    // Get user profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Get yesterday's date range
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);
    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setHours(23, 59, 59, 999);

    // Get metrics
    const { data: newLeads } = await supabase
      .from("leads")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", yesterday.toISOString())
      .lte("created_at", endOfYesterday.toISOString());

    const { data: newMeetings } = await supabase
      .from("meetings")
      .select("id")
      .eq("user_id", userId)
      .gte("created_at", yesterday.toISOString())
      .lte("created_at", endOfYesterday.toISOString());

    const { data: messages } = await supabase
      .from("chat_messages")
      .select("id, lead_id")
      .in(
        "lead_id",
        (await supabase.from("leads").select("id").eq("user_id", userId)).data?.map(
          (l) => l.id
        ) || []
      )
      .gte("sent_at", yesterday.toISOString())
      .lte("sent_at", endOfYesterday.toISOString());

    const { data: allLeads } = await supabase
      .from("leads")
      .select("stage, temperature")
      .eq("user_id", userId);

    // Calculate stats
    const stats = {
      newLeads: newLeads?.length || 0,
      newMeetings: newMeetings?.length || 0,
      messagesSent: messages?.length || 0,
      totalLeads: allLeads?.length || 0,
      hotLeads: allLeads?.filter((l) => l.temperature === "quente").length || 0,
      warmLeads: allLeads?.filter((l) => l.temperature === "morno").length || 0,
      coldLeads: allLeads?.filter((l) => l.temperature === "frio").length || 0,
      wonLeads: allLeads?.filter((l) => l.stage === "Ganho").length || 0,
    };

    const conversionRate =
      stats.totalLeads > 0 ? ((stats.wonLeads / stats.totalLeads) * 100).toFixed(1) : "0";

    // O relatório passa pela camada comum. Antes exigia LOVABLE_API_KEY e
    // lançava exceção sem ela — o e-mail diário simplesmente não saía, e o
    // erro só aparecia no log da function.
    //
    // Aqui a falha NÃO é fatal, de propósito: os números do relatório vêm do
    // banco e são verdadeiros com ou sem IA. O que a IA faz é redigir. Se ela
    // não responder, o texto padrão logo abaixo entrega os mesmos números sem
    // enfeite — que é melhor que não mandar relatório nenhum.
    let reportText = "";

    try {
      const ai = await complete(
        `Você é um assistente de relatórios. Crie um breve relatório diário de prospecção em português.
Use emojis para tornar visual. Seja conciso e motivador.`,
        `Gere um relatório para ${profile?.full_name || "o usuário"} com estas métricas de ontem:
- Novos leads: ${stats.newLeads}
- Reuniões agendadas: ${stats.newMeetings}
- Mensagens enviadas: ${stats.messagesSent}
- Total de leads: ${stats.totalLeads}
- Leads quentes: ${stats.hotLeads}
- Leads mornos: ${stats.warmLeads}
- Leads frios: ${stats.coldLeads}
- Taxa de conversão: ${conversionRate}%

Inclua uma dica motivacional no final.`,
        { role: "fast", max_tokens: 700 },
      );
      reportText = ai.text;
    } catch (e) {
      console.error("[send-report] IA indisponível, usando o texto padrão:", e);
    }

    // Default report if AI fails
    if (!reportText) {
      reportText = `📊 Relatório Diário - Prospecte

Olá ${profile?.full_name || ""}!

📈 Resumo de ontem:
• Novos leads: ${stats.newLeads}
• Reuniões agendadas: ${stats.newMeetings}
• Mensagens enviadas: ${stats.messagesSent}

📊 Visão geral:
• Total de leads: ${stats.totalLeads}
• 🔥 Quentes: ${stats.hotLeads}
• ☀️ Mornos: ${stats.warmLeads}
• ❄️ Frios: ${stats.coldLeads}
• Taxa de conversão: ${conversionRate}%

Continue prospectando! 🚀`;
    }

    // ---- ENVIO ----
    //
    // Aqui havia um `// TODO: Send email using Resend` seguido de dois
    // console.log e um `success: true`. O relatorio era gerado, jogado no
    // log da function e a resposta dizia que tinha dado certo.
    //
    // O usuario liga "Relatorio diario por email" nas automacoes e nunca
    // recebe nada. Nenhum erro, nenhuma pista — a automacao aparece ativa e
    // simplesmente nao existe.
    //
    // Vai pelo `email-send`, que e o unico lugar que fala com o provedor.
    // `kind: transactional` porque relatorio nao e prospeccao: ele so pode
    // ir para o e-mail da propria conta, e a parada de emergencia (que
    // existe para parar de incomodar LEADS) nao pode calar o relatorio do
    // dono.
    const destinatario = profile?.email;

    if (!destinatario) {
      return new Response(
        JSON.stringify({
          success: false,
          code: "no_email",
          error: "A conta nao tem e-mail cadastrado, entao nao ha para onde mandar o relatorio.",
          report: reportText,
          stats,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const envio = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/email-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        to: destinatario,
        subject: `Seu relatorio de prospeccao — ${new Date().toLocaleDateString("pt-BR")}`,
        text: reportText,
        user_id: userId,
        kind: "transactional",
      }),
    });

    if (!envio.ok) {
      const detalhe = (await envio.text()).slice(0, 300);
      console.error(`[send-report] o e-mail nao saiu (${envio.status}):`, detalhe);

      // Devolve o relatorio junto: os numeros vem do banco e sao verdadeiros
      // com ou sem e-mail. O que nao pode e dizer que enviou.
      return new Response(
        JSON.stringify({
          success: false,
          code: "email_failed",
          status: envio.status,
          error: "O relatorio foi gerado, mas o e-mail nao pode ser enviado.",
          detail: detalhe,
          report: reportText,
          stats,
        }),
        { status: envio.status === 503 ? 503 : 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent_to: destinatario,
        report: reportText,
        stats,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Report error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

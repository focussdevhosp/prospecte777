import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  toName?: string;
}

function getWelcomeEmailHtml(planName: string, userName: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:16px;padding:40px 30px;text-align:center;">
    <h1 style="color:#22c55e;font-size:28px;margin:0 0 10px;">🎉 Bem-vindo ao NexaProspect!</h1>
    <p style="color:#94a3b8;font-size:16px;margin:0 0 20px;">Seu plano <strong style="color:#fff;">${planName.toUpperCase()}</strong> foi ativado com sucesso.</p>
    <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:12px;padding:20px;margin:20px 0;">
      <p style="color:#22c55e;font-size:14px;margin:0;">✅ Acesso liberado a todas as funcionalidades do plano</p>
    </div>
    <p style="color:#cbd5e1;font-size:14px;margin:20px 0 0;">Olá${userName ? ` ${userName}` : ''}, comece agora a prospectar e conquistar novos clientes!</p>
    <a href="https://nexaprospect.com.br/dashboard" style="display:inline-block;margin-top:20px;background:#22c55e;color:#fff;text-decoration:none;padding:12px 30px;border-radius:8px;font-weight:bold;">Acessar Dashboard →</a>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:20px;">NexaProspect — Prospecção inteligente por WhatsApp</p>
</div>
</body>
</html>`;
}

function getExpiringEmailHtml(planName: string, daysLeft: number, userName: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:16px;padding:40px 30px;text-align:center;">
    <h1 style="color:#f59e0b;font-size:28px;margin:0 0 10px;">⚠️ Seu plano está expirando</h1>
    <p style="color:#94a3b8;font-size:16px;margin:0 0 20px;">Olá${userName ? ` ${userName}` : ''}, seu plano <strong style="color:#fff;">${planName.toUpperCase()}</strong> expira em <strong style="color:#f59e0b;">${daysLeft} dias</strong>.</p>
    <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:12px;padding:20px;margin:20px 0;">
      <p style="color:#f59e0b;font-size:14px;margin:0;">Renove agora para não perder acesso às funcionalidades</p>
    </div>
    <a href="https://nexaprospect.com.br/billing" style="display:inline-block;margin-top:20px;background:#f59e0b;color:#fff;text-decoration:none;padding:12px 30px;border-radius:8px;font-weight:bold;">Renovar Plano →</a>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:20px;">NexaProspect — Prospecção inteligente por WhatsApp</p>
</div>
</body>
</html>`;
}

function getExpiredEmailHtml(planName: string, userName: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:16px;padding:40px 30px;text-align:center;">
    <h1 style="color:#ef4444;font-size:28px;margin:0 0 10px;">❌ Seu plano expirou</h1>
    <p style="color:#94a3b8;font-size:16px;margin:0 0 20px;">Olá${userName ? ` ${userName}` : ''}, seu plano <strong style="color:#fff;">${planName.toUpperCase()}</strong> foi cancelado.</p>
    <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:20px;margin:20px 0;">
      <p style="color:#ef4444;font-size:14px;margin:0;">Seu acesso à plataforma está bloqueado</p>
    </div>
    <p style="color:#cbd5e1;font-size:14px;margin:20px 0 0;">Renove agora para recuperar acesso completo e continuar prospectando.</p>
    <a href="https://nexaprospect.com.br/billing" style="display:inline-block;margin-top:20px;background:#ef4444;color:#fff;text-decoration:none;padding:12px 30px;border-radius:8px;font-weight:bold;">Renovar Agora →</a>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:20px;">NexaProspect — Prospecção inteligente por WhatsApp</p>
</div>
</body>
</html>`;
}

function getRenewalEmailHtml(planName: string, userName: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:20px;">
  <div style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:16px;padding:40px 30px;text-align:center;">
    <h1 style="color:#22c55e;font-size:28px;margin:0 0 10px;">✅ Renovação confirmada!</h1>
    <p style="color:#94a3b8;font-size:16px;margin:0 0 20px;">Olá${userName ? ` ${userName}` : ''}, seu plano <strong style="color:#fff;">${planName.toUpperCase()}</strong> foi renovado com sucesso.</p>
    <div style="background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.3);border-radius:12px;padding:20px;margin:20px 0;">
      <p style="color:#22c55e;font-size:14px;margin:0;">Seu acesso continua ativo! Continue prospectando 🚀</p>
    </div>
    <a href="https://nexaprospect.com.br/dashboard" style="display:inline-block;margin-top:20px;background:#22c55e;color:#fff;text-decoration:none;padding:12px 30px;border-radius:8px;font-weight:bold;">Acessar Dashboard →</a>
  </div>
  <p style="text-align:center;color:#94a3b8;font-size:12px;margin-top:20px;">NexaProspect — Prospecção inteligente por WhatsApp</p>
</div>
</body>
</html>`;
}

async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const CAKTO_API_KEY = Deno.env.get("CAKTO_API_KEY");
  const CAKTO_SECRET_KEY = Deno.env.get("CAKTO_SECRET_KEY");

  if (!CAKTO_API_KEY || !CAKTO_SECRET_KEY) {
    console.warn("Cakto API keys not configured, skipping email send");
    return false;
  }

  try {
    // Try sending via Cakto transactional email API
    const response = await fetch("https://api.cakto.com.br/v1/emails/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${CAKTO_API_KEY}`,
        "X-Client-Secret": CAKTO_SECRET_KEY,
      },
      body: JSON.stringify({
        to: payload.to,
        to_name: payload.toName || "",
        subject: payload.subject,
        html: payload.html,
        from: "NexaProspect <noreply@nexaprospect.com.br>",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Email send failed (${response.status}):`, errorText);
      return false;
    }

    console.log(`Email sent successfully to ${payload.to}`);
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, email, userName, planName, daysLeft } = await req.json();

    // Validate required fields
    if (!type || !email) {
      return new Response(
        JSON.stringify({ error: "type and email are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let emailPayload: EmailPayload;

    switch (type) {
      case "welcome":
        emailPayload = {
          to: email,
          toName: userName,
          subject: `🎉 Bem-vindo ao NexaProspect — Plano ${(planName || "Starter").toUpperCase()} ativado!`,
          html: getWelcomeEmailHtml(planName || "Starter", userName || ""),
        };
        break;

      case "expiring":
        emailPayload = {
          to: email,
          toName: userName,
          subject: `⚠️ Seu plano ${(planName || "").toUpperCase()} expira em ${daysLeft || 3} dias`,
          html: getExpiringEmailHtml(planName || "Starter", daysLeft || 3, userName || ""),
        };
        break;

      case "expired":
        emailPayload = {
          to: email,
          toName: userName,
          subject: `❌ Seu plano ${(planName || "").toUpperCase()} expirou — Renove agora`,
          html: getExpiredEmailHtml(planName || "Starter", userName || ""),
        };
        break;

      case "renewed":
        emailPayload = {
          to: email,
          toName: userName,
          subject: `✅ Renovação confirmada — Plano ${(planName || "").toUpperCase()}`,
          html: getRenewalEmailHtml(planName || "Starter", userName || ""),
        };
        break;

      default:
        return new Response(
          JSON.stringify({ error: `Unknown email type: ${type}` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    const sent = await sendEmail(emailPayload);

    return new Response(
      JSON.stringify({ success: true, sent, type, email }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Subscription email error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
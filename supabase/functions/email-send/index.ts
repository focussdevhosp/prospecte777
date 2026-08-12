// ============================================================
// ENVIO DE E-MAIL
// ============================================================
// Segunda porta de saída do produto, e por isso a parte perigosa: a primeira
// levou doze ciclos para ficar segura, e quatro caminhos diferentes furaram o
// opt-out por falarem direto com a API do WhatsApp em vez de passarem pelo
// portão.
//
// Esta function existe para que exista UM portão por canal, e não um por
// caminho. A ordem das checagens é a mesma do `whatsapp-send`, de propósito:
//
//   1. quem é o dono          — sem isso nada pode ser conferido
//   2. parada de emergência   — o freio da conta
//   3. opt-out                — agora atravessando canais
//   4. provedor configurado
//
// POR QUE E-MAIL IMPORTA AQUI
// Não é só alcance. E-mail não queima número. Hoje toda abordagem fria sai
// pelo WhatsApp, que é o ativo mais frágil da operação — chip banido não
// volta e leva junto o histórico de conversa de todo mundo. Primeiro toque
// por e-mail e WhatsApp só depois da resposta protege o ativo e amplia o
// alcance ao mesmo tempo.

import {
  corsHeaders,
  failure,
  handleCors,
  json,
  requirePaidPlan,
  requireUserOrInternal,
} from "../_shared/auth.ts";
import { initiatorOf, outboundBlockReason } from "../_shared/outbound-gate.ts";

/** Limite do corpo. Acima disso, provedor recusa ou o cliente de e-mail corta. */
const MAX_BODY = 100_000;

function emailValido(valor: string): boolean {
  // Deliberadamente frouxo: validar e-mail com regex é caça sem fim, e o
  // provedor recusa o que for inválido de verdade. O que precisa ser barrado
  // aqui é o obviamente quebrado, para não gastar uma chamada paga com ele.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(valor.trim());
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const ctx = auth.ctx;

  const paywall = await requirePaidPlan(ctx);
  if (paywall) return paywall;

  try {
    const body = await req.json();
    const { to, subject, text, lead_id } = body;

    if (!to || !subject || !text) {
      return json({ error: "to, subject e text são obrigatórios." }, 400);
    }
    if (!emailValido(String(to))) {
      return json({ error: `E-mail inválido: ${to}` }, 400);
    }
    if (String(text).length > MAX_BODY) {
      return json({ error: `O corpo passa de ${MAX_BODY} caracteres.` }, 400);
    }

    const destino = String(to).trim().toLowerCase();

    // ---- 1. DE QUEM É ----
    let ownerId: string | null = ctx.kind === "user" ? ctx.userId : null;
    if (!ownerId && typeof body.user_id === "string") ownerId = body.user_id;

    if (!ownerId) {
      return json({
        error:
          "Não foi possível identificar o dono deste envio. Informe `user_id` — " +
          "sem isso não há como conferir opt-out nem parada de emergência.",
        code: "owner_unknown",
      }, 400);
    }

    // ---- 2. PARADA DE EMERGÊNCIA ----
    // O mesmo freio do WhatsApp. Um botão que parasse só um canal seria pior
    // que nenhum: quem aperta espera que tudo pare.
    const initiatedBy = initiatorOf(body.initiated_by);

    const { data: settings } = await ctx.supabase
      .from("user_settings")
      .select("outbound_paused, outbound_paused_reason, agent_name, email_from, email_reply_to")
      .eq("user_id", ownerId)
      .maybeSingle();

    const freio = outboundBlockReason({
      initiatedBy,
      outboundPaused: settings?.outbound_paused === true,
    });

    if (freio) {
      return json({
        error:
          "Os envios estão pausados por parada de emergência" +
          (settings?.outbound_paused_reason ? `: ${settings.outbound_paused_reason}` : ".") +
          " Retome em Configurações para voltar a enviar.",
        code: freio,
      }, 409);
    }

    // ---- 3. OPT-OUT, ATRAVESSANDO CANAIS ----
    // Consulta o LEAD, não só o endereço: quem pediu para parar no WhatsApp
    // pediu para parar, ponto. Do lado de quem recebe não existe diferença
    // entre um canal e outro — é a mesma empresa insistindo.
    const { data: bloqueio } = await ctx.supabase.rpc("outbound_suppressed", {
      p_user_id: ownerId,
      p_channel: "email",
      p_lead_id: lead_id ?? null,
      p_identifier: destino,
    });

    if (bloqueio) {
      return json({ error: String(bloqueio), code: "suppressed" }, 409);
    }

    // ---- 4. PROVEDOR ----
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      // Não configurado é diferente de quebrado, e a mensagem precisa dizer
      // qual dos dois — senão alguém passa a tarde procurando defeito onde só
      // falta preencher um campo.
      return json({
        error:
          "O envio por e-mail não está configurado. Cadastre RESEND_API_KEY nos " +
          "secrets das edge functions para habilitar este canal.",
        code: "email_not_configured",
      }, 503);
    }

    const remetente = settings?.email_from
      ?? "Prospecção <onboarding@resend.dev>";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: remetente,
        to: [destino],
        subject: String(subject),
        text: String(text),
        ...(settings?.email_reply_to ? { reply_to: settings.email_reply_to } : {}),
        // Cabeçalho de descadastro em um clique. Não é enfeite: é o que faz o
        // provedor de caixa tratar a mensagem como remetente sério, e é
        // exigência de quem manda volume. Sem ele, a reputação do domínio cai
        // e o e-mail para de chegar — a mesma falha do mês 4 do WhatsApp, com
        // outro nome.
        headers: {
          "List-Unsubscribe": `<mailto:${settings?.email_reply_to ?? "sair@example.com"}?subject=descadastrar>`,
          "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        },
      }),
    });

    const detalhe = await res.text();

    if (!res.ok) {
      console.error(`[email-send] provedor recusou (${res.status}):`, detalhe.slice(0, 300));
      return json({
        error: "O provedor de e-mail recusou o envio.",
        code: "provider_error",
        status: res.status,
        detail: detalhe.slice(0, 300),
      }, res.status >= 500 ? 502 : 400);
    }

    // Registra no histórico do lead, para a conversa aparecer inteira num
    // lugar só — canal separado vira duas verdades sobre o mesmo cliente.
    if (lead_id) {
      await ctx.supabase.from("chat_messages").insert({
        lead_id,
        sender_type: "agent",
        content: `[e-mail] ${subject}\n\n${text}`,
        status: "sent",
      });
    }

    return new Response(JSON.stringify({ success: true, provider: "resend" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return failure(error, "Não foi possível enviar o e-mail.");
  }
});

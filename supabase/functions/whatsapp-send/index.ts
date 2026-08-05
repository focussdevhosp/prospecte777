import {
  assertOwnsInstance,
  checkRateLimit,
  corsHeaders,
  failure,
  handleCors,
  json,
  rateLimited,
  requirePaidPlan,
  requireUserOrInternal,
} from "../_shared/auth.ts";

const MAX_MESSAGE_LENGTH = 4096;

function normalizeBrazilPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "");

  // Remove o zero de operadora ou de DDD ("011...")
  if (digits.length > 11 && digits.startsWith("0")) digits = digits.replace(/^0+/, "");

  if (!digits.startsWith("55") && digits.length >= 10 && digits.length <= 11) {
    digits = "55" + digits;
  }

  // 55 + DDD(2) + número(8 fixo ou 9 celular)
  if (!/^55\d{10,11}$/.test(digits)) return null;

  const ddd = Number(digits.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;

  return digits;
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
    const { phone, message, instance_id, ab_test_id, ab_variant } = await req.json();

    if (!phone || !message || !instance_id) {
      return json({ error: "phone, message e instance_id são obrigatórios." }, 400);
    }

    if (typeof message !== "string" || message.trim().length === 0) {
      return json({ error: "A mensagem não pode ficar vazia." }, 400);
    }
    if (message.length > MAX_MESSAGE_LENGTH) {
      return json({ error: `A mensagem passa de ${MAX_MESSAGE_LENGTH} caracteres.` }, 400);
    }

    const formattedPhone = normalizeBrazilPhone(String(phone));
    if (!formattedPhone) {
      return json({ error: `Número inválido: ${phone}` }, 400);
    }

    // A instância precisa ser desta conta — sem isso qualquer um manda
    // mensagem pelo chip de outro cliente e queima o número dele.
    const ownership = await assertOwnsInstance(ctx, String(instance_id));
    if (ownership) return ownership;

    if (ctx.kind === "user") {
      const limit = await checkRateLimit(ctx.supabase, ctx.userId, "whatsapp-send", 120, 60);
      if (!limit.allowed) return rateLimited(limit.resetIn);
    }

    // O destinatário pediu para não receber mais? Respeitar é obrigação
    // legal (LGPD) e é o que mantém o chip vivo. A checagem roda no banco
    // com o telefone normalizado, senão formatos diferentes escapam.
    const ownerId = ctx.kind === "user"
      ? ctx.userId
      : (await ctx.supabase
          .from("user_settings")
          .select("user_id")
          .eq("whatsapp_instance_id", String(instance_id))
          .maybeSingle()).data?.user_id ?? null;

    const { data: blocked } = ownerId
      ? await ctx.supabase.rpc("is_phone_blacklisted", {
        p_user_id: ownerId,
        p_phone: formattedPhone,
      })
      : { data: false };

    if (blocked === true) {
      return json(
        { error: "Este número pediu para não receber mensagens.", code: "blacklisted" },
        409,
      );
    }

    const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
    const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

    if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
      return json({ error: "WhatsApp não está configurado no servidor." }, 503);
    }

    const statusResponse = await fetch(
      `${EVOLUTION_API_URL}/instance/connectionState/${instance_id}`,
      { method: "GET", headers: { apikey: EVOLUTION_API_KEY } },
    );

    if (!statusResponse.ok) {
      return json(
        {
          error: "WhatsApp desconectado. Reconecte em Configurações.",
          needsReconnect: true,
        },
        409,
      );
    }

    const statusData = await statusResponse.json();
    const connectionState = statusData?.instance?.state || statusData?.state;
    if (connectionState !== "open") {
      return json(
        {
          error: `WhatsApp não está conectado (estado: ${connectionState || "desconhecido"}). Reconecte em Configurações.`,
          needsReconnect: true,
        },
        409,
      );
    }

    const sendResponse = await fetch(`${EVOLUTION_API_URL}/message/sendText/${instance_id}`, {
      method: "POST",
      headers: { apikey: EVOLUTION_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ number: formattedPhone, text: message }),
    });

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error("Evolution send error:", errorText);

      if (errorText.includes("Connection Closed")) {
        return json(
          { error: "Conexão WhatsApp perdida. Reconecte em Configurações.", needsReconnect: true },
          409,
        );
      }
      return json({ error: "Falha ao enviar a mensagem pelo WhatsApp." }, 502);
    }

    const sendData = await sendResponse.json();

    if (ab_test_id && ab_variant) {
      try {
        const col = ab_variant === "a" ? "variant_a_sent" : "variant_b_sent";
        const { data: test } = await ctx.supabase
          .from("ab_tests")
          .select(col)
          .eq("id", ab_test_id)
          .maybeSingle();
        if (test) {
          await ctx.supabase
            .from("ab_tests")
            .update({
              [col]: ((test as Record<string, number>)[col] ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", ab_test_id);
        }
      } catch (e) {
        console.error("AB test tracking error:", e);
      }
    }

    return new Response(
      JSON.stringify({ success: true, message_id: sendData.key?.id || null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    return failure(error, "Não foi possível enviar a mensagem.");
  }
});

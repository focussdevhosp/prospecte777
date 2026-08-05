import webpush from "npm:web-push@3.6.7";
import {
  corsHeaders,
  handleCors,
  json,
  requireUserOrInternal,
  resolveUserId,
} from "../_shared/auth.ts";

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:noreply@prospecte.app",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;

  try {
    const input = await req.json().catch(() => ({} as Record<string, unknown>));
    const { title, body, tag, data, icon } = input;

    if (!title || !body) {
      return json({ error: "title e body são obrigatórios" }, 400);
    }

    // Sem isto, qualquer um mandava notificação push para o celular
    // de qualquer usuário do sistema.
    const identity = resolveUserId(auth.ctx, input.user_id);
    if (identity.error) return identity.error;
    const user_id = identity.userId;

    const supabase = auth.ctx.supabase;

    const { data: subs, error } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", user_id);

    if (error) throw error;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ sent: 0, message: "No subscriptions" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = JSON.stringify({
      title, body, tag: tag ?? "prospecte", data: data ?? {}, icon: icon ?? "/logo.png",
    });

    let sent = 0, removed = 0;
    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        );
        sent++;
      } catch (e: any) {
        // 404/410 = subscription expired, remove it
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from("push_subscriptions").delete().eq("id", sub.id);
          removed++;
        } else {
          console.error("Push failed:", e?.message ?? e);
        }
      }
    }

    return new Response(JSON.stringify({ sent, removed, total: subs.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

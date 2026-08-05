import { corsHeaders, handleCors, requireInternal } from "../_shared/auth.ts";

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireInternal(req);
  if (auth.error) return auth.error;

  try {
    const supabase = auth.ctx.supabase;

    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    // 1. Find subscriptions expiring in ~3 days (notify once)
    const { data: expiring } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("status", "active")
      .not("expires_at", "is", null)
      .lte("expires_at", threeDaysFromNow.toISOString())
      .gt("expires_at", now.toISOString());

    let expiringNotified = 0;

    if (expiring && expiring.length > 0) {
      for (const sub of expiring) {
        const expiresAt = new Date(sub.expires_at);
        const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        
        // Check if we already sent an expiring notification for this subscription
        const { data: existing } = await supabase
          .from("activity_log")
          .select("id")
          .eq("user_id", sub.user_id)
          .eq("activity_type", "subscription_expiring_notice")
          .gte("created_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
          .limit(1);

        if (existing && existing.length > 0) continue;

        // Get user profile
        const { data: profileData } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", sub.user_id)
          .limit(1);
        
        const profile = profileData?.[0];
        const email = profile?.email;
        if (!email) continue;

        try {
          await supabase.functions.invoke("subscription-emails", {
            body: {
              type: "expiring",
              email,
              userName: profile?.full_name || "",
              planName: sub.plan,
              daysLeft,
            },
          });

          await supabase.from("activity_log").insert({
            user_id: sub.user_id,
            activity_type: "subscription_expiring_notice",
            description: `Aviso: plano ${sub.plan.toUpperCase()} expira em ${daysLeft} dias`,
            metadata: { plan: sub.plan, days_left: daysLeft, expires_at: sub.expires_at },
          });

          expiringNotified++;
        } catch (e) {
          console.error(`Failed to notify ${email}:`, e);
        }
      }
    }

    // 2. Auto-expire subscriptions past their expires_at
    const { data: expired } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("status", "active")
      .not("expires_at", "is", null)
      .lt("expires_at", now.toISOString());

    let expiredCount = 0;

    if (expired && expired.length > 0) {
      for (const sub of expired) {
        await supabase
          .from("subscriptions")
          .update({
            status: "canceled",
            canceled_at: now.toISOString(),
            metadata: {
              last_event: "auto_expired",
              expired_at: now.toISOString(),
            },
          })
          .eq("id", sub.id);

        // Get user profile
        const { data: profData } = await supabase
          .from("profiles")
          .select("email, full_name")
          .eq("user_id", sub.user_id)
          .limit(1);
        
        const profile = profData?.[0];
        const email = profile?.email;

        if (email) {
          try {
            await supabase.functions.invoke("subscription-emails", {
              body: {
                type: "expired",
                email,
                userName: profile?.full_name || "",
                planName: sub.plan,
              },
            });
          } catch (e) {
            console.error(`Failed to send expired email to ${email}:`, e);
          }
        }

        await supabase.from("activity_log").insert({
          user_id: sub.user_id,
          activity_type: "subscription_auto_expired",
          description: `Plano ${sub.plan.toUpperCase()} expirou automaticamente`,
          metadata: { plan: sub.plan, expired_at: now.toISOString() },
        });

        expiredCount++;
      }
    }

    // 3. Recover stale jobs
    const { data: recoveredCount } = await supabase.rpc("recover_stale_jobs");

    const result = {
      success: true,
      timestamp: now.toISOString(),
      expiring_notified: expiringNotified,
      auto_expired: expiredCount,
      stale_jobs_recovered: recoveredCount || 0,
    };

    console.log("Subscription check completed:", JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Subscription check error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
import { corsHeaders, handleCors, requireInternal } from "../_shared/auth.ts";

// Motor de manutenção. Roda a cada 5 minutos pelo pg_cron, que se identifica
// com o segredo interno guardado em private.app_config.
Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireInternal(req);
  if (auth.error) return auth.error;
  const supabase = auth.ctx.supabase;

  try {
    const body = await req.json().catch(() => ({}));
    const { task } = body;

    const results: Record<string, any> = {};

    // Task 1: Recover stale background jobs
    if (!task || task === "recover_jobs") {
      const { data: recovered } = await supabase.rpc("recover_stale_jobs");
      results.recovered_jobs = recovered || 0;
      console.log(`Recovered ${recovered || 0} stale jobs`);

      // Start any pending jobs
      const { data: pendingJobs } = await supabase
        .from("background_jobs")
        .select("id")
        .eq("status", "pending")
        .order("priority", { ascending: false })
        .order("created_at", { ascending: true })
        .limit(5);

      if (pendingJobs && pendingJobs.length > 0) {
        // Trigger job processor for each pending job
        for (const job of pendingJobs) {
          await supabase.functions.invoke("job-processor", {
            body: { action: "resume", job_id: job.id },
          });
        }
        results.started_jobs = pendingJobs.length;
      }
    }

    // Task 2: Recalculate lead scores for active leads
    if (!task || task === "score_leads") {
      const { data: leads } = await supabase
        .from("leads")
        .select("id")
        .or("last_scored_at.is.null,last_scored_at.lt." + new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .limit(100);

      let scored = 0;
      for (const lead of leads || []) {
        await supabase.rpc("calculate_lead_score", { p_lead_id: lead.id });
        scored++;
      }
      results.scored_leads = scored;
      console.log(`Scored ${scored} leads`);
    }

    // Task 3: Check for follow-ups due
    if (!task || task === "check_followups") {
      const now = new Date().toISOString();
      
      const { data: dueFollowups } = await supabase
        .from("leads")
        .select("id, user_id, business_name, phone")
        .lte("next_follow_up_at", now)
        .not("next_follow_up_at", "is", null)
        .limit(50);

      results.due_followups = dueFollowups?.length || 0;
      
      // Store notifications for users
      for (const lead of dueFollowups || []) {
        await supabase.from("activity_log").insert({
          user_id: lead.user_id,
          activity_type: "followup_due",
          description: `Follow-up pendente: ${lead.business_name}`,
          lead_id: lead.id,
          metadata: { phone: lead.phone },
        });
      }
    }

    // Task 4: Cleanup old completed jobs (older than 30 days)
    if (!task || task === "cleanup") {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      
      const { count } = await supabase
        .from("background_jobs")
        .delete()
        .in("status", ["completed", "failed", "cancelled"])
        .lt("completed_at", thirtyDaysAgo);
      
      results.cleaned_jobs = count || 0;
    }

    // Task 6: Auto first message (runs every 30min via cron)
    if (!task || task === "auto_first_message") {
      try {
        await supabase.functions.invoke("auto-first-message", { body: {} });
        results.auto_first_message = "triggered";
      } catch (e) {
        console.error("Auto first message error:", e);
      }
    }

    // Task 7: Cold reactivation (1x per day, 10h-11h BRT = 13h-14h UTC)
    if (!task || task === "cold_reactivation") {
      const hour = new Date().getUTCHours();
      if (hour >= 13 && hour < 14) {
        try {
          await supabase.functions.invoke("cold-reactivation", { body: {} });
          results.cold_reactivation = "triggered";
        } catch (e) {
          console.error("Cold reactivation error:", e);
        }
      }
    }

    // Task 8: Auto-complete A/B tests with statistical significance
    if (!task || task === "check_ab_tests") {
      const { data: runningTests } = await supabase
        .from("ab_tests")
        .select("*")
        .eq("status", "running");

      let completed = 0;
      for (const test of runningTests || []) {
        const totalSent = test.variant_a_sent + test.variant_b_sent;
        if (totalSent < test.min_sample_size * 2) continue;

        const rateA = test.variant_a_sent > 0 ? test.variant_a_responses / test.variant_a_sent : 0;
        const rateB = test.variant_b_sent > 0 ? test.variant_b_responses / test.variant_b_sent : 0;
        const pooledRate = (test.variant_a_responses + test.variant_b_responses) / totalSent;
        if (pooledRate === 0 || pooledRate === 1) continue;

        const se = Math.sqrt(pooledRate * (1 - pooledRate) * (1 / test.variant_a_sent + 1 / test.variant_b_sent));
        if (se === 0) continue;
        const z = Math.abs(rateA - rateB) / se;

        if (z >= 1.96) {
          const winner = rateA > rateB ? "variant_a" : "variant_b";
          const confidence = z >= 2.576 ? 99 : z >= 1.96 ? 95 : 90;
          await supabase.from("ab_tests").update({
            status: "completed",
            winner,
            confidence,
            completed_at: new Date().toISOString(),
          }).eq("id", test.id);
          completed++;
        }
      }
      results.ab_tests_completed = completed;
    }

    // Task 9: SDR Agent - auto-reply to pending conversations
    if (!task || task === "sdr_agent") {
      const { data: sdrUsers } = await supabase
        .from("user_settings")
        .select("user_id, auto_start_hour, auto_end_hour")
        .eq("sdr_agent_enabled", true);

      const currentHour = new Date().getUTCHours();
      let sdrProcessed = 0;

      for (const u of sdrUsers || []) {
        const startH = (u.auto_start_hour ?? 9) + 3; // BRT to UTC
        const endH = (u.auto_end_hour ?? 18) + 3;
        if (currentHour < startH || currentHour >= endH) continue;

        // Find leads with unanswered messages from leads
        const { data: unanswered } = await supabase
          .from("leads")
          .select("id, phone, business_name")
          .eq("user_id", u.user_id)
          .not("last_response_at", "is", null)
          .gt("last_response_at", "last_contact_at")
          .limit(5);

        for (const lead of unanswered || []) {
          try {
            await supabase.functions.invoke("whatsapp-ai-reply", {
              body: { user_id: u.user_id, lead_id: lead.id },
            });
            sdrProcessed++;
          } catch (e) {
            console.error(`SDR error for lead ${lead.id}:`, e);
          }
        }
      }
      results.sdr_processed = sdrProcessed;
    }

    // Task 9b: Process scheduled intelligent follow-ups (SDR cadence)
    if (!task || task === "process_scheduled_followups") {
      const nowIso = new Date().toISOString();
      const { data: dueFollowups } = await supabase
        .from("intelligent_followups")
        .select("id, lead_id, user_id, trigger_reason, message_template")
        .eq("status", "pending")
        .lte("scheduled_at", nowIso)
        .limit(30);

      let sent = 0;
      let skipped = 0;
      for (const fup of dueFollowups || []) {
        try {
          // Respect user's working hours
          const { data: uSettings } = await supabase
            .from("user_settings")
            .select("sdr_agent_enabled, auto_start_hour, auto_end_hour")
            .eq("user_id", fup.user_id)
            .single();
          if (!uSettings?.sdr_agent_enabled) { skipped++; continue; }
          const hUtc = new Date().getUTCHours();
          const startH = (uSettings.auto_start_hour ?? 9) + 3;
          const endH = (uSettings.auto_end_hour ?? 18) + 3;
          if (hUtc < startH || hUtc >= endH) { skipped++; continue; }

          // Skip if lead already replied since follow-up was scheduled
          const { data: leadRow } = await supabase
            .from("leads")
            .select("last_response_at, last_contact_at, phone")
            .eq("id", fup.lead_id)
            .single();
          if (!leadRow?.phone) { skipped++; continue; }

          // Trigger AI reply to compose + send the follow-up
          const { error: aiErr } = await supabase.functions.invoke("whatsapp-ai-reply", {
            body: {
              lead_id: fup.lead_id,
              message_content: fup.message_template || `[SDR follow-up: ${fup.trigger_reason}]`,
              auto_reply_enabled: true,
              is_scheduled_followup: true,
            },
          });

          await supabase
            .from("intelligent_followups")
            .update({
              status: aiErr ? "failed" : "sent",
              sent_at: nowIso,
              result: aiErr ? aiErr.message : "dispatched via ai-reply",
            })
            .eq("id", fup.id);

          if (!aiErr) sent++;
        } catch (e) {
          console.error(`Follow-up ${fup.id} error:`, e);
          skipped++;
        }
      }
      results.scheduled_followups = { sent, skipped, due: (dueFollowups || []).length };
    }




    // Task 5: Send daily reports
    if (!task || task === "send_reports") {
      const now = new Date();
      const hour = now.getUTCHours();
      if (hour >= 11 && hour < 12) {
        const { data: usersWithReport } = await supabase
          .from("user_settings")
          .select("user_id")
          .eq("daily_report_enabled", true);
        for (const userSetting of usersWithReport || []) {
          await supabase.functions.invoke("send-report", {
            body: { user_id: userSetting.user_id },
          });
        }
        results.reports_sent = usersWithReport?.length || 0;
      }
    }

    // Task 6: Limpar janelas de rate limit já vencidas
    if (!task || task === "cleanup") {
      const { data: pruned } = await supabase.rpc("prune_rate_limits");
      results.rate_limits_pruned = pruned || 0;

      // Memória do lead só crescia; sem expurgo o prompt do agente vai
      // ficando maior e mais caro a cada conversa.
      const { data: memoryPruned } = await supabase.rpc("prune_lead_memory");
      results.lead_memory_pruned = memoryPruned || 0;

      // Conversa que travou em "processando" nunca mais recebe resposta.
      const stale = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from("pending_replies")
        .delete({ count: "exact" })
        .lt("last_seen_at", stale);
      results.stale_pending_replies = count || 0;
    }

    console.log("Cron tasks completed:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Cron error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

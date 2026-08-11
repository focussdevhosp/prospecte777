import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  handleCors as sharedHandleCors,
  json,
  requirePaidPlan,
  requireUserOrInternal,
  resolveUserId,
} from "../_shared/auth.ts";

interface BackgroundJob {
  id: string;
  user_id: string;
  job_type: string;
  status: string;
  payload: any;
  total_items: number;
  processed_items: number;
  failed_items: number;
  current_index: number;
  retry_count: number;
  max_retries: number;
}

// ------------------------------------------------------------
// POR QUE NÃO EXISTE MAIS MENSAGEM DE RESERVA
// ------------------------------------------------------------
// Aqui havia um `buildFallbackMessage` que entrava quando a IA falhava. Ele
// afirmava, em texto fixo, coisas que nunca aconteceram:
//
//   "Tenho uma estratégia que já subiu de 3.6 pra 4.7 em 30 dias"
//   "Tenho um sistema que triplica reviews em 60 dias sem esforço"
//   "Posso te mandar 2 exemplos que fiz pra [nicho]?"
//
// Nenhum desses resultados existia, nenhum desses exemplos existia. Como era
// fallback, saía justamente quando ninguém estava olhando — e ia para o
// WhatsApp de uma empresa real, em nome do usuário.
//
// A regra passou a ser: se a IA não conseguiu escrever, o lead fica para a
// próxima rodada. Um lead não abordado hoje continua sendo um lead amanhã.
// Um lead que recebeu uma promessa falsa está perdido, e possivelmente
// levou o número junto.

async function logToDb(
  supabase: any,
  jobId: string,
  userId: string,
  level: 'info' | 'error' | 'warning' | 'success',
  message: string,
  metadata?: Record<string, any>
) {
  try {
    await supabase.from("job_logs").insert({
      job_id: jobId,
      user_id: userId,
      level,
      message,
      metadata,
    });
  } catch (err) {
    console.error("Failed to log to DB:", err);
  }
}

// Process a single job item
async function processJobItem(
  supabase: any,
  job: BackgroundJob,
  index: number,
  userSettings: any
): Promise<{ success: boolean; error?: string; skipped?: boolean }> {
  const { job_type, payload } = job;

  try {
    switch (job_type) {
      case "mass_send": {
        const leads = payload.leads || [];
        const lead = leads[index];
        if (!lead) return { success: true, skipped: true };

        // Check if lead has valid phone
        if (!lead.phone) {
          console.log(`[Job ${job.id}] Lead ${index} has no phone, skipping`);
          return { success: true, skipped: true };
        }

        let message = "";

        // Check if using direct AI mode (no template)
        if (payload.direct_ai_mode || !payload.message_template) {
          const isRemarketing = payload.is_remarketing || false;
          console.log(`[Job ${job.id}] Generating ${isRemarketing ? 'remarketing' : 'AI'} message for lead ${index}: ${lead.business_name}`);
          await logToDb(supabase, job.id, job.user_id, 'info', `Gerando mensagem ${isRemarketing ? 'de remarketing' : 'IA'} para ${lead.business_name}...`);
          
          try {
            // A camada de IA já faz retry e troca de provedor por dentro.
            // A repetição que sobra aqui é para o 429 do próprio gateway
            // das edge functions, que é outro limite.
            let aiResponse: Response | null = null;
            let lastErrorText = "";
            const maxAttempts = 3;

            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
              aiResponse = await fetch(
                `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-prospecting`,
                {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                  },
                  body: JSON.stringify({
                    action: "generate_message",
                    user_id: job.user_id,
                    data: {
                      // O id vai junto: com ele a esteira lê a auditoria do
                      // site, a memória e o histórico direto do banco em vez
                      // de trabalhar com os seis campos que cabiam aqui.
                      lead: {
                        id: lead.id,
                        business_name: lead.business_name,
                        phone: lead.phone,
                        niche: lead.niche,
                        location: lead.location,
                        rating: lead.rating,
                        reviews_count: lead.reviews_count,
                        website: lead.website,
                      },
                      template: null,
                      agentSettings: payload.agent_settings || {},
                      isRemarketing,
                      goal: payload.goal || "agendar_demonstracao",
                    },
                  }),
                }
              );

              if (aiResponse.ok) break;

              lastErrorText = await aiResponse.text();

              // 422 = o Quality Gate reprovou. Repetir não adianta: a decisão
              // foi sobre o conteúdo, não sobre disponibilidade.
              if (aiResponse.status === 422) break;

              const isRateLimit = aiResponse.status === 429 || /rate limit/i.test(lastErrorText);
              if (!isRateLimit || attempt === maxAttempts) break;

              const retryMatch = lastErrorText.match(/Retry after (\d+)ms/i);
              const waitMs = retryMatch
                ? Math.min(parseInt(retryMatch[1]) + 500, 30000)
                : Math.min(2000 * Math.pow(2, attempt - 1), 30000);
              await logToDb(supabase, job.id, job.user_id, 'info', `Rate limit IA — aguardando ${Math.round(waitMs / 1000)}s (tentativa ${attempt}/${maxAttempts})`);
              await new Promise((r) => setTimeout(r, waitMs));
            }

            // Sem mensagem aprovada, o lead é PULADO. Não existe texto de
            // reserva: o que existia aqui afirmava resultados inventados.
            if (!aiResponse || !aiResponse.ok) {
              const blockedByGate = aiResponse?.status === 422;
              const reason = blockedByGate
                ? "a mensagem não passou na revisão de qualidade"
                : "a IA está indisponível";

              await logToDb(
                supabase, job.id, job.user_id, 'warning',
                `${lead.business_name} pulado: ${reason}. Nada foi enviado.`,
                { lead_id: lead.id, status: aiResponse?.status ?? null, detail: lastErrorText.slice(0, 300) },
              );
              return { success: true, skipped: true };
            }

            const aiData = await aiResponse.json();
            message = (aiData.message || "").trim();

            if (!message) {
              await logToDb(
                supabase, job.id, job.user_id, 'warning',
                `${lead.business_name} pulado: a IA devolveu mensagem vazia.`,
                { lead_id: lead.id },
              );
              return { success: true, skipped: true };
            }
          } catch (aiError: any) {
            console.error(`[Job ${job.id}] erro de IA no lead ${index}:`, aiError);
            await logToDb(
              supabase, job.id, job.user_id, 'warning',
              `${lead.business_name} pulado por erro de IA (${aiError.message}). Nada foi enviado.`,
              { lead_id: lead.id },
            );
            return { success: true, skipped: true };
          }

        } else if (payload.use_ai_personalization) {
          // Use AI to personalize template
          console.log(`[Job ${job.id}] Personalizing template for lead ${index}: ${lead.business_name}`);
          
          try {
            const aiResponse = await fetch(
              `${Deno.env.get("SUPABASE_URL")}/functions/v1/ai-prospecting`,
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({
                  action: "generate_message",
                  user_id: job.user_id, // Pass user_id for internal auth
                  data: {
                    lead: {
                      business_name: lead.business_name,
                      niche: lead.niche,
                      location: lead.location,
                      rating: lead.rating,
                      reviews_count: lead.reviews_count,
                      website: lead.website, // Include website info
                    },
                    template: payload.message_template,
                    agentSettings: payload.agent_settings || {},
                  },
                }),
              }
            );

            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              message = aiData.message || payload.message_template;
            } else {
              // Fallback to simple replacement
              console.log(`[Job ${job.id}] AI personalization failed, using fallback`);
              message = payload.message_template
                .replace(/{nome}/gi, lead.business_name || "")
                .replace(/{empresa}/gi, lead.business_name || "")
                .replace(/{nicho}/gi, lead.niche || "seu segmento")
                .replace(/{cidade}/gi, lead.location || "sua região")
                .replace(/{telefone}/gi, lead.phone || "");
            }
          } catch (aiError) {
            // Fallback to simple replacement
            message = payload.message_template
              .replace(/{nome}/gi, lead.business_name || "")
              .replace(/{empresa}/gi, lead.business_name || "")
              .replace(/{nicho}/gi, lead.niche || "seu segmento")
              .replace(/{cidade}/gi, lead.location || "sua região")
              .replace(/{telefone}/gi, lead.phone || "");
          }
        } else {
          // Simple variable replacement
          message = payload.message_template
            .replace(/{nome}/gi, lead.business_name || "")
            .replace(/{empresa}/gi, lead.business_name || "")
            .replace(/{nicho}/gi, lead.niche || "seu segmento")
            .replace(/{cidade}/gi, lead.location || "sua região")
            .replace(/{telefone}/gi, lead.phone || "");
        }

        // Send WhatsApp message
        console.log(`[Job ${job.id}] Sending message to ${lead.business_name} (${lead.phone})`);
        await logToDb(supabase, job.id, job.user_id, 'info', `Enviando para ${lead.business_name} (${lead.phone})...`);
        
        const response = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              phone: lead.phone,
              message,
              instance_id: userSettings.whatsapp_instance_id,
            }),
          }
        );

        if (!response.ok) {
          const error = await response.text();
          console.error(`[Job ${job.id}] WhatsApp send failed for lead ${index}:`, error);
          await logToDb(supabase, job.id, job.user_id, 'error', `Falha ao enviar para ${lead.business_name}: ${error}`);
          // Continue to next lead instead of stopping
          return { success: false, error: `WhatsApp: ${error}` };
        }

        // Log success
        await logToDb(supabase, job.id, job.user_id, 'success', `Mensagem enviada para ${lead.business_name}`);

        // Save message to database
        if (lead.id) {
          await supabase.from("chat_messages").insert({
            lead_id: lead.id,
            content: message,
            sender_type: "user",
            status: "sent",
          });

          // Update lead's last_contact_at, stage, and mark as message_sent
          await supabase
            .from("leads")
            .update({ 
              last_contact_at: new Date().toISOString(),
              stage: 'Contato',
              temperature: 'morno',
              message_sent: true,
            })
            .eq("id", lead.id);
        }

        // Record prospecting stats for analytics
        const now = new Date();
        try {
          await supabase.from("prospecting_stats").insert({
            user_id: job.user_id,
            niche: lead.niche || 'Geral',
            location: lead.location || null,
            hour_of_day: now.getHours(),
            day_of_week: now.getDay(),
            messages_sent: 1,
            responses_received: 0,
            positive_responses: 0,
            date: now.toISOString().split('T')[0],
          });
        } catch (err) {
          console.error('[Job] Error recording stats:', err);
        }

        // Random delay between messages (anti-block)
        // Check job status during delay to allow pause/cancel to work
        const minInterval = userSettings.message_interval_seconds || 30;
        const maxInterval = userSettings.message_interval_max || (minInterval + 60);
        const delay = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval;
        console.log(`[Job ${job.id}] Waiting ${delay}s before next message`);
        await logToDb(supabase, job.id, job.user_id, 'info', `Aguardando ${delay}s antes do próximo envio...`);
        
        // Break delay into smaller chunks to check for pause/cancel
        const chunkSize = 5; // Check every 5 seconds
        for (let waited = 0; waited < delay; waited += chunkSize) {
          await new Promise((resolve) => setTimeout(resolve, chunkSize * 1000));
          
          // Check if job was cancelled or paused during delay
          const { data: checkJob } = await supabase
            .from("background_jobs")
            .select("status")
            .eq("id", job.id)
            .single();
          
          if (checkJob?.status === "cancelled" || checkJob?.status === "paused") {
            console.log(`[Job ${job.id}] ${checkJob.status} during delay, stopping`);
            return { success: true, stopped: true };
          }
        }

        return { success: true };
      }

      case "follow_up": {
        const leads = payload.leads || [];
        const lead = leads[index];
        if (!lead) return { success: true, skipped: true };

        if (!lead.phone) {
          return { success: true, skipped: true };
        }

        const message = payload.message_template
          .replace(/{nome}/gi, lead.business_name || "")
          .replace(/{empresa}/gi, lead.business_name || "")
          .replace(/{nicho}/gi, lead.niche || "seu segmento")
          .replace(/{cidade}/gi, lead.location || "sua região");

        const response = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              phone: lead.phone,
              message,
              instance_id: userSettings.whatsapp_instance_id,
            }),
          }
        );

        if (!response.ok) {
          // Continue to next lead
          return { success: false, error: await response.text() };
        }

        // Update follow-up count and mark as sent
        if (lead.id) {
          await supabase
            .from("leads")
            .update({
              follow_up_count: (lead.follow_up_count || 0) + 1,
              last_contact_at: new Date().toISOString(),
              message_sent: true,
            })
            .eq("id", lead.id);
        }

        // Anti-block delay with status check
        const delay = Math.floor(Math.random() * 30) + 30;
        const chunkSize = 5;
        for (let waited = 0; waited < delay; waited += chunkSize) {
          await new Promise((resolve) => setTimeout(resolve, chunkSize * 1000));
          
          const { data: checkJob } = await supabase
            .from("background_jobs")
            .select("status")
            .eq("id", job.id)
            .single();
          
          if (checkJob?.status === "cancelled" || checkJob?.status === "paused") {
            return { success: true, stopped: true };
          }
        }

        return { success: true };
      }

      case "prospecting": {
        // Prospecting is handled by ai-prospecting function
        // This just tracks progress
        return { success: true };
      }

      default:
        return { success: true };
    }
  } catch (error: any) {
    console.error(`[Job ${job.id}] Error processing item ${index}:`, error);
    // Return failure but allow job to continue with next item
    return { success: false, error: error.message };
  }
}

// Main job processing function
async function processJob(supabase: any, job: BackgroundJob) {
  console.log(`Processing job ${job.id} (${job.job_type}) from index ${job.current_index}`);
  
  await logToDb(supabase, job.id, job.user_id, 'info', `Iniciando processamento do job (${job.total_items} leads)`);

  // Get user settings
  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("*")
    .eq("user_id", job.user_id)
    .single();

  if (!userSettings?.whatsapp_connected) {
    await logToDb(supabase, job.id, job.user_id, 'error', 'WhatsApp não conectado. Conecte seu WhatsApp nas configurações.');
    await supabase
      .from("background_jobs")
      .update({
        status: "failed",
        error_message: "WhatsApp não conectado",
        completed_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return;
  }

  // Mark job as running
  await supabase
    .from("background_jobs")
    .update({
      status: "running",
      started_at: job.started_at || new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq("id", job.id);

  const totalItems = job.total_items;
  let processedItems = job.processed_items;
  let failedItems = job.failed_items;
  let currentIndex = job.current_index;

  // Get payload with leads
  const payload = job.payload as any;
  const leads = payload.leads || [];

  // Process items from current index
  for (let i = currentIndex; i < totalItems; i++) {
    // Mark current lead as "sending" and update job
    if (leads[i]) {
      leads[i].status = 'sending';
    }

    // Update heartbeat and current lead status every iteration
    await supabase
      .from("background_jobs")
      .update({
        current_index: i,
        processed_items: processedItems,
        failed_items: failedItems,
        last_heartbeat_at: new Date().toISOString(),
        payload: { ...payload, leads },
      })
      .eq("id", job.id);

    // Check if job was cancelled or paused
    const { data: currentJob } = await supabase
      .from("background_jobs")
      .select("status, current_index")
      .eq("id", job.id)
      .single();

    if (currentJob?.status === "cancelled" || currentJob?.status === "paused") {
      console.log(`Job ${job.id} was ${currentJob.status}`);
      return;
    }

    // Check if skip was requested (current_index was advanced externally)
    if (currentJob?.current_index > i) {
      console.log(`Job ${job.id} skip detected, advancing to index ${currentJob.current_index}`);
      i = currentJob.current_index - 1; // Will be incremented by loop
      processedItems++;
      continue;
    }

    // Process item
    const result = await processJobItem(supabase, job, i, userSettings);

    // Update lead status based on result
    if (leads[i]) {
      leads[i].status = result.success ? 'sent' : (result.skipped ? 'skipped' : 'failed');
      if (!result.success && result.error) {
        leads[i].error_message = result.error;
      }
    }

    if (result.success) {
      processedItems++;
      // Check if job was stopped during delay
      if ((result as any).stopped) {
        console.log(`[Job ${job.id}] Stopped during delay, exiting loop`);
        break;
      }
    } else if (!result.skipped) {
      failedItems++;
      console.error(`Item ${i} failed:`, result.error);
    } else {
      processedItems++; // Skipped items count as processed
    }

    // Update payload with lead status
    await supabase
      .from("background_jobs")
      .update({
        payload: { ...payload, leads },
      })
      .eq("id", job.id);
  }

  // Mark job as completed
  const sentCount = leads.filter((l: any) => l.status === 'sent').length;
  const skippedCount = leads.filter((l: any) => l.status === 'skipped').length;
  
  await logToDb(supabase, job.id, job.user_id, 'success', 
    `Job concluído! ${sentCount} enviados, ${failedItems} falhas, ${skippedCount} pulados.`
  );
  
  await supabase
    .from("background_jobs")
    .update({
      status: "completed",
      processed_items: processedItems,
      failed_items: failedItems,
      current_index: totalItems,
      completed_at: new Date().toISOString(),
      payload: { ...payload, leads }, // Save final lead statuses
      result: {
        total: totalItems,
        processed: processedItems,
        failed: failedItems,
        sent: sentCount,
        skipped: skippedCount,
      },
    })
    .eq("id", job.id);

  console.log(`Job ${job.id} completed: ${processedItems}/${totalItems} processed, ${failedItems} failed`);
}

Deno.serve(async (req) => {
  const preflight = sharedHandleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const paywall = await requirePaidPlan(auth.ctx);
  if (paywall) return paywall;

  try {
    const supabase = auth.ctx.supabase;

    const body = await req.json().catch(() => ({}));
    const { action, job_id } = body;

    const identity = resolveUserId(auth.ctx, body.user_id);
    if (identity.error) return identity.error;
    const user_id = identity.userId;

    // Toda ação por job_id (pause/resume/cancel/skip/start/status) rodava sem
    // conferir dono: bastava conhecer o UUID para mexer no processamento de
    // outra conta. Um guard só, na entrada, cobre todos os casos.
    if (job_id && auth.ctx.kind === "user") {
      const { data: owned } = await supabase
        .from("background_jobs")
        .select("id")
        .eq("id", job_id)
        .eq("user_id", user_id)
        .maybeSingle();
      if (!owned) return json({ error: "Job não encontrado." }, 404);
    }

    switch (action) {
      case "create": {
        // Create a new job
        const { job_type, payload, total_items, priority = 5 } = body;

        if (!user_id || !job_type || !payload) {
          return new Response(
            JSON.stringify({ error: "Missing required fields" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: job, error } = await supabase
          .from("background_jobs")
          .insert({
            user_id,
            job_type,
            payload,
            total_items: total_items || 0,
            priority,
            status: "pending",
          })
          .select()
          .single();

        if (error) throw error;

        // Start processing in background
        EdgeRuntime.waitUntil(
          (async () => {
            await new Promise((r) => setTimeout(r, 1000)); // Small delay
            await processJob(supabase, job);
          })()
        );

        return new Response(
          JSON.stringify({ success: true, job }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "pause": {
        if (!job_id) {
          return new Response(
            JSON.stringify({ error: "job_id required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabase
          .from("background_jobs")
          .update({ status: "paused" })
          .eq("id", job_id);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "resume": {
        if (!job_id) {
          return new Response(
            JSON.stringify({ error: "job_id required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: job } = await supabase
          .from("background_jobs")
          .select("*")
          .eq("id", job_id)
          .single();

        if (!job) {
          return new Response(
            JSON.stringify({ error: "Job not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Resume in background
        EdgeRuntime.waitUntil(processJob(supabase, job));

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "cancel": {
        if (!job_id) {
          return new Response(
            JSON.stringify({ error: "job_id required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabase
          .from("background_jobs")
          .update({ status: "cancelled", completed_at: new Date().toISOString() })
          .eq("id", job_id);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "skip": {
        // Skip to next lead immediately
        if (!job_id) {
          return new Response(
            JSON.stringify({ error: "job_id required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Get current job
        const { data: job } = await supabase
          .from("background_jobs")
          .select("*")
          .eq("id", job_id)
          .single();

        if (!job) {
          return new Response(
            JSON.stringify({ error: "Job not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Update payload to mark current lead as skipped and advance index
        const payload = job.payload as any;
        const leads = payload.leads || [];
        const currentIndex = job.current_index || 0;

        if (currentIndex < leads.length) {
          leads[currentIndex].status = 'skipped';
        }

        await supabase
          .from("background_jobs")
          .update({
            current_index: currentIndex + 1,
            processed_items: (job.processed_items || 0) + 1,
            payload: { ...payload, leads },
          })
          .eq("id", job_id);

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "start": {
        // Start a job that was just created
        if (!job_id) {
          return new Response(
            JSON.stringify({ error: "job_id required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: job } = await supabase
          .from("background_jobs")
          .select("*")
          .eq("id", job_id)
          .single();

        if (!job) {
          return new Response(
            JSON.stringify({ error: "Job not found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Start processing in background
        EdgeRuntime.waitUntil(processJob(supabase, job));

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "recover": {
        // Recover stale jobs - called by cron
        const { data: recoveredCount } = await supabase.rpc("recover_stale_jobs");

        // Find pending jobs and start them
        const { data: pendingJobs } = await supabase
          .from("background_jobs")
          .select("*")
          .eq("status", "pending")
          .order("priority", { ascending: false })
          .order("created_at", { ascending: true })
          .limit(5);

        for (const job of pendingJobs || []) {
          EdgeRuntime.waitUntil(processJob(supabase, job));
        }

        return new Response(
          JSON.stringify({
            success: true,
            recovered: recoveredCount,
            started: pendingJobs?.length || 0,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "status": {
        // Get job status
        const { data: jobs } = await supabase
          .from("background_jobs")
          .select("*")
          .eq("user_id", user_id)
          .order("created_at", { ascending: false })
          .limit(20);

        return new Response(
          JSON.stringify({ jobs }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Job processor error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// Handle shutdown gracefully
addEventListener("beforeunload", (ev) => {
  console.log("Job processor shutting down:", ev.detail?.reason);
});

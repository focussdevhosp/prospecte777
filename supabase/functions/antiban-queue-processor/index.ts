import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  handleCors as sharedHandleCors,
  json,
  requirePaidPlan,
  requireUserOrInternal,
  resolveUserId,
} from "../_shared/auth.ts";
import { loadChips, pickChip, recordChipSend } from "../_shared/chips.ts";

interface QueueItem {
  id: string;
  user_id: string;
  lead_id: string | null;
  phone: string;
  original_content: string;
  processed_content: string | null;
  status: string;
  simulate_typing: boolean;
  typing_duration_seconds: number;
  delay_seconds: number;
  batch_id: string | null;
}

interface AntiBanConfig {
  min_delay_seconds: number;
  max_delay_seconds: number;
  warmup_enabled: boolean;
  warmup_day: number;
  warmup_start_date: string | null;
  warmup_daily_limit: number;
  warmup_increment_percent: number;
  typing_enabled: boolean;
  min_typing_seconds: number;
  max_typing_seconds: number;
  rest_pause_enabled: boolean;
  messages_before_rest: number;
  rest_duration_minutes: number;
  daily_limit: number;
  hourly_limit: number;
  chip_health: string;
  messages_sent_today: number;
  messages_sent_hour: number;
  last_message_sent_at: string | null;
  last_rest_at: string | null;
}

// Calculate random delay between min and max
function getRandomDelay(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Calculate current daily limit based on warmup
function calculateDailyLimit(config: AntiBanConfig): number {
  if (!config.warmup_enabled || !config.warmup_start_date) {
    return config.daily_limit;
  }
  
  const startDate = new Date(config.warmup_start_date);
  const today = new Date();
  const daysSinceStart = Math.floor((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  
  // Progressive increase: base * (1 + increment%)^days
  const calculatedLimit = config.warmup_daily_limit * 
    Math.pow(1 + (config.warmup_increment_percent / 100), daysSinceStart);
  
  return Math.min(Math.floor(calculatedLimit), config.daily_limit);
}

// Check chip health based on recent activity
function evaluateChipHealth(
  messagesSentHour: number, 
  messagesSentDay: number,
  hourlyLimit: number,
  dailyLimit: number
): { health: string; riskFactors: string[]; recommendations: string[] } {
  const riskFactors: string[] = [];
  const recommendations: string[] = [];
  
  const hourlyUsage = messagesSentHour / hourlyLimit;
  const dailyUsage = messagesSentDay / dailyLimit;
  
  if (hourlyUsage > 0.9) {
    riskFactors.push('Limite horário quase atingido');
    recommendations.push('Aguarde o próximo hora para continuar');
  }
  
  if (dailyUsage > 0.9) {
    riskFactors.push('Limite diário quase atingido');
    recommendations.push('Pare os envios por hoje');
  }
  
  if (hourlyUsage > 0.7) {
    riskFactors.push('Alto volume por hora');
    recommendations.push('Aumente o intervalo entre mensagens');
  }
  
  if (riskFactors.length === 0) {
    return { health: 'healthy', riskFactors: [], recommendations: ['Continue operando normalmente'] };
  }
  
  if (riskFactors.length >= 2 || hourlyUsage > 0.9 || dailyUsage > 0.9) {
    return { health: 'critical', riskFactors, recommendations };
  }
  
  return { health: 'warning', riskFactors, recommendations };
}

// Send typing indicator via Evolution API
async function sendTypingIndicator(
  phone: string, 
  instanceId: string, 
  durationSeconds: number
): Promise<boolean> {
  const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
  const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

  if (!EVOLUTION_API_URL || !EVOLUTION_API_KEY) {
    console.error("Evolution API not configured for typing");
    return false;
  }

  try {
    // Format phone
    let formattedPhone = phone.replace(/\D/g, "");
    if (!formattedPhone.startsWith("55") && formattedPhone.length <= 11) {
      formattedPhone = "55" + formattedPhone;
    }

    // Send "composing" presence (typing)
    const response = await fetch(`${EVOLUTION_API_URL}/chat/updatePresence/${instanceId}`, {
      method: "POST",
      headers: {
        "apikey": EVOLUTION_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        number: formattedPhone,
        presence: "composing",
      }),
    });

    if (!response.ok) {
      console.error("Failed to send typing indicator:", await response.text());
      return false;
    }

    // Wait for the typing duration
    await new Promise(resolve => setTimeout(resolve, durationSeconds * 1000));

    // Send "paused" presence to stop typing
    await fetch(`${EVOLUTION_API_URL}/chat/updatePresence/${instanceId}`, {
      method: "POST",
      headers: {
        "apikey": EVOLUTION_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        number: formattedPhone,
        presence: "paused",
      }),
    });

    return true;
  } catch (error) {
    console.error("Typing indicator error:", error);
    return false;
  }
}

// Process a single queue item
async function processQueueItem(
  supabase: any,
  item: QueueItem,
  config: AntiBanConfig,
  instanceId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if phone is blacklisted
    const { data: blacklisted } = await supabase
      .from("whatsapp_blacklist")
      .select("id")
      .eq("user_id", item.user_id)
      .eq("phone", item.phone)
      .single();

    if (blacklisted) {
      console.log(`[AntiBan] Phone ${item.phone} is blacklisted, skipping`);
      await supabase
        .from("whatsapp_queue")
        .update({ status: "cancelled", error_message: "Número na blacklist" })
        .eq("id", item.id);
      return { success: true };
    }

    // Update status to typing
    await supabase
      .from("whatsapp_queue")
      .update({ status: "typing", typing_started_at: new Date().toISOString() })
      .eq("id", item.id);

    // Simulate typing if enabled
    if (item.simulate_typing && config.typing_enabled) {
      const typingDuration = getRandomDelay(config.min_typing_seconds, config.max_typing_seconds);
      console.log(`[AntiBan] Simulating typing for ${typingDuration}s to ${item.phone}`);
      await sendTypingIndicator(item.phone, instanceId, typingDuration);
    }

    // Process spintax if not already processed
    let messageContent = item.processed_content || item.original_content;
    if (!item.processed_content) {
      // Call database function to process spintax
      const { data: processedMsg } = await supabase.rpc("process_spintax", {
        p_user_id: item.user_id,
        p_content: item.original_content,
      });
      messageContent = processedMsg || item.original_content;
      
      // Save processed content
      await supabase
        .from("whatsapp_queue")
        .update({ processed_content: messageContent })
        .eq("id", item.id);
    }

    // Update status to sending
    await supabase
      .from("whatsapp_queue")
      .update({ status: "sending" })
      .eq("id", item.id);

    // Send the message
    const sendResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          phone: item.phone,
          message: messageContent,
          instance_id: instanceId,
        }),
      }
    );

    if (!sendResponse.ok) {
      const errorText = await sendResponse.text();
      console.error(`[AntiBan] Failed to send to ${item.phone}:`, errorText);
      
      await supabase
        .from("whatsapp_queue")
        .update({ 
          status: "failed", 
          error_message: errorText,
          retry_count: item.retry_count || 0 + 1,
        })
        .eq("id", item.id);
      
      return { success: false, error: errorText };
    }

    // Update status to sent
    await supabase
      .from("whatsapp_queue")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", item.id);

    // Update lead if exists
    if (item.lead_id) {
      await supabase
        .from("chat_messages")
        .insert({
          lead_id: item.lead_id,
          content: messageContent,
          sender_type: "user",
          status: "sent",
        });

      await supabase
        .from("leads")
        .update({ 
          last_contact_at: new Date().toISOString(),
          message_sent: true,
        })
        .eq("id", item.lead_id);
    }

    // Update antiban config counters
    await supabase
      .from("antiban_config")
      .update({
        messages_sent_today: config.messages_sent_today + 1,
        messages_sent_hour: config.messages_sent_hour + 1,
        last_message_sent_at: new Date().toISOString(),
      })
      .eq("user_id", item.user_id);

    console.log(`[AntiBan] Successfully sent to ${item.phone}`);
    return { success: true };
  } catch (error: any) {
    console.error(`[AntiBan] Error processing item:`, error);
    return { success: false, error: error.message };
  }
}

// Main queue processor
async function processQueue(supabase: any, userId: string, batchId?: string) {
  console.log(`[AntiBan] Starting queue processing for user ${userId}`);

  // Get user settings
  const { data: userSettings } = await supabase
    .from("user_settings")
    .select("whatsapp_instance_id, whatsapp_connected")
    .eq("user_id", userId)
    .single();

  if (!userSettings?.whatsapp_connected || !userSettings?.whatsapp_instance_id) {
    console.error("[AntiBan] WhatsApp not connected");
    return { error: "WhatsApp não conectado" };
  }

  // Chips disponíveis para rotação. É aqui que ela mais importa: o disparo
  // em massa é justamente o que estoura o limite de um número só. Antes a
  // configuração de rotação era ignorada e tudo saía pelo chip principal.
  const { chips, strategy, enabled: rotationEnabled } = await loadChips(supabase, userId);
  console.log(
    `[AntiBan] rotação ${rotationEnabled ? `ligada (${strategy})` : "desligada"}, ` +
    `${chips.length} chip(s) disponível(is)`,
  );

  // Get or create antiban config
  let { data: config } = await supabase
    .from("antiban_config")
    .select("*")
    .eq("user_id", userId)
    .single();

  if (!config) {
    const { data: newConfig } = await supabase
      .from("antiban_config")
      .insert({ user_id: userId })
      .select()
      .single();
    config = newConfig;
  }

  // Calculate current daily limit
  const currentDailyLimit = calculateDailyLimit(config);
  
  // Check if limits are reached
  if (config.messages_sent_today >= currentDailyLimit) {
    console.log("[AntiBan] Daily limit reached");
    return { error: "Limite diário atingido", daily_limit: currentDailyLimit };
  }

  if (config.messages_sent_hour >= config.hourly_limit) {
    console.log("[AntiBan] Hourly limit reached");
    return { error: "Limite por hora atingido" };
  }

  // Check if rest pause is needed
  if (config.rest_pause_enabled) {
    const messagesSinceRest = config.last_rest_at 
      ? config.messages_sent_hour 
      : config.messages_sent_today;
    
    if (messagesSinceRest >= config.messages_before_rest) {
      console.log(`[AntiBan] Rest pause needed after ${messagesSinceRest} messages`);
      
      await supabase
        .from("antiban_config")
        .update({ last_rest_at: new Date().toISOString() })
        .eq("user_id", userId);
      
      // Wait for rest duration
      const restMs = config.rest_duration_minutes * 60 * 1000;
      await new Promise(resolve => setTimeout(resolve, restMs));
    }
  }

  // Get pending items from queue
  let query = supabase
    .from("whatsapp_queue")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["pending", "scheduled"])
    .order("priority", { ascending: false })
    .order("created_at", { ascending: true });

  if (batchId) {
    query = query.eq("batch_id", batchId);
  }

  const { data: queueItems, error: queueError } = await query.limit(50);

  if (queueError || !queueItems?.length) {
    console.log("[AntiBan] No items in queue");
    return { processed: 0 };
  }

  console.log(`[AntiBan] Found ${queueItems.length} items to process`);

  let processed = 0;
  let failed = 0;

  for (const item of queueItems) {
    // Check limits before each send
    const { data: currentConfig } = await supabase
      .from("antiban_config")
      .select("messages_sent_today, messages_sent_hour")
      .eq("user_id", userId)
      .single();

    if (currentConfig.messages_sent_today >= currentDailyLimit) {
      console.log("[AntiBan] Daily limit reached during processing");
      break;
    }

    if (currentConfig.messages_sent_hour >= config.hourly_limit) {
      console.log("[AntiBan] Hourly limit reached during processing");
      break;
    }

    // Escolhe o chip desta mensagem. `processed` avança o round-robin sem
    // precisar guardar estado entre execuções.
    const chip = rotationEnabled
      ? pickChip(chips, strategy, processed)
      : null;
    const instanceId = chip?.instance_id ?? userSettings.whatsapp_instance_id;

    // Process item
    const result = await processQueueItem(
      supabase,
      item,
      { ...config, ...currentConfig },
      instanceId
    );

    if (result.success) {
      processed++;
      await recordChipSend(supabase, userId, instanceId, false);
      // Mantém o contador local em dia para a estratégia por saúde
      // equilibrar dentro do próprio lote, não só entre execuções.
      if (chip) chip.sent_today++;
    } else {
      failed++;
      await recordChipSend(supabase, userId, instanceId, true);
    }

    // Random delay between messages
    const delay = getRandomDelay(config.min_delay_seconds, config.max_delay_seconds);
    console.log(`[AntiBan] Waiting ${delay}s before next message`);
    await new Promise(resolve => setTimeout(resolve, delay * 1000));
  }

  // Update chip health
  const healthCheck = evaluateChipHealth(
    config.messages_sent_hour + processed,
    config.messages_sent_today + processed,
    config.hourly_limit,
    currentDailyLimit
  );

  await supabase
    .from("antiban_config")
    .update({ 
      chip_health: healthCheck.health,
      last_health_check_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  // Log health check
  await supabase.from("chip_health_logs").insert({
    user_id: userId,
    health_status: healthCheck.health,
    messages_sent_hour: config.messages_sent_hour + processed,
    messages_sent_day: config.messages_sent_today + processed,
    failed_messages_hour: failed,
    connection_status: "connected",
    risk_factors: healthCheck.riskFactors,
    recommendations: healthCheck.recommendations,
  });

  console.log(`[AntiBan] Completed: ${processed} sent, ${failed} failed`);
  return { processed, failed, health: healthCheck };
}

// Add items to queue
async function addToQueue(
  supabase: any,
  userId: string,
  items: Array<{
    phone: string;
    content: string;
    leadId?: string;
    priority?: number;
    simulateTyping?: boolean;
  }>,
  batchId?: string
) {
  const { data: config } = await supabase
    .from("antiban_config")
    .select("min_delay_seconds, max_delay_seconds, typing_enabled, min_typing_seconds, max_typing_seconds")
    .eq("user_id", userId)
    .single();

  const queueItems = items.map(item => ({
    user_id: userId,
    lead_id: item.leadId || null,
    phone: item.phone,
    original_content: item.content,
    status: "pending",
    priority: item.priority || 1,
    delay_seconds: getRandomDelay(
      config?.min_delay_seconds || 30, 
      config?.max_delay_seconds || 90
    ),
    simulate_typing: item.simulateTyping ?? config?.typing_enabled ?? true,
    typing_duration_seconds: getRandomDelay(
      config?.min_typing_seconds || 2, 
      config?.max_typing_seconds || 6
    ),
    batch_id: batchId || null,
  }));

  const { data, error } = await supabase
    .from("whatsapp_queue")
    .insert(queueItems)
    .select();

  if (error) {
    console.error("[AntiBan] Error adding to queue:", error);
    return { error: error.message };
  }

  return { added: data.length, batch_id: batchId };
}

// Get queue status
async function getQueueStatus(supabase: any, userId: string, batchId?: string) {
  let query = supabase
    .from("whatsapp_queue")
    .select("status")
    .eq("user_id", userId);

  if (batchId) {
    query = query.eq("batch_id", batchId);
  }

  const { data: items } = await query;

  if (!items) return { total: 0 };

  const statusCounts = items.reduce((acc: Record<string, number>, item: any) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  // Get antiban config
  const { data: config } = await supabase
    .from("antiban_config")
    .select("*")
    .eq("user_id", userId)
    .single();

  // Calculate current limit
  const currentDailyLimit = config ? calculateDailyLimit(config) : 200;

  return {
    total: items.length,
    ...statusCounts,
    config: config ? {
      chip_health: config.chip_health,
      messages_sent_today: config.messages_sent_today,
      messages_sent_hour: config.messages_sent_hour,
      daily_limit: currentDailyLimit,
      hourly_limit: config.hourly_limit,
      warmup_day: config.warmup_day,
    } : null,
  };
}

// Reset daily/hourly counters (called by cron)
async function resetCounters(supabase: any) {
  const now = new Date();
  const isNewHour = now.getMinutes() < 5; // First 5 minutes of the hour
  const isNewDay = now.getHours() === 0 && isNewHour;

  if (isNewDay) {
    // Reset daily counters and increment warmup day
    await supabase
      .from("antiban_config")
      .update({ 
        messages_sent_today: 0,
        messages_sent_hour: 0,
        warmup_day: supabase.sql`warmup_day + 1`,
      });
    console.log("[AntiBan] Reset daily counters");
  } else if (isNewHour) {
    // Reset hourly counter only
    await supabase
      .from("antiban_config")
      .update({ messages_sent_hour: 0 });
    console.log("[AntiBan] Reset hourly counters");
  }

  return { reset: isNewDay ? "daily" : (isNewHour ? "hourly" : "none") };
}

Deno.serve(async (req) => {
  const preflight = sharedHandleCors(req);
  if (preflight) return preflight;

  // A checagem anterior aceitava a requisição se existisse *qualquer*
  // header authorization OU um user_id no corpo — ou seja, mandar
  // {"user_id": "<uuid de alguém>"} já bastava para operar a fila alheia.
  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const paywall = await requirePaidPlan(auth.ctx);
  if (paywall) return paywall;

  try {
    const supabase = auth.ctx.supabase;

    const body = await req.json().catch(() => ({}));
    const { action, batch_id, items } = body;

    // Ações de manutenção rodam sem dono; o resto é sempre escopado.
    const isMaintenance = action === "reset_counters" || action === "cron";
    let user_id: string | null = null;

    if (!isMaintenance) {
      const identity = resolveUserId(auth.ctx, body.user_id);
      if (identity.error) return identity.error;
      user_id = identity.userId;
    } else if (auth.ctx.kind !== "internal") {
      return json({ error: "Ação de manutenção exige chamada interna." }, 403);
    }

    switch (action) {
      case "add_to_queue": {
        if (!user_id || !items?.length) {
          return new Response(
            JSON.stringify({ error: "user_id and items required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        
        const newBatchId = batch_id || crypto.randomUUID();
        const result = await addToQueue(supabase, user_id, items, newBatchId);
        
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "process_queue": {
        if (!user_id) {
          return new Response(
            JSON.stringify({ error: "user_id required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Start processing in background
        EdgeRuntime.waitUntil(processQueue(supabase, user_id, batch_id));

        return new Response(
          JSON.stringify({ started: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_status": {
        if (!user_id) {
          return new Response(
            JSON.stringify({ error: "user_id required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const status = await getQueueStatus(supabase, user_id, batch_id);
        
        return new Response(
          JSON.stringify(status),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "cancel_batch": {
        if (!user_id || !batch_id) {
          return new Response(
            JSON.stringify({ error: "user_id and batch_id required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        await supabase
          .from("whatsapp_queue")
          .update({ status: "cancelled" })
          .eq("user_id", user_id)
          .eq("batch_id", batch_id)
          .in("status", ["pending", "scheduled"]);

        return new Response(
          JSON.stringify({ cancelled: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "reset_counters":
      case "cron": {
        const result = await resetCounters(supabase);
        return new Response(
          JSON.stringify(result),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      case "get_health_history": {
        if (!user_id) {
          return new Response(
            JSON.stringify({ error: "user_id required" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const { data: logs } = await supabase
          .from("chip_health_logs")
          .select("*")
          .eq("user_id", user_id)
          .order("created_at", { ascending: false })
          .limit(50);

        return new Response(
          JSON.stringify({ logs }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
  } catch (error: any) {
    console.error("[AntiBan] Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-api-key",
  "Content-Type": "application/json",
};

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ success: false, error: message }, status);
}

// Authenticate via Bearer token (user JWT) or X-API-Key (hunter_api_token from user_settings)
async function authenticate(req: Request) {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const authHeader = req.headers.get("authorization") || "";
  const apiKey = req.headers.get("x-api-key") || "";

  // Method 1: Bearer JWT token (Supabase auth)
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.replace("Bearer ", "");
    const anonClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!
    );
    const { data: { user }, error } = await anonClient.auth.getUser(token);
    if (error || !user) return { user: null, supabase, error: "Invalid JWT token" };
    return { user, supabase, error: null };
  }

  // Method 2: X-API-Key (matches hunter_api_token in user_settings)
  if (apiKey) {
    const { data: settings, error } = await supabase
      .from("user_settings")
      .select("user_id")
      .eq("hunter_api_token", apiKey)
      .single();

    if (error || !settings) return { user: null, supabase, error: "Invalid API key" };
    return { user: { id: settings.user_id }, supabase, error: null };
  }

  return { user: null, supabase, error: "Missing authentication. Use Authorization: Bearer <jwt> or X-API-Key: <key>" };
}

// Parse route: /api/resource/id/action
function parseRoute(url: URL): { resource: string; id?: string; action?: string } {
  const parts = url.pathname.replace(/^\/api\/?/, "").split("/").filter(Boolean);
  return { resource: parts[0] || "", id: parts[1], action: parts[2] };
}

// ============ LEADS ============
async function handleLeads(req: Request, supabase: any, userId: string, route: { id?: string; action?: string }, url: URL) {
  const { id, action } = route;

  // GET /api/leads — list leads
  if (req.method === "GET" && !id) {
    const page = parseInt(url.searchParams.get("page") || "1");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "50"), 100);
    const stage = url.searchParams.get("stage");
    const temperature = url.searchParams.get("temperature");
    const niche = url.searchParams.get("niche");
    const search = url.searchParams.get("search");
    const source = url.searchParams.get("source");
    const sort = url.searchParams.get("sort") || "created_at";
    const order = url.searchParams.get("order") || "desc";
    const from = (page - 1) * limit;

    let query = supabase.from("leads").select("*", { count: "exact" }).eq("user_id", userId);
    if (stage) query = query.eq("stage", stage);
    if (temperature) query = query.eq("temperature", temperature);
    if (niche) query = query.eq("niche", niche);
    if (source) query = query.eq("source", source);
    if (search) query = query.or(`business_name.ilike.%${search}%,phone.ilike.%${search}%,email.ilike.%${search}%`);
    query = query.order(sort, { ascending: order === "asc" }).range(from, from + limit - 1);

    const { data, count, error } = await query;
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data, total: count, page, limit });
  }

  // GET /api/leads/:id — get single lead
  if (req.method === "GET" && id && !action) {
    const { data, error } = await supabase.from("leads").select("*").eq("id", id).eq("user_id", userId).single();
    if (error) return errorResponse("Lead not found", 404);
    return jsonResponse({ success: true, data });
  }

  // POST /api/leads — create lead
  if (req.method === "POST" && !id) {
    const body = await req.json();
    if (!body.business_name || !body.phone) return errorResponse("business_name and phone are required");
    const { data, error } = await supabase.from("leads").insert({
      ...body,
      user_id: userId,
      source: body.source || "api",
    }).select().single();
    if (error) return errorResponse(error.message, 500);

    // Log activity
    await supabase.from("activity_log").insert({
      user_id: userId, lead_id: data.id, activity_type: "lead_created",
      description: `Lead ${data.business_name} criado via API`,
    });

    return jsonResponse({ success: true, data }, 201);
  }

  // PUT /api/leads/:id — update lead
  if (req.method === "PUT" && id) {
    const body = await req.json();
    delete body.id; delete body.user_id; delete body.created_at;
    const { data, error } = await supabase.from("leads").update(body).eq("id", id).eq("user_id", userId).select().single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  // DELETE /api/leads/:id — delete lead
  if (req.method === "DELETE" && id) {
    const { error } = await supabase.from("leads").delete().eq("id", id).eq("user_id", userId);
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, message: "Lead deleted" });
  }

  return errorResponse("Invalid leads endpoint", 404);
}

// ============ MESSAGES ============
async function handleMessages(req: Request, supabase: any, userId: string, route: { id?: string; action?: string }, url: URL) {
  const { id, action } = route;

  // POST /api/messages/send — send WhatsApp message
  if (req.method === "POST" && id === "send") {
    const body = await req.json();
    if (!body.phone || !body.message) return errorResponse("phone and message are required");

    const { data: settings } = await supabase.from("user_settings").select("whatsapp_instance_id, whatsapp_connected").eq("user_id", userId).single();
    if (!settings?.whatsapp_connected) return errorResponse("WhatsApp not connected", 422);

    const { data, error } = await supabase.functions.invoke("whatsapp-send", {
      body: {
        phone: body.phone,
        message: body.message,
        instance_id: settings.whatsapp_instance_id,
        user_id: userId,
        // Envio por API e automacao: quem integrou escreveu um programa.
        // A parada de emergencia precisa alcancar isso tambem.
        initiated_by: "automation",
      },
    });

    if (error) return errorResponse(error.message, 500);

    // Save to chat_messages if lead_id provided
    if (body.lead_id) {
      await supabase.from("chat_messages").insert({
        lead_id: body.lead_id, content: body.message, sender_type: "api", status: "sent",
      });
    }

    return jsonResponse({ success: true, data });
  }

  // GET /api/messages/:lead_id — get messages for a lead
  if (req.method === "GET" && id) {
    const limit = parseInt(url.searchParams.get("limit") || "100");
    const { data, error } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("lead_id", id)
      .order("sent_at", { ascending: true })
      .limit(limit);
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  return errorResponse("Invalid messages endpoint", 404);
}

// ============ CAMPAIGNS ============
async function handleCampaigns(req: Request, supabase: any, userId: string, route: { id?: string; action?: string }, url: URL) {
  const { id, action } = route;

  // GET /api/campaigns — list campaigns
  if (req.method === "GET" && !id) {
    const { data, error } = await supabase.from("campaigns").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  // GET /api/campaigns/:id — get single campaign
  if (req.method === "GET" && id && !action) {
    const { data, error } = await supabase.from("campaigns").select("*").eq("id", id).eq("user_id", userId).single();
    if (error) return errorResponse("Campaign not found", 404);
    return jsonResponse({ success: true, data });
  }

  // POST /api/campaigns — create campaign
  if (req.method === "POST" && !id) {
    const body = await req.json();
    if (!body.name) return errorResponse("name is required");
    const { data, error } = await supabase.from("campaigns").insert({ ...body, user_id: userId }).select().single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data }, 201);
  }

  // PUT /api/campaigns/:id — update campaign
  if (req.method === "PUT" && id && !action) {
    const body = await req.json();
    delete body.id; delete body.user_id;
    const { data, error } = await supabase.from("campaigns").update(body).eq("id", id).eq("user_id", userId).select().single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  // POST /api/campaigns/:id/start
  if (req.method === "POST" && id && action === "start") {
    const { data, error } = await supabase.from("campaigns").update({ status: "running", started_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId).select().single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  // POST /api/campaigns/:id/pause
  if (req.method === "POST" && id && action === "pause") {
    const { data, error } = await supabase.from("campaigns").update({ status: "paused" }).eq("id", id).eq("user_id", userId).select().single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  // DELETE /api/campaigns/:id
  if (req.method === "DELETE" && id) {
    const { error } = await supabase.from("campaigns").delete().eq("id", id).eq("user_id", userId);
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, message: "Campaign deleted" });
  }

  return errorResponse("Invalid campaigns endpoint", 404);
}

// ============ MEETINGS ============
async function handleMeetings(req: Request, supabase: any, userId: string, route: { id?: string; action?: string }, url: URL) {
  const { id } = route;

  if (req.method === "GET" && !id) {
    const status = url.searchParams.get("status");
    let query = supabase.from("meetings").select("*, leads(business_name, phone)").eq("user_id", userId).order("scheduled_at", { ascending: true });
    if (status) query = query.eq("status", status);
    const { data, error } = await query;
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  if (req.method === "POST" && !id) {
    const body = await req.json();
    if (!body.lead_id || !body.title || !body.scheduled_at) return errorResponse("lead_id, title, and scheduled_at are required");
    const { data, error } = await supabase.from("meetings").insert({ ...body, user_id: userId }).select().single();
    if (error) return errorResponse(error.message, 500);

    await supabase.from("activity_log").insert({
      user_id: userId, lead_id: body.lead_id, activity_type: "meeting_scheduled",
      description: `Reunião "${body.title}" agendada via API`,
    });

    return jsonResponse({ success: true, data }, 201);
  }

  if (req.method === "PUT" && id) {
    const body = await req.json();
    delete body.id; delete body.user_id;
    const { data, error } = await supabase.from("meetings").update(body).eq("id", id).eq("user_id", userId).select().single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  if (req.method === "DELETE" && id) {
    const { error } = await supabase.from("meetings").delete().eq("id", id).eq("user_id", userId);
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, message: "Meeting deleted" });
  }

  return errorResponse("Invalid meetings endpoint", 404);
}

// ============ TEMPLATES ============
async function handleTemplates(req: Request, supabase: any, userId: string, route: { id?: string }, _url: URL) {
  const { id } = route;

  if (req.method === "GET" && !id) {
    const { data, error } = await supabase.from("message_templates").select("*").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  if (req.method === "POST" && !id) {
    const body = await req.json();
    if (!body.name || !body.content || !body.niche) return errorResponse("name, content, and niche are required");
    const { data, error } = await supabase.from("message_templates").insert({ ...body, user_id: userId }).select().single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data }, 201);
  }

  if (req.method === "PUT" && id) {
    const body = await req.json();
    delete body.id; delete body.user_id;
    const { data, error } = await supabase.from("message_templates").update(body).eq("id", id).eq("user_id", userId).select().single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  if (req.method === "DELETE" && id) {
    const { error } = await supabase.from("message_templates").delete().eq("id", id).eq("user_id", userId);
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, message: "Template deleted" });
  }

  return errorResponse("Invalid templates endpoint", 404);
}

// ============ ANALYTICS ============
async function handleAnalytics(req: Request, supabase: any, userId: string, route: { id?: string }, url: URL) {
  if (req.method !== "GET") return errorResponse("Method not allowed", 405);

  const type = route.id || "overview";

  if (type === "overview") {
    const [leads, messages, meetings, campaigns] = await Promise.all([
      supabase.from("leads").select("id, stage, temperature, created_at", { count: "exact" }).eq("user_id", userId),
      supabase.from("chat_messages").select("id, sender_type", { count: "exact" }).in("lead_id", 
        supabase.from("leads").select("id").eq("user_id", userId)
      ),
      supabase.from("meetings").select("id, status", { count: "exact" }).eq("user_id", userId),
      supabase.from("campaigns").select("id, status", { count: "exact" }).eq("user_id", userId),
    ]);

    const stageCount: Record<string, number> = {};
    const tempCount: Record<string, number> = {};
    for (const l of leads.data || []) {
      stageCount[l.stage] = (stageCount[l.stage] || 0) + 1;
      if (l.temperature) tempCount[l.temperature] = (tempCount[l.temperature] || 0) + 1;
    }

    return jsonResponse({
      success: true,
      data: {
        total_leads: leads.count || 0,
        leads_by_stage: stageCount,
        leads_by_temperature: tempCount,
        total_meetings: meetings.count || 0,
        total_campaigns: campaigns.count || 0,
      },
    });
  }

  if (type === "activity") {
    const limit = parseInt(url.searchParams.get("limit") || "50");
    const { data, error } = await supabase
      .from("activity_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  if (type === "prospecting") {
    const { data, error } = await supabase
      .from("prospecting_stats")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false })
      .limit(30);
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  return errorResponse("Invalid analytics type. Use: overview, activity, prospecting", 404);
}

// ============ AUTOMATIONS ============
async function handleAutomations(req: Request, supabase: any, userId: string, _route: { id?: string }, _url: URL) {
  if (req.method === "GET") {
    const { data, error } = await supabase.from("user_settings")
      .select("auto_prospecting_enabled, auto_first_message_enabled, auto_followup_enabled, sdr_agent_enabled, auto_pipeline_enabled, auto_reactivation_enabled, auto_lead_scoring, daily_report_enabled, weekly_report_enabled")
      .eq("user_id", userId).single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  if (req.method === "PUT") {
    const body = await req.json();
    const allowed = [
      "auto_prospecting_enabled", "auto_first_message_enabled", "auto_followup_enabled",
      "sdr_agent_enabled", "auto_pipeline_enabled", "auto_reactivation_enabled",
      "auto_lead_scoring", "daily_report_enabled", "weekly_report_enabled",
    ];
    const filtered: Record<string, any> = {};
    for (const key of allowed) {
      if (key in body) filtered[key] = body[key];
    }
    if (Object.keys(filtered).length === 0) return errorResponse("No valid automation fields provided");

    const { data, error } = await supabase.from("user_settings").update(filtered).eq("user_id", userId).select().single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  return errorResponse("Method not allowed", 405);
}

// ============ WEBHOOKS ============
async function handleWebhooks(req: Request, supabase: any, userId: string, _route: { id?: string }, _url: URL) {
  if (req.method === "GET") {
    const { data, error } = await supabase.from("user_settings")
      .select("webhook_url, webhook_events")
      .eq("user_id", userId).single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  if (req.method === "PUT") {
    const body = await req.json();
    const updates: Record<string, any> = {};
    if ("webhook_url" in body) updates.webhook_url = body.webhook_url;
    if ("webhook_events" in body) updates.webhook_events = body.webhook_events;
    if (Object.keys(updates).length === 0) return errorResponse("Provide webhook_url or webhook_events");

    const { data, error } = await supabase.from("user_settings").update(updates).eq("user_id", userId).select("webhook_url, webhook_events").single();
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  return errorResponse("Method not allowed", 405);
}

// ============ AI ============
async function handleAI(req: Request, supabase: any, userId: string, route: { id?: string }, _url: URL) {
  if (req.method !== "POST") return errorResponse("Method not allowed", 405);

  const action = route.id;

  // POST /api/ai/reply — generate AI reply for a lead
  if (action === "reply") {
    const body = await req.json();
    if (!body.lead_id || !body.message) return errorResponse("lead_id and message are required");

    const { data, error } = await supabase.functions.invoke("whatsapp-ai-reply", {
      body: { lead_id: body.lead_id, message: body.message, user_id: userId },
    });
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  // POST /api/ai/score — score a lead
  if (action === "score") {
    const body = await req.json();
    if (!body.lead_id) return errorResponse("lead_id is required");
    const { data, error } = await supabase.rpc("calculate_lead_score", { p_lead_id: body.lead_id });
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, score: data });
  }

  // POST /api/ai/analyze-intent — analyze message intent
  if (action === "analyze-intent") {
    const body = await req.json();
    if (!body.lead_id || !body.message) return errorResponse("lead_id and message are required");
    const { data, error } = await supabase.functions.invoke("intent-pipeline", {
      body: { lead_id: body.lead_id, message: body.message, user_id: userId },
    });
    if (error) return errorResponse(error.message, 500);
    return jsonResponse({ success: true, data });
  }

  return errorResponse("Invalid AI action. Use: reply, score, analyze-intent", 404);
}

// ============ MAIN ROUTER ============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const { user, supabase, error: authError } = await authenticate(req);

    // Public health check
    const route = parseRoute(url);
    if (route.resource === "health") {
      return jsonResponse({ success: true, version: "1.0.0", status: "online", timestamp: new Date().toISOString() });
    }

    if (authError || !user) return errorResponse(authError || "Unauthorized", 401);

    const userId = user.id;

    switch (route.resource) {
      case "leads": return await handleLeads(req, supabase, userId, route, url);
      case "messages": return await handleMessages(req, supabase, userId, route, url);
      case "campaigns": return await handleCampaigns(req, supabase, userId, route, url);
      case "meetings": return await handleMeetings(req, supabase, userId, route, url);
      case "templates": return await handleTemplates(req, supabase, userId, route, url);
      case "analytics": return await handleAnalytics(req, supabase, userId, route, url);
      case "automations": return await handleAutomations(req, supabase, userId, route, url);
      case "webhooks": return await handleWebhooks(req, supabase, userId, route, url);
      case "ai": return await handleAI(req, supabase, userId, route, url);
      default: return errorResponse(`Unknown resource: ${route.resource}. Available: leads, messages, campaigns, meetings, templates, analytics, automations, webhooks, ai`, 404);
    }
  } catch (err: any) {
    console.error("API Error:", err);
    return errorResponse(err.message || "Internal server error", 500);
  }
});

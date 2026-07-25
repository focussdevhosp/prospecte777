import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const firstUsableKeyFrom = (rawValue: string | undefined): string | null => {
  if (!rawValue) return null;

  const trimmed = rawValue.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("sb_secret_") || trimmed.split(".").length === 3) {
    return trimmed;
  }

  const opaqueMatch = trimmed.match(/sb_secret_[A-Za-z0-9_-]+/);
  if (opaqueMatch?.[0]) return opaqueMatch[0];

  try {
    const parsed = JSON.parse(trimmed);
    const stack = [parsed];
    while (stack.length > 0) {
      const current = stack.shift();
      if (typeof current === "string") {
        const key: string | null = firstUsableKeyFrom(current);
        if (key) return key;
      } else if (Array.isArray(current)) {
        stack.push(...current);
      } else if (current && typeof current === "object") {
        stack.push(...Object.values(current));
      }
    }
  } catch {
    // Not JSON; fall through to the raw value as a final fallback.
  }

  return trimmed;
};

const getAdminKey = () =>
  firstUsableKeyFrom(Deno.env.get("SUPABASE_SECRET_KEYS")) ||
  firstUsableKeyFrom(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"));

const createAdminDataClient = (supabaseUrl: string, adminKey: string) => {
  const isOpaqueSecret = adminKey.startsWith("sb_secret_");

  return createClient(supabaseUrl, adminKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      fetch: (input, init = {}) => {
        const requestInit = init as RequestInit;
        const headers = new Headers(requestInit.headers);
        headers.set("apikey", adminKey);

        // Opaque Supabase secret keys must identify through `apikey` only.
        // Sending them as `Authorization: Bearer ...` makes some Supabase
        // services try to parse them as JWTs and causes bad_jwt failures.
        if (isOpaqueSecret) {
          headers.delete("Authorization");
        }

        return fetch(input, { ...requestInit, headers });
      },
    },
  });
};

const callAuthAdmin = async (
  supabaseUrl: string,
  adminKey: string,
  path: string,
  init: RequestInit = {},
) => {
  const headers = new Headers(init.headers);
  headers.set("apikey", adminKey);
  headers.set("Content-Type", "application/json");

  if (!adminKey.startsWith("sb_secret_")) {
    headers.set("Authorization", `Bearer ${adminKey}`);
  }

  const response = await fetch(`${supabaseUrl}/auth/v1${path}`, {
    ...init,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload?.msg ||
      payload?.message ||
      payload?.error_description ||
      payload?.error ||
      `Supabase Auth admin request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const adminKey = getAdminKey();

    if (!supabaseUrl || !adminKey) {
      return jsonResponse({ error: "Supabase admin configuration missing" }, 500);
    }

    const supabase = createAdminDataClient(supabaseUrl, adminKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!anonKey) {
      return jsonResponse({ error: "Supabase auth configuration missing" }, 500);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    // Check admin role
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError) throw roleError;

    if (!roleData) {
      return jsonResponse({ error: "Forbidden: admin only" }, 403);
    }

    // Parse body once
    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // No body
    }
    const action = body.action || "list";

    // LIST USERS
    if (action === "list") {
      const { data: profileRows, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, email, full_name, avatar_url, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);

      if (profilesError) throw profilesError;

      const userIds = (profileRows || []).map((profile: any) => profile.user_id).filter(Boolean);

      if (userIds.length === 0) {
        return jsonResponse({ users: [], total: 0 });
      }

      const [settingsRes, rolesRes, blockedRes] = await Promise.all([
        supabase.from("user_settings").select("user_id, whatsapp_connected, auto_prospecting_enabled").in("user_id", userIds),
        supabase.from("user_roles").select("*").in("user_id", userIds),
        supabase.from("blocked_users").select("user_id").in("user_id", userIds),
      ]);

      const queryError = settingsRes.error || rolesRes.error || blockedRes.error;
      if (queryError) throw queryError;

      const settings = settingsRes.data;
      const roles = rolesRes.data;
      const blockedUserIds = new Set((blockedRes.data || []).map((b: any) => b.user_id));

      const enrichedUsers = (profileRows || []).map((profile: any) => {
        const setting = settings?.find((s: any) => s.user_id === profile.user_id);
        const userRoles = roles?.filter((r: any) => r.user_id === profile.user_id).map((r: any) => r.role) || [];

        return {
          id: profile.user_id,
          email: profile.email,
          full_name: profile?.full_name || null,
          avatar_url: profile?.avatar_url || null,
          created_at: profile.created_at,
          last_sign_in_at: null,
          whatsapp_connected: setting?.whatsapp_connected || false,
          auto_prospecting: setting?.auto_prospecting_enabled || false,
          roles: userRoles,
          is_blocked: blockedUserIds.has(profile.user_id),
        };
      });

      return jsonResponse({ users: enrichedUsers, total: enrichedUsers.length });
    }

    // DELETE USER
    if (action === "delete") {
      const targetUserId = body.user_id;
      if (!targetUserId) {
        return jsonResponse({ error: "user_id required" }, 400);
      }
      if (targetUserId === user.id) {
        return jsonResponse({ error: "Cannot delete yourself" }, 400);
      }
      await callAuthAdmin(supabaseUrl, adminKey, `/admin/users/${targetUserId}`, { method: "DELETE" });
      return jsonResponse({ success: true });
    }

    // BLOCK USER
    if (action === "block") {
      const { user_id: targetUserId, reason } = body;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (targetUserId === user.id) {
        return new Response(JSON.stringify({ error: "Cannot block yourself" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Delete existing then insert to avoid unique constraint issues
      await supabase.from("blocked_users").delete().eq("user_id", targetUserId);
      const { error } = await supabase.from("blocked_users").insert({
        user_id: targetUserId,
        blocked_by: user.id,
        reason: reason || "Bloqueado pelo administrador",
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UNBLOCK USER
    if (action === "unblock") {
      const { user_id: targetUserId } = body;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.from("blocked_users").delete().eq("user_id", targetUserId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // SEND NOTIFICATION TO USER
    if (action === "send-notification") {
      const { user_id: targetUserId, title, message } = body;
      if (!targetUserId || !title || !message) {
        return new Response(JSON.stringify({ error: "user_id, title, and message required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.from("admin_notifications").insert({
        user_id: targetUserId,
        admin_id: user.id,
        title,
        message,
      });
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET SUPPORT TICKETS
    if (action === "support-tickets") {
      const { data: tickets, error } = await supabase
        .from("support_tickets")
        .select(`*, support_messages(id, content, sender_type, sender_id, created_at)`)
        .order("updated_at", { ascending: false });
      if (error) throw error;

      const ticketUserIds = [...new Set((tickets || []).map((t: any) => t.user_id))];
      let ticketProfiles: any[] = [];
      if (ticketUserIds.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", ticketUserIds);
        ticketProfiles = data || [];
      }

      const enrichedTickets = (tickets || []).map((t: any) => ({
        ...t,
        user_name: ticketProfiles.find((p: any) => p.user_id === t.user_id)?.full_name || null,
        user_email: ticketProfiles.find((p: any) => p.user_id === t.user_id)?.email || null,
      }));

      return new Response(JSON.stringify({ tickets: enrichedTickets }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // REPLY TO SUPPORT TICKET
    if (action === "reply-ticket") {
      const { ticket_id, content } = body;
      if (!ticket_id || !content) {
        return new Response(JSON.stringify({ error: "ticket_id and content required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.from("support_messages").insert({
        ticket_id,
        sender_id: user.id,
        sender_type: "admin",
        content,
      });
      if (error) throw error;
      await supabase.from("support_tickets").update({ updated_at: new Date().toISOString() }).eq("id", ticket_id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // CLOSE TICKET
    if (action === "close-ticket") {
      const { ticket_id } = body;
      if (!ticket_id) {
        return new Response(JSON.stringify({ error: "ticket_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.from("support_tickets").update({ status: "closed" }).eq("id", ticket_id);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET STATS
    if (action === "stats") {
      const [usersRes, whatsappRes, leadsRes, messagesRes] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("user_settings").select("*", { count: "exact", head: true }).eq("whatsapp_connected", true),
        supabase.from("leads").select("*", { count: "exact", head: true }),
        supabase.from("chat_messages").select("*", { count: "exact", head: true }),
      ]);

      return new Response(
        JSON.stringify({
          total_users: usersRes.count || 0,
          connected_whatsapp: whatsappRes.count || 0,
          total_leads: leadsRes.count || 0,
          total_messages: messagesRes.count || 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Admin error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
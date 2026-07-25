import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    // Prefer new-format secret key (sb_secret_...) over legacy service_role JWT
    // to avoid "unrecognized JWT kid" errors under the signing-keys system.
    const adminKey =
      Deno.env.get("SUPABASE_SECRET_KEYS") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, adminKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check admin role
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .single();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Forbidden: admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
      const {
        data: { users },
        error,
      } = await supabase.auth.admin.listUsers({ page: 1, perPage: 50 });

      if (error) throw error;

      const userIds = users.map((u: any) => u.id);

      const [profilesRes, settingsRes, rolesRes, blockedRes] = await Promise.all([
        supabase.from("profiles").select("*").in("user_id", userIds),
        supabase.from("user_settings").select("user_id, whatsapp_connected, auto_prospecting_enabled").in("user_id", userIds),
        supabase.from("user_roles").select("*").in("user_id", userIds),
        supabase.from("blocked_users").select("user_id").in("user_id", userIds),
      ]);

      const profiles = profilesRes.data;
      const settings = settingsRes.data;
      const roles = rolesRes.data;
      const blockedUserIds = new Set((blockedRes.data || []).map((b: any) => b.user_id));

      const enrichedUsers = users.map((u: any) => {
        const profile = profiles?.find((p: any) => p.user_id === u.id);
        const setting = settings?.find((s: any) => s.user_id === u.id);
        const userRoles = roles?.filter((r: any) => r.user_id === u.id).map((r: any) => r.role) || [];

        return {
          id: u.id,
          email: u.email,
          full_name: profile?.full_name || null,
          avatar_url: profile?.avatar_url || null,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          whatsapp_connected: setting?.whatsapp_connected || false,
          auto_prospecting: setting?.auto_prospecting_enabled || false,
          roles: userRoles,
          is_blocked: blockedUserIds.has(u.id),
        };
      });

      return new Response(JSON.stringify({ users: enrichedUsers, total: users.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE USER
    if (action === "delete") {
      const targetUserId = body.user_id;
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: "user_id required" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (targetUserId === user.id) {
        return new Response(JSON.stringify({ error: "Cannot delete yourself" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { error } = await supabase.auth.admin.deleteUser(targetUserId);
      if (error) throw error;
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
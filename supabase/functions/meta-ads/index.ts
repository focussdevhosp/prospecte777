import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, access_token, ad_account_id, payload } = await req.json();

    if (!access_token) {
      return new Response(
        JSON.stringify({ error: "Token de acesso não fornecido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!action) {
      return new Response(
        JSON.stringify({ error: "Ação não especificada" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const base = "https://graph.facebook.com/v19.0";

    if (action === "get_accounts") {
      const res = await fetch(`${base}/me/adaccounts?fields=id,name,account_status&access_token=${access_token}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get_campaigns") {
      if (!ad_account_id) {
        return new Response(JSON.stringify({ error: "ad_account_id necessário" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const res = await fetch(`${base}/${ad_account_id}/campaigns?fields=id,name,status,objective,daily_budget,lifetime_budget&access_token=${access_token}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get_leadgen_leads") {
      if (!payload?.form_id) {
        return new Response(JSON.stringify({ error: "form_id necessário" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const res = await fetch(`${base}/${payload.form_id}/leads?fields=id,created_time,field_data&access_token=${access_token}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "create_custom_audience") {
      if (!ad_account_id || !payload?.name) {
        return new Response(JSON.stringify({ error: "ad_account_id e name necessários" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const res = await fetch(`${base}/${ad_account_id}/customaudiences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token,
          name: payload.name,
          subtype: "CUSTOM",
          description: payload.description || "Audiência criada pelo NexaProspect CRM",
          customer_file_source: "USER_PROVIDED_ONLY",
        }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "add_users_to_audience") {
      if (!payload?.audience_id || !payload?.phones) {
        return new Response(JSON.stringify({ error: "audience_id e phones necessários" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const phones: string[] = payload.phones;
      const hashed = await Promise.all(
        phones.map(async (p: string) => {
          const clean = p.replace(/\D/g, "");
          const normalized = clean.startsWith("55") ? clean : `55${clean}`;
          const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
          return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
        })
      );

      const res = await fetch(`${base}/${payload.audience_id}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          access_token,
          payload: {
            schema: ["PHONE"],
            data: hashed.map(h => [h]),
          },
        }),
      });
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get_lead_forms") {
      if (!payload?.page_id) {
        return new Response(JSON.stringify({ error: "page_id necessário" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const res = await fetch(`${base}/${payload.page_id}/leadgen_forms?fields=id,name,leads_count&access_token=${access_token}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "get_audiences") {
      if (!ad_account_id) {
        return new Response(JSON.stringify({ error: "ad_account_id necessário" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const res = await fetch(`${base}/${ad_account_id}/customaudiences?fields=id,name,approximate_count,time_updated&access_token=${access_token}`);
      const data = await res.json();
      return new Response(JSON.stringify(data), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (action === "debug_token") {
      // Uses the token to inspect itself (no app secret needed)
      const res = await fetch(
        `${base}/debug_token?input_token=${access_token}&access_token=${access_token}`
      );
      const data = await res.json();
      const info = data?.data || {};
      return new Response(JSON.stringify({
        is_valid: info.is_valid === true,
        expires_at: info.expires_at ? info.expires_at * 1000 : null, // ms
        data_access_expires_at: info.data_access_expires_at ? info.data_access_expires_at * 1000 : null,
        scopes: info.scopes || [],
        raw: data,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

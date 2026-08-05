import {
  checkRateLimit,
  corsHeaders,
  handleCors,
  rateLimited,
  requirePaidPlan,
  requireUserOrInternal,
  serviceClient,
} from "../_shared/auth.ts";

const supabase = serviceClient();

async function fetchWithRetry(url: string, tries = 3, timeoutMs = 8000): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: ctl.signal,
      });
      clearTimeout(t);
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
      } else {
        return res;
      }
    } catch (e) {
      clearTimeout(t);
      lastErr = e;
    }
    // backoff: 400ms, 1200ms, 3600ms
    await new Promise((r) => setTimeout(r, 400 * Math.pow(3, i)));
  }
  throw lastErr ?? new Error("Fetch failed");
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const paywall = await requirePaidPlan(auth.ctx);
  if (paywall) return paywall;

  if (auth.ctx.kind === "user") {
    const limit = await checkRateLimit(auth.ctx.supabase, auth.ctx.userId, "cnpj-radar", 90, 60);
    if (!limit.allowed) return rateLimited(limit.resetIn);
  }

  try {
    const { action, cnpj, filters } = await req.json();

    if (action === "lookup") {
      const clean = (cnpj || "").replace(/\D/g, "");
      if (clean.length !== 14) {
        return new Response(JSON.stringify({ error: "CNPJ inválido" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 1) cache lookup (24h)
      const { data: cached } = await supabase
        .from("cnpj_cache")
        .select("data, expires_at")
        .eq("cnpj", clean)
        .maybeSingle();

      if (cached && new Date(cached.expires_at) > new Date()) {
        return new Response(JSON.stringify({ ...cached.data, _cached: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 2) primary: opencnpj
      let data: any = null;
      try {
        const res = await fetchWithRetry(`https://api.opencnpj.org/${clean}`);
        if (res.ok) data = await res.json();
      } catch (_) { /* fallback */ }

      // 3) fallback: brasilapi
      if (!data) {
        try {
          const res = await fetchWithRetry(`https://brasilapi.com.br/api/cnpj/v1/${clean}`);
          if (res.ok) data = await res.json();
        } catch (_) { /* nothing */ }
      }

      if (!data) {
        return new Response(JSON.stringify({ error: "CNPJ não encontrado ou serviço indisponível" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // save cache (best-effort)
      await supabase.from("cnpj_cache").upsert({
        cnpj: clean,
        data,
        fetched_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      });

      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "search") {
      const { uf, municipio, cnae, porte, limit = 50 } = filters || {};
      let url = `https://api.opencnpj.org/search?limit=${Math.min(limit, 100)}`;
      if (uf) url += `&uf=${uf}`;
      if (municipio) url += `&municipio=${encodeURIComponent(municipio)}`;
      if (cnae) url += `&cnae_fiscal=${cnae}`;
      if (porte) url += `&porte=${porte}`;

      const res = await fetchWithRetry(url);
      const data = await res.json();
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

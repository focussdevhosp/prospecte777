import {
  checkRateLimit,
  corsHeaders,
  handleCors,
  rateLimited,
  requirePaidPlan,
  requireUserOrInternal,
  serviceClient,
} from "../_shared/auth.ts";
import { parsePhone } from "../_shared/leads.ts";

const supabase = serviceClient();

/**
 * Cada fonte de CNPJ nomeia os campos do seu jeito. Aqui tudo vira o mesmo
 * formato que a tela já espera, e o telefone passa pela mesma validação do
 * motor de captura — CNPJ com telefone inválido é lead que não existe.
 */
function normalizeCompany(
  raw: Record<string, unknown>,
  fallbackUf: string,
): Record<string, unknown> | null {
  const str = (...keys: string[]): string => {
    for (const k of keys) {
      const v = raw[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") return String(v).trim();
    }
    return "";
  };

  const cnpj = str("cnpj", "cnpj_raiz", "estabelecimento_cnpj").replace(/\D/g, "");
  if (cnpj.length !== 14) return null;

  const razao = str("razao_social", "nome_empresarial", "company_name");
  if (!razao) return null;

  // Telefone pode vir como "ddd + numero" separados ou já junto.
  const ddd = str("ddd_1", "ddd_telefone_1_ddd");
  const rawPhone = str("ddd_telefone_1", "telefone_1", "telefone", "phone");
  const parsed = parsePhone(ddd ? `${ddd}${rawPhone}` : rawPhone);

  return {
    cnpj,
    razao_social: razao,
    nome_fantasia: str("nome_fantasia", "fantasia", "trade_name"),
    situacao_cadastral: str("situacao_cadastral", "situacao") || "Ativa",
    cnae_fiscal_descricao: str("cnae_fiscal_descricao", "atividade_principal_descricao"),
    cnae_fiscal: Number(str("cnae_fiscal", "atividade_principal_codigo").replace(/\D/g, "")) || 0,
    logradouro: str("logradouro", "endereco"),
    numero: str("numero"),
    complemento: str("complemento"),
    bairro: str("bairro"),
    municipio: str("municipio", "cidade"),
    uf: str("uf", "estado") || fallbackUf,
    cep: str("cep").replace(/\D/g, ""),
    ddd_telefone_1: parsed?.e164 ?? "",
    telefone_formatado: parsed?.display ?? "",
    email: str("email", "correio_eletronico").toLowerCase(),
    data_inicio_atividade: str("data_inicio_atividade", "data_abertura"),
    porte: str("porte", "porte_empresa"),
    descricao_tipo_de_logradouro: str("descricao_tipo_de_logradouro", "tipo_logradouro"),
  };
}

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
      const { uf, municipio, cnae, porte, limit = 50, only_with_phone = true } = filters || {};
      const target = Math.min(Number(limit) || 50, 500);

      // A tela chamava `publica.cnpj.ws` direto do navegador. Isso significa
      // requisição sem chave batendo o limite público em minutos, nenhum
      // cache, e CORS decidindo se o recurso funciona ou não — do lado do
      // usuário, sem log nenhum. Aqui as duas fontes rodam no servidor,
      // com retry e formato normalizado.
      const results: Record<string, unknown>[] = [];
      const seen = new Set<string>();
      const sources: { source: string; found: number; error?: string }[] = [];

      const addRows = (rows: unknown[], source: string) => {
        let added = 0;
        for (const row of rows ?? []) {
          const item = row as Record<string, unknown>;
          const normalized = normalizeCompany(item, String(uf ?? ""));
          if (!normalized) continue;
          if (seen.has(normalized.cnpj)) continue;
          if (only_with_phone && !normalized.ddd_telefone_1) continue;

          seen.add(normalized.cnpj);
          results.push(normalized);
          added++;
          if (results.length >= target) break;
        }
        sources.push({ source, found: added });
      };

      // Fonte 1: cnpj.ws (mesma que a tela usava, campos já no formato certo)
      try {
        const perPage = 20;
        const maxPages = Math.ceil(target / perPage);

        for (let page = 1; page <= maxPages && results.length < target; page++) {
          const params = new URLSearchParams();
          if (uf) params.set("uf", String(uf));
          if (municipio) params.set("municipio", String(municipio).toUpperCase());
          if (cnae) params.set("cnae", String(cnae).replace(/\D/g, ""));
          if (porte) params.set("porte", String(porte));
          params.set("pagina", String(page));

          const res = await fetchWithRetry(`https://publica.cnpj.ws/cnpj/s?${params}`, 2);
          if (!res.ok) break;

          const data = await res.json();
          const rows = Array.isArray(data) ? data : data?.data ?? [];
          if (rows.length === 0) break;

          addRows(rows, `cnpj.ws p${page}`);
        }
      } catch (e) {
        sources.push({
          source: "cnpj.ws",
          found: 0,
          error: e instanceof Error ? e.message : "erro",
        });
      }

      // Fonte 2: opencnpj, para completar quando a primeira devolve pouco
      if (results.length < target) {
        try {
          let url = `https://api.opencnpj.org/search?limit=${Math.min(target - results.length, 100)}`;
          if (uf) url += `&uf=${uf}`;
          if (municipio) url += `&municipio=${encodeURIComponent(String(municipio))}`;
          if (cnae) url += `&cnae_fiscal=${String(cnae).replace(/\D/g, "")}`;
          if (porte) url += `&porte=${porte}`;

          const res = await fetchWithRetry(url, 2);
          const data = await res.json();
          addRows(Array.isArray(data) ? data : data?.data ?? [], "opencnpj");
        } catch (e) {
          sources.push({
            source: "opencnpj",
            found: 0,
            error: e instanceof Error ? e.message : "erro",
          });
        }
      }

      console.log(`[cnpj-radar] ${results.length} empresas · ${JSON.stringify(sources)}`);

      return new Response(
        JSON.stringify({ results, total: results.length, sources }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
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

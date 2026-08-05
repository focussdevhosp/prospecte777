import {
  checkRateLimit,
  corsHeaders,
  handleCors,
  json,
  rateLimited,
  requirePaidPlan,
  requireUserOrInternal,
} from "../_shared/auth.ts";
import { captureLeads } from "../_shared/engine.ts";

// ============================================================
// BUSCA DE LEADS
// ============================================================
// Esta é a função que a tela de Captura usa de verdade.
//
// Antes: SerpAPI global (ou raspagem do DuckDuckGo como plano B), telefone
// tirado do texto do snippet com regex e dedup por string de dígitos.
// O que chegava na tela vinha cheio de página de agregador, "Os 10 melhores
// restaurantes de X" virando nome de empresa, e CNPJ formatado passando por
// telefone.
//
// Agora: OpenStreetMap como fonte primária (cadastro estruturado, telefone e
// endereço do próprio negócio, sem chave de API), SerpAPI/Serper por cima se
// houver chave, DuckDuckGo completando — e tudo passa pela peneira de
// `_shared/leads.ts` antes de virar resultado.
//
// O formato da resposta é o mesmo de antes, de propósito: a tela não precisa
// mudar para receber dado melhor.

interface ExtendedSearchResult {
  title: string;
  link: string;
  snippet: string;
  phone?: string;
  phone_display?: string;
  phone_kind?: string;
  email?: string;
  position: number;
  rating?: number;
  reviews_count?: number;
  website?: string;
  address?: string;
  google_maps_url?: string;
  photo_url?: string;
  thumbnail?: string;
  category?: string;
  quality_score?: number;
  quality_reasons?: string[];
  source?: string;
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const paywall = await requirePaidPlan(auth.ctx);
  if (paywall) return paywall;

  // Cada busca dispara várias requisições externas; sem teto, uma tela
  // aberta em loop derruba a cota das fontes para todo mundo.
  if (auth.ctx.kind === "user") {
    const limit = await checkRateLimit(auth.ctx.supabase, auth.ctx.userId, "web-search", 40, 60);
    if (!limit.allowed) return rateLimited(limit.resetIn);
  }

  try {
    const {
      query,
      location,
      num_results = 0,
      min_quality = 0,
    } = await req.json();

    if (!query) return json({ error: "Query é obrigatória" }, 400);

    // Chave do usuário tem prioridade sobre a global: quem paga SerpAPI
    // merece usar a cota dele, não competir pela nossa.
    let serpApiKey = Deno.env.get("SERPAPI_API_KEY") ?? null;
    let serperApiKey: string | null = null;

    if (auth.ctx.kind === "user") {
      const { data: settings } = await auth.ctx.supabase
        .from("user_settings")
        .select("serpapi_api_key, serper_api_key")
        .eq("user_id", auth.ctx.userId)
        .maybeSingle();

      if (settings?.serper_api_key) serperApiKey = settings.serper_api_key;
      if (settings?.serpapi_api_key) serpApiKey = settings.serpapi_api_key;
    }

    const maxResults = num_results > 0 ? num_results : 200;

    const report = await captureLeads({
      niche: query,
      location: location || "Brasil",
      maxResults,
      minQuality: min_quality,
      serpApiKey,
      serperApiKey,
    });

    const results: ExtendedSearchResult[] = report.leads.map((lead, i) => ({
      title: lead.business_name,
      link: lead.website ?? lead.google_maps_url ?? "",
      website: lead.website ?? undefined,
      snippet: lead.address ?? "",
      address: lead.address ?? undefined,
      phone: lead.phone,
      phone_display: lead.phone_display,
      phone_kind: lead.phone_kind,
      email: lead.email ?? undefined,
      rating: lead.rating ?? undefined,
      reviews_count: lead.reviews_count ?? undefined,
      google_maps_url: lead.google_maps_url ?? undefined,
      category: lead.subtype ?? undefined,
      quality_score: lead.quality_score,
      quality_reasons: lead.quality_reasons,
      source: lead.source ?? undefined,
      position: i + 1,
    }));

    console.log(
      `web-search "${query}" em "${location}": ${report.total_raw} brutos -> ` +
      `${results.length} válidos. Descartes: ${JSON.stringify(report.discarded)}`,
    );

    return json({
      success: true,
      results,
      total: results.length,
      search_info: {
        query,
        location,
        total_results: results.length,
        // O usuário passa a ver de onde veio cada lead e por que os outros
        // foram descartados, em vez de só um número.
        sources: report.sources,
        discarded: report.discarded,
        total_raw: report.total_raw,
      },
    });
  } catch (error) {
    console.error("Web search error:", error);
    return json(
      { error: error instanceof Error ? error.message : "Erro desconhecido" },
      500,
    );
  }
});

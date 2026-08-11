// ============================================================
// NEXA SEARCH — AGREGADOR
// ============================================================
// Para o usuário existe um botão: BUSCAR. Ele digita "clínicas de estética"
// e "Itu/SP", e recebe empresas únicas. Quantas fontes foram consultadas,
// quais falharam e quantas duplicatas foram fundidas é problema nosso.
//
// O que este módulo garante:
//   - fonte lenta não segura as outras (paralelo com timeout por fonte);
//   - fonte fora do ar não derruba a busca (falha isolada + disjuntor);
//   - a mesma empresa vista por três fontes vira UMA, com o melhor de cada;
//   - busca repetida recente não refaz o trabalho (cache);
//   - se a área foi ampliada, o usuário é avisado — nunca em silêncio.

import { ProviderRegistry } from "./registry.ts";
import { normalizeBusiness, resolveEntities } from "./entity-resolution.ts";
import {
  MapsWorkerProvider, OpenStreetMapProvider, SerpApiProvider,
  SerperProvider, WebSearchProvider,
} from "./adapters.ts";
import type {
  LeadProvider, NormalizedBusiness, SearchBudget, SearchQuery, SearchReport,
} from "./types.ts";
import { DEFAULT_BUDGET } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

/** Validade do cache. Empresa não abre e fecha de um dia para o outro. */
const CACHE_TTL_HOURS = 72;

export interface AggregateOptions {
  query: SearchQuery;
  supabase?: Supa | null;
  keys?: { serper?: string | null; serpapi?: string | null };
  budget?: Partial<SearchBudget>;
  /** Chamado a cada fonte que termina — alimenta o progresso na tela. */
  onProgress?: (progress: {
    completed: number;
    total: number;
    uniqueSoFar: number;
    /** Rótulo genérico: a tela não revela qual fonte é qual. */
    message: string;
  }) => Promise<void> | void;
}

export interface AggregateResult {
  businesses: NormalizedBusiness[];
  report: SearchReport;
}

/** Monta o registry com as fontes disponíveis para esta conta. */
export function buildRegistry(
  supabase: Supa | null,
  keys?: { serper?: string | null; serpapi?: string | null },
): ProviderRegistry {
  const registry = new ProviderRegistry(supabase);

  registry.register(new OpenStreetMapProvider());
  registry.register(new MapsWorkerProvider());

  // Serper e SerpApi cobrem a mesma lacuna. Registrar as duas quando só uma
  // tem chave é inofensivo: a sem chave responde `not_configured` e o
  // registry a ignora.
  registry.register(new SerperProvider(keys?.serper ?? null));
  registry.register(new SerpApiProvider(keys?.serpapi ?? null));
  registry.register(new WebSearchProvider());

  return registry;
}

/**
 * Executa a busca agregada.
 *
 * Os providers rodam todos de uma vez. Antes o motor os chamava em
 * sequência, então a busca demorava a soma de todas as fontes; agora demora
 * a mais lenta. Com quatro fontes de ~20s, isso é a diferença entre 80 e 25
 * segundos de espera.
 */
export async function aggregateSearch(opts: AggregateOptions): Promise<AggregateResult> {
  const budget: SearchBudget = { ...DEFAULT_BUDGET, ...opts.budget };
  const registry = buildRegistry(opts.supabase ?? null, opts.keys);
  await registry.loadStates();

  const selected = registry.selectFor(budget);
  const report: SearchReport = {
    query: opts.query,
    providers: [],
    totalRaw: 0,
    duplicatesMerged: 0,
    ambiguousForReview: 0,
    unique: 0,
    fromCache: 0,
  };

  // ---- Cache ----
  const cached = await readCache(opts.supabase, opts.query);
  const collected: NormalizedBusiness[] = [...cached];
  report.fromCache = cached.length;

  if (cached.length > 0) {
    await opts.onProgress?.({
      completed: 0,
      total: selected.length,
      uniqueSoFar: cached.length,
      message: `${cached.length} empresas recuperadas de buscas recentes`,
    });
  }

  // ---- Fontes em paralelo, cada uma com o próprio teto de tempo ----
  const deadline = Date.now() + budget.maxDurationMs;
  let completed = 0;

  const runs = selected.map(async ({ provider }) => {
    if (Date.now() > deadline) {
      report.providers.push({
        id: provider.id, found: 0, unique: 0, durationMs: 0,
        skipped: "orçamento de tempo esgotado",
      });
      return;
    }

    const result = await registry.run(provider, opts.query);
    const before = collected.length;

    for (const raw of result.businesses) {
      if (!raw.name) continue;
      collected.push(normalizeBusiness(raw, provider.id));
    }

    report.totalRaw += result.businesses.length;
    report.providers.push({
      id: provider.id,
      found: result.businesses.length,
      unique: collected.length - before,
      durationMs: result.durationMs,
      error: result.error,
    });

    completed++;

    // O progresso mostra empresas únicas até aqui, não o bruto — é o número
    // que o usuário entende e o único que significa alguma coisa.
    const partial = resolveEntities(collected);
    await opts.onProgress?.({
      completed,
      total: selected.length,
      uniqueSoFar: partial.businesses.length,
      message: completed < selected.length
        ? `${partial.businesses.length} empresas únicas · pesquisando novas fontes...`
        : `${partial.businesses.length} empresas únicas encontradas`,
    });
  });

  await Promise.all(runs);

  // ---- Consolidação ----
  const resolution = resolveEntities(collected);
  report.duplicatesMerged = resolution.merged;
  report.ambiguousForReview = resolution.review.length;

  // Ordena por completude: quem tem telefone, site e avaliação vale mais que
  // um registro com só o nome, e é isso que o usuário quer ver primeiro.
  const ranked = resolution.businesses
    .sort((a, b) => completeness(b) - completeness(a))
    .slice(0, budget.maxResults);

  report.unique = ranked.length;

  // Registra quanto cada fonte agregou de verdade, para o scoring.
  for (const entry of report.providers) {
    const contributed = ranked.filter((b) => b.sources.includes(entry.id)).length;
    entry.unique = contributed;
    await registry.recordUnique(entry.id, contributed);
  }

  await writeCache(opts.supabase, opts.query, ranked);

  return { businesses: ranked, report };
}

/** Quanto de um registro está preenchido. Usado só para ordenar. */
function completeness(business: NormalizedBusiness): number {
  let score = 0;
  if (business.phone) score += 40;         // sem telefone não há prospecção
  if (business.website) score += 15;
  if (business.address) score += 10;
  if (business.rating != null) score += 10;
  if (business.reviewsCount != null) score += 5;
  if (business.latitude != null) score += 5;
  if (business.category) score += 5;
  if (business.email) score += 5;
  // Empresa vista por mais de uma fonte é mais provável de existir mesmo.
  score += Math.min(15, (business.sources.length - 1) * 8);
  return score;
}

// ------------------------------------------------------------
// CACHE
// ------------------------------------------------------------

function cacheKey(query: SearchQuery): string {
  const norm = (s: string) =>
    s.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
  return `${norm(query.term)}|${norm(query.location)}`;
}

async function readCache(
  supabase: Supa | null | undefined,
  query: SearchQuery,
): Promise<NormalizedBusiness[]> {
  if (!supabase) return [];

  try {
    const cutoff = new Date(Date.now() - CACHE_TTL_HOURS * 3600_000).toISOString();
    const { data } = await supabase
      .from("search_cache")
      .select("businesses")
      .eq("cache_key", cacheKey(query))
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const rows = data?.businesses;
    return Array.isArray(rows) ? (rows as NormalizedBusiness[]) : [];
  } catch (e) {
    console.error("[search] cache indisponível:", e);
    return [];
  }
}

async function writeCache(
  supabase: Supa | null | undefined,
  query: SearchQuery,
  businesses: NormalizedBusiness[],
): Promise<void> {
  if (!supabase || businesses.length === 0) return;

  try {
    await supabase.from("search_cache").upsert(
      {
        cache_key: cacheKey(query),
        term: query.term,
        location: query.location,
        // Teto para a linha não virar um blob gigante.
        businesses: businesses.slice(0, 300),
        result_count: businesses.length,
        created_at: new Date().toISOString(),
      },
      { onConflict: "cache_key" },
    );
  } catch (e) {
    console.error("[search] não foi possível gravar o cache:", e);
  }
}

// ------------------------------------------------------------
// EXPANSÃO DE CONSULTA
// ------------------------------------------------------------

/**
 * Variações do termo, por sinônimo conhecido.
 *
 * Sem IA de propósito: o dicionário é auditável, custa zero e não inventa
 * um nicho que não existe. A expansão por modelo entra depois, se este
 * mapa se mostrar curto demais.
 */
const TERM_VARIANTS: Record<string, string[]> = {
  "estetica": ["clínica de estética", "estética avançada", "harmonização facial", "centro de estética"],
  "odontolog": ["clínica odontológica", "dentista", "consultório odontológico", "ortodontia"],
  "advocacia": ["escritório de advocacia", "advogado", "consultoria jurídica"],
  "imobiliar": ["imobiliária", "corretor de imóveis", "administradora de imóveis"],
  "academia": ["academia", "crossfit", "pilates", "studio de treinamento"],
  "restaurante": ["restaurante", "self-service", "comida caseira"],
  "contabil": ["escritório de contabilidade", "contador", "assessoria contábil"],
  "veterinari": ["clínica veterinária", "pet shop", "hospital veterinário"],
  "barbearia": ["barbearia", "barber shop", "corte masculino"],
  "salao": ["salão de beleza", "cabeleireiro", "esmalteria"],
};

export function expandQuery(term: string): string[] {
  const normalized = term.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  for (const [key, variants] of Object.entries(TERM_VARIANTS)) {
    if (normalized.includes(key)) {
      // Não repete o que o usuário já escreveu.
      return variants.filter((v) =>
        v.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") !== normalized
      );
    }
  }

  return [];
}

// ------------------------------------------------------------
// ÁREA INSUFICIENTE
// ------------------------------------------------------------

/** Abaixo disso, vale perguntar se o usuário quer ampliar a área. */
export const THIN_RESULT_THRESHOLD = 10;

/**
 * Sugere ampliar a busca — mas só sugere.
 *
 * Trocar "Itu" por "região de Itu" sem avisar altera a intenção do usuário:
 * ele pediu Itu porque atende Itu. Quem decide é ele.
 */
export function suggestExpansion(
  query: SearchQuery,
  found: number,
): { shouldSuggest: boolean; suggestion: string | null; reason: string } {
  if (found >= THIN_RESULT_THRESHOLD) {
    return { shouldSuggest: false, suggestion: null, reason: "resultado suficiente" };
  }

  const variants = expandQuery(query.term);
  if (variants.length > 0) {
    return {
      shouldSuggest: true,
      suggestion: `buscar também por: ${variants.slice(0, 3).join(", ")}`,
      reason: `apenas ${found} empresa(s) encontrada(s) para "${query.term}"`,
    };
  }

  return {
    shouldSuggest: true,
    suggestion: "ampliar para cidades vizinhas",
    reason: `apenas ${found} empresa(s) encontrada(s) em ${query.location}`,
  };
}

export type { LeadProvider, SearchReport };

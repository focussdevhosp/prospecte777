// ============================================================
// MOTOR DE CAPTURA
// ============================================================
// Orquestra as fontes, passa tudo pela peneira de qualidade e grava o
// resultado no job. Cada fonte falha sozinha: se o Overpass estiver fora do
// ar, o DuckDuckGo ainda entrega.

import { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { RawLead, refineLeads, ScoredLead } from "./leads.ts";
import {
  searchDuckDuckGo,
  searchOpenStreetMap,
  searchSerpApi,
  searchSerper,
} from "./sources.ts";

/**
 * Variações de busca por nicho. Só usadas pelas fontes de texto livre —
 * o OSM trabalha por tag, que é mais preciso que sinônimo.
 */
const SUBNICHES: Record<string, string[]> = {
  "Restaurantes": ["restaurante", "comida caseira", "self-service", "churrascaria", "comida japonesa", "bistrô"],
  "Salões de Beleza": ["salão de beleza", "cabeleireiro", "esmalteria", "designer de sobrancelhas", "estética"],
  "Academias": ["academia", "crossfit", "pilates", "personal trainer", "artes marciais"],
  "Clínicas Médicas": ["clínica médica", "consultório médico", "centro médico", "dermatologista", "ortopedista"],
  "Clínicas Odontológicas": ["clínica odontológica", "dentista", "ortodontista", "implante dentário"],
  "Escritórios de Advocacia": ["escritório de advocacia", "advogado trabalhista", "advogado empresarial"],
  "Imobiliárias": ["imobiliária", "corretor de imóveis", "administradora de imóveis"],
  "Pet Shops": ["pet shop", "banho e tosa", "clínica veterinária"],
  "Oficinas Mecânicas": ["oficina mecânica", "auto center", "funilaria", "elétrica automotiva"],
  "Escolas e Cursos": ["escola de idiomas", "curso técnico", "escola de música", "reforço escolar"],
  "Lojas de Roupas": ["loja de roupas", "boutique", "moda feminina", "loja de calçados"],
  "Farmácias": ["farmácia", "drogaria", "farmácia de manipulação"],
  "Hotéis e Pousadas": ["hotel", "pousada", "hostel"],
  "Estúdios de Tatuagem": ["estúdio de tatuagem", "tatuador", "piercing"],
  "Barbearias": ["barbearia", "barber shop", "corte masculino"],
  "Floriculturas": ["floricultura", "arranjos florais", "paisagismo"],
  "Padarias": ["padaria", "panificadora", "confeitaria"],
  "Pizzarias": ["pizzaria", "pizza delivery", "pizza artesanal"],
  "Hamburguerias": ["hamburgueria", "smash burger", "lanchonete"],
  "Cafeterias": ["cafeteria", "coffee shop", "brunch"],
};

export interface EngineOptions {
  niche: string;
  location: string;
  maxResults: number;
  serpApiKey?: string | null;
  serperApiKey?: string | null;
  /** Quanto menor, mais permissivo. 0 aceita tudo que passou na validação. */
  minQuality?: number;
}

export interface EngineReport {
  leads: ScoredLead[];
  sources: { source: string; found: number; error?: string }[];
  discarded: Record<string, number>;
  total_raw: number;
}

/**
 * Roda a captura. `onProgress` recebe 0..100 para alimentar a barra do job.
 */
export async function captureLeads(
  opts: EngineOptions,
  onProgress?: (percent: number, partial: number) => Promise<void>,
): Promise<EngineReport> {
  const { niche, location, maxResults } = opts;
  const minQuality = opts.minQuality ?? 0;

  const raw: RawLead[] = [];
  const sources: EngineReport["sources"] = [];

  // Cada etapa vale uma fatia da barra de progresso.
  const terms = (SUBNICHES[niche] ?? [niche.toLowerCase()]).slice(0, 6);
  const totalSteps = 1 + terms.length + (opts.serperApiKey || opts.serpApiKey ? 1 : 0);
  let step = 0;

  const advance = async () => {
    step++;
    if (onProgress) {
      await onProgress(Math.round((step / totalSteps) * 100), raw.length);
    }
  };

  // ---- 1. OpenStreetMap (cadastro estruturado, melhor sinal) ----
  const osm = await searchOpenStreetMap(niche, location, Math.min(maxResults, 400));
  raw.push(...osm.leads);
  sources.push({ source: osm.source, found: osm.leads.length, error: osm.error });
  await advance();

  // ---- 2. API paga do usuário, se ele tiver configurado ----
  if (opts.serperApiKey) {
    const r = await searchSerper(opts.serperApiKey, niche, location);
    raw.push(...r.leads);
    sources.push({ source: r.source, found: r.leads.length, error: r.error });
    await advance();
  } else if (opts.serpApiKey) {
    const r = await searchSerpApi(opts.serpApiKey, niche, location);
    raw.push(...r.leads);
    sources.push({ source: r.source, found: r.leads.length, error: r.error });
    await advance();
  }

  // ---- 3. DuckDuckGo por variação de nicho ----
  for (const term of terms) {
    if (raw.length >= maxResults * 3) break; // já tem material de sobra para peneirar

    const r = await searchDuckDuckGo(term, location);
    raw.push(...r.leads);
    sources.push({ source: `duckduckgo:${term}`, found: r.leads.length, error: r.error });

    await advance();
    await new Promise((res) => setTimeout(res, 200)); // educação com a fonte
  }

  // ---- 4. Peneira ----
  const { leads, discarded } = refineLeads(raw);

  const filtered = leads
    .filter((l) => l.quality_score >= minQuality)
    .slice(0, maxResults);

  return {
    leads: filtered,
    sources,
    discarded,
    total_raw: raw.length,
  };
}

/**
 * Executa a captura em background, alimentando `background_jobs`.
 */
export async function runCaptureJob(
  supabase: SupabaseClient,
  jobId: string,
  userId: string,
  opts: EngineOptions,
): Promise<void> {
  try {
    await supabase
      .from("background_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", jobId);

    const report = await captureLeads(opts, async (percent, partial) => {
      await supabase
        .from("background_jobs")
        .update({
          processed_items: partial,
          current_index: percent,
          last_heartbeat_at: new Date().toISOString(),
        })
        .eq("id", jobId);
    });

    console.log(
      `[Job ${jobId}] ${report.total_raw} brutos -> ${report.leads.length} qualificados. ` +
      `Descartes: ${JSON.stringify(report.discarded)}`,
    );

    await supabase
      .from("background_jobs")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        processed_items: report.leads.length,
        total_items: report.leads.length,
        result: {
          leads: report.leads,
          total: report.leads.length,
          // Transparência: o usuário vê de onde veio e o que foi descartado,
          // em vez de só um número que apareceu do nada.
          sources: report.sources,
          discarded: report.discarded,
          total_raw: report.total_raw,
        },
      })
      .eq("id", jobId);

    // Alimenta o cache comunitário para as próximas buscas do mesmo nicho.
    await shareToCommunity(supabase, opts, report.leads);
  } catch (error) {
    console.error(`[Job ${jobId}] falhou:`, error);
    await supabase
      .from("background_jobs")
      .update({
        status: "failed",
        error_message: error instanceof Error ? error.message : "Erro desconhecido",
        completed_at: new Date().toISOString(),
      })
      .eq("id", jobId);
  }
}

function normalizeKey(value: string): string {
  return value.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

async function shareToCommunity(
  supabase: SupabaseClient,
  opts: EngineOptions,
  leads: ScoredLead[],
): Promise<void> {
  if (leads.length === 0) return;

  try {
    const rows = leads.slice(0, 200).map((l) => ({
      business_name: l.business_name,
      phone: l.phone,
      address: l.address ?? null,
      website: l.website ?? null,
      rating: l.rating ?? null,
      reviews_count: l.reviews_count ?? null,
      google_maps_url: l.google_maps_url ?? null,
      niche: opts.niche,
      location: opts.location,
      niche_normalized: normalizeKey(opts.niche),
      location_normalized: normalizeKey(opts.location),
    }));

    await supabase.from("community_leads").upsert(rows, {
      onConflict: "phone,niche_normalized,location_normalized",
      ignoreDuplicates: true,
    });
  } catch (e) {
    // Cache é otimização; falhar aqui não pode derrubar a captura.
    console.error("[engine] não foi possível alimentar o cache comunitário:", e);
  }
}

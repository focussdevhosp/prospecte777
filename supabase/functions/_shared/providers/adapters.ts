// ============================================================
// ADAPTADORES DE FONTE
// ============================================================
// As funções de captura em `_shared/sources.ts` funcionam e estão testadas.
// Não há motivo para reescrevê-las: aqui elas apenas ganham o contrato
// comum, para que o registry possa tratá-las como intercambiáveis.
//
// Cada adaptador é fino de propósito. Toda a lógica de rede continua onde
// sempre esteve.

import {
  searchDuckDuckGo, searchOpenStreetMap, searchSerpApi, searchSerper,
} from "../sources.ts";
import { normalizeBusiness } from "./entity-resolution.ts";
import type {
  LeadProvider, NormalizedBusiness, ProviderHealth, ProviderResult,
  RawBusiness, SearchQuery,
} from "./types.ts";

function env(name: string): string | null {
  try {
    // deno-lint-ignore no-explicit-any
    const v = (globalThis as any).Deno?.env?.get(name);
    return v && String(v).length > 0 ? String(v) : null;
  } catch {
    return null;
  }
}

/** Separa "Itu - SP" em cidade e UF, para o merge poder comparar cidade. */
function splitLocation(location: string): { city: string | null; state: string | null } {
  const parts = location.split(/[-,/]/).map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { city: null, state: null };

  const last = parts[parts.length - 1];
  if (parts.length > 1 && /^[A-Za-z]{2}$/.test(last)) {
    return { city: parts.slice(0, -1).join(" ").trim(), state: last.toUpperCase() };
  }
  return { city: parts[0], state: null };
}

// ------------------------------------------------------------
// OPENSTREETMAP
// ------------------------------------------------------------

export class OpenStreetMapProvider implements LeadProvider {
  readonly id = "openstreetmap";
  readonly label = "Cadastro público de estabelecimentos";
  readonly capabilities = ["search", "geo", "contact"] as const satisfies readonly string[] as never;
  // Prioridade 10: roda primeiro porque é cadastro estruturado. O telefone
  // vem de campo próprio, não de texto — no merge, ele é o que fica.
  readonly priority = 10;
  readonly timeoutMs = 35_000;

  healthCheck(): Promise<{ status: ProviderHealth; detail?: string }> {
    // Não exige chave; a indisponibilidade real aparece na execução e é
    // tratada pelo disjuntor do registry.
    return Promise.resolve({ status: "healthy" });
  }

  async search(query: SearchQuery): Promise<ProviderResult> {
    const startedAt = Date.now();
    const result = await searchOpenStreetMap(
      query.term,
      query.location,
      query.limit,
      query.centro,
    );
    const { city, state } = splitLocation(query.location);

    return {
      providerId: this.id,
      businesses: result.leads.map((lead) => ({
        name: lead.business_name,
        phone: lead.phone,
        website: lead.website ?? null,
        email: lead.email ?? null,
        address: lead.address ?? null,
        city, state,
        latitude: lead.latitude ?? null,
        longitude: lead.longitude ?? null,
        category: lead.subtype ?? null,
        mapsUrl: lead.google_maps_url ?? null,
      })),
      error: result.error,
      durationMs: Date.now() - startedAt,
    };
  }

  normalize(raw: RawBusiness): NormalizedBusiness {
    return normalizeBusiness(raw, this.id);
  }
}

// ------------------------------------------------------------
// SERPER (Google Places)
// ------------------------------------------------------------

export class SerperProvider implements LeadProvider {
  readonly id = "serper";
  readonly label = "Diretório comercial premium";
  readonly capabilities = ["search", "geo", "contact", "reviews"] as never;
  readonly priority = 20;
  readonly timeoutMs = 25_000;

  constructor(private apiKey: string | null) {}

  healthCheck(): Promise<{ status: ProviderHealth; detail?: string }> {
    return Promise.resolve(
      this.apiKey
        ? { status: "healthy" }
        : { status: "not_configured", detail: "sem chave configurada nesta conta" },
    );
  }

  async search(query: SearchQuery): Promise<ProviderResult> {
    const startedAt = Date.now();
    if (!this.apiKey) {
      return { providerId: this.id, businesses: [], error: "sem chave", durationMs: 0 };
    }

    const result = await searchSerper(this.apiKey, query.term, query.location);
    const { city, state } = splitLocation(query.location);

    return {
      providerId: this.id,
      businesses: result.leads.map((lead) => ({
        name: lead.business_name,
        phone: lead.phone,
        website: lead.website ?? null,
        address: lead.address ?? null,
        city, state,
        latitude: lead.latitude ?? null,
        longitude: lead.longitude ?? null,
        rating: lead.rating ?? null,
        reviewsCount: lead.reviews_count ?? null,
        category: lead.subtype ?? null,
        externalId: lead.place_id ?? null,
      })),
      error: result.error,
      durationMs: Date.now() - startedAt,
    };
  }

  normalize(raw: RawBusiness): NormalizedBusiness {
    return normalizeBusiness(raw, this.id);
  }
}

// ------------------------------------------------------------
// SERPAPI (Google Maps)
// ------------------------------------------------------------

export class SerpApiProvider implements LeadProvider {
  readonly id = "serpapi";
  readonly label = "Diretório de mapas";
  readonly capabilities = ["search", "contact", "reviews"] as never;
  readonly priority = 25;
  readonly timeoutMs = 30_000;

  constructor(private apiKey: string | null) {}

  healthCheck(): Promise<{ status: ProviderHealth; detail?: string }> {
    return Promise.resolve(
      this.apiKey
        ? { status: "healthy" }
        : { status: "not_configured", detail: "sem chave configurada nesta conta" },
    );
  }

  async search(query: SearchQuery): Promise<ProviderResult> {
    const startedAt = Date.now();
    if (!this.apiKey) {
      return { providerId: this.id, businesses: [], error: "sem chave", durationMs: 0 };
    }

    const result = await searchSerpApi(this.apiKey, query.term, query.location);
    const { city, state } = splitLocation(query.location);

    return {
      providerId: this.id,
      businesses: result.leads.map((lead) => ({
        name: lead.business_name,
        phone: lead.phone,
        website: lead.website ?? null,
        address: lead.address ?? null,
        city, state,
        rating: lead.rating ?? null,
        reviewsCount: lead.reviews_count ?? null,
        category: lead.subtype ?? null,
        externalId: lead.place_id ?? null,
        mapsUrl: lead.google_maps_url ?? null,
      })),
      error: result.error,
      durationMs: Date.now() - startedAt,
    };
  }

  normalize(raw: RawBusiness): NormalizedBusiness {
    return normalizeBusiness(raw, this.id);
  }
}

// ------------------------------------------------------------
// BUSCA WEB
// ------------------------------------------------------------

/**
 * Complemento de última linha. Pega negócio que não está em cadastro nenhum,
 * mas extrai o telefone de texto livre — por isso tem o menor peso no merge
 * e a maior prioridade numérica (roda por último).
 */
export class WebSearchProvider implements LeadProvider {
  readonly id = "duckduckgo";
  readonly label = "Busca aberta na web";
  readonly capabilities = ["search", "contact"] as never;
  readonly priority = 90;
  readonly timeoutMs = 25_000;

  healthCheck(): Promise<{ status: ProviderHealth; detail?: string }> {
    return Promise.resolve({
      status: "degraded",
      detail: "fonte de texto livre: dado menos confiável, usada como complemento",
    });
  }

  async search(query: SearchQuery): Promise<ProviderResult> {
    const startedAt = Date.now();
    const { city, state } = splitLocation(query.location);

    // As variações vêm da expansão de consulta. Sem elas, busca só o termo.
    const terms = [query.term, ...(query.variants ?? [])].slice(0, 4);
    const businesses: RawBusiness[] = [];
    const errors: string[] = [];

    for (const term of terms) {
      const result = await searchDuckDuckGo(term, query.location);
      if (result.error) errors.push(`${term}: ${result.error}`);

      for (const lead of result.leads) {
        businesses.push({
          name: lead.business_name,
          phone: lead.phone,
          website: lead.website ?? null,
          address: lead.address ?? null,
          city, state,
          category: lead.subtype ?? null,
        });
      }

      // Educação com a fonte. Sem isto a raspagem vira rajada.
      await new Promise((r) => setTimeout(r, 250));
    }

    return {
      providerId: this.id,
      businesses,
      error: errors.length === terms.length ? errors.join(" | ") : undefined,
      durationMs: Date.now() - startedAt,
    };
  }

  normalize(raw: RawBusiness): NormalizedBusiness {
    return normalizeBusiness(raw, this.id);
  }
}

// ------------------------------------------------------------
// WORKER EXTERNO DE MAPAS
// ------------------------------------------------------------

/**
 * Adaptador para um worker externo de extração de mapas (por exemplo o
 * omkarcloud/google-maps-scraper, que é MIT mas roda em Python).
 *
 * Fica desligado até o operador publicar o worker e apontar
 * `MAPS_WORKER_URL`. Enquanto isso responde `not_configured` e o registry
 * simplesmente o ignora — nada quebra, e nenhuma empresa fictícia aparece
 * para tapar o buraco.
 *
 * A licença MIT autoriza usar o software. Ela não diz nada sobre os termos
 * do serviço de mapas consultado: essa é uma decisão de quem hospeda o
 * worker. Ver THIRD_PARTY_DATA_PROVIDERS.md.
 */
export class MapsWorkerProvider implements LeadProvider {
  readonly id = "maps_worker";
  readonly label = "Extração estruturada de mapas";
  readonly capabilities = ["search", "geo", "contact", "reviews", "hours", "photos"] as never;
  readonly priority = 15;
  readonly timeoutMs = 60_000;

  private url = env("MAPS_WORKER_URL");
  private token = env("MAPS_WORKER_TOKEN");

  healthCheck(): Promise<{ status: ProviderHealth; detail?: string }> {
    return Promise.resolve(
      this.url
        ? { status: "healthy" }
        : { status: "not_configured", detail: "MAPS_WORKER_URL não configurada" },
    );
  }

  async search(query: SearchQuery): Promise<ProviderResult> {
    const startedAt = Date.now();

    if (!this.url) {
      return {
        providerId: this.id,
        businesses: [],
        error: "worker não configurado",
        durationMs: 0,
      };
    }

    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        body: JSON.stringify({
          query: query.term,
          location: query.location,
          limit: query.limit,
        }),
      });

      if (!res.ok) {
        return {
          providerId: this.id,
          businesses: [],
          error: `HTTP ${res.status}`,
          durationMs: Date.now() - startedAt,
        };
      }

      const data = await res.json();
      const rows: Record<string, unknown>[] = Array.isArray(data)
        ? data
        : Array.isArray(data.results) ? data.results : [];

      const { city, state } = splitLocation(query.location);

      return {
        providerId: this.id,
        businesses: rows
          .filter((r) => typeof r.name === "string" && r.name)
          .map((r) => ({
            name: String(r.name),
            phone: str(r.phone) ?? str(r.phone_number),
            website: str(r.website),
            address: str(r.address),
            city: str(r.city) ?? city,
            state: str(r.state) ?? state,
            postalCode: str(r.postal_code) ?? str(r.zipcode),
            latitude: num(r.latitude) ?? num(r.lat),
            longitude: num(r.longitude) ?? num(r.lng) ?? num(r.lon),
            category: str(r.category) ?? str(r.main_category),
            description: str(r.description),
            rating: num(r.rating),
            reviewsCount: num(r.reviews) ?? num(r.review_count),
            openingHours: str(r.hours) ?? str(r.opening_hours),
            photoUrl: str(r.photo) ?? str(r.thumbnail),
            externalId: str(r.place_id) ?? str(r.id),
            mapsUrl: str(r.link) ?? str(r.url),
          })),
        durationMs: Date.now() - startedAt,
      };
    } catch (e) {
      return {
        providerId: this.id,
        businesses: [],
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - startedAt,
      };
    }
  }

  normalize(raw: RawBusiness): NormalizedBusiness {
    return normalizeBusiness(raw, this.id);
  }
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

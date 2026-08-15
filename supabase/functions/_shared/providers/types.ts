// ============================================================
// CONTRATO DE FONTE DE EMPRESAS
// ============================================================
// Hoje a captura conhece cada fonte pelo nome: o motor chama
// `searchOpenStreetMap`, depois `searchSerper`, depois um laço de
// DuckDuckGo, cada uma com assinatura própria. Acrescentar a quarta fonte
// significa mexer no motor; e quando uma cai, quem decide o que fazer é um
// `if` escrito à mão.
//
// Aqui a fonte vira um plugin com contrato fixo. O resto do sistema não
// sabe se por trás existe uma API paga, um cadastro público ou um worker
// externo — para ele existe apenas "uma fonte que devolve empresas".

/**
 * Campo com procedência. Duas fontes discordam o tempo todo sobre telefone
 * e endereço; guardar de onde veio cada valor é o que permite decidir em
 * quem acreditar em vez de deixar a última fonte sobrescrever a primeira.
 */
export interface SourcedField<T = string> {
  value: T;
  source: string;
  confidence: number;
  updatedAt: string;
}

/** Empresa como cada fonte devolve, antes de normalizar. */
export interface RawBusiness {
  name: string;
  phone?: string | null;
  website?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  category?: string | null;
  description?: string | null;
  rating?: number | null;
  reviewsCount?: number | null;
  openingHours?: string | null;
  photoUrl?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  /** Identificador da própria fonte (place_id, osm id...). Ouro para dedup. */
  externalId?: string | null;
  mapsUrl?: string | null;
}

/** Empresa depois de normalizada e consolidada entre fontes. */
export interface NormalizedBusiness {
  /** Chave estável derivada dos dados. Ver `fingerprint()`. */
  fingerprint: string;
  name: string;
  /** Telefone em E.164 (55DDNNNNNNNNN) ou null. */
  phone: string | null;
  website: string | null;
  domain: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  category: string | null;
  description: string | null;
  rating: number | null;
  reviewsCount: number | null;
  openingHours: string | null;
  photoUrl: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  mapsUrl: string | null;
  externalIds: Record<string, string>;
  /** Procedência campo a campo: `provenance.phone = "openstreetmap"`. */
  provenance: Record<string, string>;
  /** Todas as fontes que viram esta empresa. Mais fontes, mais confiança. */
  sources: string[];
}

export interface SearchQuery {
  /** O que procurar: "clínicas de estética". */
  term: string;
  /** Onde: "Itu - SP". */
  location: string;
  limit: number;
  /** Variações semânticas geradas pela expansão de consulta. */
  variants?: string[];
  /**
   * Ponto e raio, quando a busca é "perto de mim".
   *
   * Só o cadastro de estabelecimentos (OpenStreetMap) sabe usar: as outras
   * fontes procuram por TEXTO e não têm como receber um raio. Elas seguem
   * com `location`, que continua sendo o nome legível do lugar.
   */
  centro?: { lat: number; lng: number; raioKm: number } | null;
}

export interface ProviderResult {
  providerId: string;
  businesses: RawBusiness[];
  /** Falha isolada: a fonte caiu, as outras seguem. */
  error?: string;
  durationMs: number;
}

export type ProviderCapability =
  | "search"          // busca por termo + localização
  | "details"         // detalhes de uma empresa específica
  | "geo"             // devolve coordenadas
  | "contact"         // devolve telefone/e-mail
  | "reviews"         // devolve avaliação e contagem
  | "photos"
  | "hours";

export type ProviderHealth = "healthy" | "degraded" | "offline" | "not_configured";

/**
 * O contrato. `getDetails` é opcional porque nem toda fonte tem o conceito
 * de "abrir um registro" — forçar todas a implementar geraria método vazio,
 * que é pior que método ausente.
 */
export interface LeadProvider {
  readonly id: string;
  readonly label: string;
  readonly capabilities: ProviderCapability[];
  /** Menor roda primeiro. Fonte estruturada deve vir antes de texto livre. */
  readonly priority: number;
  readonly timeoutMs: number;

  /** A fonte está utilizável agora? Checa configuração, não faz rede pesada. */
  healthCheck(): Promise<{ status: ProviderHealth; detail?: string }>;

  search(query: SearchQuery): Promise<ProviderResult>;

  getDetails?(externalId: string): Promise<RawBusiness | null>;

  /** Converte o formato cru da fonte para o contrato comum. */
  normalize(raw: RawBusiness): NormalizedBusiness;
}

/** Estado operacional guardado no banco, por provider. */
export interface ProviderState {
  provider_id: string;
  enabled: boolean;
  health: ProviderHealth;
  priority: number;
  consecutive_failures: number;
  /** Enquanto o disjuntor está aberto, a fonte é pulada. */
  circuit_open_until: string | null;
  last_run_at: string | null;
  last_error: string | null;
  total_runs: number;
  total_found: number;
  total_unique: number;
  avg_latency_ms: number;
}

/** Orçamento técnico de uma busca. Fonte grátis também consome tempo. */
export interface SearchBudget {
  maxProviders: number;
  maxDurationMs: number;
  maxResults: number;
  maxRetries: number;
}

export const DEFAULT_BUDGET: SearchBudget = {
  maxProviders: 6,
  maxDurationMs: 90_000,
  maxResults: 500,
  maxRetries: 1,
};

/** Relatório interno da busca. O usuário vê só o número de empresas únicas. */
export interface SearchReport {
  query: SearchQuery;
  providers: {
    id: string;
    found: number;
    unique: number;
    durationMs: number;
    error?: string;
    skipped?: string;
  }[];
  totalRaw: number;
  duplicatesMerged: number;
  ambiguousForReview: number;
  unique: number;
  fromCache: number;
  /** Quando a área foi ampliada, o usuário precisa saber. */
  expandedArea?: string;
}

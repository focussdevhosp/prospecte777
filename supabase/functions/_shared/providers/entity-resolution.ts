// ============================================================
// ENTITY RESOLUTION
// ============================================================
// Duas fontes acham a mesma clínica e devolvem:
//
//   Fonte A: "Clínica Bella Estética"   (11) 4013-2200   Rua XV, 100
//   Fonte B: "Bella Estética Clínica"   551140132200     R. Quinze de Novembro, 100
//
// É uma empresa só. Deduplicar por nome não resolve — a ordem das palavras
// muda, o "Ltda" aparece, o acento some. E descartar a duplicata perde
// dado: a fonte A tinha o endereço por extenso, a B tinha o telefone já
// normalizado.
//
// Aqui a decisão é por evidência combinada, com nota de 0 a 100, e o
// resultado é a UNIÃO dos melhores campos — cada um sabendo de onde veio.

import type { NormalizedBusiness, RawBusiness } from "./types.ts";

// ------------------------------------------------------------
// NORMALIZAÇÃO
// ------------------------------------------------------------

export function stripAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Sufixos societários e palavras de categoria não identificam a empresa. */
const NOISE_WORDS = new Set([
  "ltda", "me", "epp", "eireli", "sa", "s", "a", "cia", "e",
  "de", "da", "do", "das", "dos", "e",
  "clinica", "consultorio", "centro", "espaco", "studio", "estudio",
  "loja", "casa", "grupo", "instituto", "escritorio", "empresa",
]);

export function normalizeName(name: string): string {
  return stripAccents(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !NOISE_WORDS.has(w))
    .join(" ")
    .trim();
}

/** Conjunto de palavras significativas — a ordem não importa para identidade. */
function nameTokens(name: string): Set<string> {
  return new Set(normalizeName(name).split(" ").filter(Boolean));
}

/**
 * Telefone brasileiro em E.164. Reaproveita a mesma regra do resto do
 * produto: 55 + DDD (11-99) + 8 ou 9 dígitos.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = String(raw).replace(/\D/g, "");
  if (digits.length > 11 && digits.startsWith("0")) digits = digits.replace(/^0+/, "");
  if (!digits.startsWith("55") && digits.length >= 10 && digits.length <= 11) {
    digits = "55" + digits;
  }
  if (!/^55\d{10,11}$/.test(digits)) return null;

  const ddd = Number(digits.slice(2, 4));
  if (ddd < 11 || ddd > 99) return null;

  return digits;
}

/** Domínio sem www nem caminho. Duas URLs do mesmo site viram a mesma chave. */
export function normalizeDomain(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const trimmed = String(raw).trim();
  if (!trimmed) return null;

  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    // Perfil de rede social não identifica o site da empresa: várias
    // empresas diferentes têm "instagram.com" como "site".
    if (/^(facebook|instagram|linkedin|twitter|x|tiktok|linktr)\./.test(host)) return null;
    return host || null;
  } catch {
    return null;
  }
}

export function normalizeAddress(raw: string | null | undefined): string | null {
  if (!raw) return null;

  const expanded = stripAccents(String(raw))
    .toLowerCase()
    .replace(/\br\.?\s/g, "rua ")
    .replace(/\bav\.?\s/g, "avenida ")
    .replace(/\bal\.?\s/g, "alameda ")
    .replace(/\btv\.?\s/g, "travessa ")
    .replace(/\bpc\.?\s|\bpça\.?\s|\bpraca\s/g, "praca ")
    .replace(/\bn[º°]?\s*/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return expanded || null;
}

/** Número do logradouro — o que mais distingue vizinhos na mesma rua. */
function streetNumber(address: string | null): string | null {
  if (!address) return null;
  return address.match(/\b(\d{1,6})\b/)?.[1] ?? null;
}

// ------------------------------------------------------------
// FINGERPRINT
// ------------------------------------------------------------

/**
 * Chave estável da empresa, na melhor evidência disponível.
 *
 * Telefone primeiro: é o identificador mais confiável que existe num lead
 * brasileiro e é exatamente o campo pelo qual a abordagem acontece. Sem
 * telefone, domínio. Sem domínio, nome + cidade.
 */
export function fingerprint(business: {
  name: string;
  phone?: string | null;
  domain?: string | null;
  city?: string | null;
}): string {
  const phone = normalizePhone(business.phone);
  if (phone) return `tel:${phone}`;

  const domain = normalizeDomain(business.domain);
  if (domain) return `dom:${domain}`;

  const name = normalizeName(business.name);
  const city = business.city ? normalizeName(business.city) : "";
  return `nm:${name}|${city}`;
}

// ------------------------------------------------------------
// SIMILARIDADE
// ------------------------------------------------------------

/** Jaccard sobre palavras significativas — resistente à ordem. */
function tokenSimilarity(a: string, b: string): number {
  const setA = nameTokens(a);
  const setB = nameTokens(b);
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const token of setA) if (setB.has(token)) shared++;

  return shared / Math.max(setA.size, setB.size);
}

/** Distância em metros entre dois pontos (Haversine). */
function distanceMeters(
  lat1: number, lon1: number, lat2: number, lon2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

export interface DuplicateVerdict {
  /** 0 a 100. */
  confidence: number;
  decision: "merge" | "review" | "distinct";
  reasons: string[];
}

/** Acima disso, funde sem perguntar. */
export const MERGE_THRESHOLD = 75;
/** Entre este e o de cima, fica para conferência humana. */
export const REVIEW_THRESHOLD = 50;

/**
 * Decide se dois registros são a mesma empresa.
 *
 * A evidência é combinada, não hierárquica: telefone igual é quase
 * definitivo, mas dois consultórios numa mesma clínica compartilham
 * telefone e são empresas diferentes. Por isso nome discordante derruba a
 * nota mesmo com telefone batendo.
 */
export function compareBusinesses(
  a: NormalizedBusiness,
  b: NormalizedBusiness,
): DuplicateVerdict {
  const reasons: string[] = [];
  let score = 0;

  // ---- Identificador da mesma fonte: prova direta ----
  for (const [source, id] of Object.entries(a.externalIds)) {
    if (b.externalIds[source] && b.externalIds[source] === id) {
      return {
        confidence: 100,
        decision: "merge",
        reasons: [`mesmo identificador em ${source}`],
      };
    }
  }

  const nameSim = tokenSimilarity(a.name, b.name);

  // ---- Telefone ----
  if (a.phone && b.phone) {
    if (a.phone === b.phone) {
      score += 55;
      reasons.push("mesmo telefone");
    } else {
      // Telefones diferentes é sinal forte de empresas diferentes, mas não
      // conclusivo: filial e matriz aparecem com o mesmo nome e números
      // distintos. Penaliza sem eliminar.
      score -= 25;
      reasons.push("telefones diferentes");
    }
  }

  // ---- Domínio ----
  if (a.domain && b.domain) {
    if (a.domain === b.domain) {
      score += 35;
      reasons.push("mesmo domínio");
    } else {
      score -= 20;
      reasons.push("domínios diferentes");
    }
  }

  // ---- Nome ----
  if (nameSim >= 0.85) {
    score += 30;
    reasons.push("nome praticamente idêntico");
  } else if (nameSim >= 0.6) {
    score += 18;
    reasons.push("nome muito parecido");
  } else if (nameSim >= 0.35) {
    score += 6;
    reasons.push("nome parcialmente parecido");
  } else {
    score -= 20;
    reasons.push("nomes diferentes");
  }

  // ---- Coordenadas ----
  let samePoint = false;
  if (a.latitude != null && a.longitude != null && b.latitude != null && b.longitude != null) {
    const meters = distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
    if (meters <= 60) {
      score += 25;
      samePoint = true;
      reasons.push("mesmo ponto no mapa");
    } else if (meters <= 250) {
      score += 10;
      reasons.push("endereços muito próximos");
    } else if (meters > 2_000) {
      score -= 30;
      reasons.push("locais distantes");
    }
  }

  // ---- Evidências que se reforçam ----
  // As notas acima somam como se cada sinal fosse independente, e não são:
  // nome idêntico NO MESMO ponto do mapa é tão conclusivo quanto telefone
  // igual. Sem este reforço, um registro sem telefone e sem site nunca
  // alcançava o limiar de fusão, e duas cópias da mesma empresa iam parar
  // na fila de conferência humana em vez de virarem uma.
  if (nameSim >= 0.85 && samePoint) {
    score += 20;
    reasons.push("nome idêntico no mesmo endereço");
  }

  // ---- Endereço textual ----
  const addrA = normalizeAddress(a.address);
  const addrB = normalizeAddress(b.address);
  if (addrA && addrB) {
    const addrSim = tokenSimilarity(addrA, addrB);
    const numA = streetNumber(addrA);
    const numB = streetNumber(addrB);

    if (addrSim >= 0.6 && numA && numB && numA === numB) {
      score += 20;
      reasons.push("mesmo endereço e número");
    } else if (addrSim >= 0.6) {
      score += 8;
      reasons.push("mesma rua");
    } else if (numA && numB && numA !== numB && addrSim >= 0.6) {
      score -= 15;
      reasons.push("mesma rua, número diferente");
    }
  }

  // ---- Cidade ----
  if (a.city && b.city) {
    if (normalizeName(a.city) === normalizeName(b.city)) {
      score += 5;
    } else {
      score -= 25;
      reasons.push("cidades diferentes");
    }
  }

  const confidence = Math.max(0, Math.min(100, Math.round(score)));

  // Trava de segurança: nome muito diferente não funde por coincidência de
  // telefone. Duas empresas no mesmo prédio compartilhando a recepção
  // virariam uma só, e o vendedor abordaria a errada.
  if (confidence >= MERGE_THRESHOLD && nameSim < 0.35) {
    return {
      confidence: Math.min(confidence, REVIEW_THRESHOLD + 20),
      decision: "review",
      reasons: [...reasons, "evidência forte, mas os nomes não batem"],
    };
  }

  return {
    confidence,
    decision:
      confidence >= MERGE_THRESHOLD ? "merge"
      : confidence >= REVIEW_THRESHOLD ? "review"
      : "distinct",
    reasons,
  };
}

// ------------------------------------------------------------
// MERGE
// ------------------------------------------------------------

/**
 * Confiança por fonte. Cadastro estruturado vale mais que texto raspado de
 * página de busca — e é isso que decide quem ganha quando duas fontes
 * discordam sobre o telefone.
 */
const SOURCE_WEIGHT: Record<string, number> = {
  google_maps: 0.95,
  serper: 0.9,
  serpapi: 0.9,
  openstreetmap: 0.85,
  cnpj: 0.8,
  instagram: 0.6,
  facebook: 0.6,
  duckduckgo: 0.4,
  import: 0.7,
  manual: 1,
};

function weightOf(source: string): number {
  return SOURCE_WEIGHT[source] ?? 0.5;
}

const MERGEABLE_FIELDS = [
  "phone", "website", "domain", "email", "address", "city", "state",
  "postalCode", "latitude", "longitude", "category", "description",
  "rating", "reviewsCount", "openingHours", "photoUrl",
  "instagramUrl", "facebookUrl", "mapsUrl",
] as const;

/**
 * Combina dois registros da mesma empresa.
 *
 * Campo vazio é sempre preenchido pelo outro. Campo preenchido nos dois só
 * troca se a fonte nova for mais confiável — assim o telefone estruturado
 * do OSM não é sobrescrito por um número raspado de snippet de busca.
 */
export function mergeBusinesses(
  base: NormalizedBusiness,
  incoming: NormalizedBusiness,
): NormalizedBusiness {
  const merged: NormalizedBusiness = {
    ...base,
    externalIds: { ...base.externalIds, ...incoming.externalIds },
    provenance: { ...base.provenance },
    sources: [...new Set([...base.sources, ...incoming.sources])],
  };

  // O nome mais completo costuma ser o mais útil para falar com a pessoa.
  if (incoming.name.length > base.name.length && tokenSimilarity(base.name, incoming.name) >= 0.5) {
    merged.name = incoming.name;
    merged.provenance.name = incoming.provenance.name ?? incoming.sources[0] ?? "desconhecida";
  }

  for (const field of MERGEABLE_FIELDS) {
    const baseValue = base[field];
    const incomingValue = incoming[field];

    if (incomingValue === null || incomingValue === undefined || incomingValue === "") continue;

    if (baseValue === null || baseValue === undefined || baseValue === "") {
      // deno-lint-ignore no-explicit-any
      (merged as any)[field] = incomingValue;
      merged.provenance[field] = incoming.provenance[field] ?? incoming.sources[0] ?? "desconhecida";
      continue;
    }

    const baseSource = base.provenance[field] ?? base.sources[0] ?? "";
    const incomingSource = incoming.provenance[field] ?? incoming.sources[0] ?? "";

    if (weightOf(incomingSource) > weightOf(baseSource)) {
      // deno-lint-ignore no-explicit-any
      (merged as any)[field] = incomingValue;
      merged.provenance[field] = incomingSource;
    }
  }

  // Contagem de avaliações: fica a maior, porque a menor está desatualizada.
  if ((incoming.reviewsCount ?? 0) > (base.reviewsCount ?? 0)) {
    merged.reviewsCount = incoming.reviewsCount;
    merged.rating = incoming.rating ?? merged.rating;
    merged.provenance.reviewsCount = incoming.provenance.reviewsCount ?? incoming.sources[0] ?? "";
  }

  // O fingerprint pode melhorar: registro sem telefone que ganhou telefone
  // passa a ter chave mais forte.
  merged.fingerprint = fingerprint({
    name: merged.name,
    phone: merged.phone,
    domain: merged.domain,
    city: merged.city,
  });

  return merged;
}

// ------------------------------------------------------------
// CONSOLIDAÇÃO
// ------------------------------------------------------------

export interface ResolutionResult {
  businesses: NormalizedBusiness[];
  merged: number;
  /** Pares ambíguos, para conferência humana. Não somem silenciosamente. */
  review: { a: string; b: string; confidence: number; reasons: string[] }[];
}

/**
 * Recebe tudo que as fontes acharam e devolve empresas únicas.
 *
 * O agrupamento por fingerprint resolve a maioria em O(n). A comparação par
 * a par só roda dentro do mesmo balde de cidade — comparar 1.200 registros
 * todos contra todos seria 700 mil comparações para achar as mesmas
 * duplicatas.
 */
export function resolveEntities(input: NormalizedBusiness[]): ResolutionResult {
  const byFingerprint = new Map<string, NormalizedBusiness>();
  const review: ResolutionResult["review"] = [];
  let merged = 0;

  // ---- Passo 1: chave exata ----
  for (const business of input) {
    const existing = byFingerprint.get(business.fingerprint);
    if (existing) {
      byFingerprint.set(business.fingerprint, mergeBusinesses(existing, business));
      merged++;
    } else {
      byFingerprint.set(business.fingerprint, business);
    }
  }

  // ---- Passo 2: comparação por similaridade dentro da cidade ----
  const buckets = new Map<string, NormalizedBusiness[]>();
  for (const business of byFingerprint.values()) {
    const key = business.city ? normalizeName(business.city) : "";
    const bucket = buckets.get(key);
    if (bucket) bucket.push(business);
    else buckets.set(key, [business]);
  }

  const result: NormalizedBusiness[] = [];

  for (const bucket of buckets.values()) {
    const kept: NormalizedBusiness[] = [];

    for (const candidate of bucket) {
      let absorbed = false;

      for (let i = 0; i < kept.length; i++) {
        const verdict = compareBusinesses(kept[i], candidate);

        if (verdict.decision === "merge") {
          kept[i] = mergeBusinesses(kept[i], candidate);
          merged++;
          absorbed = true;
          break;
        }

        if (verdict.decision === "review") {
          review.push({
            a: kept[i].name,
            b: candidate.name,
            confidence: verdict.confidence,
            reasons: verdict.reasons,
          });
        }
      }

      if (!absorbed) kept.push(candidate);
    }

    result.push(...kept);
  }

  return { businesses: result, merged, review };
}

// ------------------------------------------------------------
// NORMALIZAÇÃO DE ENTRADA
// ------------------------------------------------------------

/** Converte o formato cru de uma fonte no contrato comum. */
export function normalizeBusiness(raw: RawBusiness, source: string): NormalizedBusiness {
  const phone = normalizePhone(raw.phone);
  const domain = normalizeDomain(raw.website);

  const provenance: Record<string, string> = {};
  const stamp = (field: string, value: unknown) => {
    if (value !== null && value !== undefined && value !== "") provenance[field] = source;
  };

  stamp("name", raw.name);
  stamp("phone", phone);
  stamp("website", raw.website);
  stamp("domain", domain);
  stamp("email", raw.email);
  stamp("address", raw.address);
  stamp("city", raw.city);
  stamp("state", raw.state);
  stamp("postalCode", raw.postalCode);
  stamp("latitude", raw.latitude);
  stamp("longitude", raw.longitude);
  stamp("category", raw.category);
  stamp("description", raw.description);
  stamp("rating", raw.rating);
  stamp("reviewsCount", raw.reviewsCount);
  stamp("openingHours", raw.openingHours);
  stamp("photoUrl", raw.photoUrl);
  stamp("instagramUrl", raw.instagramUrl);
  stamp("facebookUrl", raw.facebookUrl);
  stamp("mapsUrl", raw.mapsUrl);

  const business: NormalizedBusiness = {
    fingerprint: "",
    name: (raw.name ?? "").trim(),
    phone,
    website: raw.website ?? null,
    domain,
    email: raw.email ?? null,
    address: raw.address ?? null,
    city: raw.city ?? null,
    state: raw.state ?? null,
    postalCode: raw.postalCode ?? null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    category: raw.category ?? null,
    description: raw.description ?? null,
    rating: raw.rating ?? null,
    reviewsCount: raw.reviewsCount ?? null,
    openingHours: raw.openingHours ?? null,
    photoUrl: raw.photoUrl ?? null,
    instagramUrl: raw.instagramUrl ?? null,
    facebookUrl: raw.facebookUrl ?? null,
    mapsUrl: raw.mapsUrl ?? null,
    externalIds: raw.externalId ? { [source]: String(raw.externalId) } : {},
    provenance,
    sources: [source],
  };

  business.fingerprint = fingerprint(business);
  return business;
}

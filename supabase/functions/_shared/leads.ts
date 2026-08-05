// ============================================================
// QUALIDADE DE LEAD
// ============================================================
// O motor antigo pegava o primeiro número que casasse com uma regex de
// telefone dentro do snippet do DuckDuckGo e chamava aquilo de lead. Isso
// trazia CNPJ formatado como telefone, número do concorrente que aparecia
// na mesma página, e principalmente páginas de agregador (iFood, TripAdvisor)
// no lugar do negócio real.
//
// Este módulo é a peneira: valida telefone de verdade, limpa nome, descarta
// agregador, deduplica com tolerância e pontua o que sobrou.

// ------------------------------------------------------------
// TELEFONE
// ------------------------------------------------------------

/** DDDs que existem de fato no Brasil. Fora desta lista, não é telefone. */
const VALID_DDD = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

export type PhoneKind = "mobile" | "landline";

export interface ParsedPhone {
  /** 5511987654321 — pronto para a Evolution API */
  e164: string;
  /** (11) 98765-4321 — para mostrar na tela */
  display: string;
  /** DDD + 8 dígitos finais — chave de deduplicação */
  key: string;
  ddd: number;
  kind: PhoneKind;
}

/**
 * Interpreta um telefone brasileiro em qualquer formato e rejeita o que não
 * for plausível. Devolve null em vez de um palpite: lead com telefone errado
 * custa disparo, queima reputação do chip e polui o funil.
 */
export function parsePhone(raw: string | null | undefined): ParsedPhone | null {
  if (!raw) return null;

  let digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;

  // Zero de operadora/DDD: "011 9999-8888"
  if (digits.length > 11 && digits.startsWith("0")) digits = digits.replace(/^0+/, "");

  // Código do país
  if (digits.length >= 12 && digits.startsWith("55")) digits = digits.slice(2);

  if (digits.length !== 10 && digits.length !== 11) return null;

  const ddd = Number(digits.slice(0, 2));
  if (!VALID_DDD.has(ddd)) return null;

  const subscriber = digits.slice(2);

  let kind: PhoneKind;
  if (subscriber.length === 9) {
    // Celular: sempre começa com 9, e o dígito seguinte é de 6 a 9.
    if (subscriber[0] !== "9") return null;
    if (!/[6-9]/.test(subscriber[1])) return null;
    kind = "mobile";
  } else {
    // Fixo: primeiro dígito de 2 a 5.
    if (!/[2-5]/.test(subscriber[0])) return null;
    kind = "landline";
  }

  // Sequência repetida ("11999999999") é placeholder, não cliente.
  if (/^(\d)\1+$/.test(subscriber)) return null;

  const display = kind === "mobile"
    ? `(${digits.slice(0, 2)}) ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`
    : `(${digits.slice(0, 2)}) ${subscriber.slice(0, 4)}-${subscriber.slice(4)}`;

  return {
    e164: `55${digits}`,
    display,
    key: `${digits.slice(0, 2)}${subscriber.slice(-8)}`,
    ddd,
    kind,
  };
}

/**
 * Extrai o telefone mais provável de um texto solto. Prefere celular —
 * é o que atende no WhatsApp.
 */
export function extractPhone(text: string): ParsedPhone | null {
  if (!text) return null;

  const candidates = text.match(/(?:\+?55\s*)?\(?\d{2}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/g) ?? [];

  let landline: ParsedPhone | null = null;
  for (const candidate of candidates) {
    const parsed = parsePhone(candidate);
    if (!parsed) continue;
    if (parsed.kind === "mobile") return parsed;
    if (!landline) landline = parsed;
  }
  return landline;
}

// ------------------------------------------------------------
// NOME DO NEGÓCIO
// ------------------------------------------------------------

/**
 * Marcas que listam negócios de terceiros. O título de uma página dessas é
 * "Os 10 melhores restaurantes de Curitiba", não o nome de um cliente.
 *
 * Comparamos por rótulo de domínio e não por domínio inteiro: senão
 * `ifood.com` na lista deixa passar `ifood.com.br`, que é justamente o que
 * mais aparece em busca brasileira.
 */
const AGGREGATOR_BRANDS = new Set([
  "ifood", "rappi", "ubereats", "aiqfome", "deliverymuch",
  "tripadvisor", "yelp", "foursquare", "restaurantguru",
  "booking", "airbnb", "expedia", "decolar", "hoteis", "trivago",
  "guiamais", "telelistas", "apontador", "solutudo", "encontrarfacil",
  "hagah", "kekanto", "guiafacil",
  "facebook", "instagram", "linkedin", "twitter", "youtube", "tiktok",
  "pinterest", "whatsapp",
  "olx", "mercadolivre", "elo7", "enjoei", "shopee", "amazon",
  "vivareal", "zapimoveis", "imovelweb", "quintoandar", "chavesnamao",
  "doctoralia", "boaconsulta", "catracalivre",
  "reclameaqui", "consumidor", "jusbrasil",
  "econodata", "casadosdados", "empresascnpj", "cnpj", "consultacnpj",
  "wikipedia", "google", "bing", "duckduckgo", "yahoo",
  "sebrae", "receita", "gov",
  "getninjas", "workana", "99freelas", "profissionaisdobrasil",
]);

/** Sufixos públicos comuns no Brasil — não são o nome da marca. */
const PUBLIC_SUFFIXES = new Set([
  "com", "br", "net", "org", "gov", "edu", "io", "co", "app", "me", "info", "biz",
]);

export function isAggregator(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url.startsWith("http") ? url : `https://${url}`).hostname
      .replace(/^www\./, "")
      .toLowerCase();

    // "ifood.com.br" -> ["ifood"]; "loja.exemplo.com.br" -> ["loja","exemplo"]
    const labels = host.split(".").filter((l) => l && !PUBLIC_SUFFIXES.has(l));
    return labels.some((label) => AGGREGATOR_BRANDS.has(label));
  } catch {
    return false;
  }
}

/** Palavras que denunciam página de listagem em vez de negócio. */
const LISTING_MARKERS = [
  /^os?\s+\d+\s+melhores/i,
  /^as?\s+\d+\s+melhores/i,
  /^top\s+\d+/i,
  /\bmelhores\s+\w+\s+(em|de|no|na)\b/i,
  /\blista\s+de\b/i,
  /\bencontre\b/i,
  /\bguia\s+de\b/i,
  /\bcomo\s+(fazer|escolher|abrir)\b/i,
  /\bo\s+que\s+é\b/i,
  /\bpreços?\s+e\s+avaliações\b/i,
  /\bofertas?\b/i,
  /\bcupom\b/i,
  /\bdelivery\s+de\b/i,
];

export function looksLikeListing(title: string): boolean {
  if (!title) return true;
  return LISTING_MARKERS.some((re) => re.test(title));
}

/** Tira "- iFood", "| Telefone e Endereço", tudo depois da barra. */
export function cleanBusinessName(raw: string): string {
  if (!raw) return "";

  let name = raw
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

  // Corta no primeiro separador — o que vem depois é quase sempre SEO.
  name = name.split(/\s+[|–—]\s+/)[0];
  name = name.replace(/\s+-\s+(iFood|Rappi|TripAdvisor|Facebook|Instagram|Telefone|Endereço|Home|Início).*$/i, "");
  name = name.replace(/\s*[-–—]\s*$/, "");

  // Cauda de SEO no fim do título
  name = name.replace(
    /\s*[-–—,]\s*(telefone|endereço|contato|horário de funcionamento|avaliações|fotos|cardápio|menu|preços?|whatsapp)\s*$/i,
    "",
  );

  return name.trim().slice(0, 120);
}

/** Chave de dedup: ignora acento, caixa, pontuação e sufixo societário. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(ltda|me|epp|eireli|sa|s\/a|cia|comercio|servicos)\b/g, "")
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 40);
}

// ------------------------------------------------------------
// LEAD NORMALIZADO
// ------------------------------------------------------------

export interface RawLead {
  business_name: string;
  phone?: string | null;
  address?: string | null;
  website?: string | null;
  email?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  google_maps_url?: string | null;
  place_id?: string | null;
  type?: string | null;
  subtype?: string | null;
  source?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ScoredLead extends RawLead {
  phone: string;
  phone_display: string;
  phone_kind: PhoneKind;
  dedup_key: string;
  quality_score: number;
  quality_reasons: string[];
}

/**
 * Pontuação de 0 a 100 calculada por regra, não por IA.
 *
 * A IA é boa para escrever a abordagem; para dizer se um registro tem
 * telefone válido e site próprio ela é cara, lenta e não determinística.
 * O score aqui sai igual toda vez e custa zero.
 */
export function scoreLead(lead: RawLead, phone: ParsedPhone): { score: number; reasons: string[] } {
  let score = 40; // piso: já tem nome e telefone válido
  const reasons: string[] = [];

  if (phone.kind === "mobile") {
    score += 20;
    reasons.push("Celular — atende no WhatsApp");
  } else {
    reasons.push("Telefone fixo — pode não ter WhatsApp");
  }

  if (lead.website && !isAggregator(lead.website)) {
    score += 12;
    reasons.push("Site próprio");
  }

  if (lead.email) {
    score += 8;
    reasons.push("E-mail encontrado");
  }

  if (lead.address && lead.address.length > 15) {
    score += 8;
    reasons.push("Endereço completo");
  }

  if (typeof lead.rating === "number" && lead.rating > 0) {
    if (lead.rating >= 4.5) {
      score += 6;
      reasons.push(`Bem avaliado (${lead.rating})`);
    } else if (lead.rating >= 3.5) {
      score += 3;
    } else {
      score -= 4;
      reasons.push(`Avaliação baixa (${lead.rating})`);
    }
  }

  if (typeof lead.reviews_count === "number") {
    if (lead.reviews_count >= 100) {
      score += 6;
      reasons.push("Negócio consolidado");
    } else if (lead.reviews_count >= 20) {
      score += 3;
    }
  }

  // Nome curto demais ou genérico costuma ser extração ruim.
  if (lead.business_name.replace(/\s/g, "").length < 4) {
    score -= 20;
    reasons.push("Nome suspeito");
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

/**
 * Passa a lista bruta pela peneira: valida, limpa, descarta agregador e
 * deduplica. Devolve ordenado por qualidade.
 */
export function refineLeads(raw: RawLead[]): { leads: ScoredLead[]; discarded: Record<string, number> } {
  const byPhone = new Map<string, ScoredLead>();
  const seenNames = new Set<string>();
  const discarded: Record<string, number> = {
    telefone_invalido: 0,
    agregador: 0,
    pagina_de_lista: 0,
    duplicado: 0,
    nome_vazio: 0,
  };

  for (const item of raw) {
    const name = cleanBusinessName(item.business_name ?? "");
    if (!name) {
      discarded.nome_vazio++;
      continue;
    }

    if (looksLikeListing(name)) {
      discarded.pagina_de_lista++;
      continue;
    }

    if (isAggregator(item.website)) {
      discarded.agregador++;
      continue;
    }

    const phone = parsePhone(item.phone);
    if (!phone) {
      discarded.telefone_invalido++;
      continue;
    }

    const nKey = nameKey(name);
    const existing = byPhone.get(phone.key);

    const { score, reasons } = scoreLead({ ...item, business_name: name }, phone);

    const candidate: ScoredLead = {
      ...item,
      business_name: name,
      phone: phone.e164,
      phone_display: phone.display,
      phone_kind: phone.kind,
      dedup_key: phone.key,
      quality_score: score,
      quality_reasons: reasons,
    };

    if (existing) {
      discarded.duplicado++;
      // Mesmo telefone em duas fontes: fica o registro mais completo.
      if (score > existing.quality_score) byPhone.set(phone.key, candidate);
      continue;
    }

    // Mesmo nome com telefone diferente costuma ser filial ou repetição
    // do mesmo negócio em outra página. Mantém o primeiro.
    if (nKey.length >= 6 && seenNames.has(nKey)) {
      discarded.duplicado++;
      continue;
    }

    seenNames.add(nKey);
    byPhone.set(phone.key, candidate);
  }

  const leads = [...byPhone.values()].sort((a, b) => b.quality_score - a.quality_score);
  return { leads, discarded };
}

// ============================================================
// FONTES DE CAPTURA
// ============================================================
// Antes existia uma fonte só: raspagem do HTML do DuckDuckGo com regex.
// Isso quebra sempre que o DDG mexe no layout, e o telefone saía do snippet
// de texto — ou seja, do que a página *fala*, não do cadastro do negócio.
//
// Aqui cada fonte é isolada e falha sozinha. Se uma cair, as outras seguem.

import { RawLead, extractPhone } from "./leads.ts";

export interface SourceResult {
  source: string;
  leads: RawLead[];
  error?: string;
}

/**
 * Como este cliente se apresenta.
 *
 * Era uma string de Chrome — o app fingindo ser um navegador. Isso quebrou a
 * fonte principal: o Overpass responde HTTP 406 para User-Agent de navegador,
 * porque a política dele exige que um programa se identifique como programa.
 * Confirmado na prática: mesma consulta, mesmo IP, 406 com o Chrome falso e
 * 200 com este.
 *
 * Ou seja, o disfarce não era só contra a regra da casa — era o motivo de a
 * captura devolver zero. As duas coisas se resolvem com a verdade.
 */
const UA = "Prospecte777/1.0 (+https://nexaprospect.com.br; contato@nexaprospect.com.br)";

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ------------------------------------------------------------
// OPENSTREETMAP / OVERPASS
// ------------------------------------------------------------
// Fonte primária. É um cadastro de estabelecimentos, não um índice de
// páginas: telefone, site e endereço vêm em campos separados, já do
// negócio certo. Gratuita e sem chave.

/**
 * Nicho digitado pelo usuário -> tags OSM.
 *
 * O campo de nicho é TEXTO LIVRE. A tabela antiga era um mapa com chaves
 * acentuadas e no plural ("clínicas médicas"), comparado com `includes` — e
 * quem digitava "clinica de estetica", sem acento, não casava com nada.
 *
 * O efeito não parecia defeito: a missão rodava inteira, terminava
 * "concluída" e trazia ZERO empresas. Nenhuma mensagem dizia que o nicho não
 * tinha mapeamento, então o usuário concluía que não existem clínicas na
 * cidade dele.
 *
 * Agora: sem acento, sem plural, e por PALAVRA em vez de substring — porque
 * "clinica de estetica" não contém "clinicas medicas" nem vice-versa, mas as
 * duas compartilham "clinica".
 */
interface MapaOsm {
  tags: string[];
  /** Termos que levam a estas tags. Já normalizados: sem acento, singular. */
  termos: string[];
}

const OSM_MAPA: MapaOsm[] = [
  { tags: ['"amenity"="restaurant"', '"amenity"="fast_food"'],
    termos: ["restaurante", "lanchonete", "comida", "alimentacao", "bistro", "churrascaria"] },
  { tags: ['"cuisine"="pizza"'], termos: ["pizzaria", "pizza"] },
  { tags: ['"cuisine"="burger"'], termos: ["hamburgueria", "hamburguer", "burger"] },
  { tags: ['"amenity"="cafe"'], termos: ["cafeteria", "cafe", "coffee"] },
  { tags: ['"shop"="bakery"'], termos: ["padaria", "confeitaria", "panificadora"] },
  { tags: ['"shop"="beauty"', '"shop"="hairdresser"', '"shop"="cosmetics"'],
    termos: ["estetica", "beleza", "salao", "cabeleireiro", "manicure", "depilacao",
             "sobrancelha", "cilios", "spa", "unha"] },
  { tags: ['"shop"="hairdresser"'], termos: ["barbearia", "barbeiro"] },
  { tags: ['"leisure"="fitness_centre"', '"leisure"="sports_centre"'],
    termos: ["academia", "fitness", "musculacao", "crossfit", "pilates", "ginastica"] },
  { tags: ['"amenity"="clinic"', '"amenity"="doctors"', '"healthcare"="clinic"'],
    termos: ["clinica", "medico", "medica", "saude", "consultorio", "dermatologia",
             "fisioterapia", "psicologia", "nutricao"] },
  { tags: ['"amenity"="dentist"'], termos: ["odontologia", "odontologica", "dentista", "dental"] },
  // "petshop" junto entra como termo próprio: a busca é por palavra inteira,
  // então "pet" não alcança quem escreve tudo emendado — e emendado é como a
  // maioria escreve.
  { tags: ['"amenity"="veterinary"', '"shop"="pet"'],
    termos: ["veterinaria", "veterinario", "petshop", "pet"] },
  { tags: ['"amenity"="pharmacy"'], termos: ["farmacia", "drogaria"] },
  { tags: ['"shop"="optician"'], termos: ["otica", "oculos"] },
  { tags: ['"shop"="car_repair"'], termos: ["oficina", "mecanica", "automotivo", "funilaria"] },
  { tags: ['"shop"="car"'], termos: ["concessionaria", "revenda", "veiculo", "automovel"] },
  { tags: ['"office"="estate_agent"'], termos: ["imobiliaria", "imovel", "corretor"] },
  { tags: ['"office"="lawyer"'], termos: ["advocacia", "advogado", "juridico"] },
  { tags: ['"office"="accountant"'], termos: ["contabilidade", "contador", "contabil"] },
  { tags: ['"office"="architect"'], termos: ["arquitetura", "arquiteto"] },
  { tags: ['"office"="company"', '"office"="it"'],
    termos: ["agencia", "marketing", "publicidade", "software", "tecnologia", "consultoria"] },
  { tags: ['"tourism"="hotel"', '"tourism"="guest_house"'],
    termos: ["hotel", "pousada", "hospedagem", "motel"] },
  { tags: ['"shop"="clothes"'], termos: ["roupa", "vestuario", "boutique", "moda"] },
  { tags: ['"shop"="shoes"'], termos: ["calcado", "sapato", "sapataria"] },
  { tags: ['"shop"="jewelry"'], termos: ["joalheria", "joia", "semijoia"] },
  { tags: ['"amenity"="school"', '"amenity"="language_school"', '"amenity"="college"'],
    termos: ["escola", "curso", "colegio", "faculdade", "ensino", "idioma", "creche"] },
  { tags: ['"amenity"="driving_school"'], termos: ["autoescola", "cnh", "habilitacao"] },
  { tags: ['"shop"="florist"'], termos: ["floricultura", "flor"] },
  { tags: ['"shop"="tattoo"'], termos: ["tatuagem", "tattoo", "piercing"] },
  { tags: ['"shop"="supermarket"', '"shop"="convenience"'],
    termos: ["supermercado", "mercado", "mercearia", "hortifruti"] },
  { tags: ['"shop"="hardware"', '"shop"="doityourself"'],
    termos: ["material de construcao", "ferragem", "construcao"] },
  { tags: ['"shop"="furniture"'], termos: ["movel", "moveleira", "decoracao"] },
  { tags: ['"shop"="laundry"', '"shop"="dry_cleaning"'], termos: ["lavanderia", "lavagem"] },
  { tags: ['"amenity"="bar"', '"amenity"="pub"'], termos: ["bar", "pub", "adega", "distribuidora"] },
  { tags: ['"shop"="bicycle"'], termos: ["bicicletaria", "bicicleta", "bike"] },
  { tags: ['"shop"="mobile_phone"', '"shop"="electronics"'],
    termos: ["celular", "eletronico", "informatica"] },
];

/** Tira acento, deixa minúsculo e remove pontuação. */
export function normalizarTermo(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function semPlural(palavra: string): string {
  if (palavra.length > 4 && palavra.endsWith("s")) return palavra.slice(0, -1);
  return palavra;
}

/**
 * Devolve as tags OSM de um nicho, ou lista vazia quando não conhece.
 *
 * Lista vazia NÃO é silêncio: quem chama transforma isso numa mensagem
 * explícita, porque "não sei procurar esse nicho" e "não existe ninguém
 * nesse nicho aqui" são coisas muito diferentes para quem está esperando.
 */
export function osmTagsFor(niche: string): string[] {
  const palavras = normalizarTermo(niche).split(" ").map(semPlural).filter((p) => p.length >= 3);
  if (palavras.length === 0) return [];

  let melhor: { tags: string[]; acertos: number } | null = null;

  for (const entrada of OSM_MAPA) {
    let acertos = 0;

    for (const termo of entrada.termos) {
      const partes = termo.split(" ").map(semPlural).filter((p) => p.length >= 3);
      if (partes.length === 0) continue;

      // Termo de uma palavra: basta ela aparecer. Termo composto
      // ("material de construcao") exige todas as partes relevantes.
      const bateu = partes.every((p) => palavras.includes(p));
      if (bateu) acertos += partes.length;
    }

    if (acertos > 0 && (!melhor || acertos > melhor.acertos)) {
      melhor = { tags: entrada.tags, acertos };
    }
  }

  return melhor?.tags ?? [];
}

/**
 * Separa "Itu - SP" em cidade e estado.
 *
 * Existe porque o texto livre ia inteiro para o Nominatim e ele casava com
 * uma RUA: "Itu - SP, Brasil" devolvia "Estrada Velha de Indaiatuba e Itu,
 * Campinas" — uma via de 200 metros, a 100 km da cidade certa. Toda busca
 * dentro daquela caixa voltava vazia, e nada indicava o motivo.
 */
export function separarLocal(location: string): { cidade: string; estado: string | null } {
  const bruto = location.trim();
  const m = bruto.match(/^(.+?)\s*[-/,]\s*([A-Za-z]{2})$/);
  if (m) return { cidade: m[1].trim(), estado: m[2].toUpperCase() };
  return { cidade: bruto, estado: null };
}

/**
 * Resolve "Itu - SP" -> bounding box da CIDADE.
 *
 * Duas defesas contra o erro anterior:
 *   1. consulta estruturada (`city=` + `state=`), que o Nominatim resolve
 *      contra limites administrativos em vez de qualquer texto parecido;
 *   2. recusa resultado que não seja lugar — uma `highway` nunca é a cidade.
 */
async function geocode(location: string): Promise<[number, number, number, number] | null> {
  const { cidade, estado } = separarLocal(location);

  const tentativas = [
    `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(cidade)}` +
      (estado ? `&state=${encodeURIComponent(estado)}` : "") +
      `&country=Brasil&format=json&limit=1`,
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(cidade + ", Brasil")}` +
      `&format=json&limit=5&countrycodes=br&featureType=city`,
  ];

  for (const url of tentativas) {
    try {
      const res = await fetchWithTimeout(url, {
        headers: { "User-Agent": UA },
      }, 15000);

      if (!res.ok) continue;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) continue;

      // Só aceita limite administrativo ou lugar. `highway`, `building` e
      // afins sao o resultado errado com cara de certo.
      const lugar = data.find((d: Record<string, unknown>) =>
        d.class === "boundary" || d.class === "place"
      );
      if (!lugar) continue;

      const bb = (lugar.boundingbox as string[] | undefined)?.map(Number);
      if (!bb || bb.length !== 4 || bb.some((n: number) => !Number.isFinite(n))) continue;

      // Nominatim devolve [sul, norte, oeste, leste]; Overpass quer o mesmo.
      return [bb[0], bb[2], bb[1], bb[3]];
    } catch (e) {
      console.error("[osm] geocode falhou:", e);
    }
  }

  return null;
}

export async function searchOpenStreetMap(
  niche: string,
  location: string,
  limit = 200,
): Promise<SourceResult> {
  const tags = osmTagsFor(niche);
  if (tags.length === 0) {
    return { source: "openstreetmap", leads: [], error: "nicho sem mapeamento OSM" };
  }

  const bbox = await geocode(location);
  if (!bbox) {
    return { source: "openstreetmap", leads: [], error: "não foi possível localizar a cidade" };
  }

  const box = bbox.join(",");
  // Só queremos quem tem telefone cadastrado — sem telefone não há prospecção.
  const clauses = tags.flatMap((tag) => [
    `node[${tag}]["phone"](${box});`,
    `way[${tag}]["phone"](${box});`,
    `node[${tag}]["contact:phone"](${box});`,
    `way[${tag}]["contact:phone"](${box});`,
  ]).join("\n  ");

  const query = `[out:json][timeout:25];\n(\n  ${clauses}\n);\nout center ${limit};`;

  try {
    const res = await fetchWithTimeout("https://overpass-api.de/api/interpreter", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": UA },
      body: `data=${encodeURIComponent(query)}`,
    }, 30000);

    if (!res.ok) {
      return { source: "openstreetmap", leads: [], error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    const leads: RawLead[] = [];

    for (const el of data.elements ?? []) {
      const t = el.tags ?? {};
      const name = t.name || t["name:pt"] || t.operator;
      if (!name) continue;

      const phone = t.phone || t["contact:phone"] || t["contact:mobile"] || t.mobile;
      if (!phone) continue;

      const street = [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", ");
      const address = [street, t["addr:suburb"], t["addr:city"] || location, t["addr:state"]]
        .filter(Boolean).join(" - ");

      leads.push({
        business_name: name,
        phone,
        address: address || null,
        website: t.website || t["contact:website"] || null,
        email: t.email || t["contact:email"] || null,
        latitude: el.lat ?? el.center?.lat ?? null,
        longitude: el.lon ?? el.center?.lon ?? null,
        google_maps_url: (el.lat ?? el.center?.lat)
          ? `https://www.google.com/maps/search/?api=1&query=${el.lat ?? el.center?.lat},${el.lon ?? el.center?.lon}`
          : null,
        subtype: t.cuisine || t.shop || t.amenity || t.office || null,
        source: "openstreetmap",
      });
    }

    return { source: "openstreetmap", leads };
  } catch (e) {
    return {
      source: "openstreetmap",
      leads: [],
      error: e instanceof Error ? e.message : "erro desconhecido",
    };
  }
}

// ------------------------------------------------------------
// DUCKDUCKGO
// ------------------------------------------------------------
// Complemento. Pega negócio que não está no OSM — mas o dado é extraído de
// texto livre, então tudo aqui passa pela peneira de qualidade depois.

export async function searchDuckDuckGo(
  term: string,
  location: string,
): Promise<SourceResult> {
  const query = `${term} em ${location} telefone contato`;

  try {
    const res = await fetchWithTimeout(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=br-pt`,
      { headers: { "User-Agent": UA, Accept: "text/html" } },
      20000,
    );

    if (!res.ok) return { source: "duckduckgo", leads: [], error: `HTTP ${res.status}` };

    const html = await res.text();
    const blocks = html.split('class="result__body"');
    const leads: RawLead[] = [];

    for (let i = 1; i < blocks.length; i++) {
      const block = blocks[i];

      const title = block.match(/class="result__a"[^>]*>([^<]+)</)?.[1]?.trim() ?? "";
      const snippet = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)?.[1]
        ?.replace(/<[^>]+>/g, "").trim() ?? "";

      let link = block.match(/href="([^"]+)"[^>]*class="result__a"/)?.[1] ?? "";
      if (link.includes("uddg=")) {
        link = decodeURIComponent(link.split("uddg=")[1]?.split("&")[0] ?? "");
      }

      if (!title) continue;

      const phone = extractPhone(`${title} ${snippet}`);
      if (!phone) continue;

      leads.push({
        business_name: title,
        phone: phone.e164,
        address: snippet.slice(0, 160) || null,
        website: link || null,
        subtype: term,
        source: "duckduckgo",
      });
    }

    return { source: "duckduckgo", leads };
  } catch (e) {
    return {
      source: "duckduckgo",
      leads: [],
      error: e instanceof Error ? e.message : "erro desconhecido",
    };
  }
}

// ------------------------------------------------------------
// SERPER / SERPAPI (opcionais, se o usuário tiver chave)
// ------------------------------------------------------------

export async function searchSerper(
  apiKey: string,
  term: string,
  location: string,
): Promise<SourceResult> {
  try {
    const res = await fetchWithTimeout("https://google.serper.dev/places", {
      method: "POST",
      headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ q: `${term} em ${location}`, gl: "br", hl: "pt-br" }),
    }, 20000);

    if (!res.ok) return { source: "serper", leads: [], error: `HTTP ${res.status}` };

    const data = await res.json();
    const leads: RawLead[] = (data.places ?? [])
      .filter((p: Record<string, unknown>) => p.phoneNumber)
      .map((p: Record<string, unknown>) => ({
        business_name: String(p.title ?? ""),
        phone: String(p.phoneNumber ?? ""),
        address: (p.address as string) ?? null,
        website: (p.website as string) ?? null,
        rating: typeof p.rating === "number" ? p.rating : null,
        reviews_count: typeof p.ratingCount === "number" ? p.ratingCount : null,
        latitude: typeof p.latitude === "number" ? p.latitude : null,
        longitude: typeof p.longitude === "number" ? p.longitude : null,
        place_id: (p.placeId as string) ?? null,
        subtype: (p.category as string) ?? term,
        source: "serper",
      }));

    return { source: "serper", leads };
  } catch (e) {
    return {
      source: "serper",
      leads: [],
      error: e instanceof Error ? e.message : "erro desconhecido",
    };
  }
}

export async function searchSerpApi(
  apiKey: string,
  term: string,
  location: string,
): Promise<SourceResult> {
  try {
    const url = `https://serpapi.com/search.json?engine=google_maps&type=search` +
      `&q=${encodeURIComponent(`${term} em ${location}`)}&hl=pt-br&gl=br&api_key=${apiKey}`;

    const res = await fetchWithTimeout(url, {}, 25000);
    if (!res.ok) return { source: "serpapi", leads: [], error: `HTTP ${res.status}` };

    const data = await res.json();
    const leads: RawLead[] = (data.local_results ?? [])
      .filter((p: Record<string, unknown>) => p.phone)
      .map((p: Record<string, unknown>) => ({
        business_name: String(p.title ?? ""),
        phone: String(p.phone ?? ""),
        address: (p.address as string) ?? null,
        website: (p.website as string) ?? null,
        rating: typeof p.rating === "number" ? p.rating : null,
        reviews_count: typeof p.reviews === "number" ? p.reviews : null,
        place_id: (p.place_id as string) ?? null,
        google_maps_url: (p.place_id as string)
          ? `https://www.google.com/maps/place/?q=place_id:${p.place_id}`
          : null,
        subtype: (p.type as string) ?? term,
        source: "serpapi",
      }));

    return { source: "serpapi", leads };
  } catch (e) {
    return {
      source: "serpapi",
      leads: [],
      error: e instanceof Error ? e.message : "erro desconhecido",
    };
  }
}

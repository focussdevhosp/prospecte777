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

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

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

/** Nicho do produto -> tags OSM que representam aquele tipo de negócio. */
const OSM_TAGS: Record<string, string[]> = {
  restaurantes: ['"amenity"="restaurant"', '"amenity"="fast_food"'],
  pizzarias: ['"cuisine"="pizza"', '"amenity"="restaurant"'],
  hamburguerias: ['"cuisine"="burger"'],
  cafeterias: ['"amenity"="cafe"'],
  padarias: ['"shop"="bakery"'],
  "salões de beleza": ['"shop"="hairdresser"', '"shop"="beauty"'],
  barbearias: ['"shop"="hairdresser"'],
  academias: ['"leisure"="fitness_centre"', '"leisure"="sports_centre"'],
  "clínicas médicas": ['"amenity"="clinic"', '"amenity"="doctors"'],
  "clínicas odontológicas": ['"amenity"="dentist"'],
  farmácias: ['"amenity"="pharmacy"'],
  "pet shops": ['"shop"="pet"', '"amenity"="veterinary"'],
  "oficinas mecânicas": ['"shop"="car_repair"'],
  imobiliárias: ['"office"="estate_agent"'],
  "escritórios de advocacia": ['"office"="lawyer"'],
  "hotéis e pousadas": ['"tourism"="hotel"', '"tourism"="guest_house"'],
  "lojas de roupas": ['"shop"="clothes"'],
  "escolas e cursos": ['"amenity"="school"', '"amenity"="language_school"'],
  floriculturas: ['"shop"="florist"'],
  "estúdios de tatuagem": ['"shop"="tattoo"'],
  contabilidade: ['"office"="accountant"'],
  supermercados: ['"shop"="supermarket"', '"shop"="convenience"'],
};

function osmTagsFor(niche: string): string[] {
  const key = niche.toLowerCase().trim();
  if (OSM_TAGS[key]) return OSM_TAGS[key];

  // Casamento parcial: "Clínicas Médicas em SP" ainda acha "clínicas médicas".
  for (const [k, v] of Object.entries(OSM_TAGS)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return [];
}

/** Resolve "Curitiba" -> bounding box, via Nominatim. */
async function geocode(location: string): Promise<[number, number, number, number] | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?` +
      `q=${encodeURIComponent(location + ", Brasil")}&format=json&limit=1&countrycodes=br`;

    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": "Prospecte777/1.0 (contato@prospecte.app)" },
    }, 15000);

    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    // Nominatim devolve [sul, norte, oeste, leste]; Overpass quer o mesmo.
    const bb = data[0].boundingbox?.map(Number);
    if (!bb || bb.length !== 4 || bb.some((n: number) => !Number.isFinite(n))) return null;
    return [bb[0], bb[2], bb[1], bb[3]];
  } catch (e) {
    console.error("[osm] geocode falhou:", e);
    return null;
  }
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

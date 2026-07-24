import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface ExtendedSearchResult {
  title: string;
  link: string;
  snippet: string;
  phone?: string;
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
}

const SUBNICHES: Record<string, string[]> = {
  "restaurantes": ["restaurante", "lanchonete", "pizzaria", "hamburgueria", "cafeteria", "padaria", "churrascaria"],
  "salão de beleza": ["salão de beleza", "cabeleireiro", "manicure", "estética", "sobrancelha", "depilação"],
  "academia": ["academia", "crossfit", "pilates", "personal trainer", "estúdio fitness"],
  "clínica": ["clínica médica", "consultório médico", "dermatologista", "fisioterapia", "nutricionista"],
  "dentista": ["dentista", "clínica odontológica", "ortodontista", "implante dentário"],
  "advogado": ["advogado", "escritório de advocacia", "consultoria jurídica"],
  "pet shop": ["pet shop", "banho e tosa", "clínica veterinária"],
  "oficina": ["oficina mecânica", "auto center", "funilaria"],
  "loja": ["loja de roupas", "boutique", "calçados"],
  "imobiliária": ["imobiliária", "corretor de imóveis"],
  "hotel": ["hotel", "pousada", "hospedagem"],
  "escola": ["escola", "curso", "escola de idiomas"],
  "farmácia": ["farmácia", "drogaria"],
  "barbearia": ["barbearia", "barber shop"],
};

function getSearchVariations(niche: string): string[] {
  const nicheLower = niche.toLowerCase().trim();
  for (const [key, variations] of Object.entries(SUBNICHES)) {
    if (nicheLower.includes(key) || key.includes(nicheLower)) return variations;
  }
  for (const [_, variations] of Object.entries(SUBNICHES)) {
    if (variations.some(v => nicheLower.includes(v) || v.includes(nicheLower))) return variations;
  }
  return [niche];
}

function extractPhones(text: string): string[] {
  const phones: string[] = [];
  const patterns = [
    /\+?55\s?\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}/g,
    /\(?\d{2}\)?\s*9?\d{4}[-.\s]?\d{4}/g,
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) phones.push(...matches);
  }
  return phones;
}

function extractEmail(text: string): string | undefined {
  const match = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  return match ? match[0] : undefined;
}

// ── SerpAPI (Google Maps / Google Search) ──────────────
async function searchWithSerpApi(
  query: string,
  location: string,
  numResults: number,
  expandSearch: boolean,
  apiKey: string
): Promise<{ results: ExtendedSearchResult[]; searchInfo: any }> {
  const all: ExtendedSearchResult[] = [];
  const seenPhones = new Set<string>();
  const seenNames = new Set<string>();
  const terms = expandSearch ? getSearchVariations(query) : [query];
  console.log(`SerpAPI: ${terms.length} term(s), location="${location}"`);

  for (const term of terms) {
    if (numResults > 0 && all.length >= numResults) break;

    // Google Maps engine returns rich local results with phone/rating/address
    const url = new URL('https://serpapi.com/search.json');
    url.searchParams.set('engine', 'google_maps');
    url.searchParams.set('q', location ? `${term} ${location}` : term);
    url.searchParams.set('type', 'search');
    url.searchParams.set('hl', 'pt-br');
    url.searchParams.set('google_domain', 'google.com.br');
    url.searchParams.set('api_key', apiKey);

    try {
      const res = await fetch(url.toString());
      if (!res.ok) {
        console.warn(`SerpAPI ${res.status} for "${term}"`);
        continue;
      }
      const data = await res.json();
      const local = data.local_results || data.place_results || [];
      const items = Array.isArray(local) ? local : [local];

      for (const item of items) {
        if (!item) continue;
        const phone = item.phone || '';
        const normalizedPhone = String(phone).replace(/\D/g, '');
        const name = String(item.title || '').trim();
        const nameKey = name.toLowerCase();

        if (!phone && !item.website) continue;
        if (normalizedPhone && seenPhones.has(normalizedPhone)) continue;
        if (nameKey && seenNames.has(nameKey)) continue;
        if (normalizedPhone) seenPhones.add(normalizedPhone);
        if (nameKey) seenNames.add(nameKey);

        all.push({
          title: name || 'Empresa',
          link: item.website || item.link || '',
          website: item.website,
          snippet: item.description || item.address || '',
          phone: phone || undefined,
          rating: typeof item.rating === 'number' ? item.rating : undefined,
          reviews_count: typeof item.reviews === 'number' ? item.reviews : undefined,
          address: item.address,
          google_maps_url: item.link,
          thumbnail: item.thumbnail,
          category: item.type,
          position: all.length + 1,
        });

        if (numResults > 0 && all.length >= numResults) break;
      }
      await new Promise(r => setTimeout(r, 150));
    } catch (e) {
      console.error(`SerpAPI error "${term}":`, e);
    }
  }

  return {
    results: all,
    searchInfo: {
      query, location,
      search_type: 'serpapi_google_maps',
      total_results: all.length,
      search_terms_used: terms.length,
    },
  };
}

// ── DuckDuckGo fallback ──────────────────────────────
async function searchWithDuckDuckGo(
  query: string,
  location: string,
  numResults: number,
  expandSearch: boolean
): Promise<{ results: ExtendedSearchResult[]; searchInfo: any }> {
  const all: ExtendedSearchResult[] = [];
  const seenPhones = new Set<string>();
  const terms = expandSearch ? getSearchVariations(query) : [query];

  for (const term of terms) {
    if (numResults > 0 && all.length >= numResults) break;
    const fullQuery = location ? `${term} ${location} telefone contato` : `${term} telefone contato`;
    try {
      const resp = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(fullQuery)}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
      });
      if (!resp.ok) continue;
      const html = await resp.text();
      const blocks = html.split('class="result__body"');
      for (let i = 1; i < blocks.length; i++) {
        const b = blocks[i];
        const title = (b.match(/class="result__a"[^>]*>([^<]+)</)?.[1] || '').trim();
        const snippetRaw = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)?.[1] || '';
        const snippet = snippetRaw.replace(/<[^>]+>/g, '').trim();
        const phones = extractPhones(`${title} ${snippet}`);
        if (!phones.length) continue;
        const nk = phones[0].replace(/\D/g, '');
        if (seenPhones.has(nk)) continue;
        seenPhones.add(nk);
        all.push({
          title: title || 'Empresa', link: '', snippet,
          phone: phones[0], email: extractEmail(snippet),
          position: all.length + 1,
        });
      }
      await new Promise(r => setTimeout(r, 250));
    } catch (_e) { /* skip */ }
  }

  return { results: all, searchInfo: { query, location, search_type: 'duckduckgo_free', total_results: all.length, search_terms_used: terms.length } };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader! } }
    });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { query, location, num_results = 0, expand_search = true } = await req.json();
    if (!query) {
      return new Response(JSON.stringify({ error: 'Query é obrigatória' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`web-search: query="${query}" loc="${location || 'Brasil'}" expand=${expand_search}`);

    // Prefer SerpAPI (real Google Maps data). Fallback to DuckDuckGo scrape.
    const serpKey = Deno.env.get('SERPAPI_API_KEY');
    let result;
    let apiUsed = 'duckduckgo_free';
    if (serpKey) {
      try {
        result = await searchWithSerpApi(query, location || 'Brasil', num_results, expand_search, serpKey);
        apiUsed = 'serpapi_google_maps';
        if (!result.results.length) {
          console.log('SerpAPI returned 0, falling back to DuckDuckGo');
          result = await searchWithDuckDuckGo(query, location || 'Brasil', num_results, expand_search);
          apiUsed = 'duckduckgo_fallback';
        }
      } catch (e) {
        console.error('SerpAPI failed, falling back:', e);
        result = await searchWithDuckDuckGo(query, location || 'Brasil', num_results, expand_search);
      }
    } else {
      result = await searchWithDuckDuckGo(query, location || 'Brasil', num_results, expand_search);
    }

    console.log(`Found ${result.results.length} results via ${apiUsed}`);

    return new Response(JSON.stringify({
      success: true,
      results: result.results,
      total: result.results.length,
      search_info: { ...result.searchInfo, api_used: apiUsed },
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('Web search error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

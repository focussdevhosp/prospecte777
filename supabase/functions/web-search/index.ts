import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  phone?: string;
  email?: string;
  position: number;
}

interface ExtendedSearchResult extends SearchResult {
  rating?: number;
  reviews_count?: number;
  website?: string;
  address?: string;
  google_maps_url?: string;
  photo_url?: string;
  thumbnail?: string;
  category?: string;
}

// Subniches for expanded search
const SUBNICHES: Record<string, string[]> = {
  "restaurantes": ["restaurante", "restaurantes", "lanchonete", "self-service", "rodízio", "buffet", "churrascaria", "pizzaria", "hamburgueria", "cafeteria", "padaria"],
  "salão de beleza": ["salão de beleza", "cabeleireiro", "manicure", "esmalteria", "estética", "sobrancelha", "depilação", "nail designer"],
  "academia": ["academia", "fitness", "musculação", "crossfit", "pilates", "yoga", "personal trainer", "funcional"],
  "clínica": ["clínica médica", "consultório médico", "centro médico", "dermatologista", "fisioterapia", "psicólogo", "nutricionista"],
  "dentista": ["dentista", "odontologia", "clínica odontológica", "ortodontista", "implante dentário"],
  "advogado": ["advogado", "advocacia", "escritório de advocacia", "consultoria jurídica"],
  "pet shop": ["pet shop", "petshop", "banho e tosa", "clínica veterinária", "veterinário"],
  "oficina": ["oficina mecânica", "mecânica", "auto center", "funilaria", "troca de óleo"],
  "loja": ["loja de roupas", "moda", "boutique", "calçados", "acessórios"],
  "imobiliária": ["imobiliária", "corretor de imóveis", "imóveis"],
  "hotel": ["hotel", "pousada", "hospedagem", "resort"],
  "escola": ["escola", "curso", "escola de idiomas", "escola de música", "reforço escolar"],
  "floricultura": ["floricultura", "flores", "florista", "paisagismo"],
  "farmácia": ["farmácia", "drogaria", "farmácia de manipulação"],
  "barbearia": ["barbearia", "barbeiro", "barber shop"],
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

// Extract phone numbers from text
function extractPhones(text: string): string[] {
  const phones: string[] = [];
  const patterns = [
    /\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/g,
    /\+55\s?\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}/g,
  ];
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) phones.push(...matches);
  }
  return phones;
}

// Extract email from text
function extractEmail(text: string): string | undefined {
  const match = text.match(/[\w.-]+@[\w.-]+\.\w+/);
  return match ? match[0] : undefined;
}

// Extract rating (e.g. "4.5 estrelas", "4,7 de 5", "★ 4.8") and review count from snippet
function extractRatingAndReviews(text: string): { rating?: number; reviews_count?: number } {
  const out: { rating?: number; reviews_count?: number } = {};
  // rating: "4.5", "4,7", possibly followed by "/5" or "de 5" or "estrelas"
  const rMatch = text.match(/(?:★|⭐|nota|avaliação|rating)\s*[:\-]?\s*(\d[.,]\d)|(\d[.,]\d)\s*(?:\/\s*5|de\s*5|estrelas?)/i);
  if (rMatch) {
    const raw = (rMatch[1] || rMatch[2] || '').replace(',', '.');
    const n = parseFloat(raw);
    if (!isNaN(n) && n >= 0 && n <= 5) out.rating = n;
  }
  // reviews: "123 avaliações", "45 reviews", "(87)"
  const revMatch = text.match(/(\d{1,5})\s*(?:avaliaç[õo]es|reviews?|opini[õo]es|coment[aá]rios)/i)
    || text.match(/\((\d{1,5})\)/);
  if (revMatch) {
    const n = parseInt(revMatch[1], 10);
    if (!isNaN(n) && n < 100000) out.reviews_count = n;
  }
  return out;
}

// FREE: Search using DuckDuckGo HTML endpoint (no API key needed)
async function searchWithDuckDuckGo(
  searchQuery: string,
  location: string,
  numResults: number,
  expandSearch: boolean = true
): Promise<{ results: ExtendedSearchResult[]; searchInfo: any }> {
  console.log(`Using DuckDuckGo (FREE) for ${expandSearch ? 'expanded' : 'single'} search...`);

  const allResults: ExtendedSearchResult[] = [];
  const seenPhones = new Set<string>();
  const seenNames = new Set<string>();

  const searchTerms = expandSearch ? getSearchVariations(searchQuery) : [searchQuery];
  console.log(`Search terms: ${searchTerms.slice(0, 5).join(', ')}... (${searchTerms.length} total)`);

  for (const term of searchTerms) {
    if (numResults > 0 && allResults.length >= numResults) break;

    const fullQuery = location ? `${term} ${location} telefone contato` : `${term} telefone contato`;
    console.log(`DDG Searching: "${fullQuery}"`);

    try {
      // Use DuckDuckGo HTML endpoint
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(fullQuery)}`;
      const response = await fetch(ddgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
      });

      if (!response.ok) {
        console.warn(`DDG error for "${term}": ${response.status}`);
        continue;
      }

      const html = await response.text();

      // Parse results from HTML
      const resultBlocks = html.split('class="result__body"');
      
      for (let i = 1; i < resultBlocks.length; i++) {
        const block = resultBlocks[i];
        
        // Extract title
        const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
        const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim() : '';
        
        // Extract URL
        const urlMatch = block.match(/class="result__url"[^>]*>([^<]+)</);
        const linkMatch = block.match(/href="([^"]+)"[^>]*class="result__a"/);
        let link = '';
        if (linkMatch) {
          link = linkMatch[1];
          // DuckDuckGo wraps URLs
          if (link.includes('uddg=')) {
            const decoded = decodeURIComponent(link.split('uddg=')[1]?.split('&')[0] || '');
            link = decoded || link;
          }
        }
        
        // Extract snippet
        const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
        const snippet = snippetMatch 
          ? snippetMatch[1].replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim()
          : '';

        // Extract phone from snippet or title
        const combinedText = `${title} ${snippet}`;
        const phones = extractPhones(combinedText);
        
        if (phones.length > 0) {
          const phone = phones[0];
          const normalizedPhone = phone.replace(/\D/g, '');
          if (seenPhones.has(normalizedPhone)) continue;

          const normalizedName = title.toLowerCase().trim();
          if (normalizedName && seenNames.has(normalizedName)) continue;

          seenPhones.add(normalizedPhone);
          if (normalizedName) seenNames.add(normalizedName);

          const email = extractEmail(combinedText);
          const { rating, reviews_count } = extractRatingAndReviews(combinedText);

          allResults.push({
            title: title || 'Empresa',
            link: link,
            snippet: snippet,
            phone: phone,
            email,
            rating,
            reviews_count,
            position: allResults.length + 1,
            website: link,
            address: snippet.length > 10 ? snippet.substring(0, 100) : undefined,
          });
        }
      }

      // Delay to be respectful
      await new Promise(r => setTimeout(r, 300));
    } catch (error) {
      console.error(`Error searching "${term}":`, error);
      continue;
    }
  }

  // If DuckDuckGo didn't find enough, try Google-like search via alternative
  if (allResults.length < 5) {
    console.log('DDG results low, trying alternative search...');
    try {
      const altQuery = location ? `${searchQuery} ${location} telefone whatsapp` : `${searchQuery} telefone whatsapp`;
      const altResponse = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(altQuery)}&kl=br-pt`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
      });

      if (altResponse.ok) {
        const altHtml = await altResponse.text();
        const altBlocks = altHtml.split('class="result__body"');
        
        for (let i = 1; i < altBlocks.length; i++) {
          const block = altBlocks[i];
          const titleMatch = block.match(/class="result__a"[^>]*>([^<]+)</);
          const title = titleMatch ? titleMatch[1].replace(/&amp;/g, '&').trim() : '';
          
          const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/);
          const snippet = snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim() : '';
          
          const phones = extractPhones(`${title} ${snippet}`);
          if (phones.length > 0) {
            const normalizedPhone = phones[0].replace(/\D/g, '');
            if (!seenPhones.has(normalizedPhone)) {
              seenPhones.add(normalizedPhone);
              allResults.push({
                title: title || 'Empresa',
                link: '',
                snippet,
                phone: phones[0],
                email: extractEmail(snippet),
                position: allResults.length + 1,
              });
            }
          }
        }
      }
    } catch (e) {
      console.error('Alternative search failed:', e);
    }
  }

  console.log(`DuckDuckGo: Found ${allResults.length} unique leads with phone numbers`);

  return {
    results: allResults,
    searchInfo: {
      query: searchQuery,
      location,
      search_type: 'duckduckgo_free',
      total_results: allResults.length,
      search_terms_used: searchTerms.length,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader! } }
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { query, location, num_results = 0, search_type = 'places', expand_search = true } = await req.json();

    if (!query) {
      return new Response(
        JSON.stringify({ error: 'Query é obrigatória' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Web search: query="${query}" location="${location || 'Brasil'}", type: ${search_type}, expand: ${expand_search}`);

    // Use DuckDuckGo (FREE - no API key needed)
    const searchResult = await searchWithDuckDuckGo(query, location || 'Brasil', num_results, expand_search);

    console.log(`Found ${searchResult.results.length} results using DuckDuckGo (FREE)`);

    return new Response(
      JSON.stringify({
        success: true,
        results: searchResult.results,
        total: searchResult.results.length,
        search_info: {
          ...searchResult.searchInfo,
          api_used: 'duckduckgo_free',
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Web search error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

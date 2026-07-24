// One-shot seed: pulls IBGE municipalities and states, upserts into brazil_cities / brazil_states.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. States
    const statesRes = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados");
    const statesData = await statesRes.json();
    const regionMap: Record<string, string> = {
      N: "Norte", NE: "Nordeste", CO: "Centro-Oeste", SE: "Sudeste", S: "Sul",
    };
    const states = statesData.map((s: any) => ({
      code: s.sigla,
      name: s.nome,
      region: regionMap[s.regiao.sigla] || s.regiao.nome,
    }));

    const { error: sErr } = await supabase
      .from("brazil_states")
      .upsert(states, { onConflict: "code" });
    if (sErr) throw new Error(`states: ${sErr.message}`);

    // 2. Municipalities
    const munRes = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/municipios");
    const munData = await munRes.json();

    const cities = munData
      .map((m: any) => {
        const uf =
          m?.microrregiao?.mesorregiao?.UF?.sigla ||
          m?.["regiao-imediata"]?.["regiao-intermediaria"]?.UF?.sigla ||
          m?.municipio?.microrregiao?.mesorregiao?.UF?.sigla ||
          null;
        return uf ? { state_code: uf, name: m.nome, ibge_code: m.id } : null;
      })
      .filter(Boolean);

    // Insert in chunks of 1000
    let inserted = 0;
    const CHUNK = 1000;
    for (let i = 0; i < cities.length; i += CHUNK) {
      const chunk = cities.slice(i, i + CHUNK);
      const { error } = await supabase
        .from("brazil_cities")
        .upsert(chunk, { onConflict: "state_code,name", ignoreDuplicates: true });
      if (error) throw new Error(`cities chunk ${i}: ${error.message}`);
      inserted += chunk.length;
    }

    return json({ ok: true, states: states.length, cities: inserted });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

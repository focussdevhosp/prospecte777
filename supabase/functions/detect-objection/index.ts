import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Unauthorized" }, 401);

    const { message, lead_id } = await req.json();
    if (!message || typeof message !== "string") return json({ error: "message required" }, 400);

    // Fetch active objections (user's + templates)
    const { data: objections } = await supabase
      .from("objection_responses")
      .select("id, category, objection_keywords, objection_example, response_template, angle")
      .or(`user_id.eq.${user.id},is_template.eq.true`)
      .eq("is_active", true);

    if (!objections?.length) return json({ matches: [] });

    // Quick keyword match
    const lower = message.toLowerCase();
    const keywordMatches = objections
      .map((o) => {
        const hits = (o.objection_keywords || []).filter((k: string) => lower.includes(k.toLowerCase())).length;
        return { ...o, score: hits };
      })
      .filter((o) => o.score > 0)
      .sort((a, b) => b.score - a.score);

    if (keywordMatches.length > 0) {
      return json({ matches: keywordMatches.slice(0, 3), method: "keyword" });
    }

    // Fallback: AI semantic classification
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ matches: [] });

    const catalogue = objections
      .map((o, i) => `${i}. [${o.category}] "${o.objection_example}"`)
      .join("\n");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: "Você classifica objeções de vendas. Responda APENAS com o número do índice mais provável (0 se nenhum se aplica), sem texto extra.",
          },
          {
            role: "user",
            content: `Mensagem do lead: "${message}"\n\nObjeções conhecidas:\n${catalogue}\n\nQual índice melhor representa? (só o número, ou -1 se nenhum)`,
          },
        ],
      }),
    });

    if (!aiRes.ok) return json({ matches: [] });
    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content?.trim() || "-1";
    const idx = parseInt(raw.match(/-?\d+/)?.[0] || "-1", 10);

    if (idx >= 0 && idx < objections.length) {
      return json({ matches: [objections[idx]], method: "ai" });
    }

    return json({ matches: [] });
  } catch (e) {
    console.error("detect-objection error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

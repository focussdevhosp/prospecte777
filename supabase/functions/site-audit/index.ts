import {
  checkRateLimit,
  corsHeaders,
  handleCors,
  json,
  rateLimited,
  requirePaidPlan,
  requireUserOrInternal,
} from "../_shared/auth.ts";
import { auditSite } from "../_shared/site-audit.ts";

// ============================================================
// AUDITORIA DE SITE
// ============================================================
// Duas ações:
//   audit_lead  — audita um lead e guarda o resultado nele
//   audit_batch — audita vários de uma vez (usado pelo Radar de
//                 Oportunidades, que prioriza a carteira inteira)
//
// O resultado fica gravado em `leads.site_audit`, então a tela lê sem
// refazer a análise a cada abertura.

const BATCH_CONCURRENCY = 4;
const BATCH_MAX = 40;

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const paywall = await requirePaidPlan(auth.ctx);
  if (paywall) return paywall;

  const supabase = auth.ctx.supabase;

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const action = String(body.action ?? "audit_lead");

    // ------------------------------------------------------------
    // Um lead
    // ------------------------------------------------------------
    if (action === "audit_lead") {
      const leadId = String(body.lead_id ?? "");
      if (!leadId) return json({ error: "lead_id é obrigatório." }, 400);

      if (auth.ctx.kind === "user") {
        const limit = await checkRateLimit(supabase, auth.ctx.userId, "site-audit", 60, 60);
        if (!limit.allowed) return rateLimited(limit.resetIn);
      }

      const query = supabase.from("leads").select("id, business_name, website").eq("id", leadId);
      if (auth.ctx.kind === "user") query.eq("user_id", auth.ctx.userId);

      const { data: lead } = await query.maybeSingle();
      if (!lead) return json({ error: "Lead não encontrado." }, 404);

      const audit = await auditSite(lead.website);

      await supabase
        .from("leads")
        .update({ site_audit: audit, site_audited_at: audit.checked_at })
        .eq("id", leadId);

      return json({ lead_id: leadId, business_name: lead.business_name, audit });
    }

    // ------------------------------------------------------------
    // Vários
    // ------------------------------------------------------------
    if (action === "audit_batch") {
      const requested = Array.isArray(body.lead_ids) ? body.lead_ids.map(String) : [];

      let leadsQuery = supabase
        .from("leads")
        .select("id, business_name, website, site_audited_at");

      if (auth.ctx.kind === "user") {
        leadsQuery = leadsQuery.eq("user_id", auth.ctx.userId);
      } else if (typeof body.user_id === "string") {
        leadsQuery = leadsQuery.eq("user_id", body.user_id);
      } else {
        return json({ error: "user_id é obrigatório em chamada interna." }, 400);
      }

      if (requested.length > 0) {
        leadsQuery = leadsQuery.in("id", requested);
      } else {
        // Sem lista explícita, pega quem nunca foi auditado — é o caso de
        // uso real: acabei de capturar 200 leads, quero saber quais valem.
        leadsQuery = leadsQuery.is("site_audited_at", null);
      }

      const { data: leads } = await leadsQuery.limit(BATCH_MAX);
      if (!leads || leads.length === 0) {
        return json({ audited: 0, results: [], message: "Nenhum lead pendente de auditoria." });
      }

      // Concorrência limitada: auditar 40 sites de uma vez derruba a
      // function por tempo e ainda parece varredura para os servidores.
      const results: Record<string, unknown>[] = [];
      const queue = [...leads];

      const worker = async () => {
        while (queue.length > 0) {
          const lead = queue.shift();
          if (!lead) break;

          try {
            const audit = await auditSite(lead.website);
            await supabase
              .from("leads")
              .update({ site_audit: audit, site_audited_at: audit.checked_at })
              .eq("id", lead.id);

            results.push({
              lead_id: lead.id,
              business_name: lead.business_name,
              score: audit.score,
              findings: audit.findings.length,
              pitch: audit.pitch,
            });
          } catch (e) {
            console.error(`[site-audit] falha em ${lead.id}:`, e);
          }
        }
      };

      await Promise.all(
        Array.from({ length: Math.min(BATCH_CONCURRENCY, leads.length) }, worker),
      );

      // Menor nota primeiro: mais problema no site = mais o que vender.
      results.sort((a, b) => Number(a.score) - Number(b.score));

      return json({ audited: results.length, results });
    }

    return json({ error: "Ação inválida." }, 400);
  } catch (error) {
    console.error("[site-audit] erro:", error);
    return json(
      { error: error instanceof Error ? error.message : "Erro interno" },
      500,
    );
  }
});

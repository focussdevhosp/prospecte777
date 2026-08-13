// ============================================================
// SALES ORCHESTRATOR
// ============================================================
// Coordena, não executa. Cada agente resolve o seu pedaço e devolve uma
// estrutura auditável; o orquestrador decide o que fazer com ela e registra
// cada passo no feed.
//
// O motivo de existir um lugar só para isso: antes a decisão de abordar
// estava espalhada entre o frontend (que escolhia o serviço), o job-processor
// (que decidia o fallback) e o cron (que decidia o horário). Três donos para
// uma decisão só significa que ninguém é dono.

import { callAI, recordUsage, AIUnavailable } from "../ai.ts";
import { auditSite } from "../site-audit.ts";
import { buildDossier, type LeadRow, type MemoryRow, type MessageRow } from "./dossier.ts";
import { qualify, explainQualification } from "./qualifier.ts";
import { matchOffer, offerFromRow } from "./offer-matcher.ts";
import { buildStrategy } from "./strategist.ts";
import { buildCopyPrompt, buildRewritePrompt, cleanMessage, aberturaDe
} from "./copywriter.ts";
import { evaluate } from "./quality-gate.ts";
import { AUTONOMY, type AutonomyLevel, type CampaignGoal, type IcpCriteria, type Offer, type QualityThresholds } from "./types.ts";
import { isUsable, waterfall } from "../providers/enrichment.ts";
import { emailSources } from "../providers/email-sources.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

export interface MissionRow {
  id: string;
  user_id: string;
  name: string;
  niche: string;
  city?: string | null;
  state?: string | null;
  icp: IcpCriteria;
  offer_ids: string[];
  goal: CampaignGoal;
  autonomy_level: AutonomyLevel;
  daily_limit: number;
  quality_thresholds: Partial<QualityThresholds>;
  status: string;
}

export interface PipelineOutcome {
  leadId: string;
  status: string;
  score?: number;
  offer?: string | null;
  message?: string | null;
  quality?: number;
  reason?: string;
}

/** No máximo duas reescritas: a terceira quase nunca melhora e sempre custa. */
const MAX_REWRITES = 2;

// ------------------------------------------------------------
// FEED
// ------------------------------------------------------------

export async function logEvent(
  supabase: Supa,
  params: {
    userId: string;
    missionId?: string | null;
    leadId?: string | null;
    agent: string;
    event: string;
    summary: string;
    detail?: Record<string, unknown>;
    level?: "info" | "success" | "warning" | "error";
  },
): Promise<void> {
  try {
    await supabase.from("agent_events").insert({
      user_id: params.userId,
      mission_id: params.missionId ?? null,
      lead_id: params.leadId ?? null,
      agent: params.agent,
      event: params.event,
      summary: params.summary,
      detail: params.detail ?? null,
      level: params.level ?? "info",
    });
  } catch (e) {
    // O feed é auditoria, não transação. Perder uma linha não pode derrubar
    // a esteira — mas precisa aparecer no log do servidor.
    console.error("[orchestrator] falha ao gravar evento:", e);
  }
}

// ------------------------------------------------------------
// CATÁLOGO
// ------------------------------------------------------------

export async function loadCatalog(
  supabase: Supa,
  userId: string,
  offerIds: string[],
): Promise<Offer[]> {
  let query = supabase.from("service_intelligence").select("*").eq("user_id", userId);
  if (offerIds.length > 0) query = query.in("id", offerIds);

  const { data, error } = await query;
  if (error) {
    console.error("[orchestrator] falha ao carregar catálogo:", error.message);
    return [];
  }
  return (data ?? []).map(offerFromRow);
}

// ------------------------------------------------------------
// ENRIQUECIMENTO
// ------------------------------------------------------------

/**
 * Roda a auditoria do site se ainda não foi feita.
 *
 * Esta é a etapa que transforma "melhorar sua presença digital" em "seu site
 * não abre direito no celular". Vale o custo: é a única fonte de fato
 * verificável que existe para uma empresa que nunca respondeu nada.
 */
export async function enrichLead(supabase: Supa, lead: LeadRow): Promise<LeadRow> {
  let atualizado = lead;

  // ---- Auditoria de site ----
  if (!lead.site_audit || !lead.site_audited_at) {
    try {
      const audit = await auditSite(lead.website ?? null);
      await supabase
        .from("leads")
        .update({ site_audit: audit, site_audited_at: audit.checked_at })
        .eq("id", lead.id);

      atualizado = { ...atualizado, site_audit: audit, site_audited_at: audit.checked_at };
    } catch (e) {
      console.error(`[orchestrator] auditoria falhou para ${lead.id}:`, e);
      // Segue sem auditoria: o dossiê fica mais pobre, mas a esteira não para.
    }
  }

  // ---- E-mail, em cascata ----
  // Só quando falta. Reenriquecer quem já tem e-mail é pagar de novo pelo
  // mesmo dado — e a cascata cobra por consulta, não por acerto.
  if (!lead.email && lead.website) {
    try {
      const resultado = await waterfall(emailSources(), {
        businessName: lead.business_name ?? "",
        domain: lead.website,
        city: lead.location ?? null,
        niche: lead.niche ?? null,
      });

      if (isUsable(resultado) && resultado.value) {
        await supabase
          .from("leads")
          .update({ email: resultado.value, email_source: resultado.how })
          .eq("id", lead.id);

        atualizado = { ...atualizado, email: resultado.value };
        console.log(
          `[cascata] e-mail de ${lead.id} por ${resultado.source}, ` +
            `${resultado.tried.length} fonte(s) consultada(s), custo ${resultado.cost}`,
        );
      } else {
        // Não grava palpite. Um e-mail de baixa confiança bounce, e bounce
        // queima o domínio de quem mandou — o dado ruim custa mais que a
        // ausência dele.
        console.log(`[cascata] sem e-mail utilizável para ${lead.id}: ${resultado.reason}`);
      }
    } catch (e) {
      console.error(`[orchestrator] cascata de e-mail falhou para ${lead.id}:`, e);
    }
  }

  return atualizado;
}

// ------------------------------------------------------------
// CONTEXTO ENXUTO
// ------------------------------------------------------------

/**
 * Carrega só o necessário para decidir sobre este lead.
 *
 * "Não envie o banco inteiro para o modelo": memória limitada a 20 itens de
 * confiança razoável, e só as últimas 10 mensagens.
 */
async function loadContext(
  supabase: Supa,
  leadId: string,
): Promise<{ memories: MemoryRow[]; messages: MessageRow[] }> {
  const [memoryResult, messageResult] = await Promise.all([
    supabase
      .from("lead_memory")
      .select("memory_type, key, value, confidence")
      .eq("lead_id", leadId)
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order("confidence", { ascending: false })
      .limit(20),
    supabase
      .from("chat_messages")
      .select("sender_type, content, sent_at")
      .eq("lead_id", leadId)
      .order("sent_at", { ascending: false })
      .limit(10),
  ]);

  return {
    memories: (memoryResult.data ?? []) as MemoryRow[],
    messages: ((messageResult.data ?? []) as MessageRow[]).reverse(),
  };
}

// ------------------------------------------------------------
// A ESTEIRA
// ------------------------------------------------------------

export interface RunOptions {
  supabase: Supa;
  mission: MissionRow;
  lead: LeadRow;
  catalog: Offer[];
  senderSettings: Record<string, unknown>;
  /** Só monta o rascunho, nunca envia. Usado pelo preview e pelo playground. */
  dryRun?: boolean;
}

/**
 * Leva UM lead da descoberta até o rascunho aprovado (ou até o bloqueio).
 *
 * O envio em si não acontece aqui: quem envia é o `whatsapp-send`, que já
 * carrega opt-out, blacklist, rotação de chip e checagem de conexão. Duplicar
 * essas regras aqui criaria duas verdades sobre quando é permitido enviar.
 */
export async function runPipelineForLead(opts: RunOptions): Promise<{
  outcome: PipelineOutcome;
  record: Record<string, unknown>;
}> {
  const { supabase, mission, catalog, senderSettings } = opts;
  const userId = mission.user_id;

  // ---- 1. ENRICHMENT ----
  const lead = await enrichLead(supabase, opts.lead);
  const { memories, messages } = await loadContext(supabase, lead.id);

  // ---- 2. RESEARCH / LEAD 360 ----
  const dossier = buildDossier({ lead, memories, messages });
  await logEvent(supabase, {
    userId, missionId: mission.id, leadId: lead.id,
    agent: "research",
    event: "dossier_built",
    summary: `Dossiê montado para ${dossier.businessName}: ${dossier.facts.length} fatos, ${dossier.observedNeeds.length} oportunidades.`,
    detail: { facts: dossier.facts.length, needs: dossier.observedNeeds },
  });

  // ---- 3. QUALIFICATION ----
  const qualification = qualify(dossier, mission.icp ?? {});

  if (qualification.disqualified) {
    await logEvent(supabase, {
      userId, missionId: mission.id, leadId: lead.id,
      agent: "qualification",
      event: "disqualified",
      summary: `${dossier.businessName} desqualificado: ${qualification.disqualifiedReason}`,
      level: "warning",
    });
    return {
      outcome: { leadId: lead.id, status: "disqualified", reason: qualification.disqualifiedReason ?? undefined },
      record: {
        status: "disqualified",
        dossier: dossier as unknown,
        qualification: qualification as unknown,
        score: 0,
        error_message: qualification.disqualifiedReason,
      },
    };
  }

  await logEvent(supabase, {
    userId, missionId: mission.id, leadId: lead.id,
    agent: "qualification",
    event: "scored",
    summary: explainQualification(qualification),
    detail: { score: qualification.score, reasons: qualification.reasons },
  });

  // Mantém o CRM em dia — a nota precisa aparecer na tela do lead também.
  await supabase
    .from("leads")
    .update({
      lead_score: qualification.score,
      temperature: qualification.temperature,
      score_factors: qualification.reasons,
      last_scored_at: new Date().toISOString(),
    })
    .eq("id", lead.id);

  // ---- 4. OFFER MATCHER ----
  const match = matchOffer(dossier, catalog, mission.offer_ids ?? []);
  await logEvent(supabase, {
    userId, missionId: mission.id, leadId: lead.id,
    agent: "offer_matcher",
    event: "offer_selected",
    summary: match.offer
      ? `Oferta escolhida: ${match.offer.name} (${match.confidence}% de confiança) — ${match.reasons[0] ?? ""}`
      : "Nenhuma oferta disponível no catálogo.",
    detail: { offer: match.offer?.name ?? null, confidence: match.confidence, reasons: match.reasons },
    level: match.offer ? "info" : "warning",
  });

  // ---- 5. STRATEGY ----
  const strategy = buildStrategy({
    dossier,
    qualification,
    match,
    goal: mission.goal,
    formality: (senderSettings.communication_style as string)?.includes("formal") ? "formal" : "informal",
  });

  await logEvent(supabase, {
    userId, missionId: mission.id, leadId: lead.id,
    agent: "strategy",
    event: "strategy_built",
    summary: `Estratégia: ${strategy.angle} · ${strategy.maxWords} palavras · ${strategy.hook ? `gancho "${strategy.hook.value}"` : "sem gancho forte"}`,
    detail: { angle: strategy.angle, rationale: strategy.rationale },
  });

  // As últimas aberturas desta campanha, para o redator não repetir a mesma
  // frase doze vezes. Falha aqui é irrelevante: sem a lista ele escreve como
  // escrevia antes, e o pior caso é a repetição que já existia.
  let recentOpenings: string[] = [];
  try {
    const { data: anteriores } = await supabase
      .from("mission_leads")
      .select("draft_message")
      .eq("mission_id", mission.id)
      .not("draft_message", "is", null)
      .order("updated_at", { ascending: false })
      .limit(6);

    recentOpenings = (anteriores ?? [])
      .map((r: { draft_message?: string | null }) => aberturaDe(String(r.draft_message ?? "")))
      .filter((a: string) => a.length > 0);
  } catch (e) {
    console.error("[orchestrator] não foi possível ler as aberturas anteriores:", e);
  }

  const copyContext = {
    dossier,
    strategy,
    recentOpenings,
    sender: {
      agentName: (senderSettings.agent_name as string) ?? "um consultor",
      persona: (senderSettings.agent_persona as string) ?? null,
      communicationStyle: (senderSettings.communication_style as string) ?? null,
      emojiUsage: (senderSettings.emoji_usage as string) ?? null,
      companyName: null,
    },
  };

  // ---- 6. COPY + 7. QUALITY GATE (com reescrita) ----
  const previousMessages = messages
    .filter((m) => m.sender_type !== "lead")
    .map((m) => m.content);

  let message = "";
  let verdict = null as ReturnType<typeof evaluate> | null;
  let rewrites = 0;

  try {
    for (let attempt = 0; attempt <= MAX_REWRITES; attempt++) {
      const prompt = attempt === 0
        ? buildCopyPrompt(copyContext)
        : buildRewritePrompt(copyContext, message, verdict!.issues.filter((i) => i.severity === "block"));

      const result = await callAI({
        messages: [
          { role: "system", content: prompt.system },
          { role: "user", content: prompt.user },
        ],
        role: "primary",
        // Temperatura baixa na reescrita: a tarefa deixa de ser criar e passa
        // a ser consertar um ponto específico.
        temperature: attempt === 0 ? 0.8 : 0.4,
        max_tokens: 400,
      });

      await recordUsage(supabase, {
        userId,
        usage: result.usage,
        purpose: attempt === 0 ? "copy" : "copy_rewrite",
        missionId: mission.id,
        leadId: lead.id,
        agent: "copy",
      });

      message = cleanMessage(result.text);
      verdict = evaluate({
        message,
        dossier,
        strategy,
        thresholds: mission.quality_thresholds ?? {},
        previousMessages,
      });

      if (verdict.approved) break;

      rewrites = attempt + 1;
      await logEvent(supabase, {
        userId, missionId: mission.id, leadId: lead.id,
        agent: "quality",
        event: "rewrite_requested",
        summary: `Quality Gate reprovou (nota ${verdict.overall}): ${verdict.issues.filter((i) => i.severity === "block").map((i) => i.message).join(" · ")}`,
        detail: { scores: verdict.scores, issues: verdict.issues },
        level: "warning",
      });
    }
  } catch (e) {
    const isUnavailable = e instanceof AIUnavailable;
    const reason = e instanceof Error ? e.message : String(e);

    await logEvent(supabase, {
      userId, missionId: mission.id, leadId: lead.id,
      agent: "copy",
      event: "copy_failed",
      summary: `Não foi possível gerar a mensagem para ${dossier.businessName}: ${reason}`,
      level: "error",
    });

    // Decisão deliberada: quando a IA falha, NÃO existe mensagem de reserva.
    // O sistema antigo mandava um texto fixo afirmando resultados que nunca
    // aconteceram. Não enviar nada é sempre melhor que enviar mentira.
    return {
      outcome: { leadId: lead.id, status: "failed", reason },
      record: {
        status: "failed",
        dossier: dossier as unknown,
        qualification: qualification as unknown,
        offer_match: match as unknown,
        strategy: strategy as unknown,
        score: qualification.score,
        temperature: qualification.temperature,
        error_message: isUnavailable
          ? "IA indisponível. Nenhuma mensagem foi enviada — o sistema não usa texto genérico como reserva."
          : reason,
      },
    };
  }

  const finalVerdict = verdict!;

  await logEvent(supabase, {
    userId, missionId: mission.id, leadId: lead.id,
    agent: "quality",
    event: finalVerdict.approved ? "approved" : "blocked",
    summary: finalVerdict.approved
      ? `Quality Gate aprovado (${finalVerdict.overall}/100 · factualidade ${finalVerdict.scores.factuality})`
      : `Quality Gate bloqueou após ${rewrites} reescrita(s): ${finalVerdict.issues.filter((i) => i.severity === "block").map((i) => i.message).join(" · ")}`,
    detail: { scores: finalVerdict.scores, issues: finalVerdict.issues, message },
    level: finalVerdict.approved ? "success" : "warning",
  });

  const base = {
    dossier: dossier as unknown,
    qualification: qualification as unknown,
    offer_match: match as unknown,
    strategy: strategy as unknown,
    draft_message: message,
    quality: finalVerdict as unknown,
    rewrite_count: rewrites,
    score: qualification.score,
    temperature: qualification.temperature,
  };

  if (!finalVerdict.approved) {
    return {
      outcome: {
        leadId: lead.id, status: "blocked", score: qualification.score,
        offer: match.offer?.name ?? null, message, quality: finalVerdict.overall,
        reason: finalVerdict.issues.find((i) => i.severity === "block")?.message,
      },
      record: { ...base, status: "blocked" },
    };
  }

  // ---- 8. AUTONOMIA decide o destino do rascunho ----
  const autonomy = AUTONOMY[mission.autonomy_level] ?? AUTONOMY.assistido;
  const canSend = autonomy.send && !opts.dryRun;

  return {
    outcome: {
      leadId: lead.id,
      status: canSend ? "approved" : "awaiting_approval",
      score: qualification.score,
      offer: match.offer?.name ?? null,
      message,
      quality: finalVerdict.overall,
    },
    record: { ...base, status: canSend ? "approved" : "awaiting_approval" },
  };
}

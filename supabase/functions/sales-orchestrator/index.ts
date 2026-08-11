// ============================================================
// SALES ORCHESTRATOR — PORTA HTTP
// ============================================================
// Uma missão descreve QUEM prospectar, O QUE pode ser oferecido, QUAL o
// objetivo e QUAIS os limites. Esta function executa isso dentro das regras.
//
// Ações:
//   create_mission   — cria a missão (rascunho)
//   list_missions    — lista com contadores
//   get_mission      — missão + leads + feed
//   start_mission    — dispara a captura e a esteira em background
//   run_batch        — processa mais um lote (chamado pelo cron ou pela tela)
//   preview_lead     — roda a esteira em modo seco, sem enviar nada
//   approve_draft    — humano aprova e o envio sai
//   reject_draft     — humano recusa
//   pause_mission / resume_mission
//   emergency_stop / resume_outbound
//   command_center   — números do painel operacional

import {
  checkRateLimit,
  failure,
  handleCors,
  json,
  rateLimited,
  requirePaidPlan,
  requireUserOrInternal,
  resolveUserId,
} from "../_shared/auth.ts";
import { aggregateSearch, expandQuery, suggestExpansion } from "../_shared/providers/search.ts";
import {
  loadCatalog,
  logEvent,
  runPipelineForLead,
  type MissionRow,
} from "../_shared/agents/orchestrator.ts";
import { AUTONOMY, type AutonomyLevel } from "../_shared/agents/types.ts";

// Quantos leads a esteira processa por chamada. Cada um custa uma chamada de
// IA e até duas reescritas; passar disso estoura o tempo da edge function.
const BATCH_SIZE = 8;

const VALID_GOALS = [
  "agendar_demonstracao", "solicitar_orcamento", "falar_com_vendedor", "vender", "outro",
];

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
    const action = String(body.action ?? "");

    const identity = resolveUserId(auth.ctx, body.user_id);
    if (identity.error) return identity.error;
    const userId = identity.userId;

    // Toda ação que gasta IA ou dispara envio passa por limite.
    if (auth.ctx.kind === "user" && ["start_mission", "run_batch", "preview_lead"].includes(action)) {
      const limit = await checkRateLimit(supabase, userId, "sales-orchestrator", 30, 60);
      if (!limit.allowed) return rateLimited(limit.resetIn);
    }

    switch (action) {
      case "create_mission":  return await createMission(supabase, userId, body);
      case "list_missions":   return await listMissions(supabase, userId);
      case "get_mission":     return await getMission(supabase, userId, body);
      case "start_mission":   return await startMission(supabase, userId, body);
      case "run_batch":       return await runBatch(supabase, userId, body);
      case "preview_lead":    return await previewLead(supabase, userId, body);
      case "approve_draft":   return await approveDraft(supabase, userId, body);
      case "reject_draft":    return await rejectDraft(supabase, userId, body);
      case "pause_mission":   return await setPaused(supabase, userId, body, true);
      case "resume_mission":  return await setPaused(supabase, userId, body, false);
      case "emergency_stop":  return await emergencyStop(supabase, userId, body);
      case "resume_outbound": return await resumeOutbound(supabase, userId);
      case "command_center":  return await commandCenter(supabase, userId);
      case "activity_feed":   return await activityFeed(supabase, userId, body);
      default:
        return json({ error: `Ação desconhecida: ${action}` }, 400);
    }
  } catch (error) {
    return failure(error, "Não foi possível executar a operação.");
  }
});

// ------------------------------------------------------------
// CRIAÇÃO
// ------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type Supa = any;

async function createMission(supabase: Supa, userId: string, body: Record<string, unknown>) {
  const name = String(body.name ?? "").trim();
  const niche = String(body.niche ?? "").trim();

  if (name.length < 3) return json({ error: "Dê um nome à missão (mínimo 3 caracteres)." }, 400);
  if (niche.length < 2) return json({ error: "Informe o nicho a prospectar." }, 400);

  const city = str(body.city);
  const state = str(body.state);
  if (!city && !str(body.region)) {
    return json({ error: "Informe ao menos a cidade ou a região." }, 400);
  }

  const goal = String(body.goal ?? "agendar_demonstracao");
  if (!VALID_GOALS.includes(goal)) return json({ error: "Objetivo inválido." }, 400);

  const autonomy = String(body.autonomy_level ?? "assistido") as AutonomyLevel;
  if (!AUTONOMY[autonomy]) return json({ error: "Nível de autonomia inválido." }, 400);

  const targetCount = clampInt(body.target_count, 1, 2000, 50);
  const dailyLimit = clampInt(body.daily_limit, 1, 1000, 30);
  const startHour = clampInt(body.start_hour, 0, 23, 9);
  const endHour = clampInt(body.end_hour, 1, 24, 18);
  if (endHour <= startHour) {
    return json({ error: "O horário final precisa ser maior que o inicial." }, 400);
  }

  // Confere que as ofertas escolhidas são mesmo desta conta — sem isto, o
  // corpo da requisição escolheria o catálogo de outro usuário.
  const offerIds = asStringArray(body.offer_ids);
  if (offerIds.length > 0) {
    const { data: owned } = await supabase
      .from("service_intelligence")
      .select("id")
      .eq("user_id", userId)
      .in("id", offerIds);

    if ((owned?.length ?? 0) !== offerIds.length) {
      return json({ error: "Uma ou mais ofertas selecionadas não pertencem à sua conta." }, 403);
    }
  }

  const location = [city, state].filter(Boolean).join(" - ") || str(body.region);

  // O ICP nasce preenchido com o que o usuário já informou. Sem isto ele
  // ficaria vazio e a qualificação não teria contra o que comparar.
  const icp = {
    niches: asStringArray(body.icp_niches).length > 0 ? asStringArray(body.icp_niches) : [niche],
    locations: asStringArray(body.icp_locations).length > 0
      ? asStringArray(body.icp_locations)
      : [location].filter(Boolean),
    signals: asStringArray(body.icp_signals),
    exclusions: asStringArray(body.icp_exclusions),
    minRating: numOrNull(body.icp_min_rating),
    maxRating: numOrNull(body.icp_max_rating),
    minReviews: numOrNull(body.icp_min_reviews),
  };

  const { data, error } = await supabase
    .from("missions")
    .insert({
      user_id: userId,
      name,
      segment: str(body.segment),
      niche,
      city,
      state,
      region: str(body.region),
      keywords: asStringArray(body.keywords),
      icp,
      target_count: targetCount,
      offer_ids: offerIds,
      goal,
      channel: "whatsapp",
      autonomy_level: autonomy,
      daily_limit: dailyLimit,
      start_hour: startHour,
      end_hour: endHour,
      work_days_only: body.work_days_only !== false,
      quality_thresholds: (body.quality_thresholds as Record<string, unknown>) ?? {},
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    console.error("[orchestrator] falha ao criar missão:", error.message);
    return json({ error: "Não foi possível criar a missão." }, 500);
  }

  await logEvent(supabase, {
    userId,
    missionId: data.id,
    agent: "orchestrator",
    event: "mission_created",
    summary: `Missão "${name}" criada: ${niche} em ${location || "região definida"} · objetivo ${goal.replace(/_/g, " ")} · autonomia ${AUTONOMY[autonomy].label}.`,
    detail: { target_count: targetCount, offers: offerIds.length, autonomy },
  });

  return json({ mission: data });
}

// ------------------------------------------------------------
// LEITURA
// ------------------------------------------------------------

async function listMissions(supabase: Supa, userId: string) {
  const { data, error } = await supabase
    .from("missions")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) return json({ error: "Não foi possível carregar as missões." }, 500);
  return json({ missions: data ?? [] });
}

async function getMission(supabase: Supa, userId: string, body: Record<string, unknown>) {
  const missionId = str(body.mission_id);
  if (!missionId) return json({ error: "mission_id é obrigatório." }, 400);

  const { data: mission } = await supabase
    .from("missions")
    .select("*")
    .eq("id", missionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!mission) return json({ error: "Missão não encontrada." }, 404);

  const [leadsResult, eventsResult, gateResult] = await Promise.all([
    supabase
      .from("mission_leads")
      .select("*, leads(id, business_name, phone, niche, location, website, stage, rating, reviews_count)")
      .eq("mission_id", missionId)
      .order("score", { ascending: false, nullsFirst: false })
      .limit(200),
    supabase
      .from("agent_events")
      .select("*")
      .eq("mission_id", missionId)
      .order("created_at", { ascending: false })
      .limit(80),
    supabase.rpc("mission_can_send", { p_mission_id: missionId }),
  ]);

  return json({
    mission,
    leads: leadsResult.data ?? [],
    events: eventsResult.data ?? [],
    send_block_reason: gateResult.data ?? null,
  });
}

async function activityFeed(supabase: Supa, userId: string, body: Record<string, unknown>) {
  const { data, error } = await supabase
    .from("agent_events")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(clampInt(body.limit, 1, 200, 50));

  if (error) return json({ error: "Não foi possível carregar o feed." }, 500);
  return json({ events: data ?? [] });
}

async function commandCenter(supabase: Supa, userId: string) {
  const { data, error } = await supabase.rpc("command_center", { p_user_id: userId });
  if (error) {
    console.error("[orchestrator] command_center falhou:", error.message);
    return json({ error: "Não foi possível carregar o painel." }, 500);
  }
  return json({ metrics: data ?? {} });
}

// ------------------------------------------------------------
// EXECUÇÃO
// ------------------------------------------------------------

async function startMission(supabase: Supa, userId: string, body: Record<string, unknown>) {
  const missionId = str(body.mission_id);
  if (!missionId) return json({ error: "mission_id é obrigatório." }, 400);

  const { data: mission } = await supabase
    .from("missions")
    .select("*")
    .eq("id", missionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!mission) return json({ error: "Missão não encontrada." }, 404);
  if (mission.status === "running") return json({ error: "Esta missão já está rodando." }, 409);

  // Freio global vence qualquer intenção de iniciar.
  const { data: settings } = await supabase
    .from("user_settings")
    .select("outbound_paused, whatsapp_connected, serper_api_key, serpapi_api_key")
    .eq("user_id", userId)
    .maybeSingle();

  if (settings?.outbound_paused) {
    return json({ error: "A parada de emergência está ativa. Retome os envios antes de iniciar uma missão." }, 409);
  }

  const autonomy = AUTONOMY[mission.autonomy_level as AutonomyLevel] ?? AUTONOMY.assistido;
  if (autonomy.send && !settings?.whatsapp_connected) {
    return json({
      error: "Esta missão envia mensagens e o WhatsApp não está conectado. Conecte em Configurações ou use autonomia Manual/Assistido.",
    }, 409);
  }

  await supabase
    .from("missions")
    .update({ status: "running", paused_at: null, paused_reason: null, last_run_at: new Date().toISOString() })
    .eq("id", missionId);

  await logEvent(supabase, {
    userId, missionId,
    agent: "orchestrator",
    event: "mission_started",
    summary: `Missão "${mission.name}" iniciada. Buscando até ${mission.target_count} empresas.`,
    level: "success",
  });

  const location = [mission.city, mission.state].filter(Boolean).join(" - ") || mission.region || "";

  // A captura passa do tempo de uma requisição, então corre em background.
  EdgeRuntime.waitUntil(
    researchAndIngest(supabase, mission as MissionRow, location, {
      serper: settings?.serper_api_key ?? null,
      serpapi: settings?.serpapi_api_key ?? null,
    }),
  );

  return json({ status: "running", mission_id: missionId });
}

/**
 * RESEARCH AGENT.
 *
 * Consulta várias fontes ao mesmo tempo, consolida o que elas acharam e
 * grava apenas empresas únicas. Antes as fontes rodavam em sequência: a
 * busca demorava a soma de todas, e a mesma empresa vista por três fontes
 * virava três leads.
 *
 * O usuário não vê nada disso — para ele existe "buscando empresas".
 */
async function researchAndIngest(
  supabase: Supa,
  mission: MissionRow & { name: string; target_count: number; city?: string | null; region?: string | null },
  location: string,
  keys: { serper: string | null; serpapi: string | null },
): Promise<void> {
  try {
    const { businesses, report } = await aggregateSearch({
      query: {
        term: mission.niche,
        location,
        limit: mission.target_count,
        variants: expandQuery(mission.niche),
      },
      supabase,
      keys: { serper: keys.serper, serpapi: keys.serpapi },
      budget: { maxResults: mission.target_count },
      onProgress: async (progress) => {
        // Resultado progressivo: a tela mostra o número subindo em vez de
        // uma barra parada até o fim.
        await logEvent(supabase, {
          userId: mission.user_id, missionId: mission.id,
          agent: "research",
          event: "search_progress",
          summary: progress.message,
          detail: { completed: progress.completed, total: progress.total },
        });
      },
    });

    // O detalhe técnico fica no `detail`, para auditoria; o resumo que o
    // usuário lê fala de empresas, não de providers.
    await logEvent(supabase, {
      userId: mission.user_id, missionId: mission.id,
      agent: "research",
      event: "search_completed",
      summary:
        `${report.unique} empresas únicas encontradas ` +
        `(${report.totalRaw} registros brutos, ${report.duplicatesMerged} duplicatas unificadas` +
        `${report.fromCache > 0 ? `, ${report.fromCache} de buscas recentes` : ""}).`,
      detail: {
        providers: report.providers,
        duplicates_merged: report.duplicatesMerged,
        ambiguous: report.ambiguousForReview,
        from_cache: report.fromCache,
      },
      level: report.unique > 0 ? "success" : "warning",
    });

    if (businesses.length === 0) {
      await supabase.from("missions").update({ status: "completed" }).eq("id", mission.id);
      return;
    }

    // Resultado magro: sugere ampliar, mas não amplia sozinho. Trocar "Itu"
    // por "região de Itu" sem avisar muda a intenção de quem pediu Itu.
    const expansion = suggestExpansion(
      { term: mission.niche, location, limit: mission.target_count },
      businesses.length,
    );
    if (expansion.shouldSuggest) {
      await logEvent(supabase, {
        userId: mission.user_id, missionId: mission.id,
        agent: "research",
        event: "thin_results",
        summary: `Poucos resultados: ${expansion.reason}. Sugestão: ${expansion.suggestion}.`,
        level: "warning",
      });
    }

    let inserted = 0;

    for (const business of businesses) {
      if (!business.phone) continue; // sem telefone não há abordagem por WhatsApp

      // Dedup contra a carteira que o usuário já tem: a mesma empresa pode
      // aparecer em duas missões, e abordar duas vezes vira denúncia.
      const { data: existing } = await supabase
        .from("leads")
        .select("id")
        .eq("user_id", mission.user_id)
        .eq("phone", business.phone)
        .maybeSingle();

      let leadId = existing?.id ?? null;

      if (!leadId) {
        const { data: created, error } = await supabase
          .from("leads")
          .insert({
            user_id: mission.user_id,
            business_name: business.name,
            phone: business.phone,
            niche: mission.niche,
            location: [business.city, business.state].filter(Boolean).join(" - ") || location,
            website: business.website,
            email: business.email,
            address: business.address,
            rating: business.rating,
            reviews_count: business.reviewsCount,
            google_maps_url: business.mapsUrl,
            lat: business.latitude,
            lng: business.longitude,
            company_description: business.description,
            instagram_url: business.instagramUrl,
            facebook_url: business.facebookUrl,
            photo_url: business.photoUrl,
            industry: business.category,
            stage: "Contato",
            temperature: "frio",
            // Guarda TODAS as fontes que viram esta empresa. Um lead
            // confirmado por três fontes é mais confiável que um visto por
            // uma só, e o dossiê usa isso.
            source: business.sources.join("+"),
          })
          .select("id")
          .single();

        if (error) {
          console.error("[orchestrator] falha ao gravar lead:", error.message);
          continue;
        }
        leadId = created.id;
      }

      const { error: linkError } = await supabase.from("mission_leads").insert({
        mission_id: mission.id,
        lead_id: leadId,
        user_id: mission.user_id,
        status: "found",
      });

      // 23505 = já está nesta missão. Esperado ao rodar de novo.
      if (linkError && linkError.code !== "23505") {
        console.error("[orchestrator] falha ao vincular lead:", linkError.message);
        continue;
      }
      if (!linkError) inserted++;
    }

    await supabase.from("missions").update({ leads_found: inserted }).eq("id", mission.id);

    await logEvent(supabase, {
      userId: mission.user_id, missionId: mission.id,
      agent: "orchestrator",
      event: "ingest_completed",
      summary: `${inserted} empresas entraram na missão. A esteira processa em lotes de ${BATCH_SIZE}.`,
      level: "success",
    });
  } catch (e) {
    console.error("[orchestrator] captura falhou:", e);
    await supabase.from("missions").update({ status: "failed" }).eq("id", mission.id);

    await logEvent(supabase, {
      userId: mission.user_id, missionId: mission.id,
      agent: "research",
      event: "search_failed",
      summary: `A busca falhou: ${e instanceof Error ? e.message : String(e)}`,
      level: "error",
    });
  }
}

/**
 * Processa um lote: qualifica, escolhe oferta, monta estratégia, escreve,
 * revisa e — se a autonomia permitir e a portaria deixar — envia.
 */
async function runBatch(supabase: Supa, userId: string, body: Record<string, unknown>) {
  const missionId = str(body.mission_id);
  if (!missionId) return json({ error: "mission_id é obrigatório." }, 400);

  const { data: mission } = await supabase
    .from("missions")
    .select("*")
    .eq("id", missionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!mission) return json({ error: "Missão não encontrada." }, 404);

  const { data: pending } = await supabase
    .from("mission_leads")
    .select("id, lead_id, leads(*)")
    .eq("mission_id", missionId)
    .eq("status", "found")
    .limit(BATCH_SIZE);

  if (!pending || pending.length === 0) {
    const { count } = await supabase
      .from("mission_leads")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId)
      .in("status", ["found"]);

    if ((count ?? 0) === 0) {
      await supabase.from("missions").update({ status: "completed" }).eq("id", missionId);
    }
    return json({ processed: 0, remaining: 0, done: true });
  }

  // Teto de gasto antes de qualquer chamada de IA. Um lote de 8 leads pode
  // custar 24 chamadas com as reescritas; descobrir o estouro depois de
  // gastar não serve de nada.
  const { data: budgetBlock } = await supabase.rpc("ai_budget_check", {
    p_user_id: userId,
    p_mission_id: missionId,
  });

  if (budgetBlock) {
    await logEvent(supabase, {
      userId, missionId,
      agent: "supervisor",
      event: "budget_exceeded",
      summary: `Lote não processado: ${budgetBlock}. Ajuste o limite em Configurações para continuar.`,
      level: "warning",
    });
    return json({
      error: String(budgetBlock),
      code: "ai_budget_exceeded",
      processed: 0,
    }, 429);
  }

  const [catalog, settingsResult] = await Promise.all([
    loadCatalog(supabase, userId, mission.offer_ids ?? []),
    supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  const settings = settingsResult.data ?? {};
  const autonomy = AUTONOMY[mission.autonomy_level as AutonomyLevel] ?? AUTONOMY.assistido;

  const results: Record<string, unknown>[] = [];
  let sent = 0;

  for (const row of pending) {
    const lead = row.leads;
    if (!lead) continue;

    try {
      const { outcome, record } = await runPipelineForLead({
        supabase,
        mission: mission as MissionRow,
        lead,
        catalog,
        senderSettings: settings,
      });

      await supabase.from("mission_leads").update(record).eq("id", row.id);

      // ---- ENVIO ----
      // Só sai daqui se a autonomia autorizar E a portaria do banco liberar.
      // A portaria checa parada de emergência, horário, dia útil, limite
      // diário e conexão — e falha fechada.
      if (record.status === "approved" && autonomy.send) {
        const { data: blockReason } = await supabase.rpc("mission_can_send", { p_mission_id: missionId });

        if (blockReason) {
          await supabase
            .from("mission_leads")
            .update({ status: "awaiting_approval" })
            .eq("id", row.id);

          await logEvent(supabase, {
            userId, missionId, leadId: lead.id,
            agent: "outreach",
            event: "send_blocked",
            summary: `Envio para ${lead.business_name} retido: ${String(blockReason).replace(/_/g, " ")}. O rascunho ficou aguardando.`,
            level: "warning",
          });
        } else {
          const ok = await sendMessage(supabase, {
            userId, missionId, missionLeadId: row.id,
            lead, message: String(record.draft_message ?? ""),
            instanceId: settings.whatsapp_instance_id ?? null,
          });
          if (ok) sent++;
        }
      }

      results.push(outcome as unknown as Record<string, unknown>);
    } catch (e) {
      console.error(`[orchestrator] esteira falhou no lead ${lead.id}:`, e);
      await supabase
        .from("mission_leads")
        .update({ status: "failed", error_message: e instanceof Error ? e.message : String(e) })
        .eq("id", row.id);
    }
  }

  await refreshCounters(supabase, missionId);

  const { count: remaining } = await supabase
    .from("mission_leads")
    .select("id", { count: "exact", head: true })
    .eq("mission_id", missionId)
    .eq("status", "found");

  if ((remaining ?? 0) === 0) {
    await supabase.from("missions").update({ status: "completed" }).eq("id", missionId);
  }

  return json({
    processed: results.length,
    sent,
    remaining: remaining ?? 0,
    done: (remaining ?? 0) === 0,
    results,
  });
}

/**
 * Modo seco: monta o rascunho e mostra todo o raciocínio, sem gravar status
 * nem enviar. É o que alimenta a prévia da tela e o laboratório.
 */
async function previewLead(supabase: Supa, userId: string, body: Record<string, unknown>) {
  const leadId = str(body.lead_id);
  if (!leadId) return json({ error: "lead_id é obrigatório." }, 400);

  const { data: lead } = await supabase
    .from("leads")
    .select("*")
    .eq("id", leadId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!lead) return json({ error: "Lead não encontrado." }, 404);

  const missionId = str(body.mission_id);
  let mission: MissionRow;

  if (missionId) {
    const { data } = await supabase
      .from("missions").select("*").eq("id", missionId).eq("user_id", userId).maybeSingle();
    if (!data) return json({ error: "Missão não encontrada." }, 404);
    mission = data as MissionRow;
  } else {
    // Prévia avulsa, fora de missão: ICP vazio e todas as ofertas da conta.
    mission = {
      id: "",
      user_id: userId,
      name: "prévia",
      niche: lead.niche ?? "",
      icp: {},
      offer_ids: asStringArray(body.offer_ids),
      goal: (str(body.goal) as MissionRow["goal"]) ?? "agendar_demonstracao",
      autonomy_level: "manual",
      daily_limit: 0,
      quality_thresholds: {},
      status: "draft",
    };
  }

  const [catalog, settingsResult] = await Promise.all([
    loadCatalog(supabase, userId, mission.offer_ids ?? []),
    supabase.from("user_settings").select("*").eq("user_id", userId).maybeSingle(),
  ]);

  const { outcome, record } = await runPipelineForLead({
    supabase,
    mission,
    lead,
    catalog,
    senderSettings: settingsResult.data ?? {},
    dryRun: true,
  });

  return json({
    outcome,
    dossier: record.dossier,
    qualification: record.qualification,
    offer_match: record.offer_match,
    strategy: record.strategy,
    message: record.draft_message ?? null,
    quality: record.quality ?? null,
    rewrites: record.rewrite_count ?? 0,
    error: record.error_message ?? null,
  });
}

// ------------------------------------------------------------
// ENVIO
// ------------------------------------------------------------

/**
 * Delega ao `whatsapp-send`, que já carrega blacklist, opt-out, rotação de
 * chip, checagem de conexão e limite de tamanho. Reimplementar isso aqui
 * criaria uma segunda verdade sobre quando é permitido enviar.
 */
async function sendMessage(
  supabase: Supa,
  params: {
    userId: string;
    missionId: string;
    missionLeadId: string;
    // deno-lint-ignore no-explicit-any
    lead: any;
    message: string;
    instanceId: string | null;
  },
): Promise<boolean> {
  const { lead, message } = params;

  try {
    const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
      },
      body: JSON.stringify({
        phone: lead.phone,
        message,
        instance_id: params.instanceId,
        user_id: params.userId,
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      const optedOut = res.status === 409 && /blacklist/i.test(detail);

      await supabase
        .from("mission_leads")
        .update({
          status: optedOut ? "opted_out" : "failed",
          error_message: detail.slice(0, 400),
        })
        .eq("id", params.missionLeadId);

      await logEvent(supabase, {
        userId: params.userId, missionId: params.missionId, leadId: lead.id,
        agent: "outreach",
        event: optedOut ? "opted_out" : "send_failed",
        summary: optedOut
          ? `${lead.business_name} está na lista de bloqueio — nada foi enviado.`
          : `Falha ao enviar para ${lead.business_name}.`,
        detail: { status: res.status },
        level: optedOut ? "warning" : "error",
      });
      return false;
    }

    const now = new Date().toISOString();

    await supabase
      .from("mission_leads")
      .update({ status: "sent", sent_at: now })
      .eq("id", params.missionLeadId);

    await supabase
      .from("leads")
      .update({
        message_sent: true,
        stage: "Abordado",
        first_contact_at: lead.first_contact_at ?? now,
        last_contact_at: now,
      })
      .eq("id", lead.id);

    // Registra no histórico para o agente conversacional ter o que ler
    // quando o lead responder.
    await supabase.from("chat_messages").insert({
      lead_id: lead.id,
      sender_type: "agent",
      content: message,
      status: "sent",
    });

    await supabase.from("activity_log").insert({
      user_id: params.userId,
      lead_id: lead.id,
      activity_type: "mission_outreach",
      description: `Abordagem enviada para ${lead.business_name} pela missão.`,
    });

    await logEvent(supabase, {
      userId: params.userId, missionId: params.missionId, leadId: lead.id,
      agent: "outreach",
      event: "message_sent",
      summary: `Mensagem enviada para ${lead.business_name}.`,
      detail: { message },
      level: "success",
    });

    return true;
  } catch (e) {
    console.error("[orchestrator] envio falhou:", e);
    await supabase
      .from("mission_leads")
      .update({ status: "failed", error_message: e instanceof Error ? e.message : String(e) })
      .eq("id", params.missionLeadId);
    return false;
  }
}

// ------------------------------------------------------------
// APROVAÇÃO HUMANA
// ------------------------------------------------------------

async function approveDraft(supabase: Supa, userId: string, body: Record<string, unknown>) {
  const id = str(body.mission_lead_id);
  if (!id) return json({ error: "mission_lead_id é obrigatório." }, 400);

  const { data: row } = await supabase
    .from("mission_leads")
    .select("*, leads(*), missions(id, name, autonomy_level)")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!row) return json({ error: "Rascunho não encontrado." }, 404);
  if (!row.draft_message) return json({ error: "Este item não tem mensagem para aprovar." }, 400);
  if (row.status === "sent") return json({ error: "Esta mensagem já foi enviada." }, 409);

  // O humano pode corrigir o texto na hora de aprovar. Se corrigiu, o texto
  // editado passa pelo Quality Gate de novo? Não: edição humana é decisão
  // humana, e o gate existe para revisar a IA, não para revisar o dono.
  const edited = str(body.message);
  const message = edited && edited.length > 0 ? edited : row.draft_message;

  const blockReason = await supabase.rpc("mission_can_send", { p_mission_id: row.mission_id });
  // A portaria vale também para envio aprovado por humano — o que ela protege
  // (horário, opt-out, limite, parada de emergência) não deixa de valer.
  if (blockReason.data) {
    return json({
      error: `Não é possível enviar agora: ${String(blockReason.data).replace(/_/g, " ")}.`,
      code: String(blockReason.data),
    }, 409);
  }

  const { data: settings } = await supabase
    .from("user_settings").select("whatsapp_instance_id").eq("user_id", userId).maybeSingle();

  await supabase
    .from("mission_leads")
    .update({ approved_by: userId, approved_at: new Date().toISOString(), draft_message: message })
    .eq("id", id);

  const ok = await sendMessage(supabase, {
    userId,
    missionId: row.mission_id,
    missionLeadId: id,
    lead: row.leads,
    message,
    instanceId: settings?.whatsapp_instance_id ?? null,
  });

  await refreshCounters(supabase, row.mission_id);

  return ok
    ? json({ status: "sent" })
    : json({ error: "A mensagem foi aprovada mas o envio falhou. Veja o feed." }, 502);
}

async function rejectDraft(supabase: Supa, userId: string, body: Record<string, unknown>) {
  const id = str(body.mission_lead_id);
  if (!id) return json({ error: "mission_lead_id é obrigatório." }, 400);

  const { data: row } = await supabase
    .from("mission_leads").select("mission_id, lead_id").eq("id", id).eq("user_id", userId).maybeSingle();
  if (!row) return json({ error: "Rascunho não encontrado." }, 404);

  const reason = str(body.reason) ?? "recusado pelo usuário";

  await supabase
    .from("mission_leads")
    .update({ status: "rejected", rejected_reason: reason })
    .eq("id", id);

  await logEvent(supabase, {
    userId, missionId: row.mission_id, leadId: row.lead_id,
    agent: "supervisor",
    event: "draft_rejected",
    summary: `Rascunho recusado: ${reason}`,
    level: "warning",
  });

  return json({ status: "rejected" });
}

// ------------------------------------------------------------
// FREIOS
// ------------------------------------------------------------

async function setPaused(supabase: Supa, userId: string, body: Record<string, unknown>, paused: boolean) {
  const missionId = str(body.mission_id);
  if (!missionId) return json({ error: "mission_id é obrigatório." }, 400);

  const reason = str(body.reason) ?? "pausa manual";

  const { data, error } = await supabase
    .from("missions")
    .update(
      paused
        ? { status: "paused", paused_at: new Date().toISOString(), paused_reason: reason }
        : { status: "running", paused_at: null, paused_reason: null },
    )
    .eq("id", missionId)
    .eq("user_id", userId)
    .select()
    .maybeSingle();

  if (error || !data) return json({ error: "Missão não encontrada." }, 404);

  await logEvent(supabase, {
    userId, missionId,
    agent: "orchestrator",
    event: paused ? "mission_paused" : "mission_resumed",
    summary: paused ? `Missão pausada: ${reason}` : "Missão retomada.",
    level: paused ? "warning" : "success",
  });

  return json({ mission: data });
}

async function emergencyStop(supabase: Supa, userId: string, body: Record<string, unknown>) {
  const reason = str(body.reason) ?? "parada manual";
  const { data, error } = await supabase.rpc("emergency_stop", {
    p_user_id: userId,
    p_reason: reason,
  });

  if (error) {
    console.error("[orchestrator] parada de emergência falhou:", error.message);
    return json({ error: "Não foi possível parar os envios." }, 500);
  }

  return json({ paused_missions: data ?? 0 });
}

async function resumeOutbound(supabase: Supa, userId: string) {
  const { error } = await supabase.rpc("resume_outbound", { p_user_id: userId });
  if (error) return json({ error: "Não foi possível retomar os envios." }, 500);
  return json({ status: "resumed" });
}

// ------------------------------------------------------------
// AUXILIARES
// ------------------------------------------------------------

/**
 * Recalcula os contadores da missão.
 *
 * A conta em si mora no banco (`mission_refresh_counters`). Ela precisa
 * rodar também dentro dos gatilhos de resposta e de reunião, e uma regra de
 * negócio escrita nos dois lugares acaba divergindo — normalmente no dia em
 * que alguém acrescenta um status novo e lembra de só uma das cópias.
 */
async function refreshCounters(supabase: Supa, missionId: string): Promise<void> {
  await supabase.rpc("mission_refresh_counters", { p_mission_id: missionId });
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function numOrNull(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).map((v) => v.trim());
}

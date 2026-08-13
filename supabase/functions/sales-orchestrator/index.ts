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
//   retry_lead       — recoloca na fila um lead que falhou no envio
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
import { classifySendFailure, MAX_SEND_ATTEMPTS } from "../_shared/agents/send-policy.ts";
import { pickAssignee, type AssignmentStrategy } from "../_shared/agents/assignment.ts";

// Quantos leads a esteira processa por chamada. Cada um custa uma chamada de
// IA e até duas reescritas; passar disso estoura o tempo da edge function.
const BATCH_SIZE = 8;

const VALID_GOALS = [
  "agendar_demonstracao", "solicitar_orcamento", "falar_com_vendedor", "vender", "outro",
];

// Os mesmos três valores do CHECK em `missions.channel`. Repetidos aqui de
// propósito: a lista do banco recusaria o insert com uma mensagem de
// constraint, e ninguém sabe o que fazer com "violates check constraint".
const VALID_CHANNELS = ["whatsapp", "email", "email_depois_whatsapp"];

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
      case "retry_lead":      return await retryLead(supabase, userId, body);
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

/**
 * Cliente Supabase, tipado no mínimo que esta function usa.
 *
 * `any` aqui apagava a conferência de forma das chamadas — e uma chamada com
 * a forma errada só aparece em produção, porque o PostgREST devolve 400 e o
 * código segue. O tipo gerado do Supabase não entra em edge function (ele
 * vive em `src/`), então o mínimo estrutural é o que dá para ter.
 */
// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

  // O canal era gravado fixo em "whatsapp" logo abaixo, apesar de a coluna
  // aceitar três valores e de existir uma function de e-mail pronta. Escolher
  // na tela não adiantava nada porque nada lia a escolha.
  const channel = String(body.channel ?? "whatsapp");
  if (!VALID_CHANNELS.includes(channel)) {
    return json({ error: "Canal inválido." }, 400);
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
      channel,
      autonomy_level: autonomy,
      daily_limit: dailyLimit,
      start_hour: startHour,
      end_hour: endHour,
      work_days_only: body.work_days_only !== false,
      quality_thresholds: (body.quality_thresholds as Record<string, unknown>) ?? {},
      // Só a procedência. O `icp` acima é cópia: alterar o perfil depois não
      // pode reescrever a régua de uma missão que já rodou — o score dos
      // leads dela foi calculado com a régua antiga, e trocar uma sem trocar
      // o outro produz um histórico que não fecha.
      icp_profile_id: str(body.icp_profile_id),
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
      // ZERO EMPRESAS PRECISA DIZER POR QUÊ.
      //
      // Antes a missão terminava "concluída" com zero leads e um aviso de uma
      // linha: "0 empresas únicas encontradas". As três causas possíveis são
      // muito diferentes entre si, e o usuário não tinha como distinguir:
      //
      //   - o nicho não tem mapeamento (nada foi procurado de verdade);
      //   - a cidade não foi localizada;
      //   - procurou certo e não existe ninguém ali.
      //
      // A primeira ele resolve trocando a palavra. A terceira ele resolve
      // mudando de cidade. Sem saber qual é, ele conclui que o produto não
      // funciona — e nesse caso estava certo.
      const motivos = (report.providers ?? [])
        .map((p) => (p as { id?: string; error?: string | null }))
        .filter((p) => p.error)
        .map((p) => `${p.id}: ${p.error}`);

      const semMapeamento = motivos.some((m) => m.includes("sem mapeamento"));
      const semCidade = motivos.some((m) => m.includes("localizar a cidade"));

      await logEvent(supabase, {
        userId: mission.user_id, missionId: mission.id,
        agent: "research",
        event: "search_empty",
        summary: semMapeamento
          ? `Nenhuma empresa encontrada: não sabemos procurar pelo nicho "${mission.niche}". ` +
            `Tente um termo mais comum — "clínica", "salão", "oficina", "restaurante".`
          : semCidade
          ? `Nenhuma empresa encontrada: não foi possível localizar "${location}". ` +
            `Confira o nome da cidade e o estado.`
          : `Nenhuma empresa encontrada para "${mission.niche}" em ${location}. ` +
            `A busca funcionou — não há cadastros com telefone nessa combinação.`,
        detail: { motivos },
        level: "warning",
      });

      // Não há fila para abrir, então concluir é verdade. Passa pela mesma
      // função que decide isso em todo lugar.
      await supabase.rpc("mission_settle_status", { p_mission_id: mission.id });
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

    // ---- QUEM FICA COM O LEAD ----
    // `leads.assigned_to` existia desde o começo e nada nunca escreveu nele.
    // Numa operação de uma pessoa isso não fazia falta; a partir de dois
    // vendedores, lead sem dono é lead que ninguém atende porque cada um acha
    // que é do outro.
    //
    // A carga é lida UMA VEZ e atualizada na memória a cada atribuição. Ler
    // do banco a cada lead custaria uma consulta por lead; ler uma vez e não
    // atualizar jogaria os 50 leads do lote inteiro no mesmo vendedor — o de
    // menor carga no instante em que a lista foi lida.
    const { data: equipe } = await supabase.rpc("team_availability", {
      p_owner_id: mission.user_id,
    });

    // A estratégia é da EQUIPE, não da missão: mudá-la por campanha faria a
    // mesma carteira ser repartida por duas réguas diferentes, e aí ninguém
    // consegue explicar por que um vendedor recebeu mais.
    const { data: equipeCfg } = await supabase
      .from("teams")
      .select("assignment_strategy")
      .eq("owner_id", mission.user_id)
      .maybeSingle();

    const estrategia = (equipeCfg?.assignment_strategy ?? "carga") as AssignmentStrategy;

    const membros = ((equipe ?? []) as Array<{
      user_id: string; active: boolean; open_load: number;
      niches: string[] | null; capacity: number | null;
    }>).map((m) => ({
      userId: m.user_id,
      openLoad: Number(m.open_load ?? 0),
      active: m.active !== false,
      niches: m.niches ?? undefined,
      capacity: m.capacity ?? undefined,
    }));

    // Um membro só é a própria conta: distribuir para si mesmo é ruído no
    // histórico e não responde nenhuma pergunta.
    const distribui = membros.filter((m) => m.active).length > 1;
    let rodada = 0;

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

        // Só lead NOVO entra na distribuição. Lead que já existia na carteira
        // pode ter dono, conversa em andamento e negociação aberta — trocar a
        // pessoa no meio disso faz o cliente recomeçar a explicar tudo.
        if (distribui) {
          const escolha = pickAssignee(membros, {
            strategy: estrategia,
            niche: mission.niche,
            counter: rodada++,
          });

          if (escolha.userId) {
            await supabase.from("leads").update({ assigned_to: escolha.userId }).eq("id", leadId);
            await supabase.from("lead_assignments").insert({
              lead_id: leadId,
              user_id: escolha.userId,
              assigned_by: null,
              reason: escolha.reason,
            });

            // A carga sobe aqui, na memória. É isto que impede o lote inteiro
            // de cair no mesmo vendedor.
            const m = membros.find((x) => x.userId === escolha.userId);
            if (m) m.openLoad += 1;
          }
        }
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

  const { data: settingsFirst } = await supabase
    .from("user_settings").select("*").eq("user_id", userId).maybeSingle();
  const settings = settingsFirst ?? {};

  // ---- PRIMEIRO O QUE JÁ ESTÁ ESCRITO ----
  // Mensagem aprovada e retida (fora do horário, limite do dia, WhatsApp
  // caído) espera aqui até a janela abrir. Sai antes de qualquer lead novo:
  // soltar o que já existe custa uma chamada de rede, escrever um lote novo
  // custa IA — e a mensagem retida é a que está envelhecendo.
  const blocks = new Set<string>();
  const flushed = await flushApproved(supabase, {
    userId, missionId,
    instanceId: (settings as { whatsapp_instance_id?: string }).whatsapp_instance_id ?? null,
    blocks,
    channel: mission.channel,
  });

  const { data: pending } = await supabase
    .from("mission_leads")
    .select("id, lead_id, leads(*)")
    .eq("mission_id", missionId)
    .eq("status", "found")
    .limit(BATCH_SIZE);

  if (!pending || pending.length === 0) {
    await reportBlocks(supabase, userId, missionId, blocks);
    const { data: work } = await supabase.rpc("mission_settle_status", { p_mission_id: missionId });
    return json({ processed: 0, sent: flushed, remaining: 0, done: true, work });
  }

  // Teto de gasto antes de qualquer chamada de IA. Um lote de 8 leads pode
  // custar 24 chamadas com as reescritas; descobrir o estouro depois de
  // gastar não serve de nada.
  //
  // Fica depois do flush de propósito: soltar mensagem já escrita não gasta
  // IA nenhuma, e estourar o orçamento não é motivo para deixar mensagem
  // pronta apodrecendo na fila.
  const { data: budgetBlock } = await supabase.rpc("ai_budget_check", {
    p_user_id: userId,
    p_mission_id: missionId,
  });

  if (budgetBlock) {
    await logEvent(supabase, {
      userId, missionId,
      agent: "supervisor",
      event: "budget_exceeded",
      summary: `Lote não processado: ${budgetBlock}. Ajuste o teto em Central de IA > Custo e teto para continuar.`,
      level: "warning",
    });
    return json({
      error: String(budgetBlock),
      code: "ai_budget_exceeded",
      processed: 0,
    }, 429);
  }

  const catalog = await loadCatalog(supabase, userId, mission.offer_ids ?? []);
  const autonomy = AUTONOMY[mission.autonomy_level as AutonomyLevel] ?? AUTONOMY.assistido;

  const results: Record<string, unknown>[] = [];
  let sent = flushed;

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
        // Se a portaria já barrou alguém neste lote, o motivo é da missão e
        // continua valendo — não vale uma ida ao banco por lead para ouvir a
        // mesma resposta.
        const blockReason = blocks.size > 0
          ? [...blocks][0]
          : (await supabase.rpc("mission_can_send", { p_mission_id: missionId })).data;

        if (blockReason) {
          // Fica em 'approved', não em 'awaiting_approval'. A distinção
          // importa: 'awaiting_approval' diz "a IA quer que alguém decida", e
          // aqui ninguém precisa decidir nada — é só o expediente, o limite
          // do dia ou o WhatsApp fora do ar. Marcado como aprovado, o próprio
          // cron solta quando a janela abrir; marcado como pendente de
          // aprovação, esperava um clique que ninguém sabia que devia dar.
          blocks.add(String(blockReason));
        } else {
          const ok = await sendMessage(supabase, {
            userId, missionId, missionLeadId: row.id,
            lead, message: String(record.draft_message ?? ""),
            instanceId: (settings as { whatsapp_instance_id?: string }).whatsapp_instance_id ?? null,
            channel: mission.channel,
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

  await reportBlocks(supabase, userId, missionId, blocks);

  // Recalcula os contadores e conclui a missão só se não sobrou nada em
  // nenhuma fila — inclusive a de aprovação humana.
  const { data: work } = await supabase.rpc("mission_settle_status", { p_mission_id: missionId });
  const remaining = Number((work as { to_process?: number } | null)?.to_process ?? 0);

  return json({
    processed: results.length,
    sent,
    remaining,
    done: remaining === 0,
    work,
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
 * Assunto do e-mail, tirado da PRÓPRIA mensagem.
 *
 * A esteira gera um texto só, no formato de WhatsApp. Inventar um assunto
 * aqui seria escrever uma frase que nenhum quality gate conferiu — e assunto
 * é justamente a parte que o destinatário lê primeiro. Reaproveitar a
 * primeira frase mantém tudo dentro do que já foi checado.
 */
function assuntoDe(mensagem: string, nomeDaEmpresa?: string | null): string {
  const primeira = mensagem
    .split(/\n|(?<=[.!?])\s/)
    .map((p) => p.trim())
    .find((p) => p.length >= 12);

  if (!primeira) return nomeDaEmpresa ? `Contato — ${nomeDaEmpresa}` : "Contato";
  if (primeira.length <= 78) return primeira.replace(/[.!?]+$/, "");

  const corte = primeira.slice(0, 75);
  return corte.slice(0, corte.lastIndexOf(" ")) + "...";
}

/**
 * Delega à function do canal — `whatsapp-send` ou `email-send`. As duas já
 * carregam dono, parada de emergência, opt-out entre canais e limite.
 * Reimplementar isso aqui criaria uma segunda verdade sobre quando é
 * permitido enviar, que foi exatamente como quatro caminhos diferentes
 * furaram o opt-out antes.
 */
async function sendMessage(
  supabase: Supa,
  params: {
    userId: string;
    missionId: string;
    missionLeadId: string;
    /** Linha de `leads`. Só os campos que o envio usa. */
    lead: { id: string; phone: string; email?: string | null; business_name?: string | null; first_contact_at?: string | null };
    message: string;
    instanceId: string | null;
    /** Canal da missão. Ausente = whatsapp, que era o único que existia. */
    channel?: string | null;
  },
): Promise<boolean> {
  const { lead, message } = params;

  // `email_depois_whatsapp` só vai por e-mail se HOUVER e-mail. Sem isso a
  // missão inteira travaria em leads capturados do Maps, que na maioria das
  // vezes vêm só com telefone — e o usuário veria zero envios sem entender
  // por quê.
  const desejado = params.channel ?? "whatsapp";
  const temEmail = !!lead.email;
  const porEmail = desejado === "email" || (desejado === "email_depois_whatsapp" && temEmail);

  if (porEmail && !temEmail) {
    // Canal exclusivo de e-mail e lead sem endereço: é definitivo, não
    // adianta tentar de novo cinco vezes.
    await supabase.rpc("mission_lead_send_failed", {
      p_mission_lead_id: params.missionLeadId,
      p_error: "A missão é por e-mail e este lead não tem endereço de e-mail.",
      p_definitive: true,
      p_max_attempts: MAX_SEND_ATTEMPTS,
    });

    await logEvent(supabase, {
      userId: params.userId, missionId: params.missionId, leadId: lead.id,
      agent: "outreach",
      event: "send_failed",
      summary: `${lead.business_name} não tem e-mail, e esta missão envia por e-mail.`,
      level: "warning",
    });
    return false;
  }

  const canalUsado = porEmail ? "email" : "whatsapp";

  try {
    const res = porEmail
      ? await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/email-send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          to: lead.email,
          subject: assuntoDe(message, lead.business_name),
          text: message,
          lead_id: lead.id,
          user_id: params.userId,
        }),
      })
      : await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-send`, {
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
      const kind = classifySendFailure(res.status, detail);

      // Opt-out não é falha de envio: é resposta. Sai da fila e não volta.
      if (kind === "opt_out") {
        await supabase
          .from("mission_leads")
          .update({ status: "opted_out", error_message: detail.slice(0, 400) })
          .eq("id", params.missionLeadId);

        await logEvent(supabase, {
          userId: params.userId, missionId: params.missionId, leadId: lead.id,
          agent: "outreach",
          event: "opted_out",
          summary: `${lead.business_name} está na lista de bloqueio — nada foi enviado.`,
          detail: { status: res.status },
          level: "warning",
        });
        return false;
      }

      const { data: outcome } = await supabase.rpc("mission_lead_send_failed", {
        p_mission_lead_id: params.missionLeadId,
        p_error: detail,
        p_definitive: kind === "definitive",
        p_max_attempts: MAX_SEND_ATTEMPTS,
      });

      const willRetry = Boolean((outcome as { will_retry?: boolean } | null)?.will_retry);
      const attempts = Number((outcome as { attempts?: number } | null)?.attempts ?? 1);

      await logEvent(supabase, {
        userId: params.userId, missionId: params.missionId, leadId: lead.id,
        agent: "outreach",
        event: "send_failed",
        summary: willRetry
          ? `Falha ao enviar para ${lead.business_name} (tentativa ${attempts}). A mensagem continua na fila e será tentada de novo.`
          : `Falha ao enviar para ${lead.business_name} após ${attempts} tentativa(s). O rascunho ficou parado.`,
        detail: { status: res.status, attempts, will_retry: willRetry },
        // Enquanto vai tentar de novo é aviso, não erro: erro é o que exige
        // que alguém olhe. Marcar como erro cada oscilação de rede treina o
        // usuário a ignorar o feed justamente onde ele precisa confiar.
        level: willRetry ? "warning" : "error",
      });
      return false;
    }

    const now = new Date().toISOString();

    await supabase
      .from("mission_leads")
      .update({ status: "sent", sent_at: now, sent_channel: canalUsado })
      .eq("id", params.missionLeadId);

    // ATENÇÃO AO QUE NÃO ESTÁ AQUI: `stage: "Abordado"`.
    //
    // Essa linha existia e derrubava o UPDATE INTEIRO. O CHECK da tabela só
    // aceita Contato, Qualificado, Proposta, Negociação, Ganho e Perdido —
    // "Abordado" nunca existiu no vocabulário. O Postgres recusava a linha
    // toda, e como ninguém conferia o erro, `message_sent`, `first_contact_at`
    // e `last_contact_at` também não eram gravados.
    //
    // O estrago real era no `last_contact_at`: é dele que o follow-up calcula
    // há quantos dias o lead está sem resposta. Sem atualização, a conta
    // sempre partia da data de criação — ou seja, todo lead abordado ficaria
    // elegível a follow-up imediatamente, e de novo a cada rodada.
    //
    // O defeito estava dormente porque só dispara em envio bem-sucedido, e
    // nenhum envio jamais aconteceu neste projeto. Apareceria no primeiro dia
    // com o chip conectado.
    //
    // O estágio não muda mesmo: mandar a primeira abordagem não avança o lead
    // no funil — ele continua em "Contato" até responder.
    const { error: erroLead } = await supabase
      .from("leads")
      .update({
        message_sent: true,
        first_contact_at: lead.first_contact_at ?? now,
        last_contact_at: now,
      })
      .eq("id", lead.id);

    if (erroLead) {
      // Não interrompe: a mensagem JÁ FOI. Mas precisa gritar, porque daqui
      // para a frente o follow-up vai calcular em cima de data errada.
      console.error(
        `[orchestrator] mensagem enviada mas o lead ${lead.id} não foi atualizado:`,
        erroLead.message,
      );

      await logEvent(supabase, {
        userId: params.userId, missionId: params.missionId, leadId: lead.id,
        agent: "outreach",
        event: "lead_update_failed",
        summary:
          `A mensagem saiu para ${lead.business_name}, mas o registro do lead não ` +
          `atualizou. O follow-up pode calcular o prazo errado. Detalhe: ${erroLead.message}`,
        level: "error",
      });
    }

    // Registra no histórico para o agente conversacional ter o que ler
    // quando o lead responder.
    // O `email-send` ja registra o proprio historico com o assunto junto;
    // gravar de novo aqui deixaria a conversa com a mesma mensagem duas
    // vezes, e o agente conversacional leria como se tivesse insistido.
    if (!porEmail) {
      await supabase.from("chat_messages").insert({
        lead_id: lead.id,
        sender_type: "agent",
        content: message,
        status: "sent",
      });
    }

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
      summary: porEmail
        ? `E-mail enviado para ${lead.business_name} (${lead.email}).`
        : `Mensagem enviada para ${lead.business_name}.`,
      detail: { message },
      level: "success",
    });

    return true;
  } catch (e) {
    // Cair aqui é rede: DNS, timeout, conexão derrubada no meio. Nunca é
    // motivo definitivo — a mensagem pode nem ter chegado ao `whatsapp-send`.
    console.error("[orchestrator] envio falhou:", e);

    const { data: outcome } = await supabase.rpc("mission_lead_send_failed", {
      p_mission_lead_id: params.missionLeadId,
      p_error: e instanceof Error ? e.message : String(e),
      // Sem status HTTP: a requisição não chegou a ter resposta.
      p_definitive: classifySendFailure(null, null) === "definitive",
      p_max_attempts: MAX_SEND_ATTEMPTS,
    });

    await logEvent(supabase, {
      userId: params.userId, missionId: params.missionId, leadId: lead.id,
      agent: "outreach",
      event: "send_failed",
      summary: (outcome as { will_retry?: boolean } | null)?.will_retry
        ? `A rede falhou ao enviar para ${lead.business_name}. A mensagem continua na fila.`
        : `A rede falhou ao enviar para ${lead.business_name} e as tentativas se esgotaram.`,
      detail: { attempts: (outcome as { attempts?: number } | null)?.attempts ?? 1 },
      level: (outcome as { will_retry?: boolean } | null)?.will_retry ? "warning" : "error",
    });
    return false;
  }
}


/**
 * Solta as mensagens que já estavam aprovadas e ficaram retidas.
 *
 * Retenção não é falha: fora do horário comercial, no limite do dia ou com o
 * WhatsApp desconectado, segurar é o comportamento certo. O que faltava era
 * alguém voltar depois. Sem isto, "envio automático fora do horário" queria
 * dizer "envio nunca".
 *
 * A portaria é consultada a cada envio, não uma vez por lote: o limite
 * diário se esgota DENTRO do lote, e uma checagem só no começo deixaria
 * passar até sete mensagens além do teto — justamente o número que protege a
 * conta de bloqueio.
 */
async function flushApproved(
  supabase: Supa,
  params: {
    userId: string;
    missionId: string;
    instanceId: string | null;
    blocks: Set<string>;
    /** Canal da missão. Sem ele, todo envio aprovado sairia por WhatsApp. */
    channel?: string | null;
  },
): Promise<number> {
  const { data: ready } = await supabase
    .from("mission_leads")
    .select("id, draft_message, leads(*)")
    .eq("mission_id", params.missionId)
    .eq("status", "approved")
    .not("draft_message", "is", null)
    // Mais antigo primeiro: quem esperou mais sai antes.
    .order("updated_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (!ready || ready.length === 0) return 0;

  let sent = 0;

  for (const row of ready) {
    const lead = row.leads;
    if (!lead) continue;

    const { data: blockReason } = await supabase.rpc("mission_can_send", {
      p_mission_id: params.missionId,
    });

    if (blockReason) {
      // Bloqueio é da missão inteira, não deste lead: quando aparece, vale
      // para todos os que vêm depois. Parar aqui evita repetir a consulta
      // para cada um dos que sobraram.
      params.blocks.add(String(blockReason));
      break;
    }

    const ok = await sendMessage(supabase, {
      userId: params.userId,
      missionId: params.missionId,
      missionLeadId: row.id,
      lead,
      message: String(row.draft_message ?? ""),
      instanceId: params.instanceId,
      channel: params.channel,
    });
    if (ok) sent++;
  }

  return sent;
}

/**
 * Conta ao usuário, uma vez por motivo, por que a missão não enviou agora.
 *
 * Um evento por lead retido inundaria o feed: o cron roda a cada 5 minutos, e
 * uma missão parada das 18h às 9h geraria centenas de linhas dizendo a mesma
 * coisa. O motivo é da missão, então basta dizê-lo uma vez.
 */
async function reportBlocks(
  supabase: Supa,
  userId: string,
  missionId: string,
  blocks: Set<string>,
): Promise<void> {
  for (const reason of blocks) {
    await logEvent(supabase, {
      userId, missionId,
      agent: "outreach",
      event: "send_blocked",
      summary:
        `Envios retidos: ${reason.replace(/_/g, " ")}. ` +
        `As mensagens já escritas continuam na fila e saem sozinhas quando isso se resolver.`,
      detail: { reason },
      level: "warning",
    });
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
    .select("*, leads(*), missions(id, name, autonomy_level, channel)")
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
    channel: row.missions?.channel,
  });

  // Aprovar o último item da fila pode ser o que conclui a missão.
  await supabase.rpc("mission_settle_status", { p_mission_id: row.mission_id });

  return ok
    ? json({ status: "sent" })
    : json({ error: "A mensagem foi aprovada mas o envio falhou. Veja o feed." }, 502);
}

/**
 * Recoloca na fila um lead que falhou no envio.
 *
 * O ciclo das tentativas automáticas para em cinco. Depois disso o lead vira
 * `failed` e ficava sem caminho de volta pela interface — o rascunho continua
 * gravado, aprovado e revisado, e mesmo assim inalcançável.
 *
 * Zera o contador de propósito: se a pessoa está clicando, ela sabe de algo
 * que o sistema não sabe (o WhatsApp voltou, o número foi corrigido). Manter
 * o contador faria a primeira tentativa nova já bater no teto.
 *
 * Não recoloca quem saiu por opt-out. Aquele "failed" seria uma decisão do
 * lead, não uma falha de rede, e insistir seria desrespeito.
 */
async function retryLead(supabase: Supa, userId: string, body: Record<string, unknown>) {
  const id = str(body.mission_lead_id);
  if (!id) return json({ error: "mission_lead_id é obrigatório." }, 400);

  const { data: row } = await supabase
    .from("mission_leads")
    .select("id, mission_id, lead_id, status, draft_message, quality")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!row) return json({ error: "Item não encontrado." }, 404);

  if (row.status === "opted_out") {
    return json({ error: "Este número pediu para não receber mensagens." }, 409);
  }
  if (row.status !== "failed") {
    return json({ error: "Só faz sentido recolocar na fila quem falhou no envio." }, 400);
  }
  if (!row.draft_message) {
    return json({ error: "Não há rascunho para reenviar. Rode o lote de novo." }, 400);
  }

  await supabase
    .from("mission_leads")
    .update({ status: "approved", send_attempts: 0, error_message: null })
    .eq("id", id);

  await supabase.rpc("mission_settle_status", { p_mission_id: row.mission_id });

  await logEvent(supabase, {
    userId, missionId: row.mission_id, leadId: row.lead_id,
    agent: "supervisor",
    event: "retry_requested",
    summary: "Rascunho recolocado na fila de envio por decisão do usuário.",
    level: "info",
  });

  return json({ status: "approved" });
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

  // Recusar também esvazia a fila — e esvaziar a fila pode concluir a missão.
  await supabase.rpc("mission_settle_status", { p_mission_id: row.mission_id });

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

// Não existe mais `refreshCounters` aqui: recalcular contador e decidir se a
// missão acabou são a mesma pergunta feita ao banco em `mission_settle_status`.
// Manter as duas chamadas separadas em TypeScript foi o que permitiu a missão
// ser concluída com a fila de aprovação cheia — os contadores estavam certos e
// ninguém olhava para eles antes de encerrar.

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

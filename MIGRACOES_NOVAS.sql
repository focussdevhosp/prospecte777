-- ============================================================
-- MIGRAÇÕES NOVAS — PARA O BANCO QUE JÁ EXISTE
-- ============================================================
-- São 11 migrações, todas ADITIVAS: criam tabela, função, gatilho e
-- coluna. Nenhuma apaga dado, nenhuma remove coluna, nenhuma altera tipo de
-- coluna existente.
--
-- Use ESTE arquivo. O `SCHEMA_COMPLETO.sql` serve para subir um banco vazio
-- do zero e não é o seu caso.
--
-- COMO USAR
--   Supabase -> SQL Editor -> cole tudo -> Run.
--
-- ANTES DE RODAR, confira em Database -> Extensions:
--   pgcrypto   (gen_random_uuid, gen_random_bytes)
--   pg_cron    (agendamentos)
--   pg_net     (net.http_post, usado pelo cron)
--
-- O QUE MUDA NA SUA OPERAÇÃO
--   - os crons passam a autenticar por segredo interno em vez de anon key.
--     Hoje TODA execução automática morre em 401 — nenhum follow-up e nenhuma
--     manutenção jamais rodou pelo agendamento;
--   - gatilhos novos passam a fechar o funil da missão e alimentar o teste
--     A/B a cada resposta de lead e a cada negócio ganho;
--   - a política de `meetings` passa a conferir se o lead é seu (antes
--     conferia só o user_id).
--
-- Se algo parar no meio, me mande a mensagem de erro: ela diz em qual bloco
-- parou, e todos os blocos são idempotentes — dá para rodar de novo.
-- ============================================================


-- ############################################################
-- [01/11] 20260811120000_b7c8d9e0-0005-4a55-9c05-000000000005.sql
-- ############################################################

-- ============================================================
-- MISSÃO DE PROSPECÇÃO E ESTEIRA COMERCIAL
-- ============================================================
-- O produto sabia capturar empresa e sabia conversar quando o lead
-- respondia. O trecho do meio — decidir se vale abordar, o que oferecer, com
-- que argumento, e revisar antes de enviar — não existia em lugar nenhum:
-- acontecia na cabeça do usuário, ou não acontecia.
--
-- Estas tabelas dão lugar a esse trecho. `mission_leads` carrega um lead pela
-- esteira inteira e guarda a decisão de cada agente, para que qualquer nota,
-- oferta ou mensagem possa ser auditada depois.
--
-- Nada aqui altera tabela existente de forma destrutiva. `leads` continua
-- sendo a entidade central do CRM.
-- ============================================================

-- ------------------------------------------------------------
-- MISSÕES
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.missions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,

  -- Alvo
  segment           TEXT,
  niche             TEXT NOT NULL,
  city              TEXT,
  state             TEXT,
  region            TEXT,
  keywords          TEXT[] DEFAULT '{}',
  -- ICP em JSON: niches[], locations[], signals[], exclusions[], faixas.
  icp               JSONB NOT NULL DEFAULT '{}'::jsonb,
  target_count      INTEGER NOT NULL DEFAULT 50,

  -- Ofertas autorizadas nesta missão (ids de service_intelligence).
  -- Vazio significa "qualquer serviço do catálogo".
  offer_ids         UUID[] DEFAULT '{}',

  goal              TEXT NOT NULL DEFAULT 'agendar_demonstracao',
  channel           TEXT NOT NULL DEFAULT 'whatsapp',

  -- Limites operacionais. Somam-se aos limites globais da conta;
  -- vence sempre o mais restritivo.
  autonomy_level    TEXT NOT NULL DEFAULT 'assistido',
  daily_limit       INTEGER NOT NULL DEFAULT 30,
  start_hour        INTEGER NOT NULL DEFAULT 9,
  end_hour          INTEGER NOT NULL DEFAULT 18,
  work_days_only    BOOLEAN NOT NULL DEFAULT TRUE,
  -- Limites do Quality Gate. Vazio usa os padrões do código.
  quality_thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,

  status            TEXT NOT NULL DEFAULT 'draft',
  paused_at         TIMESTAMPTZ,
  paused_reason     TEXT,

  -- Contadores desnormalizados: o painel lê milhares de vezes e agregar
  -- mission_leads a cada abertura de tela não se paga.
  leads_found       INTEGER NOT NULL DEFAULT 0,
  leads_qualified   INTEGER NOT NULL DEFAULT 0,
  leads_drafted     INTEGER NOT NULL DEFAULT 0,
  leads_contacted   INTEGER NOT NULL DEFAULT 0,
  leads_replied     INTEGER NOT NULL DEFAULT 0,
  meetings_booked   INTEGER NOT NULL DEFAULT 0,

  last_run_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT missions_autonomy_valid
    CHECK (autonomy_level IN ('manual', 'assistido', 'semiautonomo', 'autonomo')),
  CONSTRAINT missions_status_valid
    CHECK (status IN ('draft', 'running', 'paused', 'completed', 'failed')),
  CONSTRAINT missions_goal_valid
    CHECK (goal IN ('agendar_demonstracao', 'solicitar_orcamento', 'falar_com_vendedor', 'vender', 'outro')),
  CONSTRAINT missions_hours_valid
    CHECK (start_hour >= 0 AND start_hour <= 23 AND end_hour >= 1 AND end_hour <= 24 AND end_hour > start_hour),
  CONSTRAINT missions_limits_valid
    CHECK (daily_limit > 0 AND daily_limit <= 1000 AND target_count > 0 AND target_count <= 2000)
);

CREATE INDEX IF NOT EXISTS idx_missions_user_status
  ON public.missions (user_id, status, created_at DESC);

-- ------------------------------------------------------------
-- LEAD DENTRO DA MISSÃO
-- ------------------------------------------------------------
-- Uma linha por lead por missão. Cada coluna JSONB é a saída de um agente,
-- guardada inteira para poder ser reaberta na tela e conferida.

CREATE TABLE IF NOT EXISTS public.mission_leads (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id       UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  lead_id          UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  status           TEXT NOT NULL DEFAULT 'found',

  -- Saídas dos agentes
  dossier          JSONB,
  qualification    JSONB,
  offer_match      JSONB,
  strategy         JSONB,
  draft_message    TEXT,
  quality          JSONB,
  rewrite_count    INTEGER NOT NULL DEFAULT 0,

  score            INTEGER,
  temperature      TEXT,

  approved_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  rejected_reason  TEXT,

  sent_at          TIMESTAMPTZ,
  replied_at       TIMESTAMPTZ,
  error_message    TEXT,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT mission_leads_status_valid CHECK (status IN (
    'found', 'enriched', 'qualified', 'disqualified',
    'drafted', 'blocked', 'awaiting_approval', 'approved', 'rejected',
    'sent', 'replied', 'meeting_booked', 'handed_off', 'failed', 'opted_out'
  )),
  -- O mesmo lead não entra duas vezes na mesma missão: sem isto, rodar a
  -- missão de novo geraria abordagem duplicada para quem já foi abordado.
  CONSTRAINT mission_leads_unique UNIQUE (mission_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_mission_leads_mission
  ON public.mission_leads (mission_id, status, score DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_mission_leads_user_pending
  ON public.mission_leads (user_id, status)
  WHERE status IN ('awaiting_approval', 'drafted');

CREATE INDEX IF NOT EXISTS idx_mission_leads_lead
  ON public.mission_leads (lead_id);

-- ------------------------------------------------------------
-- FEED DE ATIVIDADE
-- ------------------------------------------------------------
-- "Toda decisão importante deve ser auditável." Sem isto a IA autônoma é uma
-- caixa preta, e caixa preta que manda mensagem em nome da empresa não é algo
-- que se possa deixar rodando.

CREATE TABLE IF NOT EXISTS public.agent_events (
  id           BIGSERIAL PRIMARY KEY,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id   UUID REFERENCES public.missions(id) ON DELETE CASCADE,
  lead_id      UUID REFERENCES public.leads(id) ON DELETE SET NULL,

  agent        TEXT NOT NULL,
  event        TEXT NOT NULL,
  summary      TEXT NOT NULL,
  detail       JSONB,
  level        TEXT NOT NULL DEFAULT 'info',

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT agent_events_level_valid CHECK (level IN ('info', 'success', 'warning', 'error'))
);

CREATE INDEX IF NOT EXISTS idx_agent_events_feed
  ON public.agent_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_events_mission
  ON public.agent_events (mission_id, created_at DESC);

-- ------------------------------------------------------------
-- CONSUMO DE IA
-- ------------------------------------------------------------
-- Não havia nenhum registro de token, custo ou latência. Um job de 500 leads
-- gastava sem deixar rastro.

CREATE TABLE IF NOT EXISTS public.ai_usage (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mission_id        UUID REFERENCES public.missions(id) ON DELETE SET NULL,
  lead_id           UUID REFERENCES public.leads(id) ON DELETE SET NULL,

  agent             TEXT,
  purpose           TEXT NOT NULL,
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms        INTEGER NOT NULL DEFAULT 0,
  cost_usd          NUMERIC(12, 6) NOT NULL DEFAULT 0,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_user_day
  ON public.ai_usage (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_mission
  ON public.ai_usage (mission_id, created_at DESC);

-- ------------------------------------------------------------
-- PARADA DE EMERGÊNCIA
-- ------------------------------------------------------------
-- Freio global da conta. Precisa ser uma coluna, não um estado em memória:
-- quem aperta o botão espera que TUDO pare, inclusive o cron que roda daqui
-- a três minutos numa instância diferente.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS outbound_paused BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS outbound_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outbound_paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS default_autonomy_level TEXT NOT NULL DEFAULT 'assistido';

COMMENT ON COLUMN public.user_settings.outbound_paused IS
  'Parada de emergência: quando TRUE, nenhum envio de prospecção sai, por nenhum caminho.';

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------

ALTER TABLE public.missions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mission_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own missions"      ON public.missions;
DROP POLICY IF EXISTS "own mission leads" ON public.mission_leads;
DROP POLICY IF EXISTS "own agent events"  ON public.agent_events;
DROP POLICY IF EXISTS "own ai usage"      ON public.ai_usage;

CREATE POLICY "own missions" ON public.missions
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE POLICY "own mission leads" ON public.mission_leads
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Feed e consumo são escritos pelas edge functions (service role, que passa
-- por cima de RLS). O usuário só lê — evita que o front adultere a auditoria.
CREATE POLICY "own agent events" ON public.agent_events
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "own ai usage" ON public.ai_usage
  FOR SELECT USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- PORTARIA DA MISSÃO
-- ------------------------------------------------------------

/**
 * Diz se a missão pode enviar AGORA.
 *
 * Concentra num lugar só o que antes estava espalhado entre o frontend, o
 * job-processor e o cron — cada um com uma versão ligeiramente diferente da
 * mesma regra. Falha fechada: em qualquer dúvida, não envia.
 *
 * Devolve NULL quando pode enviar, ou o motivo do bloqueio.
 */
CREATE OR REPLACE FUNCTION public.mission_can_send(p_mission_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mission   RECORD;
  v_settings  RECORD;
  v_sent_today INTEGER;
  v_hour      INTEGER;
  v_dow       INTEGER;
BEGIN
  SELECT * INTO v_mission FROM public.missions WHERE id = p_mission_id;
  IF NOT FOUND THEN
    RETURN 'missao_nao_encontrada';
  END IF;

  IF v_mission.paused_at IS NOT NULL THEN
    RETURN 'missao_pausada';
  END IF;

  IF v_mission.status <> 'running' THEN
    RETURN 'missao_nao_esta_ativa';
  END IF;

  SELECT * INTO v_settings
  FROM public.user_settings
  WHERE user_id = v_mission.user_id;

  IF FOUND AND v_settings.outbound_paused THEN
    RETURN 'parada_de_emergencia_ativa';
  END IF;

  IF FOUND AND COALESCE(v_settings.whatsapp_connected, FALSE) = FALSE THEN
    RETURN 'whatsapp_desconectado';
  END IF;

  -- Horário do Brasil (UTC-3). O servidor roda em UTC.
  v_hour := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::INTEGER;
  v_dow  := EXTRACT(DOW  FROM (NOW() AT TIME ZONE 'America/Sao_Paulo'))::INTEGER;

  IF v_mission.work_days_only AND (v_dow = 0 OR v_dow = 6) THEN
    RETURN 'fora_de_dia_util';
  END IF;

  IF v_hour < v_mission.start_hour OR v_hour >= v_mission.end_hour THEN
    RETURN 'fora_do_horario_permitido';
  END IF;

  SELECT COUNT(*) INTO v_sent_today
  FROM public.mission_leads
  WHERE mission_id = p_mission_id
    AND sent_at IS NOT NULL
    AND sent_at >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;

  IF v_sent_today >= v_mission.daily_limit THEN
    RETURN 'limite_diario_da_missao_atingido';
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mission_can_send(UUID) TO authenticated, service_role;

/**
 * Parada de emergência da conta inteira.
 *
 * Pausa o freio global e todas as missões ativas na mesma transação, para não
 * existir janela em que uma delas ainda dispara.
 */
CREATE OR REPLACE FUNCTION public.emergency_stop(
  p_user_id UUID,
  p_reason  TEXT DEFAULT 'parada manual'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_paused INTEGER;
BEGIN
  UPDATE public.user_settings
  SET outbound_paused = TRUE,
      outbound_paused_at = NOW(),
      outbound_paused_reason = p_reason
  WHERE user_id = p_user_id;

  UPDATE public.missions
  SET status = 'paused',
      paused_at = NOW(),
      paused_reason = p_reason,
      updated_at = NOW()
  WHERE user_id = p_user_id
    AND status = 'running';

  GET DIAGNOSTICS v_paused = ROW_COUNT;

  INSERT INTO public.agent_events (user_id, agent, event, summary, level)
  VALUES (p_user_id, 'supervisor', 'emergency_stop',
          format('Parada de emergência: %s missão(ões) pausada(s). Motivo: %s', v_paused, p_reason),
          'warning');

  RETURN v_paused;
END;
$$;

GRANT EXECUTE ON FUNCTION public.emergency_stop(UUID, TEXT) TO authenticated, service_role;

/** Retoma os envios. Missões continuam pausadas até serem retomadas uma a uma. */
CREATE OR REPLACE FUNCTION public.resume_outbound(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.user_settings
  SET outbound_paused = FALSE,
      outbound_paused_at = NULL,
      outbound_paused_reason = NULL
  WHERE user_id = p_user_id;

  INSERT INTO public.agent_events (user_id, agent, event, summary, level)
  VALUES (p_user_id, 'supervisor', 'resume', 'Envios retomados.', 'info');
END;
$$;

GRANT EXECUTE ON FUNCTION public.resume_outbound(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- PAINEL OPERACIONAL
-- ------------------------------------------------------------

/**
 * Números do dia + o que precisa de atenção humana.
 *
 * Uma chamada só: o painel antigo fazia seis consultas para montar a tela.
 */
CREATE OR REPLACE FUNCTION public.command_center(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH today AS (
    SELECT (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE AS d
  )
  SELECT jsonb_build_object(
    'found_today', (
      SELECT COUNT(*) FROM public.mission_leads, today
      WHERE user_id = p_user_id AND created_at >= today.d
    ),
    'qualified_today', (
      SELECT COUNT(*) FROM public.mission_leads, today
      WHERE user_id = p_user_id AND created_at >= today.d
        AND status NOT IN ('found', 'disqualified', 'failed')
    ),
    'contacted_today', (
      SELECT COUNT(*) FROM public.mission_leads, today
      WHERE user_id = p_user_id AND sent_at >= today.d
    ),
    'replied_today', (
      SELECT COUNT(*) FROM public.mission_leads, today
      WHERE user_id = p_user_id AND replied_at >= today.d
    ),
    'meetings_today', (
      SELECT COUNT(*) FROM public.meetings, today
      WHERE user_id = p_user_id AND scheduled_at >= today.d
        AND scheduled_at < today.d + 1
    ),
    -- O que exige ação humana agora
    'awaiting_approval', (
      SELECT COUNT(*) FROM public.mission_leads
      WHERE user_id = p_user_id AND status = 'awaiting_approval'
    ),
    'awaiting_reply', (
      SELECT COUNT(*) FROM public.leads
      WHERE user_id = p_user_id
        AND last_response_at IS NOT NULL
        AND (last_contact_at IS NULL OR last_response_at > last_contact_at)
    ),
    'overdue_followups', (
      SELECT COUNT(*) FROM public.leads
      WHERE user_id = p_user_id
        AND next_follow_up_at IS NOT NULL
        AND next_follow_up_at < NOW()
        AND stage NOT IN ('Ganho', 'Perdido')
    ),
    'hot_leads', (
      SELECT COUNT(*) FROM public.leads
      WHERE user_id = p_user_id AND temperature IN ('quente', 'muito_quente')
    ),
    'handoffs_pending', (
      SELECT COUNT(*) FROM public.agent_escalations
      WHERE user_id = p_user_id AND resolved_at IS NULL
    ),
    'paused_missions', (
      SELECT COUNT(*) FROM public.missions
      WHERE user_id = p_user_id AND status = 'paused'
    ),
    'automation_errors', (
      SELECT COUNT(*) FROM public.agent_events, today
      WHERE user_id = p_user_id AND level = 'error' AND created_at >= today.d
    ),
    'outbound_paused', (
      SELECT COALESCE(outbound_paused, FALSE) FROM public.user_settings
      WHERE user_id = p_user_id
    ),
    'ai_cost_today', (
      SELECT COALESCE(ROUND(SUM(cost_usd), 4), 0) FROM public.ai_usage, today
      WHERE user_id = p_user_id AND created_at >= today.d
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.command_center(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- MEMÓRIA COMERCIAL
-- ------------------------------------------------------------
-- `lead_memory` já existia com tipos livres. Estes tipos passam a ser os
-- reconhecidos pela esteira; a coluna continua TEXT para não quebrar o que
-- o agente conversacional já grava hoje.

COMMENT ON TABLE public.lead_memory IS
  'Memória comercial estruturada. Tipos usados pela esteira: need, interest, '
  'objection, commitment, preference, context, next_action.';

-- ------------------------------------------------------------
-- GATILHOS DE updated_at
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_missions_touch ON public.missions;
CREATE TRIGGER trg_missions_touch
  BEFORE UPDATE ON public.missions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_mission_leads_touch ON public.mission_leads;
CREATE TRIGGER trg_mission_leads_touch
  BEFORE UPDATE ON public.mission_leads
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ############################################################
-- [02/11] 20260811140000_c8d9e0f1-0006-4a66-9c06-000000000006.sql
-- ############################################################

-- ============================================================
-- AGREGADOR DE FONTES, CACHE E TETO DE GASTO DE IA
-- ============================================================
-- Três lacunas que a esteira deixou abertas:
--
--   1. As fontes de captura não tinham memória. Uma que estava fora do ar
--      continuava sendo chamada a cada busca, gastando os 20s de timeout de
--      todo mundo, porque nada lembrava que ela já falhara três vezes.
--
--   2. Buscar "clínicas de estética em Itu" duas vezes no mesmo dia refazia
--      o trabalho inteiro: mesmo custo, mesmo tempo, mesmo risco de bloqueio,
--      para chegar ao mesmo resultado.
--
--   3. `ai_usage` registrava o custo mas nada o interrompia. Uma missão de
--      500 leads disparava 500+ chamadas sem teto configurável.
-- ============================================================

-- ------------------------------------------------------------
-- ESTADO DOS PROVIDERS
-- ------------------------------------------------------------
-- Global, não por usuário: se o Overpass está fora do ar, está fora para
-- todo mundo, e cada conta descobrir isso sozinha custaria 3 falhas por
-- conta antes de qualquer uma parar de tentar.

CREATE TABLE IF NOT EXISTS public.provider_states (
  provider_id          TEXT PRIMARY KEY,
  enabled              BOOLEAN NOT NULL DEFAULT TRUE,
  health               TEXT NOT NULL DEFAULT 'healthy',
  priority             INTEGER NOT NULL DEFAULT 100,

  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  -- Enquanto isto estiver no futuro, a fonte é pulada.
  circuit_open_until   TIMESTAMPTZ,

  last_run_at          TIMESTAMPTZ,
  last_error           TEXT,

  total_runs           INTEGER NOT NULL DEFAULT 0,
  total_found          INTEGER NOT NULL DEFAULT 0,
  -- O número que importa: quantas empresas ÚNICAS a fonte agregou. Uma
  -- fonte que acha 300 empresas que as outras já tinham não vale nada.
  total_unique         INTEGER NOT NULL DEFAULT 0,
  avg_latency_ms       INTEGER NOT NULL DEFAULT 0,

  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT provider_health_valid
    CHECK (health IN ('healthy', 'degraded', 'offline', 'not_configured'))
);

COMMENT ON TABLE public.provider_states IS
  'Saúde e desempenho das fontes de empresas. Infraestrutura interna: o '
  'cliente final não vê quais fontes existem.';

-- Só service role e admin da plataforma enxergam. Para o cliente existe
-- apenas "a busca" — expor a lista de fontes seria expor a engenharia.
ALTER TABLE public.provider_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin reads provider states" ON public.provider_states;
CREATE POLICY "admin reads provider states" ON public.provider_states
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- ------------------------------------------------------------
-- CACHE DE BUSCA
-- ------------------------------------------------------------
-- Comunitário de propósito, como o `community_leads` que já existe: se
-- alguém buscou "clínicas de estética em Itu" há duas horas, refazer a
-- consulta não traz empresa nova — traz custo e risco de bloqueio.

CREATE TABLE IF NOT EXISTS public.search_cache (
  cache_key    TEXT PRIMARY KEY,
  term         TEXT NOT NULL,
  location     TEXT NOT NULL,
  businesses   JSONB NOT NULL DEFAULT '[]'::jsonb,
  result_count INTEGER NOT NULL DEFAULT 0,
  hits         INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_search_cache_fresh
  ON public.search_cache (created_at DESC);

ALTER TABLE public.search_cache ENABLE ROW LEVEL SECURITY;

-- Escrita só por service role (edge function). Leitura acontece do lado do
-- servidor, então não há policy de SELECT para o cliente.
DROP POLICY IF EXISTS "no direct client access" ON public.search_cache;

/** Limpa cache vencido. Chamado pelo cron. */
CREATE OR REPLACE FUNCTION public.purge_search_cache(p_hours INTEGER DEFAULT 72)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.search_cache
  WHERE created_at < NOW() - (p_hours || ' hours')::INTERVAL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_search_cache(INTEGER) TO service_role;

-- ------------------------------------------------------------
-- TETO DE GASTO DE IA
-- ------------------------------------------------------------

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS ai_daily_budget_usd   NUMERIC(10, 2) NOT NULL DEFAULT 5.00,
  ADD COLUMN IF NOT EXISTS ai_monthly_budget_usd NUMERIC(10, 2) NOT NULL DEFAULT 100.00;

COMMENT ON COLUMN public.user_settings.ai_daily_budget_usd IS
  'Teto diário de gasto com IA. Ao atingir, a esteira para de gerar mensagem '
  '— responder conversa em andamento continua permitido.';

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS ai_budget_usd NUMERIC(10, 2);

COMMENT ON COLUMN public.missions.ai_budget_usd IS
  'Teto de gasto desta missão. NULL usa apenas os limites da conta.';

/**
 * Diz se ainda há orçamento de IA. Devolve NULL quando pode gastar, ou o
 * motivo do bloqueio.
 *
 * Falha ABERTA de propósito: se o cálculo do orçamento quebrar, a operação
 * comercial não pode parar por causa da contabilidade. O contrário — parar
 * de vender porque a telemetria falhou — custa mais que o estouro.
 */
CREATE OR REPLACE FUNCTION public.ai_budget_check(
  p_user_id    UUID,
  p_mission_id UUID DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily_cap   NUMERIC;
  v_monthly_cap NUMERIC;
  v_mission_cap NUMERIC;
  v_today       NUMERIC;
  v_month       NUMERIC;
  v_mission     NUMERIC;
BEGIN
  SELECT ai_daily_budget_usd, ai_monthly_budget_usd
    INTO v_daily_cap, v_monthly_cap
  FROM public.user_settings
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(cost_usd), 0) INTO v_today
  FROM public.ai_usage
  WHERE user_id = p_user_id
    AND created_at >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE;

  IF v_daily_cap > 0 AND v_today >= v_daily_cap THEN
    RETURN format('limite diário de IA atingido (US$ %s de %s)',
                  ROUND(v_today, 2), ROUND(v_daily_cap, 2));
  END IF;

  SELECT COALESCE(SUM(cost_usd), 0) INTO v_month
  FROM public.ai_usage
  WHERE user_id = p_user_id
    AND created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo');

  IF v_monthly_cap > 0 AND v_month >= v_monthly_cap THEN
    RETURN format('limite mensal de IA atingido (US$ %s de %s)',
                  ROUND(v_month, 2), ROUND(v_monthly_cap, 2));
  END IF;

  IF p_mission_id IS NOT NULL THEN
    SELECT ai_budget_usd INTO v_mission_cap
    FROM public.missions WHERE id = p_mission_id;

    IF v_mission_cap IS NOT NULL AND v_mission_cap > 0 THEN
      SELECT COALESCE(SUM(cost_usd), 0) INTO v_mission
      FROM public.ai_usage WHERE mission_id = p_mission_id;

      IF v_mission >= v_mission_cap THEN
        RETURN format('orçamento da missão esgotado (US$ %s de %s)',
                      ROUND(v_mission, 2), ROUND(v_mission_cap, 2));
      END IF;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ai_budget_check(UUID, UUID) TO authenticated, service_role;

/** Consumo de IA por período, para o painel de custos. */
CREATE OR REPLACE FUNCTION public.ai_cost_summary(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'today', (
      SELECT COALESCE(ROUND(SUM(cost_usd), 4), 0) FROM public.ai_usage
      WHERE user_id = p_user_id
        AND created_at >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE
    ),
    'month', (
      SELECT COALESCE(ROUND(SUM(cost_usd), 4), 0) FROM public.ai_usage
      WHERE user_id = p_user_id
        AND created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
    ),
    'daily_cap',   (SELECT ai_daily_budget_usd   FROM public.user_settings WHERE user_id = p_user_id),
    'monthly_cap', (SELECT ai_monthly_budget_usd FROM public.user_settings WHERE user_id = p_user_id),
    'by_agent', (
      SELECT COALESCE(jsonb_object_agg(agent, total), '{}'::jsonb)
      FROM (
        SELECT COALESCE(agent, 'outros') AS agent, ROUND(SUM(cost_usd), 4) AS total
        FROM public.ai_usage
        WHERE user_id = p_user_id
          AND created_at >= DATE_TRUNC('month', NOW() AT TIME ZONE 'America/Sao_Paulo')
        GROUP BY 1
      ) t
    ),
    'avg_latency_ms', (
      SELECT COALESCE(ROUND(AVG(latency_ms)), 0) FROM public.ai_usage
      WHERE user_id = p_user_id
        AND created_at >= (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.ai_cost_summary(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- MISSÕES PENDENTES PARA O CRON
-- ------------------------------------------------------------

/**
 * Missões ativas com lead esperando na esteira.
 *
 * Hoje o lote só anda quando alguém abre a tela e clica. Com isto o cron
 * consegue tocar a fila sozinho — que é o que "autônomo" significa.
 */
CREATE OR REPLACE FUNCTION public.missions_pending_batch(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (mission_id UUID, user_id UUID, pending INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.user_id, COUNT(ml.id)::INTEGER AS pending
  FROM public.missions m
  JOIN public.mission_leads ml
    ON ml.mission_id = m.id AND ml.status = 'found'
  LEFT JOIN public.user_settings us ON us.user_id = m.user_id
  WHERE m.status = 'running'
    AND m.paused_at IS NULL
    AND COALESCE(us.outbound_paused, FALSE) = FALSE
  GROUP BY m.id, m.user_id
  ORDER BY pending DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.missions_pending_batch(INTEGER) TO service_role;

-- ------------------------------------------------------------
-- PAINEL DE FONTES (SUPER ADMIN)
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.data_sources_overview()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result JSONB;
BEGIN
  -- Infraestrutura interna: só admin da plataforma.
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso restrito';
  END IF;

  SELECT jsonb_build_object(
    'providers', COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', provider_id,
        'enabled', enabled,
        'health', health,
        'priority', priority,
        'total_runs', total_runs,
        'total_found', total_found,
        'total_unique', total_unique,
        'unique_rate', CASE WHEN total_found > 0
          THEN ROUND(total_unique::NUMERIC / total_found, 3) ELSE 0 END,
        'avg_latency_ms', avg_latency_ms,
        'consecutive_failures', consecutive_failures,
        'circuit_open_until', circuit_open_until,
        'last_run_at', last_run_at,
        'last_error', last_error
      ) ORDER BY priority
    ), '[]'::jsonb),
    'cache_entries', (SELECT COUNT(*) FROM public.search_cache),
    'cache_hits',    (SELECT COALESCE(SUM(hits), 0) FROM public.search_cache)
  ) INTO v_result
  FROM public.provider_states;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.data_sources_overview() TO authenticated, service_role;

DROP TRIGGER IF EXISTS trg_provider_states_touch ON public.provider_states;
CREATE TRIGGER trg_provider_states_touch
  BEFORE UPDATE ON public.provider_states
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- ############################################################
-- [03/11] 20260811160000_d9e0f1a2-0007-4a77-9c07-000000000007.sql
-- ############################################################

-- ============================================================
-- O CRON PRECISA PROVAR QUE É O CRON
-- ============================================================
-- Duas coisas erradas nos agendamentos antigos, e a segunda é a que
-- realmente quebrava:
--
-- 1. O endereço do projeto estava fixo dentro do comando do cron, em cinco
--    migrações diferentes:
--
--      url := 'https://<ref>.supabase.co/functions/v1/cron-tasks'
--
--    Enquanto existe um projeto só, isso passa despercebido. No dia em que
--    alguém restaurar um backup em outro projeto, o cron de lá continua
--    chamando as funções daqui — e não falha, funciona, operando o banco
--    errado. Passa a morar em `private.app_config`: trocar vira um UPDATE
--    numa linha, não uma caçada por string em migração antiga.
--
-- 2. Os agendamentos mandavam a ANON KEY no Authorization. As functions
--    internas passaram a exigir prova de chamada interna, e a anon key não é
--    uma — então TODA execução automática morria em 401. Nenhum follow-up,
--    nenhuma manutenção e nenhum lote de missão jamais rodou pelo cron.
--
-- Esta migração é a última da fila de propósito: reagenda por cima do que as
-- anteriores deixaram, então o histórico continua íntegro e o resultado
-- final está correto em qualquer projeto onde ela rodar.
--
-- SE UM DIA VOCÊ TROCAR DE PROJETO: altere o valor abaixo antes de rodar. A
-- conferência do fim FALHA de propósito se sobrar cron apontando para outro
-- lugar — é melhor a migração parar do que o agendamento operar o banco
-- errado em silêncio.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENDEREÇO DAS FUNÇÕES
-- ------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON private.app_config FROM PUBLIC, anon, authenticated;

/**
 * Descobre o endereço das edge functions deste projeto.
 *
 * Ordem: valor configurado > referência do próprio banco > nada.
 *
 * O nome do banco no Supabase não carrega o project ref, então não dá para
 * deduzir com segurança — por isso o valor configurado é a fonte da verdade,
 * e a função devolve NULL em vez de chutar. Chutar aqui significaria
 * disparar cron contra um endereço inexistente e ninguém entender por quê.
 */
CREATE OR REPLACE FUNCTION private.functions_base_url()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT value FROM private.app_config WHERE key = 'functions_base_url';
$$;

-- Endereço deste projeto. Se um dia mudar, basta:
--   UPDATE private.app_config
--      SET value = 'https://<outro-ref>.supabase.co/functions/v1/'
--    WHERE key = 'functions_base_url';
-- e rodar o bloco de reagendamento abaixo.
INSERT INTO private.app_config (key, value)
VALUES ('functions_base_url', 'https://oeztpxyprifabkvysroh.supabase.co/functions/v1/')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Garante o segredo interno mesmo que esta migração rode isolada.
INSERT INTO private.app_config (key, value)
VALUES ('internal_secret', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2. REAGENDAMENTO
-- ------------------------------------------------------------
-- Recria todos os jobs apontando para o endereço configurado e
-- autenticando pelo segredo interno.
--
-- Os agendamentos originais mandavam a ANON KEY no Authorization. Além de
-- ser o projeto errado, era autenticação errada: as functions internas
-- passaram a exigir prova de chamada interna, e a anon key não é uma.

DO $$
DECLARE
  v_secret TEXT;
  v_base   TEXT;
  v_job    RECORD;
BEGIN
  SELECT value INTO v_base   FROM private.app_config WHERE key = 'functions_base_url';
  SELECT value INTO v_secret FROM private.app_config WHERE key = 'internal_secret';

  IF v_base IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'functions_base_url ou internal_secret ausente — crons não reagendados.';
    RETURN;
  END IF;

  FOR v_job IN
    SELECT * FROM (VALUES
      -- cron-tasks é o motor de manutenção: dentro dele roda também o
      -- avanço dos lotes das missões (tarefa `run_missions`).
      ('cron-tasks-every-5min',        '*/5 * * * *',  'cron-tasks',            '{}'),
      ('scheduled-prospecting-hourly', '0 * * * *',    'scheduled-prospecting', '{"action":"check_and_run"}'),
      ('follow-up-check',              '*/30 * * * *', 'follow-up',             '{"action":"process_follow_ups"}'),
      ('check-subscriptions-daily',    '0 */6 * * *',  'check-subscriptions',   '{}')
    ) AS t(job_name, schedule, fn, body)
  LOOP
    -- cron.unschedule estoura se o job não existir; num projeto novo é o
    -- caso normal, então o erro é ignorado de propósito.
    BEGIN
      PERFORM cron.unschedule(v_job.job_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      v_job.job_name,
      v_job.schedule,
      format(
        $cmd$SELECT net.http_post(
          url := %L,
          headers := %L::jsonb,
          body := %L::jsonb
        ) AS request_id;$cmd$,
        v_base || v_job.fn,
        json_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', v_secret
        )::text,
        v_job.body
      )
    );
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 3. CONFERÊNCIA
-- ------------------------------------------------------------
-- Nenhum job pode ter sobrado apontando para outro projeto. Se sobrar, a
-- migração falha aqui em vez de deixar o problema silencioso em produção —
-- que é exatamente como ele passou despercebido da primeira vez.

DO $$
DECLARE
  v_base    TEXT;
  v_estranhos INTEGER;
BEGIN
  SELECT value INTO v_base FROM private.app_config WHERE key = 'functions_base_url';

  SELECT COUNT(*) INTO v_estranhos
  FROM cron.job
  WHERE command LIKE '%supabase.co/functions/v1/%'
    AND command NOT LIKE '%' || v_base || '%';

  IF v_estranhos > 0 THEN
    RAISE EXCEPTION
      'Há % job(s) de cron apontando para outro projeto Supabase. '
      'Rode: SELECT jobname, command FROM cron.job; e reagende manualmente.',
      v_estranhos;
  END IF;
END;
$$;


-- ############################################################
-- [04/11] 20260811180000_e0f1a2b3-0008-4a88-9c08-000000000008.sql
-- ############################################################

-- ============================================================
-- O FUNIL DA MISSÃO PRECISA CHEGAR ATÉ O FIM
-- ============================================================
-- `mission_leads` tem os estados 'replied' e 'meeting_booked', a tela desenha
-- as cinco etapas do funil, e `command_center()` devolve `replied_today` e
-- `meetings_today`. Só que nenhum código fora do orquestrador jamais escreveu
-- nessa tabela:
--
--   $ grep -rn "mission_leads" supabase/functions/ | grep -v sales-orchestrator
--   (vazio)
--
-- Quer dizer: a esteira levava o lead até 'sent' e parava ali. Quando o lead
-- respondia, quem sabia disso era `leads.last_response_at`; quando a reunião
-- era marcada, quem sabia era `meetings`. A missão nunca ficava sabendo.
-- As duas últimas etapas do funil mostravam zero para sempre — não porque a
-- operação ia mal, mas porque ninguém contava.
--
-- Uma tela que exibe zero permanente é pior que uma tela ausente: a ausente
-- avisa que falta algo, a zerada afirma um fato falso. E o número que estava
-- faltando é justamente o que decide se a abordagem funciona.
--
-- POR QUE GATILHO NO BANCO, E NÃO CHAMADA NO CÓDIGO
-- Já existem DOIS caminhos que inserem reunião (`webhook` e
-- `whatsapp-ai-reply`) e a resposta do lead entra por mais de um lugar.
-- Espalhar `update mission_leads` por esses pontos significa que o próximo
-- caminho de resposta — que vai existir — nasce esquecendo de avançar o
-- funil, e o defeito volta calado. No gatilho, avançar deixa de ser algo que
-- alguém precisa lembrar de fazer.
-- ============================================================

-- ------------------------------------------------------------
-- 1. CONTADORES EM UM LUGAR SÓ
-- ------------------------------------------------------------
-- A regra de "o que conta como abordado/respondido" estava escrita em
-- TypeScript dentro do orquestrador. Com o gatilho, ela passaria a existir em
-- dois lugares — e duas cópias de uma regra sempre acabam discordando.
-- Passa a morar aqui; o orquestrador chama esta função.
--
-- Recalcula em vez de incrementar de propósito. Incremento depende de saber
-- o estado anterior de cada linha e erra para sempre quando erra uma vez;
-- recontar é exato, e o custo é uma varredura por índice sobre no máximo
-- 2000 linhas (`target_count` tem teto).

CREATE OR REPLACE FUNCTION public.mission_refresh_counters(p_mission_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.missions m
  SET leads_found     = c.found,
      leads_qualified = c.qualified,
      leads_drafted   = c.drafted,
      leads_contacted = c.contacted,
      leads_replied   = c.replied,
      meetings_booked = c.meetings,
      updated_at      = NOW()
  FROM (
    SELECT
      COUNT(*)                                                            AS found,
      COUNT(*) FILTER (WHERE status NOT IN ('found', 'disqualified', 'failed')) AS qualified,
      COUNT(*) FILTER (WHERE status IN ('drafted', 'awaiting_approval', 'approved',
                                        'sent', 'replied', 'meeting_booked', 'handed_off')) AS drafted,
      COUNT(*) FILTER (WHERE status IN ('sent', 'replied', 'meeting_booked', 'handed_off')) AS contacted,
      -- Quem marcou reunião obviamente respondeu; quem foi passado para
      -- humano só chega lá depois de responder. Contar só o status literal
      -- 'replied' faria o número CAIR quando o lead avança — o oposto do que
      -- um funil deve mostrar.
      COUNT(*) FILTER (WHERE status IN ('replied', 'meeting_booked', 'handed_off'))         AS replied,
      COUNT(*) FILTER (WHERE status = 'meeting_booked')                                    AS meetings
    FROM public.mission_leads
    WHERE mission_id = p_mission_id
  ) c
  WHERE m.id = p_mission_id;
$$;

GRANT EXECUTE ON FUNCTION public.mission_refresh_counters(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2. O LEAD RESPONDEU
-- ------------------------------------------------------------

/**
 * Avança para 'replied' a linha de missão que de fato abordou este lead.
 *
 * Duas decisões que valem explicação:
 *
 * 1. Só concorre missão com `sent_at` preenchido. O mesmo lead pode estar em
 *    várias missões; a resposta pertence a quem escreveu. Missão que ainda
 *    não enviou nada não pode reivindicar uma resposta que não provocou —
 *    seria inflar a conversão dela com o trabalho de outra.
 *
 * 2. Entre as que enviaram, ganha a de envio mais recente: é a mensagem que
 *    o lead tinha na frente quando respondeu.
 *
 * `replied_at` só é gravado na primeira resposta. A métrica que interessa é
 * o tempo até o lead reagir; sobrescrever a cada mensagem transformaria isso
 * em "quando ele falou pela última vez", que já existe em `leads`.
 */
CREATE OR REPLACE FUNCTION public.mission_lead_on_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT id, mission_id, user_id, status
    INTO v_row
  FROM public.mission_leads
  WHERE lead_id = NEW.lead_id
    AND sent_at IS NOT NULL
    -- Não regride quem já está adiante no funil.
    AND status NOT IN ('replied', 'meeting_booked', 'handed_off', 'opted_out')
  ORDER BY sent_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.mission_leads
  SET status     = 'replied',
      replied_at = COALESCE(replied_at, NEW.created_at)
  WHERE id = v_row.id;

  PERFORM public.mission_refresh_counters(v_row.mission_id);

  INSERT INTO public.agent_events (user_id, mission_id, lead_id, agent, event, summary, detail, level)
  VALUES (
    v_row.user_id, v_row.mission_id, NEW.lead_id,
    'orchestrator', 'lead_replied',
    'Lead respondeu à abordagem.',
    jsonb_build_object(
      'status_anterior', v_row.status,
      'trecho', left(NEW.content, 180)
    ),
    'success'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mission_lead_on_reply ON public.chat_messages;
CREATE TRIGGER trg_mission_lead_on_reply
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  -- O filtro fica no WHEN, não dentro da função: assim mensagem nossa
  -- (99% do volume) nem chega a abrir o bloco plpgsql.
  WHEN (NEW.sender_type = 'lead')
  EXECUTE FUNCTION public.mission_lead_on_reply();

-- ------------------------------------------------------------
-- 3. A REUNIÃO FOI MARCADA
-- ------------------------------------------------------------

/**
 * Avança para 'meeting_booked' — o desfecho que a missão persegue.
 *
 * Aceita também linha ainda em 'replied' ou anterior: acontece de o lead
 * fechar a agenda na mesma mensagem em que responde, e nesse caso os dois
 * gatilhos disparam na mesma transação. `replied_at` é preenchido aqui
 * quando ainda estiver vazio, porque marcar reunião sem ter respondido é
 * impossível — se o campo ficasse nulo, o funil mostraria mais reuniões que
 * respostas.
 */
CREATE OR REPLACE FUNCTION public.mission_lead_on_meeting()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT id, mission_id, user_id, status
    INTO v_row
  FROM public.mission_leads
  WHERE lead_id = NEW.lead_id
    -- A reunião só move a missão de quem é dono do lead. Ver a política de
    -- `meetings` reforçada no bloco 5: `lead_id` não era conferido contra o
    -- dono, então dava para inserir reunião apontando para o lead de outra
    -- conta. Com o gatilho, isso deixaria de ser um registro solto e passaria
    -- a mexer no funil alheio.
    AND user_id = NEW.user_id
    AND sent_at IS NOT NULL
    AND status NOT IN ('meeting_booked', 'opted_out')
  ORDER BY sent_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  UPDATE public.mission_leads
  SET status     = 'meeting_booked',
      replied_at = COALESCE(replied_at, NEW.created_at)
  WHERE id = v_row.id;

  PERFORM public.mission_refresh_counters(v_row.mission_id);

  INSERT INTO public.agent_events (user_id, mission_id, lead_id, agent, event, summary, detail, level)
  VALUES (
    v_row.user_id, v_row.mission_id, NEW.lead_id,
    'scheduler', 'meeting_booked',
    format('Reunião marcada para %s.',
           to_char(NEW.scheduled_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')),
    jsonb_build_object(
      'meeting_id', NEW.id,
      'scheduled_at', NEW.scheduled_at,
      'status_anterior', v_row.status
    ),
    'success'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_mission_lead_on_meeting ON public.meetings;
CREATE TRIGGER trg_mission_lead_on_meeting
  AFTER INSERT ON public.meetings
  FOR EACH ROW
  EXECUTE FUNCTION public.mission_lead_on_meeting();

-- ------------------------------------------------------------
-- 4. O QUE JÁ ACONTECEU ANTES DO GATILHO EXISTIR
-- ------------------------------------------------------------
-- Respostas e reuniões que ocorreram enquanto o funil estava aberto ficaram
-- registradas em `chat_messages` e `meetings`, mas não em `mission_leads`.
-- Sem esta recuperação, o histórico continuaria dizendo que ninguém nunca
-- respondeu — e a primeira medição de conversão nasceria errada.
--
-- Só faz UPDATE, e só para frente. Em projeto novo não encontra nada.

WITH primeira_resposta AS (
  SELECT ml.id,
         MIN(cm.created_at) AS respondeu_em
  FROM public.mission_leads ml
  JOIN public.chat_messages cm
    ON cm.lead_id = ml.lead_id
   AND cm.sender_type = 'lead'
   AND cm.created_at >= ml.sent_at
  WHERE ml.sent_at IS NOT NULL
    AND ml.status = 'sent'
  GROUP BY ml.id
)
UPDATE public.mission_leads ml
SET status = 'replied',
    replied_at = COALESCE(ml.replied_at, p.respondeu_em)
FROM primeira_resposta p
WHERE ml.id = p.id;

WITH reuniao AS (
  SELECT ml.id,
         MIN(mt.created_at) AS marcou_em
  FROM public.mission_leads ml
  JOIN public.meetings mt
    ON mt.lead_id = ml.lead_id
   AND mt.created_at >= ml.sent_at
  WHERE ml.sent_at IS NOT NULL
    AND ml.status IN ('sent', 'replied')
  GROUP BY ml.id
)
UPDATE public.mission_leads ml
SET status = 'meeting_booked',
    replied_at = COALESCE(ml.replied_at, r.marcou_em)
FROM reuniao r
WHERE ml.id = r.id;

-- Contadores de todas as missões tocadas pela recuperação.
DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN SELECT id FROM public.missions LOOP
    PERFORM public.mission_refresh_counters(v_id);
  END LOOP;
END;
$$;

-- ------------------------------------------------------------
-- 5. REUNIÃO PRECISA SER DE UM LEAD SEU
-- ------------------------------------------------------------
-- A política original de `meetings` conferia só o `user_id`:
--
--   FOR ALL USING (auth.uid() = user_id)
--
-- O `lead_id` passava sem conferência. Dava para inserir uma reunião com o
-- próprio user_id apontando para o lead de OUTRA conta. Enquanto a tabela
-- era só um calendário, o estrago era um registro estranho na agenda de
-- ninguém. Agora que a reunião avança o funil, viraria escrita na missão de
-- outra empresa.
--
-- `chat_messages` já conferia isso desde o começo (`is_lead_owner`); a
-- assimetria entre as duas tabelas era o defeito.

DROP POLICY IF EXISTS "Users can manage their own meetings" ON public.meetings;

CREATE POLICY "Users can manage their own meetings"
  ON public.meetings FOR ALL
  USING (auth.uid() = user_id AND public.is_lead_owner(lead_id))
  WITH CHECK (auth.uid() = user_id AND public.is_lead_owner(lead_id));

-- ------------------------------------------------------------
-- 6. CONFERÊNCIA
-- ------------------------------------------------------------
-- Gatilho que não foi criado não dá erro: ele simplesmente não roda, e o
-- sintoma é exatamente o mesmo defeito que esta migração veio corrigir —
-- números zerados sem explicação. Melhor a migração falhar aqui.

DO $$
DECLARE
  v_faltando TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_mission_lead_on_reply' AND NOT tgisinternal
  ) THEN
    v_faltando := v_faltando || 'trg_mission_lead_on_reply';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_mission_lead_on_meeting' AND NOT tgisinternal
  ) THEN
    v_faltando := v_faltando || 'trg_mission_lead_on_meeting';
  END IF;

  IF array_length(v_faltando, 1) > 0 THEN
    RAISE EXCEPTION 'Gatilhos do funil não foram criados: %', array_to_string(v_faltando, ', ');
  END IF;
END;
$$;

COMMENT ON FUNCTION public.mission_refresh_counters(UUID) IS
  'Recalcula os contadores desnormalizados de uma missão a partir de mission_leads. '
  'Fonte única da regra — o orquestrador chama esta função em vez de repeti-la.';


-- ############################################################
-- [05/11] 20260811200000_f1a2b3c4-0009-4a99-9c09-000000000009.sql
-- ############################################################

-- ============================================================
-- MISSÃO NÃO PODE SE DAR POR CONCLUÍDA COM TRABALHO PENDENTE
-- ============================================================
-- O orquestrador encerrava a missão assim que não sobrava lead em 'found':
--
--   if ((remaining ?? 0) === 0)
--     update missions set status = 'completed'
--
-- No nível de autonomia 'assistido' — que é o PADRÃO — nenhum lead envia
-- sozinho: todos param em 'awaiting_approval' esperando o dono aprovar. Quer
-- dizer que 'found' zera exatamente quando a fila de aprovação está cheia.
--
-- E `mission_can_send()` exige `status = 'running'`. Então, no modo padrão,
-- a sequência era:
--
--   1. a esteira roda e enche a fila de aprovação;
--   2. acaba o 'found' e a missão vira 'completed';
--   3. o dono clica em Aprovar e recebe
--      "Não é possível enviar agora: missao nao esta ativa";
--   4. e não existe botão que traga a missão de volta.
--
-- O caminho mais seguro do produto — com humano conferindo cada mensagem —
-- era o único que não conseguia enviar mensagem nenhuma.
--
-- Some-se a isso o que era retido pelo relógio: fora do horário permitido, o
-- envio automático voltava para 'awaiting_approval' como se a IA tivesse
-- pedido ajuda humana. Não tinha — era só o expediente. Ninguém avisava o
-- dono, e nada tentava de novo quando a janela reabria: a mensagem pronta
-- ficava parada para sempre.
-- ============================================================

-- ------------------------------------------------------------
-- 1. O QUE AINDA FALTA FAZER
-- ------------------------------------------------------------

/**
 * Trabalho pendente de uma missão, separado por quem está segurando a fila.
 *
 *   to_process    — lead capturado que a esteira ainda não analisou
 *   awaiting_human— rascunho pronto esperando decisão de uma pessoa
 *   ready_to_send — aprovado, esperando só a janela de envio abrir
 *
 * A separação existe porque os três esperam coisas diferentes: o primeiro
 * espera processamento, o segundo espera uma pessoa, o terceiro espera o
 * relógio. Tratar os três como "pendente" genérico foi o que fez o cron
 * ignorar justamente o terceiro.
 */
CREATE OR REPLACE FUNCTION public.mission_pending_work(p_mission_id UUID)
RETURNS TABLE (to_process INTEGER, awaiting_human INTEGER, ready_to_send INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COUNT(*) FILTER (WHERE status IN ('found', 'enriched', 'qualified'))::INTEGER,
    COUNT(*) FILTER (WHERE status IN ('drafted', 'awaiting_approval'))::INTEGER,
    COUNT(*) FILTER (WHERE status = 'approved')::INTEGER
  FROM public.mission_leads
  WHERE mission_id = p_mission_id;
$$;

GRANT EXECUTE ON FUNCTION public.mission_pending_work(UUID) TO authenticated, service_role;

/**
 * Decide e aplica o status da missão. Devolve o que encontrou, para o
 * orquestrador não precisar consultar de novo.
 *
 * Conclui SÓ quando não há mais nada em nenhuma das três filas. Missão com
 * fila de aprovação aberta continua 'running' — porque é verdade: ela tem
 * trabalho pendente, só que o trabalho é de uma pessoa.
 *
 * Não mexe em missão pausada nem em missão que já foi concluída. Pausa é
 * decisão de alguém e não cabe a esta função desfazer.
 */
CREATE OR REPLACE FUNCTION public.mission_settle_status(p_mission_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_work    RECORD;
  v_mission RECORD;
  v_concluiu BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_work FROM public.mission_pending_work(p_mission_id);

  SELECT id, user_id, name, status, paused_at INTO v_mission
  FROM public.missions WHERE id = p_mission_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'missao_nao_encontrada');
  END IF;

  PERFORM public.mission_refresh_counters(p_mission_id);

  IF v_mission.status = 'running'
     AND v_mission.paused_at IS NULL
     AND v_work.to_process = 0
     AND v_work.awaiting_human = 0
     AND v_work.ready_to_send = 0
  THEN
    UPDATE public.missions SET status = 'completed' WHERE id = p_mission_id;
    v_concluiu := TRUE;

    INSERT INTO public.agent_events (user_id, mission_id, agent, event, summary, level)
    VALUES (v_mission.user_id, p_mission_id, 'supervisor', 'mission_completed',
            format('Missão "%s" concluída: não há mais nada na fila.', v_mission.name),
            'success');
  END IF;

  RETURN jsonb_build_object(
    'to_process',     v_work.to_process,
    'awaiting_human', v_work.awaiting_human,
    'ready_to_send',  v_work.ready_to_send,
    'completed',      v_concluiu,
    'status',         CASE WHEN v_concluiu THEN 'completed' ELSE v_mission.status END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mission_settle_status(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 2. O CRON PRECISA VER TAMBÉM O QUE ESTÁ SÓ ESPERANDO A HORA
-- ------------------------------------------------------------
-- A versão anterior fazia JOIN exigindo `ml.status = 'found'`. Missão sem
-- lead novo, mas com mensagens aprovadas retidas pelo horário, simplesmente
-- não aparecia — então nada nunca as soltava. O trabalho pendente era
-- invisível para quem tinha a função de tocá-lo.
--
-- O tipo de retorno muda, então precisa de DROP: CREATE OR REPLACE não
-- altera assinatura de saída.

DROP FUNCTION IF EXISTS public.missions_pending_batch(INTEGER);

CREATE FUNCTION public.missions_pending_batch(p_limit INTEGER DEFAULT 20)
RETURNS TABLE (
  mission_id    UUID,
  user_id       UUID,
  pending       INTEGER,
  ready_to_send INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id,
         m.user_id,
         COUNT(*) FILTER (WHERE ml.status = 'found')::INTEGER    AS pending,
         COUNT(*) FILTER (WHERE ml.status = 'approved')::INTEGER AS ready_to_send
  FROM public.missions m
  JOIN public.mission_leads ml
    ON ml.mission_id = m.id
   AND ml.status IN ('found', 'approved')
  LEFT JOIN public.user_settings us ON us.user_id = m.user_id
  WHERE m.status = 'running'
    AND m.paused_at IS NULL
    AND COALESCE(us.outbound_paused, FALSE) = FALSE
  GROUP BY m.id, m.user_id
  -- Quem já tem mensagem pronta vai primeiro: soltar o que está escrito
  -- custa uma chamada de rede, escrever um lote novo custa IA. E a mensagem
  -- retida é a que está envelhecendo.
  ORDER BY ready_to_send DESC, pending DESC
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.missions_pending_batch(INTEGER) TO service_role;

-- ------------------------------------------------------------
-- 3. MISSÕES QUE JÁ FORAM ENCERRADAS CEDO DEMAIS
-- ------------------------------------------------------------
-- Toda missão marcada 'completed' que ainda tem fila aberta foi encerrada
-- pelo defeito acima. Volta para 'running' — é o estado verdadeiro dela, e
-- sem isso a fila de aprovação continua impossível de aprovar.
--
-- Missão que estava pausada e mesmo assim foi marcada 'completed' pelo
-- defeito volta para 'paused', não para 'running': quem pausou, pausou. O
-- estado dela era mentiroso nos dois sentidos.

UPDATE public.missions m
SET status = CASE WHEN m.paused_at IS NULL THEN 'running' ELSE 'paused' END
WHERE m.status = 'completed'
  AND EXISTS (
    SELECT 1 FROM public.mission_leads ml
    WHERE ml.mission_id = m.id
      AND ml.status IN ('found', 'enriched', 'qualified',
                        'drafted', 'awaiting_approval', 'approved')
  );

-- ------------------------------------------------------------
-- 4. CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
DECLARE
  v_presas INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_presas
  FROM public.missions m
  WHERE m.status = 'completed'
    AND EXISTS (
      SELECT 1 FROM public.mission_leads ml
      WHERE ml.mission_id = m.id
        AND ml.status IN ('found', 'enriched', 'qualified',
                          'drafted', 'awaiting_approval', 'approved')
    );

  IF v_presas > 0 THEN
    RAISE EXCEPTION
      '% missão(ões) continuam concluídas com fila aberta — a fila de aprovação delas ficaria travada.',
      v_presas;
  END IF;
END;
$$;


-- ############################################################
-- [06/11] 20260811220000_a2b3c4d5-0010-4aaa-9c10-000000000010.sql
-- ############################################################

-- ============================================================
-- FALHA DE REDE NÃO PODE CUSTAR UM LEAD
-- ============================================================
-- `sendMessage` tratava qualquer resposta ruim do `whatsapp-send` do mesmo
-- jeito:
--
--   status: optedOut ? 'opted_out' : 'failed'
--
-- 'failed' é estado final. Nada volta a olhar para ele, e não existe botão
-- na tela para tentar de novo. Quer dizer que um 502 momentâneo da Evolution
-- — a coisa mais banal que acontece com API de WhatsApp — apagava para sempre
-- um lead que já tinha sido pesquisado, qualificado, casado com uma oferta,
-- escrito pela IA, aprovado pelo Quality Gate e, no modo assistido, lido e
-- aprovado por uma pessoa. Todo esse custo perdido porque a rede piscou.
--
-- Nem toda falha é igual, e essa é a distinção que faltava:
--
--   DEFINITIVA   número inválido, mensagem fora do formato (HTTP 400)
--                → tentar de novo dá exatamente o mesmo erro
--   OPT-OUT      o número pediu para não receber (409 + blacklisted)
--                → tentar de novo seria desrespeito, não persistência
--   TRANSITÓRIA  chip indisponível, Evolution fora, 5xx, rede caindo
--                → é justamente o caso em que tentar de novo funciona
--
-- Só a primeira e a segunda merecem ser finais.
-- ============================================================

ALTER TABLE public.mission_leads
  ADD COLUMN IF NOT EXISTS send_attempts INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.mission_leads.send_attempts IS
  'Quantas vezes o envio foi tentado. Serve de teto para a retentativa — '
  'sem ele, uma falha permanente disfarçada de transitória tentaria para sempre.';

/**
 * Registra uma tentativa de envio frustrada e decide se ainda vale insistir.
 *
 * Faz o incremento e a decisão na MESMA instrução. A alternativa — ler
 * send_attempts, somar um em TypeScript e gravar — tem janela para duas
 * execuções do cron lerem o mesmo valor e o contador andar menos que as
 * tentativas reais. É um teto de segurança: contador que anda devagar é teto
 * que não segura.
 *
 * Volta para 'approved', não para 'awaiting_approval': ninguém precisa
 * aprovar de novo o que já foi aprovado. O flush do próximo lote pega.
 *
 * Cinco tentativas, e não três, porque as falhas longas (WhatsApp
 * desconectado, parada de emergência, fora do horário) já são barradas antes
 * por `mission_can_send` e nem chegam aqui. O que chega é oscilação curta, e
 * desistir cedo demais custa um lead qualificado — enquanto insistir demais
 * custa uma linha de log.
 */
CREATE OR REPLACE FUNCTION public.mission_lead_send_failed(
  p_mission_lead_id UUID,
  p_error           TEXT,
  p_definitive      BOOLEAN DEFAULT FALSE,
  p_max_attempts    INTEGER DEFAULT 5
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  UPDATE public.mission_leads
  SET send_attempts = send_attempts + 1,
      error_message = left(COALESCE(p_error, 'erro desconhecido'), 400),
      status = CASE
                 WHEN p_definitive THEN 'failed'
                 WHEN send_attempts + 1 >= GREATEST(p_max_attempts, 1) THEN 'failed'
                 ELSE 'approved'
               END
  WHERE id = p_mission_lead_id
  RETURNING id, mission_id, status, send_attempts INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'mission_lead_nao_encontrado');
  END IF;

  PERFORM public.mission_refresh_counters(v_row.mission_id);

  RETURN jsonb_build_object(
    'status',       v_row.status,
    'attempts',     v_row.send_attempts,
    'will_retry',   v_row.status = 'approved',
    'max_attempts', GREATEST(p_max_attempts, 1)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.mission_lead_send_failed(UUID, TEXT, BOOLEAN, INTEGER)
  TO service_role;

-- ------------------------------------------------------------
-- O QUE JÁ FOI PERDIDO
-- ------------------------------------------------------------
-- Lead marcado 'failed' que ainda tem rascunho aprovado e nenhuma tentativa
-- contabilizada foi vítima do comportamento antigo. Volta para a fila com o
-- contador zerado — o rascunho continua lá, aprovado, íntegro.
--
-- A condição precisa distinguir "falhou no envio" de "falhou no meio da
-- esteira" — reabrir o segundo caso mandaria para a fila mensagem que nunca
-- passou pela revisão.
--
-- `quality IS NOT NULL` é o que separa os dois: só chega a ter avaliação de
-- qualidade quem foi escrito e revisado até o fim. Mensagem barrada pelo
-- Quality Gate não entra aqui porque recebe status 'blocked', não 'failed'.
--
-- Não dá para exigir `approved_at`: nos modos autônomos ninguém aprova à mão,
-- e o campo fica vazio justamente nos casos que este ciclo veio recuperar.

UPDATE public.mission_leads
SET status = 'approved',
    error_message = NULL
WHERE status = 'failed'
  AND send_attempts = 0
  AND draft_message IS NOT NULL
  AND quality IS NOT NULL
  AND sent_at IS NULL;

-- Devolver leads para a fila reabre fila em missão que já estava concluída.
-- Sem isto, o rascunho recuperado ficaria numa missão 'completed' — e
-- `mission_can_send` barra missão que não está 'running'. Seria recuperar o
-- lead e deixá-lo preso do mesmo jeito.

UPDATE public.missions m
SET status = CASE WHEN m.paused_at IS NULL THEN 'running' ELSE 'paused' END
WHERE m.status = 'completed'
  AND EXISTS (
    SELECT 1 FROM public.mission_leads ml
    WHERE ml.mission_id = m.id
      AND ml.status IN ('found', 'enriched', 'qualified',
                        'drafted', 'awaiting_approval', 'approved')
  );

DO $$
DECLARE
  v_id UUID;
BEGIN
  FOR v_id IN SELECT id FROM public.missions LOOP
    PERFORM public.mission_refresh_counters(v_id);
  END LOOP;
END;
$$;


-- ############################################################
-- [07/11] 20260812000000_b3c4d5e6-0011-4abb-9c11-000000000011.sql
-- ############################################################

-- ============================================================
-- "A IA PREFERIU CALAR" PRECISA DE UM NOME PRÓPRIO
-- ============================================================
-- `agent_escalations.escalation_reason` tem lista fechada, e ela cobre só
-- motivos comerciais: objeção complexa, oportunidade grande, reclamação,
-- pergunta técnica. Falta o motivo que passou a existir quando a conversa
-- ganhou conferência de factualidade: a IA gerou uma resposta, a resposta
-- afirmava coisa que ninguém pode sustentar, a reescrita também, e o certo
-- passou a ser não enviar nada e chamar uma pessoa.
--
-- Sem um valor para isso, o INSERT bateria no CHECK e falharia — e o efeito
-- seria o pior possível: a mensagem não sairia (certo) e ninguém ficaria
-- sabendo (errado). Silêncio sem aviso é o modo de falha que faz o cliente
-- achar que foi ignorado.
--
-- Também entra `opt_out_requested`: o lead pedir para parar é motivo de
-- escalação em qualquer operação séria, e não tinha onde ser registrado.
-- ============================================================

ALTER TABLE public.agent_escalations
  DROP CONSTRAINT IF EXISTS agent_escalations_escalation_reason_check;

ALTER TABLE public.agent_escalations
  ADD CONSTRAINT agent_escalations_escalation_reason_check
  CHECK (escalation_reason IN (
    'complex_objection', 'high_value_opportunity', 'complaint',
    'technical_question', 'urgent_request', 'closing_opportunity',
    'competitor_threat', 'custom_request', 'sentiment_negative',
    -- Novos
    'factuality_block',    -- a IA não conseguiu responder sem inventar
    'opt_out_requested'    -- o lead pediu para não receber mais
  ));

COMMENT ON COLUMN public.agent_escalations.escalation_reason IS
  'Por que uma pessoa precisa entrar. `factuality_block` é o único que não '
  'vem do lead: vem da própria IA reconhecendo que não tem como responder '
  'sem afirmar o que não pode sustentar.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------
-- Se o CHECK não aceitar o valor novo, o escalonamento falha em silêncio na
-- hora errada — em produção, com um lead esperando resposta.

-- Confere a definição do CHECK, e não um INSERT de teste: num projeto novo a
-- tabela `leads` está vazia, o INSERT não inseriria linha nenhuma e o teste
-- passaria sem ter testado nada. Verificação que só funciona com dados é
-- verificação que falha justamente onde mais importa — na primeira subida.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_escalations_escalation_reason_check'
      AND pg_get_constraintdef(oid) LIKE '%factuality_block%'
  ) THEN
    RAISE EXCEPTION
      'O CHECK de escalation_reason não aceita factuality_block — o escalonamento '
      'da conferência de factualidade falharia calado, com um lead esperando resposta.';
  END IF;
END;
$$;


-- ############################################################
-- [08/11] 20260812020000_c4d5e6f7-0012-4acc-9c12-000000000012.sql
-- ############################################################

-- ============================================================
-- O TESTE A/B NUNCA MEDIU NADA
-- ============================================================
-- A tela em /ab-testing tem 463 linhas: criação de teste, teste-z de duas
-- proporções, exibição de vencedor, de confiança e de conversões.
--
-- E nenhuma linha de código do produto jamais passou `ab_test_id` para o
-- envio. Uma busca de dois segundos mostra:
--
--   grep -rn "ab_test_id" src/
--   (vazio)
--
-- Então `variant_a_sent` nunca saiu de zero. E `variant_a_responses` e
-- `variant_a_conversions` não eram escritos por absolutamente nada — só
-- lidos, pela tela e pelo cron. O teste-z do cron dividia por zero, caía no
-- `continue`, e nenhum teste jamais foi concluído.
--
-- É a mesma classe do funil da missão, num tamanho maior: uma funcionalidade
-- inteira que parece pronta e em que TODO número é permanentemente zero.
--
-- O QUE MUDA
-- Os contadores saem das colunas e passam a ser derivados de uma tabela de
-- atribuição — uma linha por lead por teste. Contador desnormalizado que
-- ninguém incrementa vira zero eterno; contador derivado não tem como
-- divergir do que aconteceu.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUEM RECEBEU O QUÊ
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ab_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id   UUID NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  lead_id      UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  variant      TEXT NOT NULL CHECK (variant IN ('a', 'b')),

  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replied_at   TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  -- Em centavos: somar dinheiro em ponto flutuante acumula erro, e o número
  -- que vai aparecer na tela como "receita da variante" precisa fechar.
  revenue_cents BIGINT NOT NULL DEFAULT 0,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- O mesmo lead não entra duas vezes no mesmo teste. Sem isto, um
  -- reprocessamento de lote contaria a mesma pessoa como duas amostras e a
  -- significância viraria ficção.
  CONSTRAINT ab_assignments_unique UNIQUE (ab_test_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_ab_assignments_test
  ON public.ab_assignments (ab_test_id, variant);

CREATE INDEX IF NOT EXISTS idx_ab_assignments_lead
  ON public.ab_assignments (lead_id, sent_at DESC);

ALTER TABLE public.ab_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own ab assignments" ON public.ab_assignments;

-- Só leitura pelo cliente: quem escreve é a edge function. O usuário poder
-- editar a própria amostra tira o sentido de medir.
CREATE POLICY "own ab assignments" ON public.ab_assignments
  FOR SELECT USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. O LEAD RESPONDEU
-- ------------------------------------------------------------

/**
 * Marca a resposta na atribuição mais recente deste lead.
 *
 * Mesma escolha do funil da missão: gatilho, não chamada espalhada. A
 * resposta do lead entra por mais de um caminho, e o caminho que for escrito
 * amanhã nasceria esquecendo de contar.
 *
 * `replied_at` só na primeira resposta — a métrica é "respondeu ou não", e
 * sobrescrever a cada mensagem transformaria a amostra em outra coisa.
 */
CREATE OR REPLACE FUNCTION public.ab_on_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ab_assignments
  SET replied_at = NEW.created_at
  WHERE id = (
    SELECT id FROM public.ab_assignments
    WHERE lead_id = NEW.lead_id
      AND replied_at IS NULL
      AND sent_at <= NEW.created_at
    ORDER BY sent_at DESC
    LIMIT 1
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ab_on_reply ON public.chat_messages;
CREATE TRIGGER trg_ab_on_reply
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  WHEN (NEW.sender_type = 'lead')
  EXECUTE FUNCTION public.ab_on_reply();

-- ------------------------------------------------------------
-- 3. O NEGÓCIO FECHOU
-- ------------------------------------------------------------

/**
 * Marca conversão e receita quando o lead entra em "Ganho".
 *
 * `leads.deal_value` é o valor do negócio quando existe. Sem valor, a
 * conversão ainda conta — negócio fechado sem valor preenchido é falha de
 * cadastro, não motivo para ignorar a venda na hora de decidir qual mensagem
 * funciona.
 */
CREATE OR REPLACE FUNCTION public.ab_on_won()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valor BIGINT := 0;
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;

  IF NEW.stage <> 'Ganho' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_valor := COALESCE(ROUND(NEW.deal_value * 100), 0)::BIGINT;
  EXCEPTION WHEN OTHERS THEN
    v_valor := 0;
  END;

  UPDATE public.ab_assignments
  SET converted_at = NOW(),
      revenue_cents = v_valor
  WHERE id = (
    SELECT id FROM public.ab_assignments
    WHERE lead_id = NEW.id
      AND converted_at IS NULL
    ORDER BY sent_at DESC
    LIMIT 1
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ab_on_won ON public.leads;
CREATE TRIGGER trg_ab_on_won
  AFTER UPDATE OF stage ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.ab_on_won();

-- ------------------------------------------------------------
-- 4. OS NÚMEROS, DERIVADOS
-- ------------------------------------------------------------

/**
 * Estatísticas de um teste, contadas a partir das atribuições.
 *
 * Substitui as seis colunas de contador. A tela e o cron passam a ler daqui,
 * e some a única maneira de esses números estarem errados: ninguém precisa
 * lembrar de incrementá-los.
 */
CREATE OR REPLACE FUNCTION public.ab_test_stats(p_test_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'a', jsonb_build_object(
      'sent',          COUNT(*) FILTER (WHERE variant = 'a'),
      'replied',       COUNT(*) FILTER (WHERE variant = 'a' AND replied_at IS NOT NULL),
      'converted',     COUNT(*) FILTER (WHERE variant = 'a' AND converted_at IS NOT NULL),
      'revenue_cents', COALESCE(SUM(revenue_cents) FILTER (WHERE variant = 'a'), 0)
    ),
    'b', jsonb_build_object(
      'sent',          COUNT(*) FILTER (WHERE variant = 'b'),
      'replied',       COUNT(*) FILTER (WHERE variant = 'b' AND replied_at IS NOT NULL),
      'converted',     COUNT(*) FILTER (WHERE variant = 'b' AND converted_at IS NOT NULL),
      'revenue_cents', COALESCE(SUM(revenue_cents) FILTER (WHERE variant = 'b'), 0)
    )
  )
  FROM public.ab_assignments
  WHERE ab_test_id = p_test_id;
$$;

GRANT EXECUTE ON FUNCTION public.ab_test_stats(UUID) TO authenticated, service_role;

/**
 * Sincroniza as colunas antigas a partir das atribuições.
 *
 * As seis colunas continuam existindo porque a tela antiga lê delas e porque
 * apagar coluna é destrutivo. Deixam de ser a verdade e passam a ser cópia —
 * atualizada por esta função, nunca escrita à mão.
 */
CREATE OR REPLACE FUNCTION public.ab_sync_counters(p_test_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ab_tests t
  SET variant_a_sent        = c.a_sent,
      variant_b_sent        = c.b_sent,
      variant_a_responses   = c.a_repl,
      variant_b_responses   = c.b_repl,
      variant_a_conversions = c.a_conv,
      variant_b_conversions = c.b_conv,
      updated_at            = NOW()
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE variant = 'a')::INTEGER AS a_sent,
      COUNT(*) FILTER (WHERE variant = 'b')::INTEGER AS b_sent,
      COUNT(*) FILTER (WHERE variant = 'a' AND replied_at IS NOT NULL)::INTEGER AS a_repl,
      COUNT(*) FILTER (WHERE variant = 'b' AND replied_at IS NOT NULL)::INTEGER AS b_repl,
      COUNT(*) FILTER (WHERE variant = 'a' AND converted_at IS NOT NULL)::INTEGER AS a_conv,
      COUNT(*) FILTER (WHERE variant = 'b' AND converted_at IS NOT NULL)::INTEGER AS b_conv
    FROM public.ab_assignments
    WHERE ab_test_id = p_test_id
  ) c
  WHERE t.id = p_test_id;
$$;

GRANT EXECUTE ON FUNCTION public.ab_sync_counters(UUID) TO authenticated, service_role;

/** Testes rodando que têm atribuição — os únicos que vale reavaliar. */
CREATE OR REPLACE FUNCTION public.ab_tests_to_evaluate()
RETURNS TABLE (test_id UUID, user_id UUID, min_sample INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.user_id, t.min_sample_size
  FROM public.ab_tests t
  WHERE t.status = 'running'
    AND EXISTS (SELECT 1 FROM public.ab_assignments a WHERE a.ab_test_id = t.id);
$$;

GRANT EXECUTE ON FUNCTION public.ab_tests_to_evaluate() TO service_role;

-- ------------------------------------------------------------
-- 5. A DECISÃO PRECISA CARREGAR O MOTIVO
-- ------------------------------------------------------------
-- A coluna `winner` guardava "variant_a" e nada mais. Quem abre a tela três
-- semanas depois não tem como saber se aquilo foi decidido por venda ou por
-- curiosidade — e são conclusões muito diferentes.

ALTER TABLE public.ab_tests
  ADD COLUMN IF NOT EXISTS decision_metric TEXT,
  ADD COLUMN IF NOT EXISTS decision_reason TEXT;

COMMENT ON COLUMN public.ab_tests.decision_metric IS
  'Qual métrica decidiu: receita, conversao ou resposta. Resposta é a mais '
  'fraca das três — a mensagem que promete demais ganha ali e perde na venda.';

-- ------------------------------------------------------------
-- 6. CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ab_on_reply' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_ab_on_reply não foi criado — as respostas do teste A/B continuariam em zero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ab_on_won' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_ab_on_won não foi criado — as conversões do teste A/B continuariam em zero.';
  END IF;
END;
$$;


-- ############################################################
-- [09/11] 20260812040000_d5e6f7a8-0013-4add-9c13-000000000013.sql
-- ############################################################

-- ============================================================
-- "MELHOR HORÁRIO" ERA CALCULADO EM CIMA DE ZEROS
-- ============================================================
-- `prospecting_stats.responses_received` é escrito por um lugar só — o
-- job-processor — e sempre com o valor 0:
--
--   await supabase.from("prospecting_stats").insert({
--     ...
--     responses_received: 0,
--     positive_responses: 0,
--   });
--
-- Nada nunca incrementou aquelas colunas. E elas alimentavam a recomendação
-- de horário do `ai-prospecting`, que dividia respostas por envios e
-- devolvia, com estas palavras:
--
--   "Baseado nos seus dados: melhor horário às 9h (0.0% de resposta)"
--
-- Toda hora empatada em zero, a ordenação decidida pelo acaso da iteração, e
-- a frase "baseado nos seus dados" fazendo a pessoa confiar o suficiente para
-- reorganizar a operação em cima disso. Recomendação errada custa mais que
-- recomendação ausente, justamente porque alguém age.
--
-- SOLUÇÃO: PARAR DE CONTAR À MÃO
-- A informação sempre existiu em `chat_messages`: quem mandou, quando mandou,
-- e se veio resposta depois. Derivar disso não pode ficar defasado, porque
-- não depende de ninguém lembrar de incrementar.
-- ============================================================

/**
 * Envios e respostas por hora do dia, derivados da conversa real.
 *
 * A resposta é atribuída à hora em que NOSSA mensagem saiu, não à hora em que
 * o lead respondeu. É a pergunta que interessa: "que horas devo mandar?" —
 * não "que horas as pessoas costumam responder", que é outra coisa e não se
 * pode agir sobre ela.
 *
 * Conta uma resposta por mensagem enviada, no máximo: um lead que mandou
 * cinco mensagens seguidas respondeu uma vez, não cinco.
 */
CREATE OR REPLACE FUNCTION public.prospecting_hour_stats(
  p_user_id UUID,
  p_days    INTEGER DEFAULT 90
)
RETURNS TABLE (hour_of_day INTEGER, sent BIGINT, replied BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH nossas AS (
    SELECT
      cm.id,
      cm.lead_id,
      cm.sent_at,
      EXTRACT(HOUR FROM (cm.sent_at AT TIME ZONE 'America/Sao_Paulo'))::INTEGER AS hora
    FROM public.chat_messages cm
    JOIN public.leads l ON l.id = cm.lead_id
    WHERE l.user_id = p_user_id
      AND cm.sender_type IN ('agent', 'user')
      AND cm.status = 'sent'
      AND cm.sent_at >= NOW() - (GREATEST(p_days, 1) || ' days')::INTERVAL
  ),
  com_resposta AS (
    SELECT
      n.hora,
      EXISTS (
        SELECT 1
        FROM public.chat_messages r
        WHERE r.lead_id = n.lead_id
          AND r.sender_type = 'lead'
          AND r.sent_at > n.sent_at
          -- Janela de 72h: resposta que chega uma semana depois não foi
          -- provocada por aquela mensagem, e atribuí-la ao horário dela
          -- inventaria uma relação que não existe.
          AND r.sent_at <= n.sent_at + INTERVAL '72 hours'
      ) AS respondeu
    FROM nossas n
  )
  SELECT hora,
         COUNT(*)::BIGINT,
         COUNT(*) FILTER (WHERE respondeu)::BIGINT
  FROM com_resposta
  GROUP BY hora
  ORDER BY hora;
$$;

GRANT EXECUTE ON FUNCTION public.prospecting_hour_stats(UUID, INTEGER)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.prospecting_hour_stats(UUID, INTEGER) IS
  'Envios e respostas por hora, derivados de chat_messages. Substitui '
  'prospecting_stats.responses_received, que nunca saiu de zero.';

-- ------------------------------------------------------------
-- A COLUNA ANTIGA PRECISA DIZER O QUE É
-- ------------------------------------------------------------
-- Não apago: apagar coluna é destrutivo e há exportação lendo dela. Mas
-- quem abrir o schema precisa saber que aquele zero não é "nenhuma resposta",
-- é "ninguém nunca escreveu aqui".

COMMENT ON COLUMN public.prospecting_stats.responses_received IS
  'OBSOLETA. Nunca foi incrementada por nenhum código — o valor 0 significa '
  '"não medido", não "nenhuma resposta". Use prospecting_hour_stats().';

COMMENT ON COLUMN public.prospecting_stats.positive_responses IS
  'OBSOLETA. Mesma situação de responses_received.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'prospecting_hour_stats'
  ) THEN
    RAISE EXCEPTION 'prospecting_hour_stats não foi criada — a recomendação de horário voltaria a sair de zeros.';
  END IF;
END;
$$;


-- ############################################################
-- [10/11] 20260812060000_e6f7a8b9-0014-4aee-9c14-000000000014.sql
-- ############################################################

-- ============================================================
-- O PERFIL IDEAL PRECISA SOBREVIVER À MISSÃO
-- ============================================================
-- Os critérios de ICP moram em `missions.icp`, um JSONB por missão. Funciona
-- para uma missão e falha para uma operação: quem roda cinco campanhas
-- parecidas redigita o mesmo perfil cinco vezes.
--
-- E é assim que as pessoas param de preencher. O campo continua lá, sempre
-- vazio, a qualificação volta a ser quase só "achou sinal de oportunidade ou
-- não", e a nota que ordena a fila perde o que a tornava específica daquele
-- negócio.
--
-- Guardar o perfil separado também dá uma coisa que o JSONB por missão não
-- dava: comparar. Duas missões com o mesmo perfil e resultados diferentes
-- falam sobre a mensagem; com perfis diferentes, falam sobre o público.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.icp_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name        TEXT NOT NULL,
  description TEXT,

  -- Mesmos campos que `qualify()` lê. Os nomes batem de propósito: um
  -- apelido diferente aqui viraria tradução em três lugares e divergência no
  -- quarto.
  niches      TEXT[] NOT NULL DEFAULT '{}',
  locations   TEXT[] NOT NULL DEFAULT '{}',
  signals     TEXT[] NOT NULL DEFAULT '{}',
  exclusions  TEXT[] NOT NULL DEFAULT '{}',
  min_rating  NUMERIC(3, 1),
  max_rating  NUMERIC(3, 1),
  min_reviews INTEGER,

  -- Perfil padrão aparece pré-selecionado ao criar missão. Um por conta.
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT icp_profiles_name_len CHECK (char_length(trim(name)) >= 2),
  -- Nome repetido na mesma conta transforma o seletor em adivinhação.
  CONSTRAINT icp_profiles_unique_name UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_icp_profiles_user
  ON public.icp_profiles (user_id, created_at DESC);

ALTER TABLE public.icp_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own icp profiles" ON public.icp_profiles;
CREATE POLICY "own icp profiles" ON public.icp_profiles
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_icp_profiles_touch ON public.icp_profiles;
CREATE TRIGGER trg_icp_profiles_touch
  BEFORE UPDATE ON public.icp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- UM PADRÃO SÓ
-- ------------------------------------------------------------
-- Sem isto, marcar o segundo perfil como padrão deixaria dois marcados, e a
-- tela escolheria pela ordem da consulta — que muda. O usuário veria um
-- perfil hoje e outro amanhã sem ter mexido em nada.

CREATE OR REPLACE FUNCTION public.icp_single_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.icp_profiles
    SET is_default = FALSE
    WHERE user_id = NEW.user_id
      AND id <> NEW.id
      AND is_default;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_icp_single_default ON public.icp_profiles;
CREATE TRIGGER trg_icp_single_default
  AFTER INSERT OR UPDATE OF is_default ON public.icp_profiles
  FOR EACH ROW
  WHEN (NEW.is_default)
  EXECUTE FUNCTION public.icp_single_default();

-- ------------------------------------------------------------
-- A MISSÃO GUARDA DE ONDE VEIO O PERFIL
-- ------------------------------------------------------------
-- `missions.icp` continua sendo a verdade do que foi aplicado: mudar o perfil
-- depois não pode reescrever a régua de uma missão que já rodou — o score dos
-- leads dela foi calculado com a régua antiga, e trocar a régua sem trocar as
-- notas produz um histórico que não fecha.
--
-- Esta coluna serve só para dizer de onde a cópia veio.

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS icp_profile_id UUID REFERENCES public.icp_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.missions.icp_profile_id IS
  'Perfil que originou o `icp` desta missão. O `icp` é cópia: alterar o '
  'perfil depois NÃO muda missão que já rodou.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_icp_single_default' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_icp_single_default não foi criado — dois perfis padrão fariam a tela escolher pela ordem da consulta.';
  END IF;
END;
$$;


-- ############################################################
-- [11/11] 20260812080000_f7a8b9c0-0015-4aff-9c15-000000000015.sql
-- ############################################################

-- ============================================================
-- QUEM ASSUME A CONVERSA PRECISA SABER O QUE JÁ FOI DITO
-- ============================================================
-- Quando a IA escala, a tela mostra o nome da empresa, o motivo e duas linhas
-- de contexto. Quem clica em "Abrir" cai no inbox e começa a ler a conversa
-- do começo para descobrir o que está acontecendo.
--
-- É a parte do handoff que faz handoff dar errado. A pessoa entra sem saber o
-- que já foi prometido, o que o lead já respondeu e o que ele já recusou — e
-- a primeira mensagem dela ou repete o que a IA disse, ou contradiz. As duas
-- entregam que trocou de interlocutor no pior momento possível: aquele em que
-- o caso era importante o bastante para escalar.
--
-- Esta função devolve tudo de uma vez. Uma chamada, e não seis: montar o
-- resumo com cinco consultas na tela significa cinco chances de uma falhar e
-- a pessoa assumir com informação pela metade sem perceber.
-- ============================================================

CREATE OR REPLACE FUNCTION public.lead_handoff_brief(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead    RECORD;
  v_result  JSONB;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'lead_nao_encontrado');
  END IF;

  -- SECURITY DEFINER passa por cima do RLS, então a checagem de dono precisa
  -- ser explícita. Sem ela, qualquer usuário autenticado leria a conversa
  -- inteira de qualquer lead de qualquer conta passando um id.
  IF v_lead.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('error', 'acesso_negado');
  END IF;

  SELECT jsonb_build_object(
    'lead', jsonb_build_object(
      'id',            v_lead.id,
      'business_name', v_lead.business_name,
      'phone',         v_lead.phone,
      'niche',         v_lead.niche,
      'location',      v_lead.location,
      'website',       v_lead.website,
      'stage',         v_lead.stage,
      'temperature',   v_lead.temperature,
      'rating',        v_lead.rating,
      'reviews_count', v_lead.reviews_count,
      'site_audit',    v_lead.site_audit,
      'first_contact_at', v_lead.first_contact_at,
      'last_response_at', v_lead.last_response_at
    ),

    -- As últimas trocas, em ordem de leitura. Doze cobre a conversa que
    -- importa sem virar rolagem.
    'messages', COALESCE((
      SELECT jsonb_agg(m ORDER BY m->>'sent_at')
      FROM (
        SELECT jsonb_build_object(
          'sender_type', cm.sender_type,
          'content',     cm.content,
          'sent_at',     cm.sent_at
        ) AS m
        FROM public.chat_messages cm
        WHERE cm.lead_id = p_lead_id
        ORDER BY cm.sent_at DESC
        LIMIT 12
      ) t
    ), '[]'::jsonb),

    -- O que o lead disse em conversas anteriores. É o que a pessoa não tem
    -- como reconstruir lendo só as últimas mensagens.
    'memory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type',       lm.memory_type,
        'key',        lm.key,
        'value',      lm.value,
        'confidence', lm.confidence
      ) ORDER BY lm.updated_at DESC)
      FROM public.lead_memory lm
      WHERE lm.lead_id = p_lead_id
        AND lm.confidence >= 0.6
    ), '[]'::jsonb),

    -- O que foi oferecido e com que argumento. Quem assume não pode
    -- contradizer a proposta que a IA já colocou na mesa.
    'mission', (
      SELECT jsonb_build_object(
        'name',        m.name,
        'goal',        m.goal,
        'offer',       ml.offer_match->'offer',
        'strategy',    ml.strategy,
        'score',       ml.score,
        'temperature', ml.temperature,
        'sent_at',     ml.sent_at,
        'status',      ml.status
      )
      FROM public.mission_leads ml
      JOIN public.missions m ON m.id = ml.mission_id
      WHERE ml.lead_id = p_lead_id
      ORDER BY ml.sent_at DESC NULLS LAST
      LIMIT 1
    ),

    'escalation', (
      SELECT jsonb_build_object(
        'id',                 e.id,
        'reason',             e.escalation_reason,
        'priority',           e.priority,
        'context',            e.context,
        'recommended_action', e.recommended_action,
        'created_at',         e.created_at
      )
      FROM public.agent_escalations e
      WHERE e.lead_id = p_lead_id AND e.resolved_at IS NULL
      ORDER BY e.created_at DESC
      LIMIT 1
    ),

    'next_meeting', (
      SELECT jsonb_build_object('scheduled_at', mt.scheduled_at, 'title', mt.title)
      FROM public.meetings mt
      WHERE mt.lead_id = p_lead_id AND mt.status = 'scheduled'
      ORDER BY mt.scheduled_at
      LIMIT 1
    ),

    -- Bandeira vermelha: se o número está bloqueado, quem assume precisa
    -- saber ANTES de escrever, não depois de o envio ser recusado.
    'opted_out', EXISTS (
      SELECT 1 FROM public.whatsapp_blacklist b
      WHERE b.user_id = v_lead.user_id AND b.phone = v_lead.phone
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lead_handoff_brief(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.lead_handoff_brief(UUID) IS
  'Tudo que alguém precisa para assumir uma conversa da IA sem começar do '
  'zero: histórico, memória, oferta em jogo, motivo da escalação e se o '
  'número está bloqueado. Confere o dono explicitamente — é SECURITY DEFINER.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'lead_handoff_brief'
  ) THEN
    RAISE EXCEPTION 'lead_handoff_brief não foi criada.';
  END IF;
END;
$$;


-- ============================================================
-- CONFERÊNCIA
-- ============================================================

-- 1. As tabelas novas existem? Devem vir 8.
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('missions','mission_leads','agent_events','ai_usage',
                     'provider_states','search_cache','ab_assignments','icp_profiles')
ORDER BY table_name;

-- 2. Os gatilhos que fecham o funil e alimentam o A/B existem? Devem vir 4.
SELECT tgname FROM pg_trigger
WHERE tgname IN ('trg_mission_lead_on_reply','trg_mission_lead_on_meeting',
                 'trg_ab_on_reply','trg_ab_on_won')
ORDER BY tgname;

-- 3. Os crons apontam para este projeto e mandam o segredo interno?
SELECT jobname,
       substring(command from 'https://[a-z0-9]+\.supabase\.co') AS projeto,
       command LIKE '%x-internal-secret%' AS manda_segredo
FROM cron.job
ORDER BY jobname;

-- 4. Nada foi perdido: seus leads continuam lá.
SELECT count(*) AS leads FROM public.leads;

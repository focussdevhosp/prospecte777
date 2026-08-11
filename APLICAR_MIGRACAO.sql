-- ============================================================
-- APLICAR ESTA MIGRAÇÃO — ESTEIRA COMERCIAL + NEXA SEARCH
-- ============================================================
-- Cole tudo de uma vez no SQL Editor do Supabase e execute.
--
-- É seguro rodar mais de uma vez: tudo usa IF NOT EXISTS,
-- CREATE OR REPLACE ou DROP ... IF EXISTS antes de criar.
-- Nenhuma tabela existente é alterada de forma destrutiva —
-- as únicas mudanças em tabela antiga são ADD COLUMN IF NOT EXISTS.
--
-- O que entra:
--   missions, mission_leads, agent_events, ai_usage
--   provider_states, search_cache
--   colunas novas em user_settings e missions
--   funções: mission_can_send, emergency_stop, resume_outbound,
--            command_center, ai_budget_check, ai_cost_summary,
--            missions_pending_batch, data_sources_overview,
--            purge_search_cache, touch_updated_at
--
-- No fim há uma consulta de verificação.
-- ============================================================


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


-- ============================================================
-- ============================================================
-- PARTE 2 DE 2 — AGREGADOR DE FONTES, CACHE E TETO DE GASTO
-- ============================================================
-- ============================================================

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


-- ============================================================
-- VERIFICAÇÃO
-- ============================================================
-- Rode isto depois. Devem aparecer 6 tabelas e 10 funções.

SELECT 'tabela' AS tipo, table_name AS nome
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'missions', 'mission_leads', 'agent_events',
    'ai_usage', 'provider_states', 'search_cache'
  )

UNION ALL

SELECT 'função', routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'mission_can_send', 'emergency_stop', 'resume_outbound',
    'command_center', 'ai_budget_check', 'ai_cost_summary',
    'missions_pending_batch', 'data_sources_overview',
    'purge_search_cache', 'touch_updated_at'
  )

ORDER BY tipo, nome;

-- Confere que o RLS ficou ligado nas tabelas novas.
-- Todas devem vir com rowsecurity = true.
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'missions', 'mission_leads', 'agent_events',
    'ai_usage', 'provider_states', 'search_cache'
  )
ORDER BY tablename;

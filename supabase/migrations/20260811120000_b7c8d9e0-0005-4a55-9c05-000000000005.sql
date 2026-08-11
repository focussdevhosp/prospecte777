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

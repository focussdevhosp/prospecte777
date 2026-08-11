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

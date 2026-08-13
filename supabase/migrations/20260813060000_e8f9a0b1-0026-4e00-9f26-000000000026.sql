-- ============================================================
-- O DASHBOARD PARAVA DE CONTAR EM MIL
-- ============================================================
-- A tela buscava TODOS os leads da conta e contava no navegador:
--
--   .from('leads').select('id, stage, temperature, created_at').eq('user_id', ...)
--
-- Sem limite explícito — e o PostgREST deste projeto tem `max_rows = 1000`.
-- Acima disso ele devolve os primeiros mil e não avisa. Nenhum erro, nenhum
-- aviso, nenhuma diferença visível.
--
-- O que acontece numa conta com 1.500 leads:
--   - "Total de Leads" mostra 1000, e para de crescer para sempre;
--   - a taxa de conversão vira ganhos-dentro-dos-mil / mil;
--   - funil e temperaturas saem de uma amostra truncada, e nem aleatória —
--     é a ordem que o Postgres devolveu.
--
-- Ou seja: quanto MAIS o cliente usa o produto, MAIS errado fica o painel
-- que ele abre primeiro. E o erro cresce em silêncio.
--
-- Contar é trabalho de banco. Aqui vai uma agregação só, exata, sem teto.
-- ============================================================

CREATE OR REPLACE FUNCTION public.dashboard_metrics(
  p_user_id UUID,
  p_days    INTEGER DEFAULT 90
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_result JSONB;
BEGIN
  -- SECURITY DEFINER passa por cima do RLS, então o dono é conferido aqui.
  IF p_user_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  SELECT jsonb_build_object(
    'totalLeads',       COALESCE(l.total, 0),
    'leadsThisMonth',   COALESCE(l.este_mes, 0),
    'hotLeads',         COALESCE(l.quentes, 0),
    'warmLeads',        COALESCE(l.mornos, 0),
    'coldLeads',        COALESCE(l.frios, 0),
    -- Arredondado em 2 casas no banco: o número que a tela mostra e o que a
    -- API devolve precisam ser o mesmo, senão dois lugares divergem sobre o
    -- mesmo dado.
    'conversionRate',   CASE WHEN COALESCE(l.total, 0) > 0
                          THEN ROUND((COALESCE(l.ganhos, 0)::NUMERIC / l.total) * 100, 2)
                          ELSE 0 END,
    'meetingsScheduled', COALESCE(m.agendadas, 0),
    'meetingsThisWeek',  COALESCE(m.esta_semana, 0),
    'leadsByStage', jsonb_build_object(
      'Contato',     COALESCE(l.contato, 0),
      'Qualificado', COALESCE(l.qualificado, 0),
      'Proposta',    COALESCE(l.proposta, 0),
      'Negociação',  COALESCE(l.negociacao, 0),
      'Ganho',       COALESCE(l.ganhos, 0),
      'Perdido',     COALESCE(l.perdido, 0)
    ),
    'leadsByDate', COALESCE((
      SELECT jsonb_object_agg(dia, qtd)
      FROM (
        SELECT to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia,
               COUNT(*) AS qtd
        FROM public.leads
        WHERE user_id = p_user_id
          AND created_at >= NOW() - (p_days || ' days')::INTERVAL
        GROUP BY 1
      ) d
    ), '{}'::jsonb)
  )
  INTO v_result
  FROM (
    SELECT
      COUNT(*)                                                        AS total,
      COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())) AS este_mes,
      COUNT(*) FILTER (WHERE temperature = 'quente')                  AS quentes,
      COUNT(*) FILTER (WHERE temperature = 'morno')                   AS mornos,
      COUNT(*) FILTER (WHERE temperature = 'frio')                    AS frios,
      COUNT(*) FILTER (WHERE stage = 'Contato')                       AS contato,
      COUNT(*) FILTER (WHERE stage = 'Qualificado')                   AS qualificado,
      COUNT(*) FILTER (WHERE stage = 'Proposta')                      AS proposta,
      COUNT(*) FILTER (WHERE stage = 'Negociação')                    AS negociacao,
      COUNT(*) FILTER (WHERE stage = 'Ganho')                         AS ganhos,
      COUNT(*) FILTER (WHERE stage = 'Perdido')                       AS perdido
    FROM public.leads
    WHERE user_id = p_user_id
  ) l
  CROSS JOIN (
    SELECT
      COUNT(*) FILTER (WHERE status = 'scheduled')                    AS agendadas,
      COUNT(*) FILTER (WHERE status = 'scheduled'
                         AND scheduled_at >= date_trunc('week', NOW())) AS esta_semana
    FROM public.meetings
    WHERE user_id = p_user_id
  ) m;

  RETURN v_result;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.dashboard_metrics(UUID, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.dashboard_metrics(UUID, INTEGER) IS
  'Números do painel, contados no banco. A versão anterior baixava os leads e '
  'contava no navegador — e parava em mil por causa do teto do PostgREST, '
  'ficando cada vez mais errada conforme a conta crescia.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'dashboard_metrics'
  ) THEN
    RAISE EXCEPTION 'dashboard_metrics não foi criada — o painel continuaria parando em mil.';
  END IF;
END;
$$;

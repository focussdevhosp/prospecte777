-- ============================================================
-- O NÚMERO PRECISA SOBREVIVER AO MÊS 4
-- ============================================================
-- `chip_usage` já registra quanto cada número mandou e quantas falhas teve.
-- Nada nunca leu isso para DECIDIR: a rotação equilibra carga, e o campo
-- `health` era declarado à mão — alguém escrevia "healthy" e ficava healthy
-- para sempre.
--
-- Faltavam as duas coisas que fazem uma operação de WhatsApp durar:
--
-- 1. AQUECIMENTO. Chip novo que dispara 30 mensagens no primeiro dia é chip
--    novo que some. Volume alto vindo de número sem histórico é lido como
--    spam, e não há apelação — número banido não volta, e leva junto o
--    histórico de conversa de todo mundo que já falou com ele.
--
-- 2. RECUO AUTOMÁTICO. Falha de envio subindo é o WhatsApp avisando que está
--    de olho. Continuar no volume cheio depois disso não é usar o número, é
--    gastá-lo.
--
-- A idade do chip sai do próprio `chip_usage`: o primeiro dia em que ele
-- mandou alguma coisa. Nenhuma coluna nova, nenhum cadastro a mais para
-- alguém esquecer de preencher.
-- ============================================================

/**
 * Tudo que a decisão de "quanto este número pode mandar hoje" precisa.
 *
 * Uma chamada só: a alternativa é a edge function fazer três consultas antes
 * de cada envio, e envio é o caminho mais quente do produto.
 */
CREATE OR REPLACE FUNCTION public.chip_allowance(
  p_user_id     UUID,
  p_instance_id TEXT
)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH historico AS (
    SELECT usage_date, sent_count, failed_count
    FROM public.chip_usage
    WHERE user_id = p_user_id AND instance_id = p_instance_id
  ),
  recentes AS (
    SELECT sent_count, failed_count
    FROM historico
    WHERE usage_date >= CURRENT_DATE - 7
    ORDER BY usage_date DESC
  )
  SELECT jsonb_build_object(
    -- Dia de vida: 1 no primeiro dia em que mandou algo. Chip que nunca
    -- mandou nada também é dia 1 — é exatamente o caso que a rampa protege.
    'day_of_life', COALESCE(
      (SELECT (CURRENT_DATE - MIN(usage_date) + 1) FROM historico),
      1
    ),
    'sent_today', COALESCE(
      (SELECT sent_count FROM historico WHERE usage_date = CURRENT_DATE),
      0
    ),
    'recent_days', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('sent', sent_count, 'failed', failed_count))
       FROM recentes),
      '[]'::jsonb
    ),
    -- Quantos destinatários bloquearam depois de receber por este número.
    -- É o sinal que mais pesa numa decisão de banimento.
    'blocks', (
      SELECT COUNT(*) FROM public.whatsapp_blacklist b
      WHERE b.user_id = p_user_id
        AND b.reason = 'opt_out'
        AND b.created_at >= NOW() - INTERVAL '7 days'
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.chip_allowance(UUID, TEXT) TO authenticated, service_role;

COMMENT ON FUNCTION public.chip_allowance(UUID, TEXT) IS
  'Idade, volume de hoje, histórico recente e bloqueios de um número. A '
  'decisão do teto mora em `_shared/chip-health.ts`, que é testável.';

/**
 * Panorama dos números da conta, para a tela de anti-bloqueio.
 *
 * Mostra quem está em aquecimento e quem está com falha subindo — as duas
 * informações que hoje só existiam depois que o número já tinha sido banido.
 */
CREATE OR REPLACE FUNCTION public.chips_overview(p_user_id UUID)
RETURNS TABLE (
  instance_id  TEXT,
  day_of_life  INTEGER,
  sent_today   INTEGER,
  sent_7d      BIGINT,
  failed_7d    BIGINT,
  last_sent_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    u.instance_id,
    (CURRENT_DATE - MIN(u.usage_date) + 1)::INTEGER,
    COALESCE(SUM(u.sent_count) FILTER (WHERE u.usage_date = CURRENT_DATE), 0)::INTEGER,
    COALESCE(SUM(u.sent_count) FILTER (WHERE u.usage_date >= CURRENT_DATE - 7), 0)::BIGINT,
    COALESCE(SUM(u.failed_count) FILTER (WHERE u.usage_date >= CURRENT_DATE - 7), 0)::BIGINT,
    MAX(u.last_sent_at)
  FROM public.chip_usage u
  WHERE u.user_id = p_user_id
  GROUP BY u.instance_id
  ORDER BY 2 ASC;
$$;

GRANT EXECUTE ON FUNCTION public.chips_overview(UUID) TO authenticated, service_role;

-- Sem este índice, cada envio varre o histórico inteiro do usuário — e envio
-- é o caminho mais quente do produto.
CREATE INDEX IF NOT EXISTS idx_chip_usage_lookup
  ON public.chip_usage (user_id, instance_id, usage_date DESC);

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'chip_allowance'
  ) THEN
    RAISE EXCEPTION 'chip_allowance não foi criada — o aquecimento de chip novo não teria como ser calculado.';
  END IF;
END;
$$;

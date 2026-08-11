-- ============================================================
-- O QUE JÁ FOI ENVIADO TEM MUITO A DIZER, E NINGUÉM PERGUNTOU
-- ============================================================
-- Cada linha de `mission_leads` guarda a estratégia usada — ângulo, gancho,
-- oferta — e o desfecho: `replied_at`, `status = 'meeting_booked'`. São
-- milhares de experimentos rodando desde o primeiro dia.
--
-- Nenhuma consulta nunca leu isso. O produto acumulava a resposta para "que
-- tipo de abordagem funciona no meu nicho?" e não sabia responder.
--
-- Os números saem derivados, como em todo o resto deste trabalho: contador
-- desnormalizado é contador que alguém esquece de incrementar, e aí a
-- conclusão sai de um zero que ninguém escreveu.
-- ============================================================

/**
 * Desempenho por ângulo de abordagem.
 *
 * Conta só o que foi ENVIADO: rascunho que ficou na fila não testou nada. E o
 * ângulo vem de `strategy->>'angle'`, gravado na hora em que a mensagem foi
 * escrita — não recalculado agora, que daria outro resultado se a régua
 * tivesse mudado no meio.
 */
CREATE OR REPLACE FUNCTION public.outreach_by_angle(
  p_user_id UUID,
  p_days    INTEGER DEFAULT 180
)
RETURNS TABLE (angle TEXT, sent BIGINT, replied BIGINT, meetings BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ml.strategy->>'angle', 'sem ângulo') AS angle,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE ml.replied_at IS NOT NULL)::BIGINT,
    COUNT(*) FILTER (WHERE ml.status = 'meeting_booked')::BIGINT
  FROM public.mission_leads ml
  WHERE ml.user_id = p_user_id
    AND ml.sent_at IS NOT NULL
    AND ml.sent_at >= NOW() - (GREATEST(p_days, 1) || ' days')::INTERVAL
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.outreach_by_angle(UUID, INTEGER)
  TO authenticated, service_role;

/**
 * Desempenho por oferta.
 *
 * Responde uma pergunta diferente da anterior e igualmente sem dono: entre o
 * que você vende, o que abre porta? Uma oferta que ninguém responde não é
 * necessariamente ruim — pode estar sendo oferecida para quem não precisa —,
 * mas é o primeiro lugar para olhar.
 */
CREATE OR REPLACE FUNCTION public.outreach_by_offer(
  p_user_id UUID,
  p_days    INTEGER DEFAULT 180
)
RETURNS TABLE (offer TEXT, sent BIGINT, replied BIGINT, meetings BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ml.offer_match->'offer'->>'name', 'sem oferta') AS offer,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE ml.replied_at IS NOT NULL)::BIGINT,
    COUNT(*) FILTER (WHERE ml.status = 'meeting_booked')::BIGINT
  FROM public.mission_leads ml
  WHERE ml.user_id = p_user_id
    AND ml.sent_at IS NOT NULL
    AND ml.sent_at >= NOW() - (GREATEST(p_days, 1) || ' days')::INTERVAL
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.outreach_by_offer(UUID, INTEGER)
  TO authenticated, service_role;

-- Índice para as duas: sem ele, cada abertura da tela varre a tabela inteira.
CREATE INDEX IF NOT EXISTS idx_mission_leads_user_sent
  ON public.mission_leads (user_id, sent_at DESC)
  WHERE sent_at IS NOT NULL;

COMMENT ON FUNCTION public.outreach_by_angle(UUID, INTEGER) IS
  'Resposta e reunião por ângulo de abordagem, derivadas de mission_leads. '
  'Quem decide o que fazer com isso é `_shared/agents/learning.ts`, que exige '
  'amostra bem maior para mudar comportamento do que para exibir.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'outreach_by_angle'
  ) THEN
    RAISE EXCEPTION 'outreach_by_angle não foi criada.';
  END IF;
END;
$$;

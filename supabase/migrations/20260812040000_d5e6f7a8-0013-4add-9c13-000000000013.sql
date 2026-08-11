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

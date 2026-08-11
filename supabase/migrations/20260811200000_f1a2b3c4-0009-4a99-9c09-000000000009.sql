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

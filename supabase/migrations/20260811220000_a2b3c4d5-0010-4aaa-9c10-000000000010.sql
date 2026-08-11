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

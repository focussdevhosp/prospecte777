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

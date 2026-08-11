-- ============================================================
-- "A IA PREFERIU CALAR" PRECISA DE UM NOME PRÓPRIO
-- ============================================================
-- `agent_escalations.escalation_reason` tem lista fechada, e ela cobre só
-- motivos comerciais: objeção complexa, oportunidade grande, reclamação,
-- pergunta técnica. Falta o motivo que passou a existir quando a conversa
-- ganhou conferência de factualidade: a IA gerou uma resposta, a resposta
-- afirmava coisa que ninguém pode sustentar, a reescrita também, e o certo
-- passou a ser não enviar nada e chamar uma pessoa.
--
-- Sem um valor para isso, o INSERT bateria no CHECK e falharia — e o efeito
-- seria o pior possível: a mensagem não sairia (certo) e ninguém ficaria
-- sabendo (errado). Silêncio sem aviso é o modo de falha que faz o cliente
-- achar que foi ignorado.
--
-- Também entra `opt_out_requested`: o lead pedir para parar é motivo de
-- escalação em qualquer operação séria, e não tinha onde ser registrado.
-- ============================================================

ALTER TABLE public.agent_escalations
  DROP CONSTRAINT IF EXISTS agent_escalations_escalation_reason_check;

ALTER TABLE public.agent_escalations
  ADD CONSTRAINT agent_escalations_escalation_reason_check
  CHECK (escalation_reason IN (
    'complex_objection', 'high_value_opportunity', 'complaint',
    'technical_question', 'urgent_request', 'closing_opportunity',
    'competitor_threat', 'custom_request', 'sentiment_negative',
    -- Novos
    'factuality_block',    -- a IA não conseguiu responder sem inventar
    'opt_out_requested'    -- o lead pediu para não receber mais
  ));

COMMENT ON COLUMN public.agent_escalations.escalation_reason IS
  'Por que uma pessoa precisa entrar. `factuality_block` é o único que não '
  'vem do lead: vem da própria IA reconhecendo que não tem como responder '
  'sem afirmar o que não pode sustentar.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------
-- Se o CHECK não aceitar o valor novo, o escalonamento falha em silêncio na
-- hora errada — em produção, com um lead esperando resposta.

-- Confere a definição do CHECK, e não um INSERT de teste: num projeto novo a
-- tabela `leads` está vazia, o INSERT não inseriria linha nenhuma e o teste
-- passaria sem ter testado nada. Verificação que só funciona com dados é
-- verificação que falha justamente onde mais importa — na primeira subida.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'agent_escalations_escalation_reason_check'
      AND pg_get_constraintdef(oid) LIKE '%factuality_block%'
  ) THEN
    RAISE EXCEPTION
      'O CHECK de escalation_reason não aceita factuality_block — o escalonamento '
      'da conferência de factualidade falharia calado, com um lead esperando resposta.';
  END IF;
END;
$$;

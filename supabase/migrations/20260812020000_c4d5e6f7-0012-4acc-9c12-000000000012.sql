-- ============================================================
-- O TESTE A/B NUNCA MEDIU NADA
-- ============================================================
-- A tela em /ab-testing tem 463 linhas: criação de teste, teste-z de duas
-- proporções, exibição de vencedor, de confiança e de conversões.
--
-- E nenhuma linha de código do produto jamais passou `ab_test_id` para o
-- envio. Uma busca de dois segundos mostra:
--
--   grep -rn "ab_test_id" src/
--   (vazio)
--
-- Então `variant_a_sent` nunca saiu de zero. E `variant_a_responses` e
-- `variant_a_conversions` não eram escritos por absolutamente nada — só
-- lidos, pela tela e pelo cron. O teste-z do cron dividia por zero, caía no
-- `continue`, e nenhum teste jamais foi concluído.
--
-- É a mesma classe do funil da missão, num tamanho maior: uma funcionalidade
-- inteira que parece pronta e em que TODO número é permanentemente zero.
--
-- O QUE MUDA
-- Os contadores saem das colunas e passam a ser derivados de uma tabela de
-- atribuição — uma linha por lead por teste. Contador desnormalizado que
-- ninguém incrementa vira zero eterno; contador derivado não tem como
-- divergir do que aconteceu.
-- ============================================================

-- ------------------------------------------------------------
-- 1. QUEM RECEBEU O QUÊ
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.ab_assignments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ab_test_id   UUID NOT NULL REFERENCES public.ab_tests(id) ON DELETE CASCADE,
  lead_id      UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  variant      TEXT NOT NULL CHECK (variant IN ('a', 'b')),

  sent_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  replied_at   TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  -- Em centavos: somar dinheiro em ponto flutuante acumula erro, e o número
  -- que vai aparecer na tela como "receita da variante" precisa fechar.
  revenue_cents BIGINT NOT NULL DEFAULT 0,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- O mesmo lead não entra duas vezes no mesmo teste. Sem isto, um
  -- reprocessamento de lote contaria a mesma pessoa como duas amostras e a
  -- significância viraria ficção.
  CONSTRAINT ab_assignments_unique UNIQUE (ab_test_id, lead_id)
);

CREATE INDEX IF NOT EXISTS idx_ab_assignments_test
  ON public.ab_assignments (ab_test_id, variant);

CREATE INDEX IF NOT EXISTS idx_ab_assignments_lead
  ON public.ab_assignments (lead_id, sent_at DESC);

ALTER TABLE public.ab_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own ab assignments" ON public.ab_assignments;

-- Só leitura pelo cliente: quem escreve é a edge function. O usuário poder
-- editar a própria amostra tira o sentido de medir.
CREATE POLICY "own ab assignments" ON public.ab_assignments
  FOR SELECT USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- 2. O LEAD RESPONDEU
-- ------------------------------------------------------------

/**
 * Marca a resposta na atribuição mais recente deste lead.
 *
 * Mesma escolha do funil da missão: gatilho, não chamada espalhada. A
 * resposta do lead entra por mais de um caminho, e o caminho que for escrito
 * amanhã nasceria esquecendo de contar.
 *
 * `replied_at` só na primeira resposta — a métrica é "respondeu ou não", e
 * sobrescrever a cada mensagem transformaria a amostra em outra coisa.
 */
CREATE OR REPLACE FUNCTION public.ab_on_reply()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.ab_assignments
  SET replied_at = NEW.created_at
  WHERE id = (
    SELECT id FROM public.ab_assignments
    WHERE lead_id = NEW.lead_id
      AND replied_at IS NULL
      AND sent_at <= NEW.created_at
    ORDER BY sent_at DESC
    LIMIT 1
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ab_on_reply ON public.chat_messages;
CREATE TRIGGER trg_ab_on_reply
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  WHEN (NEW.sender_type = 'lead')
  EXECUTE FUNCTION public.ab_on_reply();

-- ------------------------------------------------------------
-- 3. O NEGÓCIO FECHOU
-- ------------------------------------------------------------

/**
 * Marca conversão e receita quando o lead entra em "Ganho".
 *
 * `leads.deal_value` é o valor do negócio quando existe. Sem valor, a
 * conversão ainda conta — negócio fechado sem valor preenchido é falha de
 * cadastro, não motivo para ignorar a venda na hora de decidir qual mensagem
 * funciona.
 */
CREATE OR REPLACE FUNCTION public.ab_on_won()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_valor BIGINT := 0;
BEGIN
  IF NEW.stage IS NOT DISTINCT FROM OLD.stage THEN
    RETURN NEW;
  END IF;

  IF NEW.stage <> 'Ganho' THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_valor := COALESCE(ROUND(NEW.deal_value * 100), 0)::BIGINT;
  EXCEPTION WHEN OTHERS THEN
    v_valor := 0;
  END;

  UPDATE public.ab_assignments
  SET converted_at = NOW(),
      revenue_cents = v_valor
  WHERE id = (
    SELECT id FROM public.ab_assignments
    WHERE lead_id = NEW.id
      AND converted_at IS NULL
    ORDER BY sent_at DESC
    LIMIT 1
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ab_on_won ON public.leads;
CREATE TRIGGER trg_ab_on_won
  AFTER UPDATE OF stage ON public.leads
  FOR EACH ROW
  EXECUTE FUNCTION public.ab_on_won();

-- ------------------------------------------------------------
-- 4. OS NÚMEROS, DERIVADOS
-- ------------------------------------------------------------

/**
 * Estatísticas de um teste, contadas a partir das atribuições.
 *
 * Substitui as seis colunas de contador. A tela e o cron passam a ler daqui,
 * e some a única maneira de esses números estarem errados: ninguém precisa
 * lembrar de incrementá-los.
 */
CREATE OR REPLACE FUNCTION public.ab_test_stats(p_test_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'a', jsonb_build_object(
      'sent',          COUNT(*) FILTER (WHERE variant = 'a'),
      'replied',       COUNT(*) FILTER (WHERE variant = 'a' AND replied_at IS NOT NULL),
      'converted',     COUNT(*) FILTER (WHERE variant = 'a' AND converted_at IS NOT NULL),
      'revenue_cents', COALESCE(SUM(revenue_cents) FILTER (WHERE variant = 'a'), 0)
    ),
    'b', jsonb_build_object(
      'sent',          COUNT(*) FILTER (WHERE variant = 'b'),
      'replied',       COUNT(*) FILTER (WHERE variant = 'b' AND replied_at IS NOT NULL),
      'converted',     COUNT(*) FILTER (WHERE variant = 'b' AND converted_at IS NOT NULL),
      'revenue_cents', COALESCE(SUM(revenue_cents) FILTER (WHERE variant = 'b'), 0)
    )
  )
  FROM public.ab_assignments
  WHERE ab_test_id = p_test_id;
$$;

GRANT EXECUTE ON FUNCTION public.ab_test_stats(UUID) TO authenticated, service_role;

/**
 * Sincroniza as colunas antigas a partir das atribuições.
 *
 * As seis colunas continuam existindo porque a tela antiga lê delas e porque
 * apagar coluna é destrutivo. Deixam de ser a verdade e passam a ser cópia —
 * atualizada por esta função, nunca escrita à mão.
 */
CREATE OR REPLACE FUNCTION public.ab_sync_counters(p_test_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.ab_tests t
  SET variant_a_sent        = c.a_sent,
      variant_b_sent        = c.b_sent,
      variant_a_responses   = c.a_repl,
      variant_b_responses   = c.b_repl,
      variant_a_conversions = c.a_conv,
      variant_b_conversions = c.b_conv,
      updated_at            = NOW()
  FROM (
    SELECT
      COUNT(*) FILTER (WHERE variant = 'a')::INTEGER AS a_sent,
      COUNT(*) FILTER (WHERE variant = 'b')::INTEGER AS b_sent,
      COUNT(*) FILTER (WHERE variant = 'a' AND replied_at IS NOT NULL)::INTEGER AS a_repl,
      COUNT(*) FILTER (WHERE variant = 'b' AND replied_at IS NOT NULL)::INTEGER AS b_repl,
      COUNT(*) FILTER (WHERE variant = 'a' AND converted_at IS NOT NULL)::INTEGER AS a_conv,
      COUNT(*) FILTER (WHERE variant = 'b' AND converted_at IS NOT NULL)::INTEGER AS b_conv
    FROM public.ab_assignments
    WHERE ab_test_id = p_test_id
  ) c
  WHERE t.id = p_test_id;
$$;

GRANT EXECUTE ON FUNCTION public.ab_sync_counters(UUID) TO authenticated, service_role;

/** Testes rodando que têm atribuição — os únicos que vale reavaliar. */
CREATE OR REPLACE FUNCTION public.ab_tests_to_evaluate()
RETURNS TABLE (test_id UUID, user_id UUID, min_sample INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.user_id, t.min_sample_size
  FROM public.ab_tests t
  WHERE t.status = 'running'
    AND EXISTS (SELECT 1 FROM public.ab_assignments a WHERE a.ab_test_id = t.id);
$$;

GRANT EXECUTE ON FUNCTION public.ab_tests_to_evaluate() TO service_role;

-- ------------------------------------------------------------
-- 5. A DECISÃO PRECISA CARREGAR O MOTIVO
-- ------------------------------------------------------------
-- A coluna `winner` guardava "variant_a" e nada mais. Quem abre a tela três
-- semanas depois não tem como saber se aquilo foi decidido por venda ou por
-- curiosidade — e são conclusões muito diferentes.

ALTER TABLE public.ab_tests
  ADD COLUMN IF NOT EXISTS decision_metric TEXT,
  ADD COLUMN IF NOT EXISTS decision_reason TEXT;

COMMENT ON COLUMN public.ab_tests.decision_metric IS
  'Qual métrica decidiu: receita, conversao ou resposta. Resposta é a mais '
  'fraca das três — a mensagem que promete demais ganha ali e perde na venda.';

-- ------------------------------------------------------------
-- 6. CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ab_on_reply' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_ab_on_reply não foi criado — as respostas do teste A/B continuariam em zero.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_ab_on_won' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_ab_on_won não foi criado — as conversões do teste A/B continuariam em zero.';
  END IF;
END;
$$;

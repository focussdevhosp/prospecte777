-- ============================================================
-- SINAL: O MOTIVO DE FALAR COM ESSA EMPRESA HOJE
-- ============================================================
-- A prospecção respondia "quem abordar". Não respondia "por que agora" — e é
-- essa a diferença que o mercado mede: prospecção genérica fica em torno de
-- 3% de resposta, prospecção com gatilho em torno de 11%.
--
-- Um sinal é uma MUDANÇA observada, com data e evidência dos dois lados. Não
-- é dedução ("deve estar crescendo") nem característica estática ("não tem
-- site" — isso é fato, e fato não expira). Só mudança justifica a frase que
-- faz a mensagem funcionar: "reparei que vocês acabaram de...".
--
-- Para detectar mudança é preciso ter o estado anterior, e `leads` guardava
-- só o atual. Daí o `signal_snapshot`: uma foto compacta do que foi visto na
-- última conferência. Uma coluna, não uma tabela de histórico — o que
-- interessa é comparar com a última vez, não reconstruir a linha do tempo.
-- ============================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS signal_snapshot   JSONB,
  ADD COLUMN IF NOT EXISTS signal_checked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.signal_snapshot IS
  'Estado do lead na última conferência de sinais: site, nota da auditoria, '
  'achados e avaliações. Sem ele não há como saber o que MUDOU.';

CREATE TABLE IF NOT EXISTS public.lead_signals (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  type        TEXT NOT NULL,
  summary     TEXT NOT NULL,
  evidence    JSONB NOT NULL DEFAULT '{}'::jsonb,
  strength    INTEGER NOT NULL DEFAULT 50,

  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Toda linha nasce com validade. É a parte que se esquece e que estraga
  -- tudo: falar de uma queda de avaliação de seis meses atrás não soa atento,
  -- soa automatizado — o registro exato que o comprador aprendeu a ignorar.
  expires_at  TIMESTAMPTZ NOT NULL,

  -- Marcado quando o sinal vira gancho de uma abordagem. Serve para não
  -- reutilizar o mesmo gatilho duas vezes com a mesma pessoa.
  used_at     TIMESTAMPTZ,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT lead_signals_strength_valid CHECK (strength BETWEEN 0 AND 100),
  CONSTRAINT lead_signals_window_valid   CHECK (expires_at > detected_at)
);

-- O mesmo sinal não entra duas vezes enquanto estiver valendo. Sem isto, uma
-- conferência que rodasse duas vezes no mesmo dia duplicaria o gatilho, e a
-- tela mostraria "o site saiu do ar" três vezes.
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_signals_unico_ativo
  ON public.lead_signals (lead_id, type)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_signals_ativos
  ON public.lead_signals (user_id, expires_at DESC)
  WHERE used_at IS NULL;

ALTER TABLE public.lead_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own lead signals" ON public.lead_signals;
-- Só leitura pelo cliente: quem grava é a edge function. Sinal editável pelo
-- front deixaria de ser observação e viraria opinião.
CREATE POLICY "own lead signals" ON public.lead_signals
  FOR SELECT USING (user_id = auth.uid());

/**
 * Sinais que ainda valem para um lead, do mais forte para o mais fraco.
 *
 * A esteira usa o primeiro como gancho. Os demais aparecem na tela para quem
 * quiser entender o contexto.
 */
CREATE OR REPLACE FUNCTION public.lead_active_signals(p_lead_id UUID)
RETURNS TABLE (
  id          UUID,
  type        TEXT,
  summary     TEXT,
  evidence    JSONB,
  strength    INTEGER,
  detected_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.type, s.summary, s.evidence, s.strength, s.detected_at, s.expires_at
  FROM public.lead_signals s
  JOIN public.leads l ON l.id = s.lead_id
  WHERE s.lead_id = p_lead_id
    AND s.used_at IS NULL
    AND s.expires_at > NOW()
    -- SECURITY DEFINER passa por cima do RLS; a checagem de dono precisa ser
    -- explícita, senão qualquer id devolve os sinais de qualquer conta.
    AND l.user_id = auth.uid()
  ORDER BY s.strength DESC, s.detected_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.lead_active_signals(UUID) TO authenticated, service_role;

/** Quantos leads têm sinal valendo agora. Alimenta o painel. */
CREATE OR REPLACE FUNCTION public.signals_overview(p_user_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'active_leads', (
      SELECT COUNT(DISTINCT lead_id) FROM public.lead_signals
      WHERE user_id = p_user_id AND used_at IS NULL AND expires_at > NOW()
    ),
    'by_type', COALESCE((
      SELECT jsonb_object_agg(type, total)
      FROM (
        SELECT type, COUNT(*) AS total
        FROM public.lead_signals
        WHERE user_id = p_user_id AND used_at IS NULL AND expires_at > NOW()
        GROUP BY type
      ) t
    ), '{}'::jsonb),
    'expiring_soon', (
      SELECT COUNT(*) FROM public.lead_signals
      WHERE user_id = p_user_id AND used_at IS NULL
        AND expires_at > NOW() AND expires_at < NOW() + INTERVAL '7 days'
    ),
    'never_checked', (
      SELECT COUNT(*) FROM public.leads
      WHERE user_id = p_user_id AND signal_checked_at IS NULL
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.signals_overview(UUID) TO authenticated, service_role;

/**
 * Limpa sinal vencido.
 *
 * Não apaga: marca como usado. O histórico de "o que a gente viu e quando"
 * é o que permite conferir depois se o gatilho era real — apagar deixaria a
 * conta sem como auditar a própria abordagem.
 */
CREATE OR REPLACE FUNCTION public.expire_lead_signals()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INTEGER;
BEGIN
  UPDATE public.lead_signals
  SET used_at = NOW()
  WHERE used_at IS NULL AND expires_at <= NOW();

  GET DIAGNOSTICS v_total = ROW_COUNT;
  RETURN v_total;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_lead_signals() TO service_role;

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'lead_signals'
  ) THEN
    RAISE EXCEPTION 'lead_signals não foi criada.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_lead_signals_unico_ativo'
  ) THEN
    RAISE EXCEPTION 'Falta o índice único — o mesmo sinal entraria várias vezes.';
  END IF;
END;
$$;

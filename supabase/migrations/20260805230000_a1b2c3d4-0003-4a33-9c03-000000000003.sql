-- ============================================================
-- ROTAÇÃO DE CHIPS: CONTABILIDADE POR NÚMERO
-- ============================================================
-- `chip_health_logs` mede a conta inteira, não cada chip: não tem coluna de
-- instância. Para distribuir volume entre números — que é o ponto da
-- rotação — é preciso saber quanto cada um mandou.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.chip_usage (
  user_id      UUID NOT NULL,
  instance_id  TEXT NOT NULL,
  usage_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  sent_count   INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  last_sent_at TIMESTAMPTZ,
  PRIMARY KEY (user_id, instance_id, usage_date)
);

ALTER TABLE public.chip_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own chip usage"
  ON public.chip_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages chip usage"
  ON public.chip_usage FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_chip_usage_lookup
  ON public.chip_usage (user_id, usage_date);

/** Contabiliza um envio (ou falha) no chip, criando a linha do dia. */
CREATE OR REPLACE FUNCTION public.record_chip_send(
  p_user_id     UUID,
  p_instance_id TEXT,
  p_failed      BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.chip_usage AS cu (user_id, instance_id, usage_date, sent_count, failed_count, last_sent_at)
  VALUES (
    p_user_id, p_instance_id, CURRENT_DATE,
    CASE WHEN p_failed THEN 0 ELSE 1 END,
    CASE WHEN p_failed THEN 1 ELSE 0 END,
    now()
  )
  ON CONFLICT (user_id, instance_id, usage_date) DO UPDATE
    SET sent_count   = cu.sent_count + CASE WHEN p_failed THEN 0 ELSE 1 END,
        failed_count = cu.failed_count + CASE WHEN p_failed THEN 1 ELSE 0 END,
        last_sent_at = now();
$$;

GRANT EXECUTE ON FUNCTION public.record_chip_send(UUID, TEXT, BOOLEAN) TO service_role;

/**
 * Volume de hoje por chip. A rotação por saúde usa isto para mandar pelo
 * número que está mais folgado.
 */
CREATE OR REPLACE FUNCTION public.get_chip_usage_today(p_user_id UUID)
RETURNS TABLE (instance_id TEXT, sent_count INTEGER, failed_count INTEGER)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cu.instance_id, cu.sent_count, cu.failed_count
  FROM public.chip_usage cu
  WHERE cu.user_id = p_user_id AND cu.usage_date = CURRENT_DATE;
$$;

GRANT EXECUTE ON FUNCTION public.get_chip_usage_today(UUID) TO authenticated, service_role;

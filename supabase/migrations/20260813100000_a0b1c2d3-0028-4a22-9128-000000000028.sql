-- ============================================================
-- "ENVIOU 20" E CHEGOU 1
-- ============================================================
-- O disparo em massa contava tudo num número só. `processed_items` somava
-- item enviado E item pulado, e a tela mostrava:
--
--   processed_items - failed_items   →  rotulado "Enviados"
--
-- Num lote real: 25 pulados pelo portão de qualidade, 1 falha de WhatsApp,
-- 1 enviado de verdade. A tela anunciou 20+ enviados. O usuário abriu o
-- WhatsApp e achou uma mensagem.
--
-- O log do job estava certo o tempo todo — cada item pulado tinha sua linha
-- dizendo "Nada foi enviado". Quem mentiu foi o número grande na tela, que é
-- justamente o que a pessoa olha.
--
-- Pulado não é enviado nem é falha. Somar aos enviados faz a tela mentir;
-- somar às falhas assusta sem motivo, porque o portão barrar uma mensagem
-- ruim é o sistema funcionando. Precisa da própria coluna.
-- ============================================================

ALTER TABLE public.background_jobs
  ADD COLUMN IF NOT EXISTS sent_items    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS skipped_items INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.background_jobs.sent_items IS
  'Itens que SAÍRAM de verdade. Diferente de processed_items, que conta '
  'tentativa — inclusive a que o portão de qualidade barrou.';

COMMENT ON COLUMN public.background_jobs.skipped_items IS
  'Itens que o sistema decidiu não enviar: mensagem reprovada no portão, '
  'lead sem telefone, IA indisponível. Não é falha — é a recusa funcionando.';

-- ------------------------------------------------------------
-- O QUE JÁ ACONTECEU
-- ------------------------------------------------------------
-- Os jobs antigos ficam com sent_items = 0, o que também é mentira — só que
-- para baixo. O log de cada job tem a verdade item a item, então dá para
-- reconstruir sem inventar nada.

UPDATE public.background_jobs j
SET
  sent_items = COALESCE((
    SELECT count(*) FROM public.job_logs l
    WHERE l.job_id = j.id AND l.level = 'success' AND l.message LIKE 'Mensagem enviada%'
  ), 0),
  skipped_items = COALESCE((
    SELECT count(*) FROM public.job_logs l
    WHERE l.job_id = j.id AND l.level = 'warning' AND l.message LIKE '%pulado%'
  ), 0)
WHERE j.sent_items = 0 AND j.processed_items > 0;

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
DECLARE
  v_faltando INTEGER;
BEGIN
  SELECT count(*) INTO v_faltando
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'background_jobs'
    AND column_name IN ('sent_items', 'skipped_items');

  IF v_faltando <> 2 THEN
    RAISE EXCEPTION 'As colunas de contagem honesta não foram criadas — a tela continuaria chamando pulado de enviado.';
  END IF;
END;
$$;

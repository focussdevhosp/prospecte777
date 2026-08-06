-- ============================================================
-- AUDITORIA DE SITE NO LEAD
-- ============================================================
-- O app sabia achar empresa, mas não respondia a pergunta seguinte:
-- "por que essa empresa precisa do que eu vendo?". O vendedor abria o site
-- do lead, olhava e escrevia a abordagem no achismo.
--
-- Aqui o resultado da auditoria fica guardado no próprio lead, para a tela
-- ler sem refazer a análise a cada abertura.
-- ============================================================

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS site_audit JSONB,
  ADD COLUMN IF NOT EXISTS site_audited_at TIMESTAMPTZ;

COMMENT ON COLUMN public.leads.site_audit IS
  'Resultado da auditoria: nota de 0 a 100, achados e argumento de venda.';

-- Índice parcial: as telas sempre filtram "quem já foi auditado".
CREATE INDEX IF NOT EXISTS idx_leads_site_audited
  ON public.leads (user_id, site_audited_at)
  WHERE site_audited_at IS NOT NULL;

-- Nota extraída para coluna própria, para dar pra ordenar sem abrir o JSON.
CREATE OR REPLACE FUNCTION public.lead_site_score(p_audit JSONB)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE((p_audit->>'score')::INTEGER, -1);
$$;

GRANT EXECUTE ON FUNCTION public.lead_site_score(JSONB) TO authenticated, service_role;

/**
 * Ranking de oportunidade da carteira.
 *
 * Junta o que já se sabe do lead: site com problema, avaliação baixa,
 * poucas avaliações, sem site. Quanto pior a situação dele, mais alto ele
 * aparece — porque é onde há mais o que vender.
 */
CREATE OR REPLACE FUNCTION public.opportunity_radar(
  p_user_id UUID,
  p_limit   INTEGER DEFAULT 50
)
RETURNS TABLE (
  id                UUID,
  business_name     TEXT,
  phone             TEXT,
  niche             TEXT,
  website           TEXT,
  stage             TEXT,
  rating            NUMERIC,
  reviews_count     INTEGER,
  site_score        INTEGER,
  site_pitch        TEXT,
  opportunity_score INTEGER,
  reasons           TEXT[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    l.id,
    l.business_name,
    l.phone,
    l.niche,
    l.website,
    l.stage,
    l.rating,
    l.reviews_count,
    public.lead_site_score(l.site_audit) AS site_score,
    (l.site_audit->>'pitch') AS site_pitch,
    (
      -- Sem site é a maior oportunidade que existe para quem vende presença digital.
      CASE WHEN l.website IS NULL OR l.website = '' THEN 40 ELSE 0 END
      -- Site auditado com nota baixa: cada 10 pontos abaixo de 100 valem 3.
      + CASE
          WHEN l.site_audit IS NOT NULL
          THEN GREATEST(0, (100 - public.lead_site_score(l.site_audit)) / 10 * 3)
          ELSE 0
        END
      -- Reputação ruim pede gestão de reputação e marketing.
      + CASE
          WHEN l.rating IS NOT NULL AND l.rating < 3.5 THEN 20
          WHEN l.rating IS NOT NULL AND l.rating < 4.0 THEN 10
          ELSE 0
        END
      -- Pouca avaliação: negócio com pouca presença digital.
      + CASE
          WHEN l.reviews_count IS NOT NULL AND l.reviews_count < 10 THEN 12
          WHEN l.reviews_count IS NOT NULL AND l.reviews_count < 30 THEN 6
          ELSE 0
        END
      -- Ainda não abordado vale mais que lead já trabalhado.
      + CASE WHEN l.stage = 'Contato' AND l.last_contact_at IS NULL THEN 10 ELSE 0 END
    )::INTEGER AS opportunity_score,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN l.website IS NULL OR l.website = '' THEN 'Não tem site' END,
      CASE WHEN public.lead_site_score(l.site_audit) BETWEEN 0 AND 49 THEN 'Site com problemas graves' END,
      CASE WHEN l.rating IS NOT NULL AND l.rating < 3.5 THEN 'Avaliação baixa no Google' END,
      CASE WHEN l.reviews_count IS NOT NULL AND l.reviews_count < 10 THEN 'Quase sem avaliações' END,
      CASE WHEN l.stage = 'Contato' AND l.last_contact_at IS NULL THEN 'Nunca foi abordado' END
    ], NULL) AS reasons
  FROM public.leads l
  WHERE l.user_id = p_user_id
    AND l.stage NOT IN ('Ganho', 'Perdido')
    AND l.agent_status <> 'opted_out'
  ORDER BY opportunity_score DESC, l.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;

GRANT EXECUTE ON FUNCTION public.opportunity_radar(UUID, INTEGER) TO authenticated, service_role;

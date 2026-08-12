-- ============================================================
-- DONO DO LEAD, E COMO A EQUIPE RECEBE
-- ============================================================
-- `leads.assigned_to` existe desde o começo e nada nunca escreveu nele. Sem
-- dono, o produto é software de um operador só: uma agência com três SDRs não
-- consegue usar, porque todos veem a mesma fila e ou dois abordam a mesma
-- empresa, ou ninguém aborda.
--
-- A decisão de quem recebe mora em `_shared/agents/assignment.ts`, com teste.
-- Aqui ficam os dados que ela precisa: quem está disponível, com que carga e
-- atendendo qual nicho.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS active     BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS niches     TEXT[] NOT NULL DEFAULT '{}',
  -- 0 = sem teto. Existe porque distribuir para quem já está cheio cria uma
  -- fila que não vai ser atendida, e fila não atendida parece atendimento.
  ADD COLUMN IF NOT EXISTS capacity   INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.team_members.active IS
  'Fora do rodízio quando FALSE: férias, saiu, ainda não configurou WhatsApp.';

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS assignment_strategy TEXT NOT NULL DEFAULT 'carga';

ALTER TABLE public.teams
  DROP CONSTRAINT IF EXISTS teams_assignment_strategy_valid;
ALTER TABLE public.teams
  ADD CONSTRAINT teams_assignment_strategy_valid
  CHECK (assignment_strategy IN ('carga', 'rodizio', 'nicho'));

COMMENT ON COLUMN public.teams.assignment_strategy IS
  'carga (padrão) distribui TRABALHO igual; rodizio distribui QUANTIDADE '
  'igual. São coisas diferentes, e a segunda acumula fila em quem já está '
  'cheio.';

CREATE INDEX IF NOT EXISTS idx_leads_assigned
  ON public.leads (assigned_to, stage)
  WHERE assigned_to IS NOT NULL;

/**
 * Quem está disponível para receber lead, com a carga de cada um.
 *
 * "Carga" é lead ABERTO: em Ganho ou Perdido não consome atenção de ninguém,
 * e contá-los faria um vendedor produtivo parecer sobrecarregado justamente
 * por ter fechado negócio.
 */
CREATE OR REPLACE FUNCTION public.team_availability(p_owner_id UUID)
RETURNS TABLE (
  user_id   UUID,
  active    BOOLEAN,
  open_load BIGINT,
  niches    TEXT[],
  capacity  INTEGER
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    tm.user_id,
    tm.active,
    (
      SELECT COUNT(*) FROM public.leads l
      WHERE l.assigned_to = tm.user_id
        AND l.stage NOT IN ('Ganho', 'Perdido')
    ),
    tm.niches,
    tm.capacity
  FROM public.team_members tm
  JOIN public.teams t ON t.id = tm.team_id
  WHERE t.owner_id = p_owner_id
  ORDER BY 3 ASC;
$$;

GRANT EXECUTE ON FUNCTION public.team_availability(UUID) TO authenticated, service_role;

-- Histórico de quem recebeu o quê e por quê. Sem isso, "por que este lead é
-- meu?" não tem resposta — e é a primeira pergunta de todo vendedor que
-- recebe uma carteira que não montou.
CREATE TABLE IF NOT EXISTS public.lead_assignments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  assigned_by UUID,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_lead_assignments_lead
  ON public.lead_assignments (lead_id, created_at DESC);

ALTER TABLE public.lead_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own lead assignments" ON public.lead_assignments;
CREATE POLICY "own lead assignments" ON public.lead_assignments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.leads l WHERE l.id = lead_id AND l.user_id = auth.uid())
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname='team_availability'
  ) THEN
    RAISE EXCEPTION 'team_availability não foi criada — a distribuição ficaria sem dados.';
  END IF;
END;
$$;

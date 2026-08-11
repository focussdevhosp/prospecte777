-- ============================================================
-- O PERFIL IDEAL PRECISA SOBREVIVER À MISSÃO
-- ============================================================
-- Os critérios de ICP moram em `missions.icp`, um JSONB por missão. Funciona
-- para uma missão e falha para uma operação: quem roda cinco campanhas
-- parecidas redigita o mesmo perfil cinco vezes.
--
-- E é assim que as pessoas param de preencher. O campo continua lá, sempre
-- vazio, a qualificação volta a ser quase só "achou sinal de oportunidade ou
-- não", e a nota que ordena a fila perde o que a tornava específica daquele
-- negócio.
--
-- Guardar o perfil separado também dá uma coisa que o JSONB por missão não
-- dava: comparar. Duas missões com o mesmo perfil e resultados diferentes
-- falam sobre a mensagem; com perfis diferentes, falam sobre o público.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.icp_profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  name        TEXT NOT NULL,
  description TEXT,

  -- Mesmos campos que `qualify()` lê. Os nomes batem de propósito: um
  -- apelido diferente aqui viraria tradução em três lugares e divergência no
  -- quarto.
  niches      TEXT[] NOT NULL DEFAULT '{}',
  locations   TEXT[] NOT NULL DEFAULT '{}',
  signals     TEXT[] NOT NULL DEFAULT '{}',
  exclusions  TEXT[] NOT NULL DEFAULT '{}',
  min_rating  NUMERIC(3, 1),
  max_rating  NUMERIC(3, 1),
  min_reviews INTEGER,

  -- Perfil padrão aparece pré-selecionado ao criar missão. Um por conta.
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT icp_profiles_name_len CHECK (char_length(trim(name)) >= 2),
  -- Nome repetido na mesma conta transforma o seletor em adivinhação.
  CONSTRAINT icp_profiles_unique_name UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS idx_icp_profiles_user
  ON public.icp_profiles (user_id, created_at DESC);

ALTER TABLE public.icp_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own icp profiles" ON public.icp_profiles;
CREATE POLICY "own icp profiles" ON public.icp_profiles
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP TRIGGER IF EXISTS trg_icp_profiles_touch ON public.icp_profiles;
CREATE TRIGGER trg_icp_profiles_touch
  BEFORE UPDATE ON public.icp_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ------------------------------------------------------------
-- UM PADRÃO SÓ
-- ------------------------------------------------------------
-- Sem isto, marcar o segundo perfil como padrão deixaria dois marcados, e a
-- tela escolheria pela ordem da consulta — que muda. O usuário veria um
-- perfil hoje e outro amanhã sem ter mexido em nada.

CREATE OR REPLACE FUNCTION public.icp_single_default()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_default THEN
    UPDATE public.icp_profiles
    SET is_default = FALSE
    WHERE user_id = NEW.user_id
      AND id <> NEW.id
      AND is_default;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_icp_single_default ON public.icp_profiles;
CREATE TRIGGER trg_icp_single_default
  AFTER INSERT OR UPDATE OF is_default ON public.icp_profiles
  FOR EACH ROW
  WHEN (NEW.is_default)
  EXECUTE FUNCTION public.icp_single_default();

-- ------------------------------------------------------------
-- A MISSÃO GUARDA DE ONDE VEIO O PERFIL
-- ------------------------------------------------------------
-- `missions.icp` continua sendo a verdade do que foi aplicado: mudar o perfil
-- depois não pode reescrever a régua de uma missão que já rodou — o score dos
-- leads dela foi calculado com a régua antiga, e trocar a régua sem trocar as
-- notas produz um histórico que não fecha.
--
-- Esta coluna serve só para dizer de onde a cópia veio.

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS icp_profile_id UUID REFERENCES public.icp_profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.missions.icp_profile_id IS
  'Perfil que originou o `icp` desta missão. O `icp` é cópia: alterar o '
  'perfil depois NÃO muda missão que já rodou.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_icp_single_default' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'trg_icp_single_default não foi criado — dois perfis padrão fariam a tela escolher pela ordem da consulta.';
  END IF;
END;
$$;

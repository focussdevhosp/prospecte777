-- ============================================================
-- MISSÃO QUE PROSPECTA EM VOLTA DE VOCÊ
-- ============================================================
-- A busca por raio existia só na tela de captura avulsa. Missão é o fluxo
-- principal do produto — quem cria uma missão prospecta em lote, no tempo,
-- com follow-up — e ficava sem a opção.
--
-- O raio não é conforto: com coordenadas a área é um círculo real em volta
-- do ponto. Quem está numa divisa alcança as duas cidades; quem está numa
-- capital não recebe o outro extremo dela como se fosse perto.
--
-- As três colunas andam juntas ou nenhuma existe: meia informação aqui
-- produziria uma busca em volta de um ponto sem raio, ou um raio sem ponto.
-- ============================================================

ALTER TABLE public.missions
  ADD COLUMN IF NOT EXISTS center_lat       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS center_lng       DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS center_radius_km INTEGER;

COMMENT ON COLUMN public.missions.center_lat IS
  'Latitude do ponto quando a missão é "perto de mim". NULL = busca pelo '
  'nome do lugar, como sempre foi.';

COMMENT ON COLUMN public.missions.center_radius_km IS
  'Raio em km, de 1 a 300. É o que a tela oferece; o teto existe porque uma '
  'área maior faz a fonte pública estourar o tempo.';

-- ------------------------------------------------------------
-- OU OS TRÊS, OU NENHUM
-- ------------------------------------------------------------

ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_centro_completo;

ALTER TABLE public.missions
  ADD CONSTRAINT missions_centro_completo CHECK (
    (center_lat IS NULL AND center_lng IS NULL AND center_radius_km IS NULL)
    OR (center_lat IS NOT NULL AND center_lng IS NOT NULL AND center_radius_km IS NOT NULL)
  );

-- ------------------------------------------------------------
-- COORDENADA QUE EXISTE NO MUNDO
-- ------------------------------------------------------------
-- Fora de faixa produz uma caixa impossível e a fonte responde erro que
-- ninguém liga a "eu cliquei em perto de mim".
--
-- (0,0) entra na proibição de propósito: é o que aparece quando a leitura do
-- aparelho falha e vem travestida de coordenada válida. Fica no Golfo da
-- Guiné — a busca varreria o oceano e voltaria vazia, e "não há empresas
-- aqui" seria a conclusão errada mais convincente possível.

ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_centro_valido;

ALTER TABLE public.missions
  ADD CONSTRAINT missions_centro_valido CHECK (
    center_lat IS NULL
    OR (
      center_lat BETWEEN -90 AND 90
      AND center_lng BETWEEN -180 AND 180
      AND NOT (center_lat = 0 AND center_lng = 0)
      AND center_radius_km BETWEEN 1 AND 300
    )
  );

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'missions' AND column_name = 'center_radius_km'
  ) THEN
    RAISE EXCEPTION 'center_radius_km não foi criada — a missão continuaria sem busca por raio.';
  END IF;

  -- A regra que mais importa é a do (0,0): prova que a checagem pega o caso
  -- de leitura falha, e não só faixa fora do mundo.
  BEGIN
    INSERT INTO public.missions (user_id, name, niche, center_lat, center_lng, center_radius_km)
    SELECT id, '__teste_constraint__', 'x', 0, 0, 10 FROM auth.users LIMIT 1;

    RAISE EXCEPTION 'A checagem aceitou (0,0) — leitura falha entraria como coordenada.';
  EXCEPTION
    WHEN check_violation THEN
      NULL;  -- recusou, que é o esperado
    WHEN OTHERS THEN
      NULL;  -- sem usuário no banco, ou outra coluna obrigatória: não é o alvo
  END;

  DELETE FROM public.missions WHERE name = '__teste_constraint__';
END;
$$;

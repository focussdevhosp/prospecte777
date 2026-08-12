-- ============================================================
-- O LEAD PRECISA CHEGAR NO CRM QUE A EMPRESA JÁ USA
-- ============================================================
-- Quem compra prospecção JÁ TEM CRM. Se o lead qualificado não flui para lá, o
-- vendedor trabalha em duas telas — e em duas semanas volta para a que já
-- usava. É a causa mais comum de abandono deste tipo de ferramenta, e não é
-- problema de qualidade: é de encaixe.
--
-- A CREDENCIAL É DE CADA CLIENTE, NÃO DA PLATAFORMA
-- Cada empresa tem o token do RD Station DELA. Isso descarta guardar em secret
-- de edge function, que é único para todo mundo. Fica na tabela, com RLS por
-- dono — e o token NUNCA volta para o navegador: a coluna tem o SELECT
-- revogado de `authenticated`, então nem um bug de tela consegue exibi-lo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.crm_integrations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  provider    TEXT NOT NULL,
  -- Token, chave ou (no caso do webhook) a própria URL de destino.
  credential  TEXT NOT NULL,
  config      JSONB NOT NULL DEFAULT '{}'::jsonb,

  active      BOOLEAN NOT NULL DEFAULT TRUE,

  -- Resultado do último envio. Integração que falha calada é integração que
  -- todo mundo acha que está funcionando.
  last_ok_at    TIMESTAMPTZ,
  last_error    TEXT,
  last_error_at TIMESTAMPTZ,
  pushed_count  INTEGER NOT NULL DEFAULT 0,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT crm_integrations_provider_valid
    CHECK (provider IN ('rd_station', 'pipedrive', 'hubspot', 'webhook')),
  -- Um destino por provedor por conta. Dois iguais mandariam o mesmo lead
  -- duas vezes, e lead duplicado no CRM do cliente é o tipo de estrago que
  -- ele leva meses para limpar à mão.
  CONSTRAINT crm_integrations_um_por_provedor UNIQUE (user_id, provider)
);

ALTER TABLE public.crm_integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own crm integrations" ON public.crm_integrations;
CREATE POLICY "own crm integrations" ON public.crm_integrations
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- O token entra, mas não sai. `authenticated` pode escrever a linha inteira e
-- ler tudo MENOS a credencial; quem precisa dela para enviar é a edge
-- function, que roda como service_role.
REVOKE SELECT ON public.crm_integrations FROM authenticated;
GRANT SELECT (
  id, user_id, provider, config, active,
  last_ok_at, last_error, last_error_at, pushed_count, created_at
) ON public.crm_integrations TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.crm_integrations TO authenticated;

-- ------------------------------------------------------------
-- O QUE JÁ FOI, E O QUE DEU ERRADO
-- ------------------------------------------------------------
-- Sem isto não há como responder "esse lead foi para o meu CRM?" — que é a
-- primeira pergunta de quem desconfia da integração, e a desconfiança começa
-- exatamente quando ela funciona.

CREATE TABLE IF NOT EXISTS public.crm_push_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id      UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,

  provider     TEXT NOT NULL,
  ok           BOOLEAN NOT NULL,
  external_id  TEXT,
  message      TEXT NOT NULL,
  -- `true` quando o contato já existia lá e nada foi sobrescrito. Não é erro:
  -- é a regra da integração aparecendo no registro.
  already_existed BOOLEAN NOT NULL DEFAULT FALSE,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Impede o mesmo lead de ser empurrado de novo para o mesmo destino a cada
-- rodada da esteira. O índice é parcial: só o que deu certo bloqueia. Falha
-- tem que poder ser tentada de novo.
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_push_uma_vez
  ON public.crm_push_log (lead_id, provider)
  WHERE ok;

CREATE INDEX IF NOT EXISTS idx_crm_push_recentes
  ON public.crm_push_log (user_id, created_at DESC);

ALTER TABLE public.crm_push_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own crm push log" ON public.crm_push_log;
CREATE POLICY "own crm push log" ON public.crm_push_log
  FOR SELECT USING (user_id = auth.uid());

-- ------------------------------------------------------------
-- COMO ESTÁ A INTEGRAÇÃO
-- ------------------------------------------------------------
-- Derivado do log, e não de contador que alguém precisa lembrar de somar.
-- Contador que ninguém incrementa vira zero permanente — já aconteceu quatro
-- vezes neste projeto.

CREATE OR REPLACE FUNCTION public.crm_overview()
RETURNS TABLE (
  provider       TEXT,
  active         BOOLEAN,
  enviados       BIGINT,
  ja_existiam    BIGINT,
  falhas         BIGINT,
  ultimo_ok      TIMESTAMPTZ,
  ultimo_erro    TEXT,
  ultimo_erro_em TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    i.provider,
    i.active,
    COALESCE(l.enviados, 0),
    COALESCE(l.ja_existiam, 0),
    COALESCE(l.falhas, 0),
    i.last_ok_at,
    i.last_error,
    i.last_error_at
  FROM public.crm_integrations i
  LEFT JOIN (
    SELECT
      provider,
      user_id,
      COUNT(*) FILTER (WHERE ok AND NOT already_existed) AS enviados,
      COUNT(*) FILTER (WHERE ok AND already_existed)     AS ja_existiam,
      COUNT(*) FILTER (WHERE NOT ok)                     AS falhas
    FROM public.crm_push_log
    WHERE user_id = auth.uid()
    GROUP BY provider, user_id
  ) l ON l.provider = i.provider AND l.user_id = i.user_id
  WHERE i.user_id = auth.uid()
  ORDER BY i.provider;
$fn$;

GRANT EXECUTE ON FUNCTION public.crm_overview() TO authenticated, service_role;

COMMENT ON FUNCTION public.crm_overview() IS
  'Estado de cada destino de CRM, contado a partir do log real de envio. '
  'Contador mantido à mão vira zero permanente no dia em que alguém esquece '
  'de somar — e ninguém percebe, porque zero parece resposta.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
DECLARE
  v_pode_ler BOOLEAN;
BEGIN
  -- A garantia que importa: o token não pode voltar para o navegador.
  SELECT has_column_privilege('authenticated', 'public.crm_integrations', 'credential', 'SELECT')
  INTO v_pode_ler;

  IF v_pode_ler THEN
    RAISE EXCEPTION
      'authenticated ainda consegue ler crm_integrations.credential — o token do '
      'CRM do cliente voltaria para o navegador.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'idx_crm_push_uma_vez'
  ) THEN
    RAISE EXCEPTION 'idx_crm_push_uma_vez não foi criado — o mesmo lead entraria '
      'repetido no CRM do cliente a cada rodada.';
  END IF;
END;
$$;

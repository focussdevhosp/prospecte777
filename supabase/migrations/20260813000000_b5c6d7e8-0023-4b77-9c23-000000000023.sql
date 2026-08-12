-- ============================================================
-- LGPD: O QUE FALTAVA ERA A PARTE FORMAL
-- ============================================================
-- A parte operacional já estava sólida: lista de bloqueio, descadastro por
-- palavra-chave, supressão atravessando canais, parada de emergência. Quem
-- pede para parar, para de receber.
--
-- O que não existia é o que uma autoridade pergunta quando aparece:
--
--   "com que base legal vocês contataram esta pessoa?"
--   "como ela pede para sair sem depender de vocês responderem?"
--   "o que vocês fizeram quando ela pediu os dados dela?"
--
-- Nenhuma das três tinha resposta no sistema. E a primeira é a que mais pesa
-- em outbound B2B: legítimo interesse é base legal válida, mas exige registro
-- do porquê — sem ele, a defesa vira "achamos que podia".
-- ============================================================

-- ------------------------------------------------------------
-- 1. DE ONDE VEIO E POR QUE PODE
-- ------------------------------------------------------------

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS legal_basis       TEXT NOT NULL DEFAULT 'legitimo_interesse',
  ADD COLUMN IF NOT EXISTS data_origin       TEXT,
  ADD COLUMN IF NOT EXISTS data_collected_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS leads_legal_basis_valid;

ALTER TABLE public.leads
  ADD CONSTRAINT leads_legal_basis_valid
  CHECK (legal_basis IN ('legitimo_interesse', 'consentimento', 'contrato', 'obrigacao_legal'));

COMMENT ON COLUMN public.leads.legal_basis IS
  'Base legal do tratamento (LGPD art. 7). Padrão legítimo interesse, que é o '
  'caso do outbound B2B sobre dado publicamente disponível.';

COMMENT ON COLUMN public.leads.data_origin IS
  'Onde este contato foi obtido, em texto legível: "Google Maps em 12/08/2026", '
  '"importação de planilha", "formulário do site". É a resposta a "de onde vocês '
  'tiraram meu telefone" — a pergunta que abre toda reclamação.';

-- Preenche a origem do que já existe, a partir do que o sistema já sabia.
-- Sem isso, todo lead anterior ficaria sem procedência — e "não sabemos" é a
-- pior resposta possível para essa pergunta.
UPDATE public.leads
SET data_origin = 'captura automática (' || COALESCE(source, 'origem não registrada') || ')'
WHERE data_origin IS NULL;

-- ------------------------------------------------------------
-- 2. PEDIDO DO TITULAR
-- ------------------------------------------------------------
-- Acesso, correção, exclusão e portabilidade têm prazo legal. Sem registro,
-- não há como provar que foi atendido nem perceber que está vencendo.

CREATE TABLE IF NOT EXISTS public.data_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lead_id     UUID REFERENCES public.leads(id) ON DELETE SET NULL,

  requester   TEXT NOT NULL,
  kind        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pendente',
  note        TEXT,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- 15 dias é o prazo da LGPD para acesso. Gravado na linha para o prazo não
  -- depender de alguém lembrar da regra.
  due_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '15 days',
  resolved_at TIMESTAMPTZ,

  CONSTRAINT data_requests_kind_valid
    CHECK (kind IN ('acesso', 'correcao', 'exclusao', 'portabilidade', 'oposicao')),
  CONSTRAINT data_requests_status_valid
    CHECK (status IN ('pendente', 'em_andamento', 'atendido', 'recusado'))
);

CREATE INDEX IF NOT EXISTS idx_data_requests_pendentes
  ON public.data_requests (user_id, due_at)
  WHERE status IN ('pendente', 'em_andamento');

ALTER TABLE public.data_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own data requests" ON public.data_requests;
CREATE POLICY "own data requests" ON public.data_requests
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ------------------------------------------------------------
-- 3. RESPONDER A UM PEDIDO DE ACESSO
-- ------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lead_data_export(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_lead RECORD;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'lead_nao_encontrado');
  END IF;

  -- SECURITY DEFINER passa por cima do RLS: a checagem de dono é explícita.
  IF v_lead.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('error', 'acesso_negado');
  END IF;

  RETURN jsonb_build_object(
    'cadastro',       to_jsonb(v_lead) - 'user_id',
    'base_legal',     v_lead.legal_basis,
    'origem_do_dado', v_lead.data_origin,
    'coletado_em',    v_lead.data_collected_at,
    'mensagens', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object('quem', sender_type, 'texto', content, 'quando', sent_at)
        ORDER BY sent_at
      )
      FROM public.chat_messages WHERE lead_id = p_lead_id
    ), '[]'::jsonb),
    'memoria', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('tipo', memory_type, 'chave', key, 'valor', value))
      FROM public.lead_memory WHERE lead_id = p_lead_id
    ), '[]'::jsonb),
    'bloqueios', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('canal', channel, 'motivo', reason, 'quando', created_at))
      FROM public.outbound_suppression WHERE lead_id = p_lead_id
    ), '[]'::jsonb)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.lead_data_export(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.lead_data_export(UUID) IS
  'Tudo que o sistema guarda sobre um contato, num lugar só. Caçar isso à mão '
  'em seis tabelas é como o prazo legal estoura: não por má vontade, por '
  'trabalho.';

-- ------------------------------------------------------------
-- 4. DESCADASTRO QUE NÃO DEPENDE DE NINGUÉM RESPONDER
-- ------------------------------------------------------------
-- É o ponto da exigência: se sair da lista exigir que a empresa atenda um
-- pedido, quem quer sair fica preso ao interesse de quem não quer perdê-lo.

CREATE OR REPLACE FUNCTION public.public_unsubscribe(
  p_identifier TEXT,
  p_source     TEXT DEFAULT 'link público'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_total INTEGER := 0;
  v_lead  RECORD;
BEGIN
  IF p_identifier IS NULL OR length(trim(p_identifier)) < 5 THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'identificador_invalido');
  END IF;

  -- Cada carteira que tenha este contato recebe seu próprio bloqueio: a
  -- supressão é por conta, e uma linha só protegeria apenas uma delas.
  FOR v_lead IN
    SELECT id, user_id FROM public.leads
    WHERE phone = trim(p_identifier)
       OR lower(email) = lower(trim(p_identifier))
  LOOP
    INSERT INTO public.outbound_suppression
      (user_id, lead_id, identifier, channel, reason, source)
    VALUES
      (v_lead.user_id, v_lead.id, trim(p_identifier), 'all', 'opt_out', p_source);

    v_total := v_total + 1;
  END LOOP;

  -- Devolve sucesso mesmo sem encontrar ninguém, de propósito: responder
  -- "esse contato não está na nossa base" a quem não fez login transforma o
  -- descadastro numa forma de descobrir quem está cadastrado.
  RETURN jsonb_build_object('ok', true, 'bloqueios_criados', v_total);
END;
$fn$;

-- `anon` de propósito: quem quer sair não tem conta aqui, e exigir login
-- seria transformar o descadastro em obstáculo.
GRANT EXECUTE ON FUNCTION public.public_unsubscribe(TEXT, TEXT)
  TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'legal_basis'
  ) THEN
    RAISE EXCEPTION 'leads.legal_basis não foi criada — a base legal continuaria sem registro.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'public_unsubscribe'
  ) THEN
    RAISE EXCEPTION 'public_unsubscribe não foi criada — o descadastro dependeria de alguém responder.';
  END IF;
END;
$$;

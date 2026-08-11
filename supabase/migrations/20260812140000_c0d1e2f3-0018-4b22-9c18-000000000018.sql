-- ============================================================
-- DADO ENRIQUECIDO PRECISA DIZER DE ONDE VEIO
-- ============================================================
-- A cascata de enriquecimento acha o e-mail em uma de várias fontes, com
-- confianças bem diferentes: dedução de padrão confirmada por DNS não é a
-- mesma coisa que registro encontrado no Hunter.
--
-- Gravar só o endereço apaga essa diferença. Três meses depois, olhando o
-- cadastro, ninguém distingue o que foi verificado do que foi deduzido — e é
-- justamente essa distinção que decide se dá para escrever para aquele
-- endereço sem risco de bounce.
--
-- É a mesma regra que vale para todo o resto do produto: todo dado carrega a
-- procedência junto.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS email_source TEXT;

COMMENT ON COLUMN public.leads.email_source IS
  'Como o e-mail foi obtido, em linguagem de gente: "padrão contato@ com o '
  'domínio confirmado recebendo e-mail (registro MX)" ou "encontrado no '
  'Hunter para o domínio x.com.br". Vazio significa cadastrado à mão.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leads' AND column_name = 'email_source'
  ) THEN
    RAISE EXCEPTION 'leads.email_source não foi criada — a cascata gravaria o e-mail sem procedência.';
  END IF;
END;
$$;

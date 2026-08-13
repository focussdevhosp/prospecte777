-- ============================================================
-- DEDUPLICAÇÃO QUE PARAVA DE FUNCIONAR EM MIL LEADS
-- ============================================================
-- Três telas conferem duplicata do mesmo jeito: baixam TODOS os telefones da
-- carteira e montam um Set no navegador.
--
--   .from('leads').select('phone').eq('user_id', ...)
--
-- Sem limite — e o PostgREST deste projeto corta em 1000. Numa carteira com
-- 1.500 leads, o Set nasce com os primeiros mil e os outros 500 ficam
-- invisíveis: importar de novo passa batido, e a mesma empresa é abordada
-- duas vezes.
--
-- O código do orquestrador já dizia o que isso significa, sobre a dedup dele:
-- "a mesma empresa pode aparecer em duas missões, e abordar duas vezes vira
-- denúncia". Aqui era a mesma coisa, com o teto no meio.
--
-- Além do teto, havia um segundo furo: duas das três telas comparavam o
-- telefone COMO ESTÁ GRAVADO. "(11) 98765-4321", "5511987654321" e
-- "11987654321" são o mesmo número e não batiam entre si.
--
-- Esta função resolve os dois: compara pela forma canônica, e o volume é o
-- dos telefones PERGUNTADOS, não o da carteira inteira.
-- ============================================================

CREATE OR REPLACE FUNCTION public.leads_ja_existentes(
  p_user_id UUID,
  p_phones  TEXT[]
)
RETURNS TABLE (phone_consultado TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF p_user_id <> auth.uid() AND NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  -- Teto de sanidade: uma importação legítima não pergunta por 20 mil
  -- números de uma vez, e sem limite isto vira porta de varredura da base.
  IF array_length(p_phones, 1) > 5000 THEN
    RAISE EXCEPTION 'consulta grande demais: % telefones', array_length(p_phones, 1);
  END IF;

  RETURN QUERY
  SELECT DISTINCT p.phone
  FROM unnest(p_phones) AS p(phone)
  WHERE EXISTS (
    SELECT 1 FROM public.leads l
    WHERE l.user_id = p_user_id
      AND public.normalize_phone_br(l.phone) = public.normalize_phone_br(p.phone)
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.leads_ja_existentes(UUID, TEXT[]) TO authenticated, service_role;

COMMENT ON FUNCTION public.leads_ja_existentes(UUID, TEXT[]) IS
  'Quais dos telefones perguntados já estão na carteira. Compara pela forma '
  'canônica e não depende de baixar a carteira inteira — que parava em mil e '
  'deixava a duplicata passar.';

-- Sem este índice a comparação canônica faz varredura da tabela a cada
-- importação. Com ele, a checagem continua barata numa carteira grande.
CREATE INDEX IF NOT EXISTS idx_leads_phone_canonico
  ON public.leads (user_id, public.normalize_phone_br(phone));

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'leads_ja_existentes'
  ) THEN
    RAISE EXCEPTION 'leads_ja_existentes não foi criada — a dedup continuaria parando em mil.';
  END IF;
END;
$$;

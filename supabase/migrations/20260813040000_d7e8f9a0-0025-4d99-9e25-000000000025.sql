-- ============================================================
-- A CHAVE DE IA NÃO É DO USUÁRIO
-- ============================================================
-- `user_settings.deepseek_api_key` guardava uma chave de IA POR CONTA, e o
-- webhook a lia com prioridade sobre a chave da plataforma:
--
--   settings.deepseek_api_key || Deno.env.get("DEEPSEEK_API_KEY")
--
-- Na prática isso obrigaria cada cliente a cadastrar a própria chave para a
-- conversa funcionar direito — o oposto do que o produto promete, e nada na
-- tela explicava. O código já não lê mais essa coluna; aqui ela sai do banco,
-- para ninguém reintroduzir a leitura por engano daqui a seis meses.
--
-- POR QUE APAGAR É SEGURO AQUI
-- Conferido antes: 2 contas no projeto, ZERO com valor nesta coluna. Não há
-- dado a perder. Se houvesse, esta migração não existiria nesta forma — o
-- certo seria mover o valor antes, e isso é decisão de quem é dono do dado.
--
-- As chaves de BUSCA continuam: `serpapi_api_key` e `serper_api_key` são de
-- cada cliente de propósito, porque quem paga a franquia da busca é ele.
-- ============================================================

DO $$
DECLARE
  v_com_valor INTEGER;
BEGIN
  -- Recusa apagar se alguém tiver algo ali. A conferência de hoje pode não
  -- valer no dia em que esta migração rodar em outro banco.
  SELECT count(deepseek_api_key) INTO v_com_valor FROM public.user_settings;

  IF v_com_valor > 0 THEN
    RAISE EXCEPTION
      'Existem % conta(s) com deepseek_api_key preenchida. Esta migração '
      'apagaria esses valores. Trate-os antes de rodar.', v_com_valor;
  END IF;
END;
$$;

ALTER TABLE public.user_settings
  DROP COLUMN IF EXISTS deepseek_api_key;

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_settings'
      AND column_name = 'deepseek_api_key'
  ) THEN
    RAISE EXCEPTION 'deepseek_api_key continua na tabela.';
  END IF;

  -- As de busca precisam continuar existindo: são de cada cliente e o
  -- produto as usa.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_settings'
      AND column_name = 'serpapi_api_key'
  ) THEN
    RAISE EXCEPTION 'serpapi_api_key sumiu junto — essa é do cliente e o produto usa.';
  END IF;
END;
$$;

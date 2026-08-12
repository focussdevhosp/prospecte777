-- ============================================================
-- QUEM PEDIU PARA PARAR, PAROU — EM TODOS OS CANAIS
-- ============================================================
-- O opt-out é por TELEFONE: `whatsapp_blacklist` guarda o número e o
-- `whatsapp-send` consulta antes de cada envio. Funcionou enquanto WhatsApp
-- era o único canal.
--
-- No momento em que o e-mail entra, isso vira uma brecha com aparência de
-- funcionalidade: quem escreveu "pare" no WhatsApp continua recebendo
-- e-mail, porque o identificador é outro. Do lado de quem recebe, não há
-- diferença nenhuma — é a mesma empresa insistindo depois de ter sido
-- mandada parar.
--
-- Então o opt-out passa a ser da PESSOA. Pedir para parar em qualquer canal
-- para todos os canais, a menos que a pessoa diga o contrário.
--
-- `whatsapp_blacklist` continua existindo e continua sendo consultada: ela
-- tem o histórico, e desligá-la abriria justamente o buraco que este arquivo
-- veio fechar.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.outbound_suppression (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- O lead, quando se sabe quem é. É por ele que o bloqueio atravessa canais:
  -- telefone e e-mail são endereços, a pessoa é uma só.
  lead_id    UUID REFERENCES public.leads(id) ON DELETE CASCADE,

  -- Endereço específico, para o caso de não haver lead — importação, opt-out
  -- por link público, pedido que chega solto.
  identifier TEXT,
  channel    TEXT NOT NULL DEFAULT 'all',

  reason     TEXT NOT NULL DEFAULT 'opt_out',
  -- Onde a pessoa pediu. Serve para responder "quando e como isso foi pedido",
  -- que é o que uma autoridade pergunta.
  source     TEXT,
  note       TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT outbound_suppression_channel_valid
    CHECK (channel IN ('all', 'whatsapp', 'email')),
  -- Sem lead e sem endereço, a linha não bloqueia ninguém — só ocupa espaço
  -- e dá a impressão de que alguém foi protegido.
  CONSTRAINT outbound_suppression_alvo
    CHECK (lead_id IS NOT NULL OR identifier IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_suppression_lead
  ON public.outbound_suppression (user_id, lead_id);

CREATE INDEX IF NOT EXISTS idx_suppression_identifier
  ON public.outbound_suppression (user_id, identifier);

ALTER TABLE public.outbound_suppression ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own suppression" ON public.outbound_suppression;
-- O usuário lê e ACRESCENTA (pode bloquear alguém na mão), mas não apaga:
-- desfazer um opt-out não é operação de tela, é decisão que precisa passar
-- por quem entende a consequência.
CREATE POLICY "own suppression read" ON public.outbound_suppression
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "own suppression insert" ON public.outbound_suppression
  FOR INSERT WITH CHECK (user_id = auth.uid());

/**
 * Diz se este envio está bloqueado, olhando a PESSOA e não só o endereço.
 *
 * Consulta, nesta ordem:
 *   1. supressão global ou do canal, pelo lead
 *   2. supressão pelo endereço informado
 *   3. `whatsapp_blacklist` — o histórico que já existia
 *
 * Devolve o motivo em texto, ou NULL quando pode enviar. Motivo em vez de
 * booleano porque a tela precisa poder dizer O QUE aconteceu: "pediu para
 * sair pelo WhatsApp em 12/08" é informação; "bloqueado" não é.
 */
CREATE OR REPLACE FUNCTION public.outbound_suppressed(
  p_user_id    UUID,
  p_channel    TEXT,
  p_lead_id    UUID DEFAULT NULL,
  p_identifier TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row RECORD;
BEGIN
  IF p_lead_id IS NOT NULL THEN
    SELECT channel, source, created_at INTO v_row
    FROM public.outbound_suppression
    WHERE user_id = p_user_id
      AND lead_id = p_lead_id
      AND channel IN ('all', p_channel)
    ORDER BY created_at
    LIMIT 1;

    IF FOUND THEN
      RETURN format(
        'Este contato pediu para não receber mais mensagens%s, em %s.',
        CASE WHEN v_row.source IS NOT NULL THEN ' (' || v_row.source || ')' ELSE '' END,
        to_char(v_row.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
      );
    END IF;
  END IF;

  IF p_identifier IS NOT NULL THEN
    SELECT channel, source, created_at INTO v_row
    FROM public.outbound_suppression
    WHERE user_id = p_user_id
      AND identifier = p_identifier
      AND channel IN ('all', p_channel)
    ORDER BY created_at
    LIMIT 1;

    IF FOUND THEN
      RETURN format(
        'Este endereço pediu para não receber mais mensagens, em %s.',
        to_char(v_row.created_at AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY')
      );
    END IF;
  END IF;

  -- A lista antiga continua valendo. Ignorá-la aqui reabriria o buraco no
  -- canal que já funcionava.
  IF p_channel = 'whatsapp' AND p_identifier IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.whatsapp_blacklist
      WHERE user_id = p_user_id AND phone = p_identifier
    ) THEN
      RETURN 'Este número está na lista de bloqueio.';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.outbound_suppressed(UUID, TEXT, UUID, TEXT)
  TO authenticated, service_role;

/**
 * Registra o opt-out atravessando canais.
 *
 * Um gatilho já coloca o número na `whatsapp_blacklist` quando o lead escreve
 * "pare". Este espelha aquilo em `outbound_suppression` com `channel = 'all'`,
 * que é o que impede o e-mail de sair para quem pediu silêncio no WhatsApp.
 */
CREATE OR REPLACE FUNCTION public.suppression_from_blacklist()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.outbound_suppression (user_id, lead_id, identifier, channel, reason, source)
  VALUES (
    NEW.user_id,
    NEW.lead_id,
    NEW.phone,
    'all',
    'opt_out',
    'pedido no WhatsApp'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_suppression_from_blacklist ON public.whatsapp_blacklist;
CREATE TRIGGER trg_suppression_from_blacklist
  AFTER INSERT ON public.whatsapp_blacklist
  FOR EACH ROW
  EXECUTE FUNCTION public.suppression_from_blacklist();

-- Quem já estava bloqueado no WhatsApp precisa entrar aqui também. Sem esta
-- recuperação, todo mundo que pediu para parar antes de hoje receberia o
-- primeiro e-mail — e seria justamente quem já demonstrou não querer.
INSERT INTO public.outbound_suppression (user_id, lead_id, identifier, channel, reason, source)
SELECT b.user_id, b.lead_id, b.phone, 'all', 'opt_out', 'lista de bloqueio anterior'
FROM public.whatsapp_blacklist b
WHERE NOT EXISTS (
  SELECT 1 FROM public.outbound_suppression s
  WHERE s.user_id = b.user_id AND s.identifier = b.phone
);

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_suppression_from_blacklist' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION
      'trg_suppression_from_blacklist não foi criado — quem pedisse para parar no '
      'WhatsApp continuaria recebendo e-mail.';
  END IF;
END;
$$;

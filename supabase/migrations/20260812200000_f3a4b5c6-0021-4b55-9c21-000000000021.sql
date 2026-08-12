-- ============================================================
-- REMETENTE DO E-MAIL, E O CANAL DA MISSÃO
-- ============================================================
-- O canal já existia em `missions.channel`, com padrão 'whatsapp' — e nunca
-- foi outra coisa, porque a tela não oferecia escolha e nada além do WhatsApp
-- sabia enviar.
--
-- Com o e-mail entrando, a coluna passa a significar algo. E ganha uma opção
-- que não é "um ou outro": `email_depois_whatsapp` é a sequência que protege
-- o ativo mais frágil da operação — o primeiro toque sai por e-mail, que não
-- queima número, e o WhatsApp entra só depois que a pessoa respondeu.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS email_from     TEXT,
  ADD COLUMN IF NOT EXISTS email_reply_to TEXT;

COMMENT ON COLUMN public.user_settings.email_from IS
  'Remetente, no formato "Nome <endereco@dominio>". O domínio precisa estar '
  'verificado no provedor — sem isso o e-mail sai como spam ou nem sai.';

ALTER TABLE public.missions
  DROP CONSTRAINT IF EXISTS missions_channel_valid;

ALTER TABLE public.missions
  ADD CONSTRAINT missions_channel_valid
  CHECK (channel IN ('whatsapp', 'email', 'email_depois_whatsapp'));

COMMENT ON COLUMN public.missions.channel IS
  'whatsapp | email | email_depois_whatsapp. A terceira é a sequência que '
  'protege o chip: primeiro toque por e-mail, WhatsApp só depois da resposta.';

-- Por qual canal cada lead foi abordado. Sem isso, medir "e-mail converte
-- mais que WhatsApp?" seria impossível — e essa é a primeira pergunta que
-- alguém faz depois de ligar o segundo canal.
ALTER TABLE public.mission_leads
  ADD COLUMN IF NOT EXISTS sent_channel TEXT;

COMMENT ON COLUMN public.mission_leads.sent_channel IS
  'Canal por onde a abordagem saiu de fato. Alimenta a comparação entre '
  'canais em `outreach_by_channel`.';

/**
 * Desempenho por canal.
 *
 * Mesma forma de `outreach_by_angle`, e pela mesma razão: o número precisa
 * sair derivado do que aconteceu, não de um contador que alguém pode
 * esquecer de incrementar.
 */
CREATE OR REPLACE FUNCTION public.outreach_by_channel(
  p_user_id UUID,
  p_days    INTEGER DEFAULT 180
)
RETURNS TABLE (channel TEXT, sent BIGINT, replied BIGINT, meetings BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ml.sent_channel, 'whatsapp') AS channel,
    COUNT(*)::BIGINT,
    COUNT(*) FILTER (WHERE ml.replied_at IS NOT NULL)::BIGINT,
    COUNT(*) FILTER (WHERE ml.status = 'meeting_booked')::BIGINT
  FROM public.mission_leads ml
  WHERE ml.user_id = p_user_id
    AND ml.sent_at IS NOT NULL
    AND ml.sent_at >= NOW() - (GREATEST(p_days, 1) || ' days')::INTERVAL
  GROUP BY 1
  ORDER BY 2 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.outreach_by_channel(UUID, INTEGER)
  TO authenticated, service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='mission_leads' AND column_name='sent_channel'
  ) THEN
    RAISE EXCEPTION 'mission_leads.sent_channel não foi criada — a comparação entre canais ficaria sem base.';
  END IF;
END;
$$;

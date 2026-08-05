-- ============================================================
-- AGENTE SDR: CONTROLE DE CONVERSA
-- ============================================================
-- O agente respondia toda mensagem que entrava, sem nenhuma trava:
--   * Lead mandava 3 mensagens seguidas ("oi" / "tudo bem?" / "quanto custa?")
--     e levava 3 respostas — é o que mais denuncia robô.
--   * A Evolution reentrega webhook em falha de rede, e a mesma mensagem era
--     processada de novo, gerando resposta duplicada.
--   * Lead pedindo "pare" continuava recebendo: o gatilho de blacklist
--     existia, mas o caminho de resposta não consultava nada.
--   * Não havia como passar a conversa para um humano.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ESTADO DO AGENTE POR LEAD
-- ------------------------------------------------------------
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS agent_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS agent_paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS agent_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS agent_replies_today INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agent_replies_date DATE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leads_agent_status_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_agent_status_check
      CHECK (agent_status IN ('active', 'paused', 'handoff', 'opted_out'));
  END IF;
END $$;

COMMENT ON COLUMN public.leads.agent_status IS
  'active = IA responde | paused = pausado pelo dono | handoff = esperando humano | opted_out = pediu para parar';

CREATE INDEX IF NOT EXISTS idx_leads_agent_status
  ON public.leads (user_id, agent_status);

-- ------------------------------------------------------------
-- 2. DEDUP DE MENSAGEM RECEBIDA
-- ------------------------------------------------------------
-- O id que a Evolution manda em data.key.id identifica a mensagem no
-- WhatsApp. Guardando ele, reentrega vira no-op em vez de resposta dupla.
ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS external_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_messages_external_id
  ON public.chat_messages (external_id)
  WHERE external_id IS NOT NULL;

-- ------------------------------------------------------------
-- 3. FILA DE ESPERA (DEBOUNCE)
-- ------------------------------------------------------------
-- Quando o lead manda várias mensagens seguidas, guardamos aqui e só
-- respondemos quando ele para de digitar. Uma resposta para o assunto
-- inteiro, não uma para cada linha.
CREATE TABLE IF NOT EXISTS public.pending_replies (
  lead_id       UUID PRIMARY KEY REFERENCES public.leads(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  message_count INTEGER NOT NULL DEFAULT 1,
  processing    BOOLEAN NOT NULL DEFAULT false
);

ALTER TABLE public.pending_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own pending replies"
  ON public.pending_replies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages pending replies"
  ON public.pending_replies FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_pending_replies_ready
  ON public.pending_replies (last_seen_at)
  WHERE processing = false;

-- ------------------------------------------------------------
-- 4. TRAVAS DO AGENTE
-- ------------------------------------------------------------

/**
 * Decide se o agente pode responder este lead agora.
 *
 * Devolve o motivo da recusa (ou NULL para "pode responder"), para o log
 * dizer exatamente por que ficou calado em vez de sumir sem explicação.
 */
CREATE OR REPLACE FUNCTION public.agent_can_reply(
  p_lead_id UUID,
  p_max_replies_per_day INTEGER DEFAULT 30
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead   RECORD;
  v_streak INTEGER;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN 'lead_inexistente'; END IF;

  IF v_lead.agent_status <> 'active' THEN
    RETURN 'agente_' || v_lead.agent_status;
  END IF;

  IF public.is_phone_blacklisted(v_lead.user_id, v_lead.phone) THEN
    RETURN 'opt_out';
  END IF;

  -- Teto diário por lead: sem isso, uma conversa em loop consome API o dia
  -- inteiro e enche o WhatsApp do contato.
  IF v_lead.agent_replies_date = CURRENT_DATE
     AND v_lead.agent_replies_today >= p_max_replies_per_day THEN
    RETURN 'teto_diario_do_lead';
  END IF;

  -- Se as últimas 4 mensagens da conversa são todas nossas, o lead parou de
  -- responder e o agente está falando sozinho.
  SELECT count(*) INTO v_streak FROM (
    SELECT sender_type FROM public.chat_messages
    WHERE lead_id = p_lead_id
    ORDER BY sent_at DESC
    LIMIT 4
  ) recentes
  WHERE sender_type <> 'lead';

  IF v_streak >= 4 THEN RETURN 'agente_falando_sozinho'; END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_can_reply(UUID, INTEGER) TO service_role;

/** Contabiliza uma resposta enviada, virando o contador à meia-noite. */
CREATE OR REPLACE FUNCTION public.agent_count_reply(p_lead_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.leads
  SET
    agent_replies_today = CASE
      WHEN agent_replies_date = CURRENT_DATE THEN agent_replies_today + 1
      ELSE 1 END,
    agent_replies_date = CURRENT_DATE
  WHERE id = p_lead_id;
$$;

GRANT EXECUTE ON FUNCTION public.agent_count_reply(UUID) TO service_role;

/** Tira a IA da conversa e sinaliza que um humano precisa entrar. */
CREATE OR REPLACE FUNCTION public.agent_handoff(
  p_lead_id UUID,
  p_reason  TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.leads
  SET agent_status = 'handoff',
      agent_paused_reason = p_reason,
      agent_paused_at = now(),
      temperature = 'quente'
  WHERE id = p_lead_id;

  INSERT INTO public.activity_log (user_id, lead_id, activity_type, description, metadata)
  VALUES (
    v_lead.user_id, p_lead_id, 'agent_handoff',
    'Agente passou a conversa para atendimento humano: ' || p_reason,
    jsonb_build_object('reason', p_reason)
  );

  INSERT INTO public.admin_notifications (user_id, title, message, type, metadata)
  VALUES (
    v_lead.user_id,
    'Lead esperando você',
    v_lead.business_name || ' precisa de atendimento humano (' || p_reason || ')',
    'handoff',
    jsonb_build_object('lead_id', p_lead_id, 'reason', p_reason)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_handoff(UUID, TEXT) TO service_role;

/** Registra opt-out: entra na blacklist e a IA para de responder. */
CREATE OR REPLACE FUNCTION public.agent_opt_out(
  p_lead_id UUID,
  p_keyword TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead RECORD;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE public.leads
  SET agent_status = 'opted_out',
      agent_paused_reason = 'opt_out',
      agent_paused_at = now(),
      temperature = 'frio',
      stage = 'Perdido'
  WHERE id = p_lead_id;

  INSERT INTO public.whatsapp_blacklist (user_id, phone, reason, keyword_matched, lead_id)
  VALUES (v_lead.user_id, v_lead.phone, 'opt_out', p_keyword, p_lead_id)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.activity_log (user_id, lead_id, activity_type, description, metadata)
  VALUES (
    v_lead.user_id, p_lead_id, 'opt_out',
    'Lead pediu para não receber mais mensagens',
    jsonb_build_object('keyword', p_keyword)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.agent_opt_out(UUID, TEXT) TO service_role;

-- ------------------------------------------------------------
-- 5. LIMPEZA DE MEMÓRIA
-- ------------------------------------------------------------
-- A memória do lead só crescia. Sem expurgo, o prompt do agente vai ficando
-- maior e mais caro a cada conversa, carregando fato de meses atrás com
-- confiança baixa.
CREATE OR REPLACE FUNCTION public.prune_lead_memory()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM public.lead_memory
  WHERE (expires_at IS NOT NULL AND expires_at < now())
     OR (confidence < 0.4 AND updated_at < now() - INTERVAL '30 days');

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- Mantém no máximo 40 memórias por lead, as mais recentes e confiáveis.
  WITH ranked AS (
    SELECT id, row_number() OVER (
      PARTITION BY lead_id ORDER BY confidence DESC, updated_at DESC
    ) AS rn
    FROM public.lead_memory
  )
  DELETE FROM public.lead_memory
  WHERE id IN (SELECT id FROM ranked WHERE rn > 40);

  RETURN v_deleted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.prune_lead_memory() TO service_role;

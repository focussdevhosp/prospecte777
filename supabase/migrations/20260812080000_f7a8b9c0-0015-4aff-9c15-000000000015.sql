-- ============================================================
-- QUEM ASSUME A CONVERSA PRECISA SABER O QUE JÁ FOI DITO
-- ============================================================
-- Quando a IA escala, a tela mostra o nome da empresa, o motivo e duas linhas
-- de contexto. Quem clica em "Abrir" cai no inbox e começa a ler a conversa
-- do começo para descobrir o que está acontecendo.
--
-- É a parte do handoff que faz handoff dar errado. A pessoa entra sem saber o
-- que já foi prometido, o que o lead já respondeu e o que ele já recusou — e
-- a primeira mensagem dela ou repete o que a IA disse, ou contradiz. As duas
-- entregam que trocou de interlocutor no pior momento possível: aquele em que
-- o caso era importante o bastante para escalar.
--
-- Esta função devolve tudo de uma vez. Uma chamada, e não seis: montar o
-- resumo com cinco consultas na tela significa cinco chances de uma falhar e
-- a pessoa assumir com informação pela metade sem perceber.
-- ============================================================

CREATE OR REPLACE FUNCTION public.lead_handoff_brief(p_lead_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead    RECORD;
  v_result  JSONB;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'lead_nao_encontrado');
  END IF;

  -- SECURITY DEFINER passa por cima do RLS, então a checagem de dono precisa
  -- ser explícita. Sem ela, qualquer usuário autenticado leria a conversa
  -- inteira de qualquer lead de qualquer conta passando um id.
  IF v_lead.user_id <> auth.uid() THEN
    RETURN jsonb_build_object('error', 'acesso_negado');
  END IF;

  SELECT jsonb_build_object(
    'lead', jsonb_build_object(
      'id',            v_lead.id,
      'business_name', v_lead.business_name,
      'phone',         v_lead.phone,
      'niche',         v_lead.niche,
      'location',      v_lead.location,
      'website',       v_lead.website,
      'stage',         v_lead.stage,
      'temperature',   v_lead.temperature,
      'rating',        v_lead.rating,
      'reviews_count', v_lead.reviews_count,
      'site_audit',    v_lead.site_audit,
      'first_contact_at', v_lead.first_contact_at,
      'last_response_at', v_lead.last_response_at
    ),

    -- As últimas trocas, em ordem de leitura. Doze cobre a conversa que
    -- importa sem virar rolagem.
    'messages', COALESCE((
      SELECT jsonb_agg(m ORDER BY m->>'sent_at')
      FROM (
        SELECT jsonb_build_object(
          'sender_type', cm.sender_type,
          'content',     cm.content,
          'sent_at',     cm.sent_at
        ) AS m
        FROM public.chat_messages cm
        WHERE cm.lead_id = p_lead_id
        ORDER BY cm.sent_at DESC
        LIMIT 12
      ) t
    ), '[]'::jsonb),

    -- O que o lead disse em conversas anteriores. É o que a pessoa não tem
    -- como reconstruir lendo só as últimas mensagens.
    'memory', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'type',       lm.memory_type,
        'key',        lm.key,
        'value',      lm.value,
        'confidence', lm.confidence
      ) ORDER BY lm.updated_at DESC)
      FROM public.lead_memory lm
      WHERE lm.lead_id = p_lead_id
        AND lm.confidence >= 0.6
    ), '[]'::jsonb),

    -- O que foi oferecido e com que argumento. Quem assume não pode
    -- contradizer a proposta que a IA já colocou na mesa.
    'mission', (
      SELECT jsonb_build_object(
        'name',        m.name,
        'goal',        m.goal,
        'offer',       ml.offer_match->'offer',
        'strategy',    ml.strategy,
        'score',       ml.score,
        'temperature', ml.temperature,
        'sent_at',     ml.sent_at,
        'status',      ml.status
      )
      FROM public.mission_leads ml
      JOIN public.missions m ON m.id = ml.mission_id
      WHERE ml.lead_id = p_lead_id
      ORDER BY ml.sent_at DESC NULLS LAST
      LIMIT 1
    ),

    'escalation', (
      SELECT jsonb_build_object(
        'id',                 e.id,
        'reason',             e.escalation_reason,
        'priority',           e.priority,
        'context',            e.context,
        'recommended_action', e.recommended_action,
        'created_at',         e.created_at
      )
      FROM public.agent_escalations e
      WHERE e.lead_id = p_lead_id AND e.resolved_at IS NULL
      ORDER BY e.created_at DESC
      LIMIT 1
    ),

    'next_meeting', (
      SELECT jsonb_build_object('scheduled_at', mt.scheduled_at, 'title', mt.title)
      FROM public.meetings mt
      WHERE mt.lead_id = p_lead_id AND mt.status = 'scheduled'
      ORDER BY mt.scheduled_at
      LIMIT 1
    ),

    -- Bandeira vermelha: se o número está bloqueado, quem assume precisa
    -- saber ANTES de escrever, não depois de o envio ser recusado.
    'opted_out', EXISTS (
      SELECT 1 FROM public.whatsapp_blacklist b
      WHERE b.user_id = v_lead.user_id AND b.phone = v_lead.phone
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.lead_handoff_brief(UUID) TO authenticated, service_role;

COMMENT ON FUNCTION public.lead_handoff_brief(UUID) IS
  'Tudo que alguém precisa para assumir uma conversa da IA sem começar do '
  'zero: histórico, memória, oferta em jogo, motivo da escalação e se o '
  'número está bloqueado. Confere o dono explicitamente — é SECURITY DEFINER.';

-- ------------------------------------------------------------
-- CONFERÊNCIA
-- ------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'lead_handoff_brief'
  ) THEN
    RAISE EXCEPTION 'lead_handoff_brief não foi criada.';
  END IF;
END;
$$;

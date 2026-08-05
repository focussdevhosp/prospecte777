-- ============================================================
-- BASE DE SEGURANÇA DO BACKEND
-- ============================================================
-- 1. Segredo interno (pg_cron -> edge function) gerado no banco,
--    nunca escrito no repositório.
-- 2. Rate limit persistente (o antigo era um Map em memória que
--    zerava a cada cold start — não limitava nada de verdade).
-- 3. has_active_subscription() para o backend decidir acesso pago.
-- 4. Reagendamento dos crons com o segredo interno no header.
-- ============================================================

-- ------------------------------------------------------------
-- 1. SEGREDO INTERNO
-- ------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS private.app_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON private.app_config FROM PUBLIC, anon, authenticated;

-- Gerado uma única vez, aleatório, dentro do próprio banco.
INSERT INTO private.app_config (key, value)
VALUES ('internal_secret', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- As edge functions verificam o segredo por aqui (service_role apenas).
CREATE OR REPLACE FUNCTION public.verify_internal_secret(p_secret TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM private.app_config
    WHERE key = 'internal_secret' AND value = p_secret
  );
$$;

REVOKE ALL ON FUNCTION public.verify_internal_secret(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_internal_secret(TEXT) TO service_role;

-- A Evolution API não manda header customizado no callback, então o webhook
-- se autentica por query string. Só o service_role lê o valor, e ele só sai
-- do banco para ser gravado na configuração da instância.
CREATE OR REPLACE FUNCTION public.get_internal_secret()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT value FROM private.app_config WHERE key = 'internal_secret';
$$;

REVOKE ALL ON FUNCTION public.get_internal_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_internal_secret() TO service_role;

-- ------------------------------------------------------------
-- 2. RATE LIMIT PERSISTENTE
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS private.rate_limits (
  identity     TEXT NOT NULL,
  action       TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count        INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (identity, action)
);
REVOKE ALL ON private.rate_limits FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_rate_limit(
  p_identity       TEXT,
  p_action         TEXT,
  p_max            INTEGER,
  p_window_seconds INTEGER
)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, reset_in_seconds INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE
  v_window_start TIMESTAMPTZ;
  v_count        INTEGER;
BEGIN
  INSERT INTO private.rate_limits AS rl (identity, action, window_start, count)
  VALUES (p_identity, p_action, now(), 1)
  ON CONFLICT (identity, action) DO UPDATE
    SET
      window_start = CASE
        WHEN rl.window_start < now() - make_interval(secs => p_window_seconds)
        THEN now() ELSE rl.window_start END,
      count = CASE
        WHEN rl.window_start < now() - make_interval(secs => p_window_seconds)
        THEN 1 ELSE rl.count + 1 END
  RETURNING rl.window_start, rl.count INTO v_window_start, v_count;

  RETURN QUERY SELECT
    v_count <= p_max,
    GREATEST(p_max - v_count, 0),
    GREATEST(
      EXTRACT(EPOCH FROM (v_window_start + make_interval(secs => p_window_seconds) - now()))::INTEGER,
      0
    );
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, TEXT, INTEGER, INTEGER) TO service_role;

-- Limpeza de janelas velhas (chamada pelo cron-tasks)
CREATE OR REPLACE FUNCTION public.prune_rate_limits()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public
AS $$
DECLARE v_deleted INTEGER;
BEGIN
  DELETE FROM private.rate_limits WHERE window_start < now() - INTERVAL '1 day';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;
REVOKE ALL ON FUNCTION public.prune_rate_limits() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_rate_limits() TO service_role;

-- ------------------------------------------------------------
-- 3. ASSINATURA COMO REGRA DE BANCO
-- ------------------------------------------------------------
-- 3 dias de tolerância: falha de webhook da Cakto não pode derrubar
-- o acesso de quem pagou.
CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status = 'active'
      AND (s.expires_at IS NULL OR s.expires_at > now() - INTERVAL '3 days')
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_subscription(UUID) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3b. TELEFONE CANÔNICO
-- ------------------------------------------------------------
-- A blacklist comparava telefone por igualdade de texto. "(11) 98765-4321",
-- "5511987654321" e "11987654321" são o mesmo número e não batiam entre si —
-- ou seja, quem pediu "pare" continuava recebendo. Canônico = DDD + 8 dígitos
-- finais, que também resolve o nono dígito dos celulares.
CREATE OR REPLACE FUNCTION public.normalize_phone_br(p_phone TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v TEXT := regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g');
BEGIN
  IF length(v) IN (12, 13) AND left(v, 2) = '55' THEN
    v := substring(v FROM 3);
  END IF;
  IF length(v) < 10 THEN
    RETURN v;
  END IF;
  RETURN left(v, 2) || right(v, 8);
END;
$$;

GRANT EXECUTE ON FUNCTION public.normalize_phone_br(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_phone_blacklisted(p_user_id UUID, p_phone VARCHAR)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.whatsapp_blacklist
    WHERE user_id = p_user_id
      AND public.normalize_phone_br(phone) = public.normalize_phone_br(p_phone)
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_phone_blacklisted(UUID, VARCHAR) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_blacklist_user_phone
  ON public.whatsapp_blacklist (user_id, phone);

-- ------------------------------------------------------------
-- 4. CRONS COM O SEGREDO INTERNO
-- ------------------------------------------------------------
-- Os agendamentos antigos mandavam a anon key no Authorization e batiam
-- em funções que agora exigem prova de chamada interna. Reagendamos todos.
DO $$
DECLARE
  v_secret TEXT;
  v_base   TEXT := 'https://oeztpxyprifabkvysroh.supabase.co/functions/v1/';
  v_job    RECORD;
BEGIN
  SELECT value INTO v_secret FROM private.app_config WHERE key = 'internal_secret';

  FOR v_job IN
    SELECT * FROM (VALUES
      ('cron-tasks-every-5min',        '*/5 * * * *', 'cron-tasks',            '{}'),
      ('scheduled-prospecting-hourly', '0 * * * *',   'scheduled-prospecting', '{"action":"check_and_run"}'),
      ('follow-up-check',              '*/30 * * * *','follow-up',             '{"action":"process_follow_ups"}'),
      ('check-subscriptions-daily',    '0 */6 * * *', 'check-subscriptions',   '{}')
    ) AS t(job_name, schedule, fn, body)
  LOOP
    -- cron.unschedule estoura se o job não existir; ignoramos nesse caso.
    BEGIN
      PERFORM cron.unschedule(v_job.job_name);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      v_job.job_name,
      v_job.schedule,
      format(
        $cmd$SELECT net.http_post(
          url := %L,
          headers := %L::jsonb,
          body := %L::jsonb
        ) AS request_id;$cmd$,
        v_base || v_job.fn,
        json_build_object(
          'Content-Type', 'application/json',
          'x-internal-secret', v_secret
        )::text,
        v_job.body
      )
    );
  END LOOP;
END $$;

-- ============================================================
-- O CRON PRECISA PROVAR QUE É O CRON
-- ============================================================
-- Duas coisas erradas nos agendamentos antigos, e a segunda é a que
-- realmente quebrava:
--
-- 1. O endereço do projeto estava fixo dentro do comando do cron, em cinco
--    migrações diferentes:
--
--      url := 'https://<ref>.supabase.co/functions/v1/cron-tasks'
--
--    Enquanto existe um projeto só, isso passa despercebido. No dia em que
--    alguém restaurar um backup em outro projeto, o cron de lá continua
--    chamando as funções daqui — e não falha, funciona, operando o banco
--    errado. Passa a morar em `private.app_config`: trocar vira um UPDATE
--    numa linha, não uma caçada por string em migração antiga.
--
-- 2. Os agendamentos mandavam a ANON KEY no Authorization. As functions
--    internas passaram a exigir prova de chamada interna, e a anon key não é
--    uma — então TODA execução automática morria em 401. Nenhum follow-up,
--    nenhuma manutenção e nenhum lote de missão jamais rodou pelo cron.
--
-- Esta migração é a última da fila de propósito: reagenda por cima do que as
-- anteriores deixaram, então o histórico continua íntegro e o resultado
-- final está correto em qualquer projeto onde ela rodar.
--
-- SE UM DIA VOCÊ TROCAR DE PROJETO: altere o valor abaixo antes de rodar. A
-- conferência do fim FALHA de propósito se sobrar cron apontando para outro
-- lugar — é melhor a migração parar do que o agendamento operar o banco
-- errado em silêncio.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ENDEREÇO DAS FUNÇÕES
-- ------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_config (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
REVOKE ALL ON private.app_config FROM PUBLIC, anon, authenticated;

/**
 * Descobre o endereço das edge functions deste projeto.
 *
 * Ordem: valor configurado > referência do próprio banco > nada.
 *
 * O nome do banco no Supabase não carrega o project ref, então não dá para
 * deduzir com segurança — por isso o valor configurado é a fonte da verdade,
 * e a função devolve NULL em vez de chutar. Chutar aqui significaria
 * disparar cron contra um endereço inexistente e ninguém entender por quê.
 */
CREATE OR REPLACE FUNCTION private.functions_base_url()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = private, public
AS $$
  SELECT value FROM private.app_config WHERE key = 'functions_base_url';
$$;

-- Endereço deste projeto. Se um dia mudar, basta:
--   UPDATE private.app_config
--      SET value = 'https://<outro-ref>.supabase.co/functions/v1/'
--    WHERE key = 'functions_base_url';
-- e rodar o bloco de reagendamento abaixo.
INSERT INTO private.app_config (key, value)
VALUES ('functions_base_url', 'https://oeztpxyprifabkvysroh.supabase.co/functions/v1/')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Garante o segredo interno mesmo que esta migração rode isolada.
INSERT INTO private.app_config (key, value)
VALUES ('internal_secret', encode(extensions.gen_random_bytes(32), 'hex'))
ON CONFLICT (key) DO NOTHING;

-- ------------------------------------------------------------
-- 2. REAGENDAMENTO
-- ------------------------------------------------------------
-- Recria todos os jobs apontando para o endereço configurado e
-- autenticando pelo segredo interno.
--
-- Os agendamentos originais mandavam a ANON KEY no Authorization. Além de
-- ser o projeto errado, era autenticação errada: as functions internas
-- passaram a exigir prova de chamada interna, e a anon key não é uma.

DO $$
DECLARE
  v_secret TEXT;
  v_base   TEXT;
  v_job    RECORD;
BEGIN
  SELECT value INTO v_base   FROM private.app_config WHERE key = 'functions_base_url';
  SELECT value INTO v_secret FROM private.app_config WHERE key = 'internal_secret';

  IF v_base IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'functions_base_url ou internal_secret ausente — crons não reagendados.';
    RETURN;
  END IF;

  FOR v_job IN
    SELECT * FROM (VALUES
      -- cron-tasks é o motor de manutenção: dentro dele roda também o
      -- avanço dos lotes das missões (tarefa `run_missions`).
      ('cron-tasks-every-5min',        '*/5 * * * *',  'cron-tasks',            '{}'),
      ('scheduled-prospecting-hourly', '0 * * * *',    'scheduled-prospecting', '{"action":"check_and_run"}'),
      ('follow-up-check',              '*/30 * * * *', 'follow-up',             '{"action":"process_follow_ups"}'),
      ('check-subscriptions-daily',    '0 */6 * * *',  'check-subscriptions',   '{}')
    ) AS t(job_name, schedule, fn, body)
  LOOP
    -- cron.unschedule estoura se o job não existir; num projeto novo é o
    -- caso normal, então o erro é ignorado de propósito.
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
END;
$$;

-- ------------------------------------------------------------
-- 3. CONFERÊNCIA
-- ------------------------------------------------------------
-- Nenhum job pode ter sobrado apontando para outro projeto. Se sobrar, a
-- migração falha aqui em vez de deixar o problema silencioso em produção —
-- que é exatamente como ele passou despercebido da primeira vez.

DO $$
DECLARE
  v_base    TEXT;
  v_estranhos INTEGER;
BEGIN
  SELECT value INTO v_base FROM private.app_config WHERE key = 'functions_base_url';

  SELECT COUNT(*) INTO v_estranhos
  FROM cron.job
  WHERE command LIKE '%supabase.co/functions/v1/%'
    AND command NOT LIKE '%' || v_base || '%';

  IF v_estranhos > 0 THEN
    RAISE EXCEPTION
      'Há % job(s) de cron apontando para outro projeto Supabase. '
      'Rode: SELECT jobname, command FROM cron.job; e reagende manualmente.',
      v_estranhos;
  END IF;
END;
$$;

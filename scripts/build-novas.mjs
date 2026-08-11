// ============================================================
// GERA O MIGRACOES_NOVAS.sql
// ============================================================
// O `SCHEMA_COMPLETO.sql` serve para subir um banco do zero. Não é o caso
// aqui: o projeto já existe e tem dados. Este arquivo junta só o que foi
// construído neste trabalho — tudo aditivo, nada que apague.
//
//   node scripts/build-novas.mjs
//
// O corte é por data no nome do arquivo. Migração nova entra sozinha; para
// mudar o ponto de corte, edite PRIMEIRA_NOVA.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const pastaMigracoes = join(raiz, "supabase", "migrations");
const destino = join(raiz, "MIGRACOES_NOVAS.sql");

/** Primeira migração deste trabalho. As anteriores o banco já tem. */
const PRIMEIRA_NOVA = "20260811120000";

const migracoes = readdirSync(pastaMigracoes)
  .filter((f) => f.endsWith(".sql") && f >= PRIMEIRA_NOVA)
  .sort();

if (migracoes.length === 0) {
  console.error("Nenhuma migração nova encontrada.");
  process.exit(1);
}

const pad = (n) => String(n).padStart(2, "0");

const cabecalho = `-- ============================================================
-- MIGRAÇÕES NOVAS — PARA O BANCO QUE JÁ EXISTE
-- ============================================================
-- São ${migracoes.length} migrações, todas ADITIVAS: criam tabela, função, gatilho e
-- coluna. Nenhuma apaga dado, nenhuma remove coluna, nenhuma altera tipo de
-- coluna existente.
--
-- Use ESTE arquivo. O \`SCHEMA_COMPLETO.sql\` serve para subir um banco vazio
-- do zero e não é o seu caso.
--
-- COMO USAR
--   Supabase -> SQL Editor -> cole tudo -> Run.
--
-- ANTES DE RODAR, confira em Database -> Extensions:
--   pgcrypto   (gen_random_uuid, gen_random_bytes)
--   pg_cron    (agendamentos)
--   pg_net     (net.http_post, usado pelo cron)
--
-- O QUE MUDA NA SUA OPERAÇÃO
--   - os crons passam a autenticar por segredo interno em vez de anon key.
--     Hoje TODA execução automática morre em 401 — nenhum follow-up e nenhuma
--     manutenção jamais rodou pelo agendamento;
--   - gatilhos novos passam a fechar o funil da missão e alimentar o teste
--     A/B a cada resposta de lead e a cada negócio ganho;
--   - a política de \`meetings\` passa a conferir se o lead é seu (antes
--     conferia só o user_id).
--
-- Se algo parar no meio, me mande a mensagem de erro: ela diz em qual bloco
-- parou, e todos os blocos são idempotentes — dá para rodar de novo.
-- ============================================================
`;

const rodape = `

-- ============================================================
-- CONFERÊNCIA
-- ============================================================

-- 1. As tabelas novas existem? Devem vir 8.
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('missions','mission_leads','agent_events','ai_usage',
                     'provider_states','search_cache','ab_assignments','icp_profiles')
ORDER BY table_name;

-- 2. Os gatilhos que fecham o funil e alimentam o A/B existem? Devem vir 4.
SELECT tgname FROM pg_trigger
WHERE tgname IN ('trg_mission_lead_on_reply','trg_mission_lead_on_meeting',
                 'trg_ab_on_reply','trg_ab_on_won')
ORDER BY tgname;

-- 3. Os crons apontam para este projeto e mandam o segredo interno?
SELECT jobname,
       substring(command from 'https://[a-z0-9]+\\.supabase\\.co') AS projeto,
       command LIKE '%x-internal-secret%' AS manda_segredo
FROM cron.job
ORDER BY jobname;

-- 4. Nada foi perdido: seus leads continuam lá.
SELECT count(*) AS leads FROM public.leads;
`;

const partes = [cabecalho];

migracoes.forEach((arquivo, i) => {
  const conteudo = readFileSync(join(pastaMigracoes, arquivo), "utf8");
  partes.push(
    "\n\n-- ############################################################",
    `\n-- [${pad(i + 1)}/${migracoes.length}] ${arquivo}`,
    "\n-- ############################################################\n\n",
    conteudo.trimEnd(),
    "\n",
  );
});

partes.push(rodape);

const saida = partes.join("");
writeFileSync(destino, saida, "utf8");

console.log(
  `MIGRACOES_NOVAS.sql: ${migracoes.length} migrações, ${(saida.length / 1024).toFixed(0)} KB.`,
);

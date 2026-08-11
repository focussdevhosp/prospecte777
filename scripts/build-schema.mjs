// ============================================================
// GERA O SCHEMA_COMPLETO.sql
// ============================================================
// O arquivo é a concatenação de todas as migrações, na ordem em que o
// Supabase as aplicaria. Serve para subir um projeto novo colando um bloco
// só no SQL Editor — sem CLI, sem access token.
//
// Existe como script porque a primeira versão foi montada à mão: passa de
// 200 KB, e toda migração nova exigiria lembrar de reabrir o arquivo, colar
// no lugar certo e corrigir a contagem em três lugares. Coisa que se esquece
// uma vez e ninguém percebe até o projeto novo subir sem a última tabela.
//
//   node scripts/build-schema.mjs
//
// Rode depois de criar qualquer migração e confira o diff.

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const pastaMigracoes = join(raiz, "supabase", "migrations");
const destino = join(raiz, "SCHEMA_COMPLETO.sql");

// A ordem alfabética do nome de arquivo É a ordem cronológica: o prefixo é
// o timestamp. É também a ordem em que o `supabase db push` aplica.
const migracoes = readdirSync(pastaMigracoes)
  .filter((f) => f.endsWith(".sql"))
  .sort();

if (migracoes.length === 0) {
  console.error("Nenhuma migração encontrada em", pastaMigracoes);
  process.exit(1);
}

const total = migracoes.length;
const pad = (n) => String(n).padStart(2, "0");

const cabecalho = `-- ============================================================
-- SCHEMA COMPLETO — PROJETO NOVO E VAZIO
-- ============================================================
-- Contém as ${total} migrações do projeto, na ordem cronológica em que foram
-- criadas. É o schema inteiro: nenhum dado de nenhum projeto anterior.
--
-- Gerado por \`node scripts/build-schema.mjs\`. Não edite à mão: edite a
-- migração e gere de novo.
--
-- COMO USAR
--   Supabase -> SQL Editor -> cole tudo -> Run.
--   Leva alguns segundos. Se parar com erro, me mande a mensagem: ela diz
--   exatamente em qual bloco parou.
--
-- ANTES DE RODAR, confirme que estas extensões estão ligadas em
-- Database -> Extensions:
--   pgcrypto   (gen_random_uuid, gen_random_bytes)
--   pg_cron    (agendamentos)
--   pg_net     (net.http_post, usado pelo cron)
--
-- Sem pg_cron e pg_net os blocos de agendamento falham — o resto do schema
-- sobe normalmente, mas as automações não rodam sozinhas.
--
-- OBSERVAÇÃO SOBRE O HISTÓRICO
--   Cinco migrações antigas gravaram o endereço do projeto anterior direto
--   no comando do cron. Elas continuam aqui para o histórico ficar íntegro,
--   e a migração 63 desfaz e recria todos os agendamentos apontando para o
--   projeto correto — e falha de propósito se sobrar algum apontando para
--   outro lugar.
-- ============================================================
`;

const rodape = `

-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================

-- 1. Quantas tabelas subiram (esperado: mais de 50).
SELECT COUNT(*) AS tabelas
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';

-- 2. As tabelas da esteira comercial existem?
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('missions','mission_leads','agent_events',
                     'ai_usage','provider_states','search_cache','leads')
ORDER BY table_name;

-- 3. Alguma tabela ficou SEM row level security? Deve vir vazio.
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = FALSE
ORDER BY tablename;

-- 4. Os crons apontam para o projeto certo? Confira a coluna command.
SELECT jobname, schedule,
       substring(command from 'https://[a-z0-9]+\\.supabase\\.co') AS projeto
FROM cron.job
ORDER BY jobname;

-- 5. Os gatilhos que fecham o funil da missão existem? Devem vir os dois.
SELECT tgname
FROM pg_trigger
WHERE tgname IN ('trg_mission_lead_on_reply', 'trg_mission_lead_on_meeting')
ORDER BY tgname;
`;

const partes = [cabecalho];

migracoes.forEach((arquivo, i) => {
  const conteudo = readFileSync(join(pastaMigracoes, arquivo), "utf8");
  partes.push(
    "\n\n-- ############################################################",
    `\n-- [${pad(i + 1)}/${total}] ${arquivo}`,
    "\n-- ############################################################\n\n",
    conteudo.trimEnd(),
    "\n",
  );
});

partes.push(rodape);

const saida = partes.join("");
writeFileSync(destino, saida, "utf8");

console.log(
  `SCHEMA_COMPLETO.sql: ${total} migrações, ${(saida.length / 1024).toFixed(0)} KB.`,
);

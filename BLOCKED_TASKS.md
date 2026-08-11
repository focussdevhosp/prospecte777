# Tarefas bloqueadas

O que não consegui terminar sozinho, por quê, e o que destrava. Ordenado por
quanto atrapalha.

---

## 1. O schema ainda não subiu no projeto novo

**Bloqueio:** não tenho acesso ao Supabase. Sem access token e sem CLI
autenticada, não consigo aplicar migração nem criar tabela.

**Por que atrapalha:** o projeto `sciphxtbxvbpiypbcxub` está vazio. Todo o
trabalho dos ciclos 1 e 2 existe em migração no repositório e em nenhum banco.
Enquanto isso não for aplicado, o app aponta para um projeto sem tabela
nenhuma e não abre.

**O que destrava:** abrir o SQL Editor do projeto novo, colar
`SCHEMA_COMPLETO.sql` inteiro e rodar. São 65 migrações, 237 KB, alguns
segundos. Antes disso, confirmar em *Database → Extensions* que `pgcrypto`,
`pg_cron` e `pg_net` estão ligadas — sem as duas últimas os blocos de
agendamento falham (o resto do schema sobe normal, mas nada roda sozinho).

Ao final o arquivo tem cinco consultas de conferência. A de número 5 é a que
importa para o ciclo 1: precisa devolver os dois gatilhos do funil.

---

## 2. Os segredos das edge functions não estão configurados

**Bloqueio:** os valores não passam por mim, e configurá-los exige o painel.

**Por que atrapalha:** sem eles, a esteira roda até a hora de escrever a
mensagem e para. Não é degradação silenciosa — o pipeline recusa enviar
qualquer coisa quando a IA não responde, de propósito —, mas na prática nada
sai.

**O que destrava:** *Project Settings → Edge Functions → Secrets*:

| Segredo | Para quê | Sem ele |
|---|---|---|
| `DEEPSEEK_API_KEY` | modelo principal | nenhuma mensagem é escrita |
| `LOVABLE_API_KEY` | modelo reserva | uma falha do DeepSeek para tudo |
| `EVOLUTION_API_URL` | WhatsApp | nada é enviado |
| `EVOLUTION_API_KEY` | WhatsApp | nada é enviado |
| `HUNTER_API_KEY` | e-mail corporativo | dossiê sem e-mail |
| `FIRECRAWL_API_KEY` | auditoria de site | dossiê sem o gancho mais forte |

Depois: `supabase functions deploy` (todas), e um `UPDATE` em
`private.app_config` só se o project ref mudar de novo.

---

## 3. Nenhum teste roda contra Postgres

**Bloqueio:** não há Postgres nesta máquina e não posso instalar serviço.

**Por que atrapalha:** os dois ciclos entregaram lógica de negócio em SQL —
gatilhos, decisão de conclusão de missão, contadores. Nada disso passa pelo
vitest. A rede de proteção atual é o bloco `DO $$ ... RAISE EXCEPTION` no fim
de cada migração, que falha a própria migração quando o resultado sai errado.
Pega o essencial; não pega regressão futura.

**O que destrava:** `supabase start` (exige Docker) e uma suíte que aplique as
migrações num banco descartável. É a lacuna de qualidade mais séria que
identifiquei — e a única que não consigo contornar com engenho.

---

## 4. `npm run lint` acusa 367 problemas anteriores

**Bloqueio:** nenhum, tecnicamente. Não fiz porque não é o que foi pedido e
mexer em 40 arquivos alheios ao trabalho embaralharia todo diff destes ciclos.

**Por que atrapalha:** com o lint vermelho de origem, ele deixa de servir como
sinal — ninguém repara em erro novo no meio de 367.

**O que destrava:** decidir se vale um commit só de `no-explicit-any` nas edge
functions antigas. Cerca de 340 dos 344 erros são esse. Nenhum ciclo
acrescentou erro novo; a conferência é sempre `eslint` no arquivo tocado,
comparado com o mesmo comando no `git stash`.

---

## 5. Envio que falha por erro transitório perde o rascunho

**Bloqueio:** nenhum. Escolhi não fazer no ciclo 2 para não misturar duas
mudanças de comportamento de envio no mesmo commit.

**Por que atrapalha:** quando o `whatsapp-send` devolve erro que não é
opt-out, `sendMessage` marca o lead como `failed` e o rascunho fica perdido.
Um 500 momentâneo da Evolution custa um lead bom, com mensagem já escrita e
já aprovada pelo Quality Gate.

**O que destrava:** coluna `send_attempts` em `mission_leads` e distinção
entre falha definitiva (opt-out, número inválido) e transitória (rede, 5xx),
com a transitória voltando para `approved` até um teto — três tentativas, por
exemplo. É meia hora de trabalho e está no topo da fila dos próximos ciclos.

---

## 6. Segredos expostos no chat precisam ser rotacionados por você

**Bloqueio:** deliberado. Rotacionar segredo é operação irreversível em
produção, e está na lista do que devo parar antes de fazer.

**O que fazer:** três credenciais foram coladas na nossa conversa e devem ser
tratadas como públicas a partir de agora.

1. **Token do GitHub** (`ghp_...`) — *Settings → Developer settings → Personal
   access tokens → Revoke*. Uso aqui foi sempre transitório
   (`git -c http.extraheader`), nunca gravado em arquivo, nunca no histórico.
2. **`sb_secret_...`** — *Project Settings → API → Rotate*.
3. **JWT `service_role`** — a mais grave: ignora RLS e dá acesso total ao
   banco. Rotacionar junto.

A chave `service_role` **não** está em nenhum arquivo do repositório. O
`client.ts` tem uma checagem que derruba o app na inicialização se alguém
configurar uma chave `service_role` como `VITE_*` — em projeto Vite tudo que
começa com `VITE_` vai no bundle que chega ao navegador de qualquer visitante.

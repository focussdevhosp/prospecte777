# Diário de trabalho autônomo

Registro do que foi feito sem supervisão, na ordem em que aconteceu. Cada
ciclo segue o mesmo caminho: analisar → implementar → testar → corrigir →
validar → commitar.

O critério de escolha do que atacar, em todos os ciclos, foi o mesmo: **tela
que parece pronta e não funciona vem antes de tela que não existe**. Um botão
que devolve erro custa mais confiança do que uma funcionalidade ausente, e os
dois primeiros ciclos foram exatamente isso.

Estado inicial: `a22652f`, 118 testes passando.

---

## Ciclo 1 — O funil da missão morria em "Abordados"

**Commit:** `235a0c6`

### Análise

Uma busca de dois segundos mostrou o defeito inteiro:

```
grep -rn "mission_leads" supabase/functions/ | grep -v sales-orchestrator
(vazio)
```

Nenhum código fora do orquestrador jamais escreveu nessa tabela. A esteira
levava o lead até `sent` e parava ali. Quando o lead respondia, quem ficava
sabendo era `leads.last_response_at`; quando a reunião era marcada, quem
ficava sabendo era a tabela `meetings`. A missão nunca era avisada.

Resultado: as duas últimas etapas do funil em `MissionDetail.tsx` mostravam
zero para sempre, e `command_center().replied_today` / `meetings_today` eram
estruturalmente zero. Não porque a operação ia mal — porque ninguém contava.
Era justamente o número que decide se a abordagem funciona.

### Implementação

Gatilho no banco, não chamada no código. Já existem **dois** caminhos que
inserem reunião (`webhook` e `whatsapp-ai-reply`) e mais de um que grava
resposta do lead. Espalhar `update mission_leads` por esses pontos significa
que o próximo caminho de resposta — que vai existir — nasce esquecendo de
avançar o funil, e o defeito volta calado.

- `mission_lead_on_reply()` em `AFTER INSERT ON chat_messages WHEN sender_type = 'lead'`
- `mission_lead_on_meeting()` em `AFTER INSERT ON meetings`
- `mission_refresh_counters()` — a regra dos contadores saiu do TypeScript e
  passou a existir num lugar só
- Recuperação do histórico: respostas e reuniões que já tinham acontecido
- Verificação que falha a migração se os gatilhos não subirem

Crédito da resposta: só missão com `sent_at` concorre, e entre elas ganha a
de envio mais recente. Missão que não enviou nada não pode reivindicar
resposta que não provocou.

### Achado colateral (corrigido junto)

A política de RLS de `meetings` conferia só `user_id` e deixava `lead_id`
passar sem conferência. Dava para inserir reunião com o próprio `user_id`
apontando para o lead de **outra conta**. Enquanto a tabela era só um
calendário, o estrago era um registro estranho na agenda de ninguém; com o
funil ligado, viraria escrita na missão de outra empresa. `chat_messages` já
conferia isso desde o começo — a assimetria é que era o defeito.

### Validação

118 testes, `tsc --noEmit` limpo, `vite build` ok.

### Extra

`SCHEMA_COMPLETO.sql` passou a ser gerado por `scripts/build-schema.mjs`. São
237 KB: cada migração nova exigiria lembrar de reabrir o arquivo, colar no
lugar certo e corrigir a contagem em três pontos.

---

## Ciclo 2 — O modo padrão não conseguia enviar nada

**Commit:** `f0ea77b`

### Análise

`runBatch` encerrava a missão assim que não sobrava lead em `found`. No nível
`assistido` — **o padrão** — nenhuma mensagem envia sozinha: todas param em
`awaiting_approval`. Ou seja, `found` zera exatamente quando a fila de
aprovação está cheia.

E `mission_can_send()` exige `status = 'running'`. A sequência era:

1. a esteira roda e enche a fila de aprovação;
2. acaba o `found` e a missão vira `completed`;
3. o dono clica em Aprovar e recebe *"Não é possível enviar agora: missao nao
   esta ativa"*;
4. não existe botão que traga a missão de volta.

O caminho mais seguro do produto — com humano conferindo cada mensagem — era
o único que não conseguia enviar mensagem nenhuma.

Colado nele, um segundo defeito: envio barrado pelo horário devolvia o lead
para `awaiting_approval`, como se a IA tivesse pedido ajuda humana. Não tinha
pedido — era só o expediente. E `missions_pending_batch` só enxergava
`found`, então nada nunca soltava aquilo. "Envio automático fora do horário"
queria dizer "envio nunca".

### Implementação

- `mission_pending_work()` — separa as três filas: a processar, esperando
  pessoa, esperando a hora. Os três esperam coisas diferentes; tratá-los como
  "pendente" genérico foi o que cegou o cron para o terceiro.
- `mission_settle_status()` — conclui a missão só com as três vazias.
- Envio barrado mantém o lead em `approved`, não em `awaiting_approval`.
- `runBatch` solta as retidas **antes** de escrever rascunho novo, e antes do
  teto de orçamento: soltar o que já existe não gasta IA.
- `missions_pending_batch` passa a enxergar missão que só tem aprovado
  esperando a hora, e ordena essas primeiro.
- Bloqueio registrado uma vez por lote, não por lead — o cron roda a cada 5
  minutos e uma missão parada das 18h às 9h geraria centenas de linhas
  idênticas no feed.
- Recuperação: missão marcada `completed` com fila aberta volta para
  `running` (ou `paused`, se estava pausada quando foi encerrada por engano).

A portaria continua sendo consultada a cada envio, não uma vez por lote: o
limite diário se esgota **dentro** do lote, e checar só no começo deixaria
passar até sete mensagens além do teto — justamente o número que protege a
conta de bloqueio.

### Validação

118 testes, `tsc --noEmit` limpo, `vite build` ok, edge function empacota
(`esbuild --bundle`, 149 KB).

---

## Notas de método

**Sobre o lint.** `npm run lint` acusa 367 problemas no repositório inteiro —
todos anteriores a este trabalho, quase todos `no-explicit-any` em edge
functions antigas. Nenhum ciclo acrescentou erro novo: a conferência é
sempre `eslint` nos arquivos tocados, comparado com o mesmo comando no
`git stash`. Zerar o resto é dívida separada, anotada em `BLOCKED_TASKS.md`.

**Sobre testes de SQL.** Gatilho e função de banco não têm cobertura no
vitest — não há Postgres local nesta máquina. A rede de proteção deles é
outra: cada migração termina com um bloco `DO $$ ... RAISE EXCEPTION` que
falha a própria migração se o resultado não for o esperado. Anotado como
lacuna real em `BLOCKED_TASKS.md`.

**Sobre as edge functions.** Não são cobertas por `tsc` (o tsconfig só olha
`src/`) e o Deno não está instalado aqui. A conferência possível é
`esbuild --bundle`, que pega erro de sintaxe e de import — não pega erro de
tipo.

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

## Ciclo 3 — Oscilação de rede custava um lead qualificado

**Commit:** `d963d1d`

### Análise

`sendMessage` tratava qualquer resposta ruim do `whatsapp-send` do mesmo
jeito: `status: optedOut ? 'opted_out' : 'failed'`. E `failed` é estado
final — nada volta a olhar para ele e não existe botão na tela para tentar de
novo.

Um 502 momentâneo da Evolution — a coisa mais banal que acontece com API de
WhatsApp — apagava para sempre um lead já pesquisado, qualificado, casado com
uma oferta, escrito pela IA, revisado pelo Quality Gate e, no modo assistido,
aprovado por uma pessoa.

### Implementação

Três categorias, só duas finais:

| | Exemplo | Decisão |
|---|---|---|
| Definitiva | número inválido (HTTP 400) | `failed` |
| Opt-out | 409 + `blacklisted` | `opted_out` |
| Transitória | sem chip, 502, 503, rede | volta para `approved`, até 5 vezes |

O 409 exigiu cuidado: significa tanto "na blacklist" quanto "nenhum chip
disponível". Tratar todo 409 como opt-out marcaria como "pediu para não
receber" um lead que nunca respondeu nada — ele sairia da fila para sempre
porque a *conta* estava sem chip. A distinção é pelo corpo e tem teste.

Incremento e decisão na mesma instrução SQL: ler, somar em TypeScript e
gravar tem janela para duas execuções do cron lerem o mesmo valor, e contador
que anda devagar é teto que não segura.

### Validação

129 testes (11 novos).

---

## Ciclo 4 — A resposta automática furava o opt-out

**Commit:** `dcf77eb`

### Análise

```
grep -n "blacklist\|outbound_paused" supabase/functions/whatsapp-ai-reply/
(vazio)
```

O `whatsapp-ai-reply` falava direto com a Evolution API. Tudo que protege um
envio mora no `whatsapp-send`, e nada disso valia por aquele caminho.

O caso concreto: o lead responde "pare". O gatilho
`auto_blacklist_on_response` grava a blacklist na mesma transação. O webhook
chama o `whatsapp-ai-reply`, que gera a resposta e manda direto — sem nunca
consultar a lista que acabou de ser escrita. **A pessoa pede para parar e
recebe mais uma mensagem.**

Junto, o segundo furo: a parada de emergência foi criada com a promessa de
que "quem aperta o botão espera que TUDO pare" — está escrito na migração que
a criou. Mas `outbound_paused` só era consultado por `mission_can_send()`.
Agente conversacional e follow-ups agendados continuavam mandando. Freio que
para uma parte é pior que freio nenhum: sem freio a pessoa desconecta o
WhatsApp na mão; com freio pela metade ela acha que resolveu e vai dormir.

### Implementação

Mesma causa, mesma correção: existia um segundo caminho de envio. A resposta
automática passa a ir pelo `whatsapp-send`, e a parada de emergência é
checada lá dentro — no único ponto por onde toda mensagem passa.

A distinção não é qual função chamou, é se **uma pessoa** decidiu mandar
aquela mensagem específica agora. Chat e teste de diagnóstico passam; IA
respondendo sozinha, follow-up agendado, lote de missão e campanha param.

O campo `initiated_by` falha fechado: qualquer coisa que não seja exatamente
`"human"` conta como automação. Tem teste para `"Human"`, `" human "` e
objeto — é essa linha que sustenta o resto.

O botão "enviar follow-ups" **não** é exceção: um clique dispara para todos os
leads vencidos. Isso é automação, ainda que começada por um clique.

### Validação

136 testes (7 novos).

---

## Ciclo 5 — O contrato de veracidade parava na primeira mensagem

**Commit:** `fba7d97`

### Análise

A primeira abordagem passava por seis avaliações antes de sair. A segunda
mensagem em diante, por nenhuma. Isso é ao contrário do risco real: a
primeira mensagem é curta e o lead desconfia dela por natureza; é na
conversa, depois que ele começou a confiar, que um número inventado vira
decisão de compra tomada em cima de coisa que nunca aconteceu.

E o prompt não só deixava passar — ele pedia:

```
✅ Prova > promessa. "fiz pra outro X e deu Y" > "vou fazer sua empresa crescer".
```

Sem nenhum case no contexto, isso é instrução direta para inventar um cliente
e um resultado. **É o mesmo defeito da geração da primeira mensagem, no mesmo
formato:** uma regra específica mandando fabricar, e duas linhas depois uma
regra vaga dizendo para não inventar. A específica ganha.

### Implementação

- Prova passa a ser a do portfólio cadastrado — link real, nome real.
- `pain_points` e `service_opportunities` saem do bloco de fatos e viram
  hipóteses, com a instrução colada ("vire pergunta").
- A resposta é conferida antes de sair; reprovou, reescreve uma vez; reprovou
  de novo, não envia e escala.

A decisão mais delicada: **número dito pelo lead é fato.** Se ele escreveu
"hoje eu faturo uns 40 mil", o agente pode responder falando em 40 mil.
Número que o *agente* escreveu antes não vale — senão bastava inventar uma vez
para virar "fato" e poder repetir para sempre, a mentira se lavando no próprio
histórico.

### Dois falsos positivos que o teste revelou

Ambos já existiam e atingiam **também a primeira abordagem**:

1. Qualquer "N mil" era tratado como preço sem catálogo. "Você comentou que
   fatura 40 mil" era barrado — o agente não conseguia demonstrar que prestou
   atenção. Agora exige indício de preço, a conferência é por frase, e
   pergunta não conta: *"cabe 500 no seu orçamento?"* é qualificação, *"fica
   500 por mês"* é proposta. Mesma quantia, papéis opostos.
2. "seu orçamento", "seu faturamento" eram bloqueados **mesmo em pergunta** —
   mas o prompt manda "vire pergunta". A saída que o próprio sistema oferecia
   era uma armadilha: o modelo obedecia e continuava reprovado.

Nos dois casos o teste estava certo e o código errado.

### Validação

156 testes (20 novos). Os 40 testes do gate continuam passando sem alteração,
o que era o ponto: a extração de `checkFactuality` não podia mudar
comportamento.

---

## Ciclo 6 — A conversa gastava sem aparecer na conta

**Commit:** `b267b2f`

### Análise

O `whatsapp-ai-reply` chamava `api.deepseek.com` direto, em três lugares:

- **Sem reserva.** Uma queda do DeepSeek derrubava toda resposta a cliente —
  inclusive de quem estava no meio de uma negociação — enquanto a primeira
  abordagem seguia funcionando pelo provedor reserva. O caminho mais crítico
  era o menos protegido.
- **Sem custo.** A conversa é de longe o maior gasto de IA do produto: manda o
  histórico inteiro no contexto, a cada mensagem, e ainda faz segunda rodada
  quando usa ferramenta. Era o único caminho fora de `ai_usage`. Um número que
  exclui o maior item é pior que número nenhum, porque parece confiável.

### Implementação

As três chamadas passam por `callAI` + `recordUsage`, cada uma com seu
`purpose`. `AIMessage` ganhou `tool_calls` — sem esse campo, todo agente que
usa ferramenta é obrigado a falar com o provedor por fora, que é exatamente
como este acabou de fora.

Falha na segunda rodada não perde mais o trabalho: a ferramenta já rodou, a
reunião já foi marcada. Só o texto final falhou.

Junto, a tela de escalações deixou de mostrar o valor cru do banco
(`factuality_block`) — quem abre aquela lista está decidindo o que atender
primeiro.

### Validação

156 testes, `tsc` limpo, build ok, nenhuma chamada direta ao DeepSeek restou.

---

## Ciclo 7 — Follow-up que não lê o que o lead respondeu

**Commit:** `1806d31`

### Análise

Uma busca por `message/sendText` mostrou que o ciclo 4 tinha fechado só um dos
quatro caminhos de envio direto:

```
webhook/index.ts:1011
hunter/index.ts:322
follow-up/index.ts:299
```

O do **webhook** é o pior: é o caminho mais sensível do produto — responde
sozinho a quem acabou de escrever. O lead responde "pare", o gatilho grava a
blacklist no mesmo instante, e vinte linhas abaixo o webhook mandava a
resposta automática assim mesmo.

E a cadência do follow-up era só calendário: 1, 3, 5, 7, 14 dias. Nada olhava
o que o lead tinha dito. Na prática, a pessoa escreve *"esse mês não dá, me
chama em setembro"* e leva três mensagens em agosto. O custo não é a mensagem
ignorada — é o lead que estava quente virar bloqueio.

### Implementação

Os três caminhos passam a ir pelo `whatsapp-send`. **Não sobrou nenhuma
chamada direta à Evolution fora dele.**

A cadência virou decisão, e a ordem das regras é a ordem da prioridade — o
que o lead **pediu** vem antes do que o calendário sugere:

| Situação | Decisão |
|---|---|
| Respondeu e não foi respondido | esperar (a bola está com a gente) |
| Recusou de forma direta | encerrar |
| Marcou data | esperar até a data que **ele** disse |
| Adiou sem data | esperar 30 dias, não encerrar |
| Quente e sumiu | transferir para uma pessoa |
| Esgotou a cadência | encerrar |

"Esse mês não dá" não é "não quero". E lead quente que parou de responder é o
melhor da carteira — merece uma pessoa, não mais um automático.

### Os nove textos fixos

Removidos, não substituídos. Um deles:

> "Lembrei de você porque vi um case parecido com o seu. Empresas do segmento
> de {nicho} têm conseguido resultados incríveis."

Um caso de sucesso e um resultado, os dois inventados, no código-fonte. Outro
afirmava a dor do lead a partir de uma tabela por nicho. E disparavam
exatamente quando a IA falhava — quando ninguém está olhando.

Também: a mensagem só entra no histórico depois de sair de verdade. Antes era
gravada como `pending` e ficava lá mesmo com o envio falhando — o agente
conversacional lia aquilo como se o lead tivesse recebido, e a mensagem
seguinte fazia referência a uma conversa que não houve.

### Validação

173 testes (17 novos).

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

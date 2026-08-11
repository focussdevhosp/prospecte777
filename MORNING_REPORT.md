# Relatório

O que foi feito enquanto você esteve fora, o que você precisa fazer, e o que
eu faria em seguida.

Ponto de partida: `a22652f`, 118 testes.
Agora: `921aa0a`, **253 testes**, 15 ciclos, tudo commitado e no GitHub.

---

## O resumo em três frases

Os doze primeiros ciclos não implementaram funcionalidade nova: foram consertando coisas
que **pareciam prontas e não estavam** — e quatro delas eram graves o bastante
para justificar sozinhas o tempo todo: o lead que pedia "pare" continuava
recebendo mensagem, a parada de emergência não parava metade dos envios, o
modo padrão do produto não conseguia enviar mensagem nenhuma, e a biblioteca
de textos que o produto entrega pronta no primeiro dia inventava casos de
sucesso e estatísticas.

A regra que usei para escolher o que atacar: **tela que parece pronta e não
funciona vem antes de tela que não existe.** Uma funcionalidade ausente
avisa que falta algo; uma quebrada afirma um fato falso.

---

## Os quatro achados que mudam a conversa

### 1. Quem pedia para parar continuava recebendo

O gatilho `auto_blacklist_on_response` coloca o número na lista de bloqueio no
instante em que o lead escreve "pare". Só que **quatro caminhos de envio
falavam direto com a Evolution API**, sem nunca consultar essa lista:

- `webhook` — a resposta automática, mandada segundos depois do "pare";
- `whatsapp-ai-reply` — o agente conversacional;
- `follow-up` — a cadência automática, a cada 30 minutos;
- `hunter` — a primeira abordagem.

Não era uma condição de corrida rara: era o comportamento normal. A pessoa
pedia para parar e recebia mais uma.

Hoje todo envio passa pelo `whatsapp-send`, que já carregava a checagem. Não
sobrou nenhuma chamada direta à Evolution fora dele.

> Isso é LGPD, e é o tipo de coisa que aparece primeiro como reclamação e
> depois como número bloqueado.

### 2. A parada de emergência parava metade

A migração que criou o botão diz, literalmente, que "quem aperta o botão
espera que TUDO pare". Mas `outbound_paused` só era consultado por
`mission_can_send()` — e só as missões passam por ali. O agente conversacional
e os follow-ups agendados continuavam mandando.

Freio que para uma parte é pior que freio nenhum: sem freio a pessoa
desconecta o WhatsApp na mão; com freio pela metade ela acha que resolveu e
vai dormir.

A checagem foi para dentro do `whatsapp-send`, o ponto único por onde tudo
passa. Continua valendo a distinção certa: **uma pessoa** respondendo um
cliente no chat passa; a máquina agindo sozinha, não.

### 3. O modo padrão não conseguia enviar nada

No nível `assistido` — que é o padrão — toda mensagem para na fila de
aprovação. Só que o orquestrador encerrava a missão assim que acabavam os
leads *a processar*, e isso acontece exatamente quando a fila de aprovação
está cheia. Missão encerrada não envia. Resultado:

1. a esteira roda e enche a fila;
2. a missão vira "concluída";
3. você clica em Aprovar e recebe *"missao nao esta ativa"*;
4. não existe botão que traga a missão de volta.

O caminho mais seguro do produto era o único que não funcionava.

### 4. O produto entregava, pronta, uma biblioteca que inventa

`src/constants/niche-configs.ts` é o que o onboarding grava na biblioteca de
templates de todo usuário novo. Os 32 textos diziam coisas assim:

> "outros restaurantes da região aumentaram 40% nos pedidos"
> "uma clínica similar que economizou R$ 3.000/mês"
> "lançamos um app de treino que os alunos usam em casa"

Nenhum número veio de lugar nenhum e nenhum desses clientes existe. Quem
assina hoje recebia essa biblioteca e disparava no primeiro dia, assinando com
o nome da própria empresa.

Isso é o começo da linha que você descreveu como "IA fraca e pouco
inteligente" — e é a parte em que o modelo não tinha culpa nenhuma.

---

## O resto, em uma linha cada

| # | O que era | Commit |
|---|---|---|
| 1 | O funil da missão morria em "Abordados": nada fora do orquestrador escrevia em `mission_leads`, então "Responderam" e "Reuniões" eram zero para sempre | `235a0c6` |
| 2 | Missão se concluía com fila aberta; mensagem retida pelo horário nunca saía | `f0ea77b` |
| 3 | Um 502 momentâneo da Evolution descartava para sempre um lead já qualificado e aprovado | `d963d1d` |
| 4 | Resposta automática furava opt-out e parada de emergência | `dcf77eb` |
| 5 | O contrato de veracidade parava na primeira mensagem; o prompt da conversa **pedia** para inventar case | `fba7d97` |
| 6 | A conversa — o maior gasto de IA do produto — não entrava no painel de custo e não tinha provedor reserva | `b267b2f` |
| 7 | Follow-up ignorava o que o lead respondeu; nove textos fixos inventavam case e dor | `1806d31` |
| 8 | Os 32 templates entregues no onboarding inventavam case, percentual e lançamento de produto | `f820120` |
| 9 | O gate barrava "me dá 2 minutos" e "como vocês agendam hoje?" — três falsos positivos no caminho principal | `163c0cb` |
| 10 | Sem dono identificado, blacklist e parada de emergência eram puladas — e pedir rotação de chip produzia exatamente isso | `9ab71ac` |
| 11 | A tela de teste A/B nunca recebeu um único dado, e decidia pela métrica que engana | `f38947b` |
| 12 | "Melhor horário às 9h (0.0% de resposta)" — recomendação calculada sobre uma coluna que ninguém escreve | `f14a26a` |

E os três últimos são o inverso: **backend pronto sem tela.**

| # | O que foi entregue | Commit |
|---|---|---|
| 13 | **Central de IA** (`/ai`): custo por etapa, teto editável — que o erro mandava ajustar numa tela inexistente — e o **Laboratório**, que mostra todo o raciocínio da IA antes de qualquer envio | `f941a0c` |
| 14 | **ICP Builder**: seis dos sete critérios que dão a nota não tinham campo na tela | `3a4f8d5` |
| 15 | **Painel prescritivo**: treze números viraram uma fila ordenada pela ordem do dinheiro, cada item com o porquê da posição | `921aa0a` |

---

## O que eu preciso de você

Em ordem. O primeiro item bloqueia todo o resto.

### 1. Subir o schema no projeto novo (5 minutos)

O projeto `sciphxtbxvbpiypbcxub` está vazio. Todo o trabalho existe em
migração e em nenhum banco.

1. *Database → Extensions*: confirme `pgcrypto`, `pg_cron`, `pg_net` ligadas.
2. *SQL Editor* → cole o `SCHEMA_COMPLETO.sql` inteiro → Run.

São 67 migrações, 246 KB, alguns segundos. No fim do arquivo há cinco
consultas de conferência — se alguma vier diferente do esperado, me mande o
resultado.

### 2. Configurar os segredos das edge functions

*Project Settings → Edge Functions → Secrets*. Sem eles a esteira roda até a
hora de escrever a mensagem e para — de propósito, sem mandar nada genérico.

`DEEPSEEK_API_KEY`, `LOVABLE_API_KEY`, `EVOLUTION_API_URL`,
`EVOLUTION_API_KEY`, `HUNTER_API_KEY`, `FIRECRAWL_API_KEY`.

Depois: `supabase functions deploy`.

### 3. Rotacionar três credenciais — isto é urgente

Foram coladas na nossa conversa e devem ser tratadas como públicas. Não
rotacionei porque rotacionar segredo é irreversível e está na lista do que eu
devo parar antes de fazer.

| Credencial | Onde | Gravidade |
|---|---|---|
| Token do GitHub `ghp_...` | Settings → Developer settings → Revoke | alta |
| `sb_secret_...` | Project Settings → API → Rotate | alta |
| JWT `service_role` | mesma tela | **crítica** — ignora RLS, dá acesso total |

O `service_role` não está em nenhum arquivo do repositório, e o `client.ts`
derruba o app na inicialização se alguém tentar configurá-lo como `VITE_*`.

---

## O que eu faria em seguida

Na ordem em que eu pegaria:

1. **Testar contra Postgres de verdade.** É a lacuna que mais me incomoda:
   vários ciclos entregaram lógica de negócio em SQL — gatilhos, decisão de
   conclusão de missão, contadores — e nada disso passa pelo vitest, porque
   não há Postgres nesta máquina. A proteção atual é o bloco `RAISE EXCEPTION`
   no fim de cada migração, que pega o essencial e não pega regressão.
2. **Tela para retomar lead que esgotou as tentativas de envio.** O rascunho
   continua gravado; falta só a interface.
3. **Biblioteca de ICP reutilizável.** Hoje o perfil é digitado por missão.
   Quem roda cinco missões parecidas redigita cinco vezes — e é exatamente
   assim que as pessoas param de preencher.
4. **Continuar a varredura por "tela que não mede nada".** Foi o padrão mais
   produtivo destes doze ciclos: achei quatro (funil da missão, teste A/B,
   melhor horário, contadores do follow-up) e cada um estava escondido atrás
   de uma interface completa. Vale procurar o resto antes de construir
   qualquer coisa nova.

Detalhes de cada uma em `BLOCKED_TASKS.md`. O caminho de cada ciclo, com o
raciocínio, em `AUTONOMOUS_WORK_LOG.md`.

---

## Uma observação que talvez interesse

Seu diagnóstico original foi que a IA abordava de forma "fraca, genérica e
pouco inteligente". Depois destes dez ciclos eu diria que o problema nunca foi
a inteligência do modelo — foi que o sistema tinha, em vários pontos,
**instruções explícitas mandando inventar**, e textos fixos de reserva que
afirmavam resultados que nunca aconteceram. Quatro exemplos que estavam no
código-fonte:

- `"fiz pra outro X e deu Y"` — no prompt da conversa, sem nenhum case no
  contexto;
- `"traga 1 prova (case rápido, número, resultado com outro cliente
  parecido)"` — no playbook, inclusive para quem não tem portfólio nenhum;
- `"vi um case parecido com o seu, empresas do segmento têm conseguido
  resultados incríveis"` — texto fixo do follow-up;
- 32 templates de onboarding com percentual, valor em reais e caso de sucesso
  inventados, entregues prontos a todo usuário novo.

Os três disparavam com mais frequência justamente quando a IA falhava — ou
seja, quando ninguém estava olhando. Um modelo melhor não teria consertado
nada disso.

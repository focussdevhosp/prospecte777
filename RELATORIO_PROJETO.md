# RELATÓRIO DO PROJETO

Data: 2026-08-11 · Branch: `nexsilesbancodados/ai-autonomous-sales-platform`

> **Ciclo 2 concluído.** O Multi-Source Lead Engine saiu de "núcleo pronto" para
> completo, com registry, adaptadores, cache, teto de gasto de IA, cron e painel
> de Super Admin. Único bloqueio remanescente: **a migração precisa ser aplicada**
> (§4, B-1) — não há token do Supabase nesta máquina.

---

## 1. O QUE FOI IMPLEMENTADO

### 1.1 Auditoria (entregue)

`PROSPECT_AI_AUDIT.md` — 47 edge functions, 50+ tabelas, ~52.500 linhas de frontend e
~15.200 de backend classificadas em COMPLETO / PARCIAL / MOCK / QUEBRADO / DUPLICADO /
PRECISA MELHORIA / NÃO EXISTE.

`PROSPECT_AI_MASTER_PLAN.md` — plano com P0/P1/P2/P3 e o que explicitamente **não**
seria feito agora.

`THIRD_PARTY_DATA_PROVIDERS.md` — licença e termos de cada fonte de dados.

**A conclusão da auditoria mudou o plano.** A IA não abordava mal por falta de prompt.
Abordava mal por três causas concretas:

| Causa | Evidência |
|---|---|
| O prompt **mandava inventar** | `ai-prospecting:456` exigia *"pelo menos 1 número concreto"* com exemplos fictícios (*"R$ 3-5 mil/mês em vendas perdidas"*, *"cada review a menos = 12% menos ligação"*). Duas linhas abaixo dizia "não invente dados" — o modelo seguiu a instrução mais específica |
| Os **fallbacks afirmavam resultado que nunca aconteceu** | `job-processor:39-47`: *"já subiu de 3.6 pra 4.7 em 30 dias"*, *"triplica reviews em 60 dias"* |
| A inteligência **existia e não chegava na abordagem** | O agente conversacional monta prompt com 14 blocos de contexto; o gerador da **primeira** mensagem recebia 6 campos e ignorava a auditoria de site que o próprio produto já gravava em `leads.site_audit` |

### 1.2 P0 — veracidade (concluído)

| # | Correção | Arquivo |
|---|---|---|
| P0-1 | Removida a instrução de inventar estatística e prova social | `ai-prospecting` |
| P0-2 | Removido o fallback com resultado fabricado | `job-processor` |
| P0-3 | Removidos os 5 fallbacks genéricos *"Olá! Vi que a X pode crescer mais"* | `ai-prospecting`, `auto-first-message`, `campaign-executor` |
| P0-4 | Timeout + retry + troca de provedor em toda chamada de IA | `_shared/ai.ts` |
| P0-5 | `.env` retirado do controle de versão | raiz |

**Decisão de projeto:** quando a IA falha, o lead é **pulado**. Não existe mensagem de
reserva. Um lead não abordado hoje continua sendo lead amanhã; um lead que recebeu
promessa falsa está perdido, e possivelmente levou o número junto.

### 1.3 P1 — esteira comercial (concluído)

Agentes com responsabilidade separada, em `supabase/functions/_shared/agents/`:

| Módulo | O que faz | IA? |
|---|---|---|
| `dossier.ts` | Lead 360. Todo dado carrega **fonte e confiança**; separa FATO OBSERVADO de HIPÓTESE COMERCIAL | não |
| `qualifier.ts` | Score 0–100 em que **cada ponto vem com a evidência**; temperatura por comportamento, não só por fit | não |
| `offer-matcher.ts` | **Uma** oferta por lead, com motivo, confiança e alternativas | não |
| `strategist.ts` | Ângulo, gancho (sempre um fato), CTA, limite de palavras, objeções esperadas | não |
| `copywriter.ts` | Prompt que só autoriza afirmar o que está nos fatos | **sim** |
| `quality-gate.ts` | 6 notas + detector de número sem fonte, preço fora do catálogo, prova social fabricada, garantia de resultado | não |
| `orchestrator.ts` | Coordena, registra cada decisão no feed, aplica autonomia | — |

Determinístico onde a regra é objetiva, por três motivos: a decisão fica auditável, o
mesmo lead recebe sempre a mesma nota (requisito para A/B honesto), e não se gasta IA
para decidir o que um `if` decide melhor.

**Banco** (`20260811120000_...sql`): `missions`, `mission_leads`, `agent_events`,
`ai_usage`, com RLS, além de `mission_can_send()`, `emergency_stop()`,
`resume_outbound()` e `command_center()`.

**Backend**: `sales-orchestrator` com 13 ações (criar, listar, iniciar, processar lote,
prévia em modo seco, aprovar, recusar, pausar, retomar, parada de emergência, painel,
feed).

**Frontend**: `/missions` (lista + funil + freio global), `/missions/:id` (fila de
aprovação com o raciocínio completo + feed ao vivo), `NewMissionDialog`, `ActivityFeed`.

### 1.4 Multi-Source Lead Engine — NEXA SEARCH (concluído)

Para o usuário existe um botão: **BUSCAR**. Ele digita "clínicas de estética" e
"Itu/SP" e recebe empresas únicas. Quantas fontes foram consultadas, quais falharam
e quantas duplicatas foram fundidas é problema do sistema.

| Item | Estado |
|---|---|
| Contrato `LeadProvider` | ✅ |
| Normalização (nome, telefone E.164, domínio, endereço) | ✅ testado |
| Fingerprint (telefone → domínio → nome+cidade) | ✅ testado |
| Entity resolution `duplicateConfidence` 0–100 · MERGE/REVIEW/DISTINCT | ✅ testado |
| Merge com **procedência por campo** e peso por fonte | ✅ testado |
| Registry com prioridade e scoring histórico | ✅ testado |
| **Circuit breaker** — 3 falhas seguidas desligam a fonte por 10 min | ✅ testado |
| Busca **paralela** com timeout por fonte | ✅ testado |
| Adaptadores: OSM, Serper, SerpApi, busca web, worker de mapas | ✅ |
| Cache global (72h) por termo + localização | ✅ |
| Expansão de consulta por sinônimo + sugestão de ampliar área | ✅ testado |
| Resultados progressivos no feed | ✅ |

**Ganho de tempo:** as fontes rodavam em sequência, então a busca demorava a soma de
todas. Agora demora a mais lenta — com quatro fontes de ~20s, a diferença é entre 80 e
25 segundos.

**Nunca amplia em silêncio.** Resultado magro gera *sugestão* de ampliar a área ou o
termo. Trocar "Itu" por "região de Itu" sem avisar mudaria a intenção de quem pediu Itu.

### 1.5 Custo, autonomia e operação (concluído)

| Item | Onde |
|---|---|
| **Teto de gasto de IA** — diário, mensal e por missão | `ai_budget_check()`; checado antes de cada lote |
| Painel de custo por agente, com latência média | `ai_cost_summary()` |
| **Cron toca as missões sozinho** | `cron-tasks` → `missions_pending_batch()` → `run_batch` |
| Limpeza de cache vencido | `purge_search_cache()`, 06h UTC |
| **Super Admin → Fontes** | `data_sources_overview()` + `AdminDataSourcesTab` |

O painel de fontes mostra **aproveitamento** (empresas únicas ÷ empresas devolvidas),
não volume: uma fonte que acha 500 empresas que as outras já tinham custa tempo e não
acrescenta carteira.

---

## 2. O QUE FOI TESTADO

**118 testes automatizados, todos passando.** 82 são novos.

```
✓ src/test/leads.test.ts             21 testes
✓ src/test/agent.test.ts             14 testes
✓ src/test/agents.test.ts            40 testes  (novo)
✓ src/test/entity-resolution.test.ts 27 testes  (novo)
✓ src/test/providers.test.ts         15 testes  (novo)
✓ src/test/example.test.ts            1 teste
```

`npx tsc --noEmit` limpo · `eslint` limpo · `vite build` OK (194 entradas de precache).

### Cenários de veracidade cobertos

O Quality Gate **reprova**, com teste dedicado para cada caso:

- estatística inventada (*"70% dos clientes desistem"*);
- valor em reais sem catálogo (*"custa uns R$ 5 mil por mês"*);
- prova social fabricada (*"acabei de fazer pra uma clínica parecida"*);
- promessa de resultado garantido;
- **a mensagem genérica que motivou este projeto** (*"Olá, tudo bem? Conheci sua empresa e gostaria de apresentar nossos serviços."*);
- **o fallback antigo do `job-processor`** (*"triplica reviews em 60 dias"*);
- reenvio de mensagem quase idêntica;
- linguagem de spam (urgência artificial, caixa alta, "clique aqui").

E **aprova** mensagem construída sobre a auditoria de site, com factualidade 100.

### Cenários de resiliência de fonte cobertos

- fonte que falha → erro isolado, as outras seguem;
- fonte que trava → cortada no timeout (verificado: <1s em vez dos 5s do provider);
- **3 falhas seguidas → disjuntor abre** e a fonte deixa de ser chamada;
- uma execução boa zera o contador de falhas;
- o disjuntor tem a palavra final mesmo quando o provider se declara saudável;
- scoring premia quem agrega empresa **única**, não quem acha muito;
- fonte nova, sem histórico, não é punida.

### Cenários de deduplicação cobertos

- *"Clínica Bella Estética"* × *"Bella Estética Clínica"* → mesma empresa;
- duas empresas diferentes que **dividem o telefone** (salas no mesmo prédio) → **não** funde;
- mesmo nome em cidades diferentes → não funde;
- merge combina endereço da fonte A com site e avaliação da fonte B;
- fonte fraca não sobrescreve dado de fonte forte.

### O que **não** foi testado

- Execução real contra Supabase (migração não aplicada nesta sessão — exige acesso ao projeto);
- Envio real por WhatsApp (exige instância Evolution conectada);
- Chamada real ao DeepSeek (exige `DEEPSEEK_API_KEY` no ambiente);
- A UI em navegador — apenas typecheck.

Os três primeiros dependem de credenciais/ambiente que não estão nesta máquina.

---

## 3. O QUE AINDA FALTA

### Único item bloqueante

1. **Aplicar as duas migrações** no Supabase. Nada da esteira funciona antes disso:

```bash
supabase link --project-ref <SEU_PROJECT_REF>
supabase db push
```

Ou colar no SQL Editor, nesta ordem:
`20260811120000_b7c8d9e0-...sql` → `20260811140000_c8d9e0f1-...sql`.

Depois, confirmar que o cron chama `cron-tasks` (a tarefa `run_missions` já está lá).

### Depois (P2)

Follow-up decisório (follow-up / esperar / encerrar / transferir / tarefa) · intent e
sentiment alimentando o CRM · handoff com dossiê pronto · A/B medindo receita e não
resposta · Command Center prescritivo · ICP Builder.

### Adiado conscientemente (P3)

Prompt Manager versionado · AI Quality Center · Cost Center com orçamento (a coleta em
`ai_usage` já existe; falta o painel) · Playground · Learning Loop com aprovação humana ·
organizações multi-tenant · Super Admin de Data Sources.

---

## 4. ERROS E BLOQUEIOS

### Resolvidos durante a execução

| Defeito | Correção |
|---|---|
| Regex de "garantia de resultado" não pegava *"Garanto que o resultado vem rápido"* — casava só a forma justaposta | Janela `[^.!?]{0,40}` entre o verbo e o objeto |
| Entity resolution mandava para conferência humana dois registros com nome idêntico no mesmo ponto do mapa, por falta de telefone | Reforço de evidência combinada: nome ≥0.85 + mesmo ponto = conclusivo |

Nos dois casos o teste estava certo e o código errado.

### Bloqueios abertos

| # | Bloqueio | Impacto |
|---|---|---|
| B-1 | **Migração não aplicada.** Sem acesso ao projeto Supabase nesta sessão | `/missions` retorna erro até a migração rodar |
| B-2 | **Token do GitHub exposto em texto puro no chat.** Foi usado apenas em header transitório (`git -c`), sem gravar em `.git/config` nem na URL do remote — confirmado | **Rotacione agora.** Já está no histórico da conversa |
| B-3 | `google-maps-scraper` é Python; o produto é Deno | Exige worker externo. Ver `THIRD_PARTY_DATA_PROVIDERS.md` |
| B-4 | Conta `gh` local (`nexsilesbancodados`) não tem escrita em `focussdevhosp/prospecte777` | Push exigiu o token; convém conceder acesso à conta ou usar deploy key |

### Riscos conhecidos, não corrigidos

- **Sem teto de gasto de IA.** `ai_usage` já grava custo por chamada, mas nada
  interrompe ao atingir limite. Uma missão de 500 leads dispara 500+ chamadas.
- **DuckDuckGo é frágil** por natureza (raspagem de HTML). Peso baixo no merge, mas
  ainda é fonte ativa.
- **RLS por `FOR ALL`** em tabelas centrais funciona, mas dificulta auditar
  SELECT/INSERT/UPDATE/DELETE separadamente.

---

## 5. PRÓXIMA ETAPA

Na ordem:

1. **Aplicar a migração** e rodar o cenário ponta a ponta com dados fictícios:
   criar missão → buscar → qualificar → escolher oferta → gerar mensagem →
   Quality Gate → aprovar → enviar (em ambiente seguro) → resposta → CRM.
2. **Fechar o Multi-Source Engine**: registry + adaptadores + cache, e migrar o
   `engine.ts` para o contrato.
3. **Cron do `run_batch`**, para a missão andar sozinha em vez de depender da tela.
4. **Teto de gasto de IA**, usando o que `ai_usage` já coleta.

---

## Apêndice — o que não foi tocado, de propósito

Estas peças estavam corretas e mexer nelas só criaria risco:

`_shared/auth.ts` (JWT validado com chave pública, comparação em tempo constante,
bloqueio de impersonação) · `_shared/agent.ts` (opt-out, handoff, debounce de rajada,
dedup de webhook, portaria que falha fechada) · `_shared/site-audit.ts` ·
`_shared/leads.ts` / `sources.ts` / `engine.ts` · `_shared/chips.ts` +
`antiban-queue-processor` · `whatsapp-ai-reply` · toda a UI de CRM, antiban e analytics.

O envio continua saindo por `whatsapp-send`, que já carrega blacklist, opt-out, rotação
de chip e checagem de conexão. Duplicar essas regras na esteira criaria uma segunda
verdade sobre quando é permitido enviar — e duas verdades sobre isso é como se manda
mensagem para quem pediu para parar.

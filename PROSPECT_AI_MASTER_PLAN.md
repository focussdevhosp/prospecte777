# PROSPECT_AI_MASTER_PLAN

Plano de execução. Base: `PROSPECT_AI_AUDIT.md`.
Alvo: **agente comercial autônomo end-to-end**, coordenado por missão.

---

## 0. Princípio que ordena tudo

O complemento crítico define o caminho a fazer funcionar **de ponta a ponta antes de
qualquer coisa secundária** (§32):

```
MISSÃO → PESQUISA → LEAD → QUALIFICAÇÃO → OFERTA → ESTRATÉGIA
       → MENSAGEM → QUALITY GATE → CONTATO → RESPOSTA
       → CONVERSA → FOLLOW-UP → REUNIÃO → CRM
```

Cruzando com a auditoria, **7 dos 14 elos já existem e funcionam bem**. O trabalho não é
construir a esteira inteira — é fabricar os elos que faltam e soldá-los nos que já giram.

| Elo | Hoje | Ação |
|---|---|---|
| MISSÃO | ⬜ não existe | **construir** |
| PESQUISA | ✅ `_shared/engine.ts` (4 fontes, peneira, origem registrada) | **reusar como está** |
| LEAD | ✅ tabela `leads` com 60 colunas | **reusar** |
| QUALIFICAÇÃO | 🟡 grupos + BANT, sem fit e sem explicação | **construir** (fato × hipótese) |
| OFERTA | ⬜ vem de um `<select>` | **construir** (Offer Matcher) |
| ESTRATÉGIA | ⬜ não existe | **construir** |
| MENSAGEM | ⚠️ existe, com 6 campos e instrução de inventar | **religar + reescrever prompt** |
| QUALITY GATE | ⬜ não existe | **construir** |
| CONTATO | ✅ `whatsapp-send` (opt-out, blacklist, chip, limite, conexão) | **reusar como está** |
| RESPOSTA | ✅ webhook + dedup + debounce | **reusar** |
| CONVERSA | ✅ `whatsapp-ai-reply` — melhor peça de IA do sistema | **reusar, não tocar** |
| FOLLOW-UP | 🟡 sequência fixa | **evoluir** (P2) |
| REUNIÃO | ✅ `meetings` + tool `scheduleMeeting` | **reusar** |
| CRM | ✅ pipeline, contatos, inbox, atividades | **reusar** |

**Regra:** nenhuma linha de `_shared/auth.ts`, `_shared/agent.ts`, `_shared/engine.ts`,
`_shared/site-audit.ts`, `_shared/chips.ts` ou `whatsapp-ai-reply` será reescrita. Elas são
o chassi. O que falta são os agentes de decisão entre "achei a empresa" e "mandei a
mensagem" — exatamente o trecho onde a IA hoje é fraca.

---

## 1. Arquitetura alvo

```
                    ┌──────────────────────────┐
                    │   MISSÃO (missions)      │
                    │  nicho · cidade · ofertas│
                    │  objetivo · autonomia    │
                    │  limites · horários      │
                    └────────────┬─────────────┘
                                 │
                    ╔════════════▼═════════════╗
                    ║   SALES ORCHESTRATOR     ║   sales-orchestrator/
                    ║   (coordena, não faz)    ║
                    ╚════════════┬═════════════╝
                                 │
   ┌────────────┬────────────┬───┴────────┬────────────┬────────────┐
   ▼            ▼            ▼            ▼            ▼            ▼
RESEARCH    ENRICHMENT   QUALIFICATION  OFFER      STRATEGY      COPY
engine.ts   site-audit   qualifier.ts   MATCHER    strategist   copywriter
 (existe)   dossier.ts    (novo)      matcher.ts    (novo)       (novo)
                                        (novo)
                                 │
                                 ▼
                        ╔════════════════╗
                        ║  QUALITY GATE  ║   quality-gate.ts (novo)
                        ║ 5 notas 0-100  ║
                        ╚═══════┬════════╝
                        reprovou│aprovou
                          ↺ reescreve
                                 ▼
                    ┌────────────────────────┐
                    │  AUTONOMIA decide       │
                    │ MANUAL → rascunho       │
                    │ ASSISTIDO → fila humana │
                    │ SEMI/AUTÔNOMO → envia   │
                    └───────────┬─────────────┘
                                ▼
                        whatsapp-send  (existe: opt-out, chip, limite)
                                ▼
                        webhook → whatsapp-ai-reply  (existe)
                                ▼
                        meetings · CRM  (existe)

   Tudo que acontece vira linha em  agent_events  →  ACTIVITY FEED ao vivo
```

### Por que agentes determinísticos onde dá

Qualificação, escolha de oferta e quality gate **não usam IA** onde a regra é objetiva.
Motivos:

1. **Auditabilidade** — "score 87 porque não tem site (fato), rating 4.1 com 12 reviews
   (fato), nicho bate com o ICP da oferta (fato)". Uma IA daria 87 sem conseguir provar.
2. **Custo** — 500 leads × 4 chamadas de IA por lead é dinheiro jogado fora numa decisão
   que um `if` resolve melhor.
3. **Determinismo** — o mesmo lead sempre recebe a mesma nota. Sem isso não há A/B nem
   learning loop honesto.

A IA entra onde ela é insubstituível: **escrever o texto** (Copy Agent) e **conversar**
(Conversation Agent, já existente). O Quality Gate roda determinístico primeiro (barato,
pega 90% dos problemas) e só chama IA se passar.

---

## 2. Modelo de dados novo

```sql
missions          -- a missão: alvo, ofertas, objetivo, limites, autonomia, status
mission_leads     -- 1 linha por lead na missão: carrega o lead por toda a esteira
                  --   qualification · offer_match · strategy · draft · quality (JSONB)
                  --   status: found→qualified→drafted→approved→contacted→replied→...
agent_events      -- feed ao vivo: quem (agente), o quê, quando, detalhe
ai_usage          -- tokens, custo estimado, latência, por missão/agente/modelo
```

Mais duas colunas de parada de emergência:
`user_settings.outbound_paused` (freio global) e `missions.paused_at` (freio por missão).

**Nenhuma tabela existente é alterada destrutivamente.** `mission_leads` referencia
`leads(id)` — o lead continua sendo a entidade central do CRM.

---

## 3. Contrato de veracidade (atravessa tudo)

Este é o coração da correção do problema relatado.

Todo dado que chega ao prompt carrega **procedência**:

```ts
type Fact = {
  label: string;          // "Site"
  value: string;          // "não possui"
  source: string;         // "auditoria de site (HTML)" | "OpenStreetMap" | "conversa"
  confidence: number;     // 0..1
  kind: "fact" | "hypothesis";
};
```

Regras aplicadas em código, não em prompt:

1. O prompt recebe **duas seções separadas**: `FATOS OBSERVADOS` e `HIPÓTESES COMERCIAIS`.
2. A instrução ao modelo é: *só afirme o que está em FATOS; hipótese só pode virar
   pergunta*.
3. O Quality Gate **procura número que não veio de fato** e reprova (`FACTUALITY`).
4. Preço só sai do catálogo (`service_intelligence.pricing_info`). Sem catálogo, sem preço.
5. Case/prova social só existe se houver `service_intelligence.case_studies` cadastrado.

Sai do sistema: *"cada review a menos = 12% menos ligação"*, *"já subiu de 3.6 pra 4.7"*,
*"triplica reviews em 60 dias"*. Nada disso jamais foi verdade verificável.

---

## 4. Roadmap priorizado

### P0 — segurança e veracidade (bloqueia tudo)

| # | Item | Arquivo |
|---|---|---|
| P0-1 | Remover instrução de inventar número/prova social | `ai-prospecting` |
| P0-2 | Remover fallback com resultado fabricado | `job-processor` |
| P0-3 | Remover fallbacks genéricos "Olá! Vi que a X pode crescer" (5 pontos) | vários |
| P0-4 | Timeout + retry nas chamadas de IA | `_shared/ai.ts` |
| P0-5 | Destrackear `.env` do Git | raiz |

### P1 — caminho crítico end-to-end (§32)

| # | Item | Entrega |
|---|---|---|
| P1-1 | `_shared/ai.ts` — abstração de provider (primary/fast/cheap/fallback), timeout, contabilidade | módulo |
| P1-2 | `dossier.ts` — Lead 360 com procedência | módulo + teste |
| P1-3 | `qualifier.ts` — fit 0-100, fato × hipótese, temperatura | módulo + teste |
| P1-4 | `offer-matcher.ts` — melhor oferta + motivo + confiança | módulo + teste |
| P1-5 | `strategist.ts` — objetivo, ângulo, formalidade, CTA, momento, objeções | módulo + teste |
| P1-6 | `copywriter.ts` — prompt factual a partir do dossiê | módulo |
| P1-7 | `quality-gate.ts` — 5 notas + detector de fabricação + reescrita | módulo + teste |
| P1-8 | Migração `missions`/`mission_leads`/`agent_events`/`ai_usage` + RLS + RPCs | SQL |
| P1-9 | `sales-orchestrator` — a esteira completa, respeitando autonomia | edge function |
| P1-10 | Níveis de autonomia + Emergency Stop (global/missão) | SQL + função + UI |
| P1-11 | UI: Nova Missão · lista · detalhe com feed ao vivo · fila de aprovação | React |
| P1-12 | Religar `generate_message` na nova esteira (compatível) | `ai-prospecting` |

### P2 — aumentam conversão

Follow-up decisório (follow-up/esperar/encerrar/transferir/tarefa) · Intent & sentiment
alimentando o CRM · Temperatura por comportamento · A/B medindo receita · Inbox com score
e próxima ação · Handoff com dossiê pronto · Command Center prescritivo · ICP Builder ·
Conversion Optimizer.

### P3 — escala e diferencial

Prompt Manager versionado · AI Quality Center · Cost Center com orçamento · Playground ·
Learning Loop com aprovação humana · Organizações multi-tenant · Super admin · Pipelines
customizáveis · Config por nicho.

---

## 5. Definição de pronto (FASE 37)

Nenhum item é "pronto" sem, quando aplicável:

UI · BACKEND · BANCO · VALIDAÇÃO · PERMISSÃO · ESTADOS · ERROS · LOGS · TESTES.

Concretamente, para o P1: a missão precisa poder ser criada na tela, executar de verdade,
gravar cada passo em `agent_events`, respeitar autonomia e limites, aparecer no feed, e
falhar de forma visível quando falhar.

---

## 6. Guardrails inegociáveis (§30)

Implementados como código, não como instrução de prompt:

| Guardrail | Onde é aplicado |
|---|---|
| Sem preço inventado | `copywriter.ts` só injeta preço vindo do catálogo |
| Sem promessa/resultado inventado | `quality-gate.ts` → `FACTUALITY` reprova número sem fonte |
| Sem funcionalidade inexistente | catálogo é a única fonte de capacidade |
| Sem contato após opt-out | `is_phone_blacklisted` (já existe) + `classifyInbound` (já existe) |
| Sem contorno de bloqueio | nada no plano toca detecção de provedor |
| Sem spam | limite diário, cooldown, horário, dedup — todos já existem e passam a ser checados **pela missão** também |
| Sem desconto fora da política | proposta continua exigindo aprovação humana |

---

## 7. O que este plano **não** faz agora

Declarado abertamente para não virar tela falsa:

- **Learning Loop automático** — só coleta dados (P1 grava `agent_events` + `ai_usage`);
  a análise e recomendação ficam em P3, com aprovação humana obrigatória.
- **Multi-provider real** — a abstração nasce em P1 com DeepSeek + fallback Lovable; outros
  provedores entram por configuração depois.
- **Cost Center** — P1 grava `ai_usage`; painel e orçamento em P3.
- **Organizações multi-tenant** — o isolamento hoje é por `user_id` + RLS e funciona;
  trocar para organização é migração grande e não aumenta conversão agora.
- **Follow-up decisório** — P2. Hoje continua a sequência atual, que funciona.

---

## 8. Ordem de execução

1. P0 inteiro (é rápido e destrava o resto)
2. `_shared/ai.ts` + os 6 módulos de agente + testes
3. Migração
4. `sales-orchestrator`
5. UI de missão + feed
6. Religar `generate_message`

Cada etapa entra funcionando. Nada de página bonita sem backend.

# PROSPECT_AI_AUDIT

Auditoria completa da plataforma antes de qualquer alteração.
Data: 2026-08-11 · Branch: `nexsilesbancodados/croaker` · Commit base: `b98c4e8`

---

## 0. Resumo executivo

A plataforma **não é um protótipo**. São ~52.500 linhas de frontend (React + Vite +
shadcn), ~15.200 linhas de edge functions (Deno/Supabase), 50+ tabelas com RLS,
47 edge functions e uma camada de autenticação que já foi endurecida (JWT validado
com chave pública, comparação em tempo constante, `resolveUserId` bloqueando
operação em nome de terceiro, rate limit persistido no banco).

**O diagnóstico do problema relatado está correto, mas a causa não é a que parece.**

A IA não é fraca porque o modelo é ruim ou porque o prompt é curto. Ela é fraca por
três motivos concretos e corrigíveis:

| # | Causa raiz | Evidência |
|---|---|---|
| 1 | **A inteligência existe, mas não chega na abordagem.** O agente conversacional (`whatsapp-ai-reply`) monta um prompt com 14 blocos de contexto: BANT, memória do lead, sinais de compra, padrões do nicho, objeções, portfólio, catálogo de serviços. O gerador da **primeira** mensagem (`ai-prospecting → generate_message`) recebe **6 campos**: nome, nicho, cidade, rating, reviews, tem-site-sim/não. | `whatsapp-ai-reply/index.ts:931-1042` vs `job-processor/index.ts:125-132` |
| 2 | **O prompt manda a IA inventar.** O bloco "REGRAS DE OURO" exige *"pelo menos 1 número concreto"* e dá como exemplo `"R$ 3-5 mil/mês em vendas perdidas"`, `"cada review a menos = 12% menos ligação"`, além de prova social fabricada (*"acabei de fazer pra um..."*). Duas linhas abaixo o mesmo prompt diz *"Não invente dados"*. A instrução mais específica vence. | `ai-prospecting/index.ts:456,465,488` |
| 3 | **Os fallbacks são piores que não enviar.** Quando a IA falha, sai texto fixo afirmando resultados que nunca aconteceram: *"já subiu de 3.6 pra 4.7 em 30 dias"*, *"triplica reviews em 60 dias"*. E em três outros pontos sai o literal `"Olá! Vi que a X pode crescer mais. Posso ajudar?"`. | `job-processor/index.ts:39-47`, `ai-prospecting/index.ts:700,717,766,783` |

Existe um módulo — `_shared/site-audit.ts` — que faz exatamente o que uma boa
abordagem precisa: audita o site do lead e devolve **fatos verificáveis** ("não tem
tag de viewport", "rodapé parado em 2021", "sem botão de WhatsApp"), cada um com
impacto comercial e oportunidade de venda associada. **Esse módulo nunca é lido pelo
gerador de mensagem.** O dado bom está no banco (`leads.site_audit`) e não chega ao
prompt.

**Conclusão:** não é preciso reconstruir nada. É preciso **ligar o que já existe** e
**parar de mandar a IA inventar**.

---

## 1. Classificação por recurso

Legenda: ✅ COMPLETO · 🟡 PARCIAL · 🔵 MOCK · 🔴 QUEBRADO · ♻️ DUPLICADO · ⚠️ PRECISA MELHORIA · ⬜ NÃO EXISTE

### 1.1 Infraestrutura e segurança

| Recurso | Status | Observação |
|---|---|---|
| Autenticação (Supabase Auth + JWT) | ✅ | `requireUser` valida o token com a chave **anon**, não com service role — impede que o service role key passe como usuário. |
| Autorização interna (cron → function) | ✅ | Dois caminhos: service role no `Authorization` e `x-internal-secret` verificado por RPC. Comparação em tempo constante (`safeEqual`). |
| `resolveUserId` (impersonação) | ✅ | Bloqueia `user_id` no corpo divergente do JWT (403). Foi um furo real, já fechado. |
| Posse de instância WhatsApp | ✅ | `assertOwnsInstance` cobre chips extras, não só o principal. |
| Rate limit | ✅ | Persistido no banco via `consume_rate_limit`. Falha aberta (decisão consciente e documentada). |
| Paywall server-side | ✅ | `requirePaidPlan` com tolerância de 3 dias e bypass para admin. |
| RLS | 🟡 | 52 `ENABLE ROW LEVEL SECURITY`. Tabelas centrais (`leads`, `whatsapp_queue`, `ab_tests`, `antiban_config`) têm **1 policy só** — provavelmente `FOR ALL`, o que funciona mas dificulta auditar SELECT/INSERT/UPDATE/DELETE separadamente. Não encontrei tabela sem RLS. |
| Secrets no frontend | ✅ | Só `VITE_SUPABASE_*` (publishable/anon). Nenhuma chave de IA ou Evolution no bundle. |
| **`.env` versionado no Git** | 🔴 | `git ls-files` lista `.env`. O `.gitignore` tem a entrada, mas arquivo já rastreado não é ignorado. Conteúdo é só anon key (público por design), então **o impacto é baixo** — mas é um hábito que vaza a próxima chave. |
| Webhook Evolution | ✅ | Autentica por `?s=<segredo>` verificado no banco (Evolution não envia header custom). |
| Chaves de IA por usuário | ⚠️ | `user_settings.deepseek_api_key` existe na tabela mas `ai-prospecting` usa **só** a global (`Deno.env`). Coluna morta ou caminho não implementado. |

### 1.2 Motor de prospecção (FASE 2)

| Recurso | Status | Observação |
|---|---|---|
| Captura multi-fonte | ✅ | `_shared/engine.ts` orquestra 4 fontes com falha isolada. |
| OpenStreetMap / Overpass | ✅ | Fonte primária, correta: cadastro estruturado, telefone em campo próprio. Geocoding via Nominatim. Filtra só quem tem telefone. |
| DuckDuckGo (HTML scraping) | 🟡 | Complemento. Extrai telefone de texto livre — frágil por natureza, mas passa pela peneira. Quebra se o DDG mudar o markup. |
| Serper / SerpApi | ✅ | Opcional, chave do próprio usuário. |
| Peneira de qualidade | ✅ | `refineLeads` com dedup, detecção de agregador e de listagem. Reporta descartes por motivo. |
| **Transparência de origem** | ✅ | `EngineReport.sources` e `discarded` vão para o job e aparecem na tela. Requisito "mostrar origem" já atendido. |
| Cache comunitário | ✅ | `community_leads` com upsert por `(phone, niche, location)`. |
| Filtros pedidos na FASE 2 | 🟡 | Existem: nicho, cidade/localização, quantidade, `minQuality`. **Não existem:** estado/região (só string livre), tamanho aproximado, "empresas sem site", "presença digital fraca" como *filtro de busca*. Esses dois últimos existem como **pós-filtro** no Radar de Oportunidades e no MassSend — o que é honesto, porque a fonte não expõe isso na consulta. |
| Nichos suportados | 🟡 | 20 subnichos hardcoded em `SUBNICHES` + 22 mapeamentos OSM. Nicho fora da lista cai para busca literal (funciona, mas sem sinônimos e sem tag OSM). |
| CNPJ Radar | ✅ | `cnpj-radar` + `cnpj_cache`. |
| Extração Instagram/Facebook | 🟡 | `instagram-scraper` / `facebook-scraper` via Apify (token do usuário). Depende de terceiro. |
| Email Finder (Hunter) | ✅ | `hunter/index.ts` + colunas `hunter_email*` no lead. |

### 1.3 Enriquecimento (FASE 3)

| Recurso | Status | Observação |
|---|---|---|
| `lead-enrichment` | 🟡 | Funciona: ViaCEP, BrasilAPI (CNPJ/DDD/CEP/bancos/feriados), Clearbit logo, RDAP/WHOIS. **Mas é um endpoint de consulta avulsa** — não há um pipeline "enriqueça este lead e grave o perfil 360". |
| Auditoria de site | ✅ | `_shared/site-audit.ts`. 11 verificações objetivas no HTML, sem IA, determinístico. Grava em `leads.site_audit`. **Excelente e subutilizado.** |
| Colunas de perfil 360 no lead | ✅ | Já existem: `company_description`, `industry`, `employee_count`, `founded_year`, `instagram_bio`, `pain_points[]`, `service_opportunities[]`, `analyzed_needs`, `enriched_at`, redes sociais. |
| **Perfil 360 consolidado** | ⬜ | Os campos existem, os dados chegam por caminhos diferentes, mas **nada monta a visão única** para consumo da IA. É a peça que falta. |

### 1.4 Lead scoring (FASE 4)

| Recurso | Status | Observação |
|---|---|---|
| `calculate_lead_score` (RPC) | ✅ | Existe no banco. |
| `calculate_quality_score` (edge) | 🟡 | Heurística de 30 linhas: rating, reviews, site, email, resposta anterior. Razoável, mas **não explica** a nota. |
| `score_factors` (JSONB no lead) | 🟡 | Coluna existe. Não achei quem escreva nela de forma consistente. |
| Temperatura (frio/morno/quente) | 🟡 | Coluna `temperature` existe, movida pelo agente conversacional via tool. Sem regra determinística para lead novo. |
| **Explicabilidade da nota** | ⬜ | Requisito explícito da FASE 4 ("sempre explicar por quê"). Não existe. |
| Fit com ICP | ⬜ | Não há conceito de ICP no banco. |
| `opportunity_radar` (RPC) | ✅ | Ranking de carteira por oportunidade, **com `reasons TEXT[]`** — é o único lugar que já explica a nota. Bom precedente a seguir. |

### 1.5 Arquitetura de agentes (FASE 5)

| Agente | Status | Onde |
|---|---|---|
| Pesquisador | 🟡 | Espalhado: `site-audit`, `lead-enrichment`, `web-search`, `firecrawl-*`. Nenhum consolida. |
| Qualificador | 🟡 | `qualify_leads_by_group` (classifica em 6 grupos) + `lead_qualification` (BANT, preenchido só pelo agente conversacional). Não separa **fato** de **hipótese** — requisito explícito. |
| Estrategista | ⬜ | Não existe. A escolha da oferta é `agentSettings.specific_service` vindo de um `<select>` do frontend. |
| Copywriter | 🟡 | É o `generate_message`. Prompt único, contexto pobre, instrução de inventar número. |
| Conversacional | ✅ | `whatsapp-ai-reply`. **A melhor peça de IA do sistema**: 14 blocos de contexto, 11 tools, debounce de rajada, dedup de webhook, portaria (`agent_can_reply`), opt-out e handoff antes de gastar token. |
| Follow-up | 🟡 | `follow-up/index.ts` + `intelligent_followups` + `cold-reactivation`. Templates fixos com placeholder — o "inteligente" ainda não é inteligente. |
| Supervisor | ⬜ | Não existe. Nada avalia a mensagem antes de sair. |

### 1.6 Motor de abordagem e personalização (FASES 6 e 7)

| Recurso | Status | Observação |
|---|---|---|
| Geração de 1ª mensagem | ⚠️ | Existe e roda. Prompt tem boa estrutura (gancho → problema → CTA micro, 45-80 palavras, proíbe "prezado"). **Mas exige número inventado e prova social fabricada.** |
| Contexto disponível ao copywriter | 🔴 | 6 campos. Ignora `site_audit`, `pain_points`, `service_opportunities`, `company_description`, `instagram_bio`, histórico, `service_intelligence` (catálogo real com preço, dores, ICP, cases). |
| Estratégias diferentes (consultiva/curta/diagnóstico/…) | ⬜ | Só 3 modos: direto, template, remarketing. |
| Fallback quando IA falha | 🔴 | Afirma resultados fabricados. Ver §0. |
| **Personalization score** | ⬜ | Não existe. Nada mede especificidade/relevância/naturalidade. |
| Loop de reescrita | ⬜ | Não existe. |
| Spintax / variação | ✅ | `process_spintax` no banco + `SpintaxManager`. |
| A/B test | ✅ | `ab_tests` + contadores no envio + `ABTestingTab`. Mede envio/resposta; **não mede receita** (requisito FASE 18). |

### 1.7 WhatsApp e antiabuso (FASE 9)

| Recurso | Status | Observação |
|---|---|---|
| Conexão / QR / status | ✅ | `whatsapp-connect` + `WhatsAppConnection.tsx`. |
| Envio | ✅ | `whatsapp-send`: valida tamanho, normaliza telefone BR (DDD 11-99, 10-11 dígitos), checa conexão antes de enviar. |
| Multi-chip / rotação | ✅ | `_shared/chips.ts`, estratégias configuráveis, contabiliza uso por chip. |
| **Opt-out** | ✅ | `is_phone_blacklisted` (RPC, telefone normalizado) barra no envio; `classifyInbound` detecta 8 padrões de pedido de parada **antes** de gastar token; `agent_opt_out` registra. |
| Handoff para humano | ✅ | 9 padrões (pediu humano, percebeu que é robô, sinal de fechamento, risco jurídico, irritação). |
| Dedup de webhook | ✅ | Unique em `external_id` + janela de 30s para formato antigo. |
| Debounce de rajada | ✅ | Espera 8s de silêncio, teto de 25s, com claim atômico para não responder duas vezes. |
| Horário comercial | ✅ | `withinBusinessHours` + `auto_start_hour`/`auto_end_hour`/`work_days_only`. |
| Limite diário / cooldown | ✅ | `antiban_config`, `get_current_daily_limit`, warmup, `agent_can_reply` (falha **fechada**). |
| Fila | ✅ | `whatsapp_queue` + `antiban-queue-processor`. |
| Painel antiban | ✅ | `AntiBanDashboard`, `QueueMonitor`, `HealthHistoryChart`. |
| Métricas por chip | ✅ | `chip_health_logs`, `get_chip_usage_today`. |

**Esta é a área mais madura do sistema.** Nada aqui contorna política de provedor.

### 1.8 CRM, inbox e pipeline (FASES 10 e 11)

| Recurso | Status |
|---|---|
| Pipeline Kanban | ✅ `CRMPipeline.tsx`, estágios em `leads.stage` |
| Contatos + detalhe | ✅ `CRMContacts`, `CRMContactDetail` |
| Inbox | 🟡 `CRMInbox.tsx` — lista conversa e permite responder. **Falta** score, próxima ação, resumo da IA no painel lateral |
| Atividades | ✅ `activity_log` |
| Automações | 🟡 `CRMAutomations` |
| Meta Ads | 🟡 `meta_ads_tokens` + `MetaTokenStatus` |
| Handoff queue | ✅ `HandoffQueue.tsx` + `agent_escalations` |
| Pipeline customizável | ⬜ Estágios fixos |

### 1.9 Catálogo, conhecimento e propostas (FASES 15, 25, 26)

| Recurso | Status | Observação |
|---|---|---|
| `service_intelligence` | ✅ | **Já é o catálogo comercial pedido na FASE 15**: nome, descrição, ICP, dores, benefícios, preço, FAQ, cases, objeções, templates por etapa, e contadores de conversão. |
| `generate-service-intelligence` | ✅ | Gera o catálogo com IA a partir de descrição do serviço. |
| Knowledge base | 🟡 | `user_settings.knowledge_base` (texto livre) + `service_intelligence`. Usado **só** pelo agente conversacional. |
| Objeções | ✅ | `objection_responses` + `detect-objection` + página `/objections`. |
| Propostas | ✅ | `generate-proposal` + `generated_proposals`. |
| Portfólio | ✅ | `portfolio_sites`, enviado como prova quando o lead pede. |

**O catálogo existe e é bom. O copywriter da 1ª mensagem não o consulta.**

### 1.10 Campanhas, analytics e operação (FASES 17, 19, 29, 30)

| Recurso | Status |
|---|---|
| Campanhas | 🟡 `campaigns` + `campaign-executor` + `CampaignsTab`. Fluxo existe, sem estimativa prévia nem preview obrigatório |
| Analytics | ✅ `AdvancedAnalytics`, `ConversionFunnel`, `NichePerformanceAnalytics`, `SentimentAnalysis`, `prospecting_stats` |
| Command Center | 🟡 `Dashboard.tsx` com KPIs, `OpportunityRadar`, `HandoffQueue`, `RecentActivity`. Mostra números; **não diz o que fazer** |
| Command Palette (Ctrl+K) | ✅ `CommandPalette.tsx` + busca de leads |
| Agendamento | ✅ `meetings`, `MeetingSettings`, `scheduleMeeting` como tool |
| Tarefas | 🟡 `leads.tasks` (JSONB) — sem tabela própria nem agenda diária |
| Jobs em background | ✅ `background_jobs`, `job-processor`, `job_logs`, `recover_stale_jobs` |
| Cron | ✅ `cron-tasks` + pg_cron |
| Super admin | 🟡 `/admin`, `admin-users`, `admin_notifications` |
| Multi-tenant | 🟡 Isolamento é **por usuário** (`user_id` + RLS) com `teams`/`team_members` por cima. Não há entidade "organização" |

### 1.11 Camada de IA (FASES 21, 23, 24, 20, 22)

| Recurso | Status | Observação |
|---|---|---|
| Provider | 🟡 | DeepSeek primário + fallback Lovable AI. **Mas o fallback só existe em `callAI` do `ai-prospecting`** — `analyze_and_personalize`, `batch_analyze` e `get_best_time` chamam Lovable direto, sem DeepSeek e sem fallback. |
| ♻️ Duplicação de cliente de IA | ♻️ | `_shared/deepseek.ts` existe, e `ai-prospecting` reimplementa o mesmo fetch inline. Dois caminhos, um só mantido. |
| Multi-provider abstrato (FASE 23) | ⬜ | Não existe. |
| Prompt Manager (FASE 21) | ⬜ | Prompts hardcoded em 12+ arquivos. |
| AI Quality Center (FASE 20) | ⬜ | Não existe. |
| AI Playground (FASE 22) | 🔵 | `Diagnostics.tsx` chama `analyze_and_personalize` — é o mais próximo, mas é tela de diagnóstico, não laboratório. |
| Cost Center (FASE 24) | ⬜ | Nenhum registro de tokens/custo/latência. |
| Timeout nas chamadas de IA | 🔴 | `callAI` faz `fetch` **sem `AbortController`**. As fontes de captura têm timeout; a IA não. Uma chamada pendurada trava o item do job. |

### 1.12 Testes (FASE 36)

| Recurso | Status |
|---|---|
| Runner | ✅ vitest + testing-library configurados |
| `agent.test.ts` | ✅ 135 linhas: opt-out, handoff, memória, horário |
| `leads.test.ts` | ✅ 170 linhas: telefone, nome, agregador, peneira |
| Cobertura de geração de mensagem | ⬜ |
| Cobertura de isolamento/RLS | ⬜ |
| Cobertura de scoring | ⬜ |

---

## 2. Problemas ordenados por gravidade

### P0 — corrigir antes de qualquer coisa

| # | Problema | Arquivo | Risco |
|---|---|---|---|
| P0-1 | **Prompt instrui a inventar estatística** (*"pelo menos 1 número concreto"* + exemplos de números fictícios) | `ai-prospecting/index.ts:456,465,488` | Afirmação falsa enviada a empresa real. Risco de reputação e de CDC/LGPD. |
| P0-2 | **Fallback afirma resultado fabricado** (*"já subiu de 3.6 pra 4.7 em 30 dias"*, *"triplica reviews em 60 dias"*) | `job-processor/index.ts:39-47` | Mesmo risco, sem nem passar por IA. |
| P0-3 | **Fallbacks genéricos** (*"Olá! Vi que a X pode crescer mais. Posso ajudar?"*) em 5 pontos | `ai-prospecting:700,717,766,783`, `auto-first-message:56`, `campaign-executor:142` | É exatamente a mensagem que o usuário quer eliminar. Queima o lead e o chip. |
| P0-4 | **Chamada de IA sem timeout** | `ai-prospecting/index.ts:40,67` | Job pendurado, custo sem retorno. |
| P0-5 | **`.env` rastreado no Git** | raiz | Baixo hoje (só anon key), alto no dia que alguém colar uma chave real. |

### P1 — necessário para vender e operar agora

| # | Problema |
|---|---|
| P1-1 | Copywriter recebe 6 campos e ignora `site_audit`, `pain_points`, `service_opportunities`, `company_description`, catálogo `service_intelligence`, histórico |
| P1-2 | Não existe separação **FATO OBSERVADO** × **HIPÓTESE COMERCIAL** |
| P1-3 | Não existe personalization score nem loop de reescrita |
| P1-4 | Não existe supervisor: nada barra mensagem ruim antes do envio |
| P1-5 | Não existe estrategista: a oferta vem de um `<select>`, não de fit com o lead |
| P1-6 | Lead score não explica a nota |
| P1-7 | Não existe nível de autonomia; toda campanha nova já pode disparar automático |
| P1-8 | `analyze_and_personalize` / `batch_analyze` sem fallback de provider |

### P2 — aumentam conversão

Estratégias de abordagem por objetivo · follow-up realmente contextual · A/B medindo
receita · Inbox com score e próxima ação · Command Center prescritivo · ICP Builder ·
Campaign Builder com estimativa e preview obrigatório.

### P3 — escala e diferencial

Prompt Manager versionado · AI Quality Center · Cost Center · Multi-provider abstrato ·
Playground · Organizações multi-tenant · Super admin completo · Pipelines customizáveis.

---

## 3. O que **não** deve ser tocado

Estas peças estão corretas e mexer nelas só cria risco:

- `_shared/auth.ts` — camada de autenticação inteira
- `_shared/agent.ts` — opt-out, handoff, debounce, dedup, portaria
- `_shared/site-audit.ts` — auditoria determinística
- `_shared/leads.ts` / `sources.ts` / `engine.ts` — captura e peneira
- `_shared/chips.ts` + `antiban-queue-processor` — rotação e antiban
- `whatsapp-ai-reply` — prompt e tools do agente conversacional
- Toda a UI de CRM, antiban e analytics já existente

---

## 4. Custos externos mapeados

| Serviço | Uso | Chave | Custo |
|---|---|---|---|
| DeepSeek | Todas as mensagens e análises | Global (`DEEPSEEK_API_KEY`) | Por token — **não medido** |
| Lovable AI Gateway | Fallback + 3 ações diretas | Global | Por token — **não medido** |
| Evolution API | WhatsApp | Global | Por instância |
| Serper / SerpApi | Busca opcional | **Por usuário** | Por consulta |
| Apify | Instagram/Facebook | **Por usuário** | Por execução |
| Hunter.io | E-mail | Global | Por consulta |
| Firecrawl | Scraping | Global | Por página |
| OpenStreetMap / Nominatim | Captura primária | — | Grátis (com etiqueta de uso) |
| ViaCEP / BrasilAPI / RDAP | Enriquecimento | — | Grátis |
| Cakto | Pagamento | Global | % |

**Risco:** nenhum teto de gasto de IA. Um job de 500 leads em modo direto dispara 500
chamadas sem limite configurável.

---

## 5. Veredito

O sistema está muito mais perto do objetivo do que a pergunta sugere. O que falta não é
volume de código — é **ligação e disciplina factual**:

1. Parar de instruir a IA a inventar.
2. Levar até o copywriter o contexto que o sistema já coletou.
3. Colocar um supervisor entre a geração e o envio.

O plano de execução está em `PROSPECT_AI_MASTER_PLAN.md`.

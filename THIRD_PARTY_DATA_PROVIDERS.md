# THIRD_PARTY_DATA_PROVIDERS

Registro das fontes de dados de empresas. Revisão: 2026-08-11.

Estar no GitHub não significa uso comercial irrestrito. Cada linha abaixo separa
**licença do código** de **termos da fonte de dados acessada** — são duas
permissões diferentes, e a segunda é a que costuma ser esquecida.

Classificação: **APPROVED** (integrado) · **REVIEW** (depende de decisão do operador)
· **REJECTED** (não integrar).

---

## Em uso hoje

### 1. OpenStreetMap / Overpass API — APPROVED

| | |
|---|---|
| Uso | Fonte primária de captura (`_shared/sources.ts`) |
| Licença dos dados | ODbL 1.0 |
| Licença de acesso | API pública, sem chave |
| Restrições | Exige atribuição em uso público dos dados; política de uso justo do Overpass |
| Custo | Gratuito |
| Como usamos | Consulta por tag de estabelecimento dentro de bounding box, com `User-Agent` identificando a aplicação |
| Observação | É cadastro estruturado: telefone e site vêm em campo próprio, não raspados de texto. Por isso tem o maior peso de confiança no merge |

### 2. Nominatim (geocoding) — APPROVED

| | |
|---|---|
| Uso | Resolve "Itu - SP" em bounding box |
| Licença | ODbL 1.0 · uso sujeito à política do Nominatim |
| Restrições | Máximo 1 req/s, `User-Agent` obrigatório. **Respeitado** |
| Custo | Gratuito |

### 3. Serper.dev — APPROVED

| | |
|---|---|
| Uso | Google Places, opcional |
| Licença | Serviço comercial, termos do fornecedor |
| Chave | **Do próprio usuário** (`user_settings.serper_api_key`) |
| Custo | Por consulta, pago pelo usuário |

### 4. SerpApi — APPROVED

| | |
|---|---|
| Uso | Google Maps, opcional |
| Licença | Serviço comercial, termos do fornecedor |
| Chave | **Do próprio usuário** (`user_settings.serpapi_api_key`) |
| Custo | Por consulta, pago pelo usuário |

### 5. DuckDuckGo HTML — REVIEW

| | |
|---|---|
| Uso | Complemento de captura |
| Licença | Nenhuma API pública oficial; leitura do HTML |
| Risco | Quebra a cada mudança de layout; os termos do DDG não autorizam raspagem explicitamente |
| Peso no merge | **O mais baixo (0.4)** — o telefone sai de texto livre, não de cadastro |
| Recomendação | Manter como último recurso, e substituir assim que houver provider melhor cobrindo a mesma lacuna |

### 6. ViaCEP / BrasilAPI / RDAP registro.br — APPROVED

| | |
|---|---|
| Uso | Enriquecimento (CEP, CNPJ, DDD, WHOIS de domínio) |
| Licença | APIs públicas brasileiras, uso livre |
| Custo | Gratuito |

---

## Avaliado, ainda não integrado

### omkarcloud/google-maps-scraper — REVIEW

| Item | Verificado em 2026-08-11 |
|---|---|
| Repositório | `https://github.com/omkarcloud/google-maps-scraper` |
| **Licença do código** | **MIT** — permite uso comercial |
| Linguagem | Python (o produto roda Deno/TypeScript em edge functions) |
| Anti-detecção / bypass de CAPTCHA / rotação de proxy | **Não anunciado no README** |
| Custo | Tem camada gratuita (200 buscas/mês) e planos pagos; recursos de enriquecimento exigem chave da Omkar Cloud |
| Atividade | 204 commits; data do último commit não visível na página consultada |

**Por que ainda não foi integrado**

1. **Não roda onde o produto roda.** É Python; as edge functions são Deno. Exige um
   worker separado (container ou VM), com custo e operação próprios.
2. **A licença do código não é a permissão da fonte.** MIT autoriza usar o
   *software*; não autoriza nada em relação aos termos do Google Maps. Essa decisão
   é do operador que hospeda o worker, não do código.
3. **Não verifiquei o comportamento em execução.** A ficha acima veio da leitura do
   README. Antes de marcar APPROVED é preciso confirmar em código que não há
   evasão de bloqueio embutida — se houver, a classificação vira **REJECTED**, sem
   discussão.

**Como está preparado no código**

O contrato `LeadProvider` (`_shared/providers/types.ts`) existe justamente para que
essa fonte entre como adaptador, sem que o resto do sistema saiba de sua existência.
Quando for integrada, ela deve:

- ser ativada **somente** por variável de ambiente apontando para o worker;
- reportar `not_configured` no `healthCheck()` enquanto não houver worker;
- nunca virar dependência obrigatória da busca.

---

## Regra permanente

Não será implementado, em nenhum provider:

- bypass de CAPTCHA;
- evasão de bloqueio;
- rotação de proxy para contornar proteção;
- falsificação de fingerprint;
- qualquer mecanismo anti-detecção.

Provider que dependa disso para funcionar é **REJECTED**. Não é uma questão de
preferência técnica: é o que separa agregação legítima de dados públicos de invasão
de um serviço de terceiro.

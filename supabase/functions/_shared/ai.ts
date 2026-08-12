// ============================================================
// CAMADA DE PROVEDOR DE IA
// ============================================================
// Antes existiam três caminhos para falar com o modelo: `_shared/deepseek.ts`,
// um fetch inline no `ai-prospecting` e chamadas diretas ao gateway Lovable.
// Só um deles tinha fallback, nenhum tinha timeout e ninguém media custo.
//
// Uma chamada de IA sem timeout é pior do que uma que falha: o item do job
// fica pendurado até a function morrer por tempo, e o usuário vê a barra
// parada sem erro nenhum.
//
// Aqui há um caminho só, com quatro papéis de modelo, timeout, retry com
// respeito ao 429 e contabilidade de uso.

export type ModelRole = "primary" | "fast" | "cheap" | "fallback";

export interface AIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  /**
   * Chamadas de ferramenta que o modelo pediu na rodada anterior.
   *
   * Precisa voltar na mensagem do assistente na rodada seguinte: a API
   * rejeita uma mensagem `role: "tool"` que não responda a nenhuma chamada
   * declarada. Sem este campo, todo agente que usa ferramenta era obrigado a
   * falar com o provedor por fora — e ficava sem fallback e sem registro de
   * custo, que é exatamente o que esta camada existe para dar.
   */
  tool_calls?: unknown[];
}

export interface AICallOptions {
  messages: AIMessage[];
  /** Qual papel de modelo usar. `fast` para tarefas mecânicas, `primary` para copy. */
  role?: ModelRole;
  temperature?: number;
  max_tokens?: number;
  /** Força resposta em JSON quando o provedor suporta. */
  json?: boolean;
  tools?: unknown[];
  tool_choice?: string | object;
  timeoutMs?: number;
  /** Só para rotular o consumo no `ai_usage`. */
  purpose?: string;
}

export interface AIUsage {
  provider: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  latency_ms: number;
  /** Estimativa em USD. Aproximada — serve para orçamento, não para faturar. */
  cost_usd: number;
}

export interface AIResult {
  text: string;
  raw: Record<string, unknown>;
  usage: AIUsage;
}

// ------------------------------------------------------------
// PROVEDORES
// ------------------------------------------------------------

interface Provider {
  name: string;
  url: string;
  keyEnv: string;
  models: Record<ModelRole, string>;
  /** USD por 1M tokens: [entrada, saída]. */
  price: Record<string, [number, number]>;
}

/**
 * Modelo da OpenAI, configurável por secret.
 *
 * O nome fica em variável de ambiente de propósito. Nome de modelo é a coisa
 * que mais muda nesta indústria — fixar no código significa que trocar de
 * modelo exige alterar arquivo, revisar, publicar e torcer. Com secret, é um
 * campo no painel.
 *
 * O padrão precisa ser um modelo que exista em qualquer conta. Quem quiser o
 * mais novo cadastra `OPENAI_MODEL` e pronto.
 */
function openaiModel(role: ModelRole): string {
  const porPapel: Record<ModelRole, string> = {
    primary: envKey("OPENAI_MODEL") ?? "gpt-4.1",
    fast: envKey("OPENAI_MODEL_FAST") ?? envKey("OPENAI_MODEL") ?? "gpt-4.1-mini",
    cheap: envKey("OPENAI_MODEL_CHEAP") ?? "gpt-4.1-mini",
    fallback: envKey("OPENAI_MODEL_FAST") ?? "gpt-4.1-mini",
  };
  return porPapel[role];
}

/**
 * Modelos de raciocínio recusam `temperature` e trocaram `max_tokens` por
 * `max_completion_tokens`. Mandar o campo errado devolve 400 — e um 400 aqui
 * derruba a resposta ao cliente inteira, não só uma chamada.
 *
 * Confirmado contra a API: `gpt-5.4-mini` responde
 * "Unsupported parameter: 'max_tokens' is not supported with this model"
 * ao formato antigo, e aceita o novo.
 *
 * As variantes `-chat-` da família 5 são as não-raciocínio e aceitam
 * `temperature` normalmente — por isso a exceção no meio da regra.
 */
export function ehRaciocinio(model: string): boolean {
  if (/-chat(-|$)/i.test(model)) return false;
  return /^(o[1-9]|gpt-5)/i.test(model);
}

export const PROVIDERS: Provider[] = [
  {
    name: "openai",
    url: "https://api.openai.com/v1/chat/completions",
    keyEnv: "OPENAI_API_KEY",
    // Preenchido em tempo de chamada por `openaiModel`; o mapa fixo aqui é só
    // o que aparece nos logs quando nada foi configurado.
    models: {
      primary: "gpt-4o",
      fast: "gpt-4o-mini",
      cheap: "gpt-4o-mini",
      fallback: "gpt-4o-mini",
    },
    // USD por 1M de tokens: [entrada, saída].
    price: {
      "gpt-4o": [2.5, 10],
      "gpt-4o-mini": [0.15, 0.6],
      "gpt-4.1": [2, 8],
      "gpt-4.1-mini": [0.4, 1.6],
      "gpt-4.1-nano": [0.1, 0.4],
      "o4-mini": [1.1, 4.4],
    },
  },
  {
    name: "deepseek",
    url: "https://api.deepseek.com/v1/chat/completions",
    keyEnv: "DEEPSEEK_API_KEY",
    models: {
      primary: "deepseek-chat",
      fast: "deepseek-chat",
      cheap: "deepseek-chat",
      fallback: "deepseek-chat",
    },
    price: { "deepseek-chat": [0.27, 1.1] },
  },
  {
    name: "lovable",
    url: "https://ai.gateway.lovable.dev/v1/chat/completions",
    keyEnv: "LOVABLE_API_KEY",
    models: {
      primary: "deepseek-chat",
      fast: "deepseek-chat",
      cheap: "deepseek-chat",
      fallback: "deepseek-chat",
    },
    price: { "deepseek-chat": [0.27, 1.1] },
  },
];

const DEFAULT_TIMEOUT_MS = 45_000;
const MAX_ATTEMPTS_PER_PROVIDER = 3;

function envKey(name: string): string | null {
  try {
    // deno-lint-ignore no-explicit-any
    const key = (globalThis as any).Deno?.env?.get(name);
    return key && String(key).length > 0 ? String(key) : null;
  } catch {
    // Sem permissão de env (ambiente de teste) — o provedor apenas não existe.
    return null;
  }
}

/**
 * Preço de um modelo que a tabela não conhece.
 *
 * Zero seria a resposta cômoda e é a errada: o teto de gasto diário compara
 * custo acumulado com um limite, e custo sempre zero faz o teto NUNCA fechar.
 * Ou seja, cadastrar um modelo novo em `OPENAI_MODEL` desligaria em silêncio
 * a única proteção contra uma conta de IA fora de controle.
 *
 * Estes valores são deliberadamente altos: superestimar faz o teto fechar
 * cedo demais, o que custa uma pausa. Subestimar custa dinheiro real.
 */
export const PRECO_DESCONHECIDO: [number, number] = [5, 20];

export function estimateCost(provider: Provider, model: string, inTok: number, outTok: number): number {
  const price = provider.price[model];

  if (!price) {
    console.warn(
      `[ai] modelo "${model}" não está na tabela de preços de ${provider.name}. ` +
      `Cobrando pelo teto (${PRECO_DESCONHECIDO[0]}/${PRECO_DESCONHECIDO[1]} por 1M) ` +
      `para o limite diário continuar valendo.`,
    );
    return (inTok / 1_000_000) * PRECO_DESCONHECIDO[0] + (outTok / 1_000_000) * PRECO_DESCONHECIDO[1];
  }

  return (inTok / 1_000_000) * price[0] + (outTok / 1_000_000) * price[1];
}

/** Espera com teto, respeitando o "Retry after XXXms" quando o provedor manda. */
function backoffMs(attempt: number, body: string): number {
  const hinted = body.match(/retry[- ]after[^0-9]{0,6}(\d+)\s*ms/i)?.[1];
  if (hinted) return Math.min(Number(hinted) + 500, 30_000);
  return Math.min(1_500 * 2 ** (attempt - 1), 20_000);
}

class AIUnavailable extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AIUnavailable";
  }
}

async function callProvider(
  provider: Provider,
  apiKey: string,
  opts: AICallOptions,
): Promise<AIResult> {
  const role = opts.role ?? "primary";
  const model = provider.name === "openai" ? openaiModel(role) : provider.models[role];
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const raciocinio = provider.name === "openai" && ehRaciocinio(model);

  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
  };

  if (raciocinio) {
    // Estes modelos escolhem a própria temperatura e recusam o campo. Também
    // gastam tokens pensando antes de responder, então o teto precisa de
    // folga — senão a resposta vem truncada no meio.
    body.max_completion_tokens = (opts.max_tokens ?? 1_200) * 4;
  } else {
    body.temperature = opts.temperature ?? 0.7;
    body.max_tokens = opts.max_tokens ?? 1_200;
  }
  if (opts.json) body.response_format = { type: "json_object" };
  if (opts.tools) {
    body.tools = opts.tools;
    body.tool_choice = opts.tool_choice ?? "auto";
  }

  let lastError = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROVIDER; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startedAt = Date.now();

    try {
      const res = await fetch(provider.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      const latency = Date.now() - startedAt;

      if (res.ok) {
        const data = await res.json();
        const usage = data.usage ?? {};
        const inTok = Number(usage.prompt_tokens ?? 0);
        const outTok = Number(usage.completion_tokens ?? 0);

        return {
          text: data.choices?.[0]?.message?.content ?? "",
          raw: data,
          usage: {
            provider: provider.name,
            model,
            prompt_tokens: inTok,
            completion_tokens: outTok,
            latency_ms: latency,
            cost_usd: estimateCost(provider, model, inTok, outTok),
          },
        };
      }

      lastError = `HTTP ${res.status}: ${(await res.text()).slice(0, 400)}`;

      // 402 (crédito) e 401 (chave) não melhoram com retry — troca de provedor.
      if (res.status === 401 || res.status === 402 || res.status === 403) {
        throw new AIUnavailable(`${provider.name} ${lastError}`);
      }

      const retriable = res.status === 429 || res.status >= 500;
      if (!retriable || attempt === MAX_ATTEMPTS_PER_PROVIDER) break;

      await new Promise((r) => setTimeout(r, backoffMs(attempt, lastError)));
    } catch (e) {
      if (e instanceof AIUnavailable) throw e;

      const aborted = e instanceof Error && e.name === "AbortError";
      lastError = aborted ? `timeout após ${timeoutMs}ms` : String(e);
      if (attempt === MAX_ATTEMPTS_PER_PROVIDER) break;
      await new Promise((r) => setTimeout(r, backoffMs(attempt, "")));
    } finally {
      clearTimeout(timer);
    }
  }

  throw new AIUnavailable(`${provider.name}: ${lastError}`);
}

/**
 * Chama o modelo. Percorre os provedores configurados na ordem até um
 * responder. Se nenhum responder, lança — quem chama decide o que fazer,
 * e a decisão certa quase nunca é "manda um texto genérico assim mesmo".
 */
export async function callAI(opts: AICallOptions): Promise<AIResult> {
  const available = PROVIDERS
    .map((p) => ({ provider: p, key: envKey(p.keyEnv) }))
    .filter((x): x is { provider: Provider; key: string } => x.key !== null);

  if (available.length === 0) {
    throw new AIUnavailable(
      "Nenhum provedor de IA configurado. Cadastre OPENAI_API_KEY, DEEPSEEK_API_KEY " +
      "ou LOVABLE_API_KEY nos secrets das edge functions.",
    );
  }

  const failures: string[] = [];

  for (const { provider, key } of available) {
    try {
      return await callProvider(provider, key, opts);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[ai] ${provider.name} falhou: ${msg}`);
      failures.push(msg);
    }
  }

  throw new AIUnavailable(`Todos os provedores falharam. ${failures.join(" | ")}`);
}

/** Atalho para completar texto simples. */
export async function complete(
  systemPrompt: string,
  userPrompt: string,
  opts: Omit<AICallOptions, "messages"> = {},
): Promise<AIResult> {
  return await callAI({
    ...opts,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
}

/**
 * Completa esperando JSON de volta.
 *
 * O modelo às vezes embrulha em ```json apesar do response_format, então a
 * extração tolera isso em vez de estourar.
 */
export async function completeJson<T>(
  systemPrompt: string,
  userPrompt: string,
  opts: Omit<AICallOptions, "messages" | "json"> = {},
): Promise<{ data: T; usage: AIUsage }> {
  const result = await complete(systemPrompt, userPrompt, { ...opts, json: true });
  const cleaned = result.text.replace(/```json\s*|\s*```/g, "").trim();
  const match = cleaned.match(/[{[][\s\S]*[}\]]/);
  if (!match) throw new Error("A IA não devolveu JSON válido.");
  return { data: JSON.parse(match[0]) as T, usage: result.usage };
}

// ------------------------------------------------------------
// CONTABILIDADE
// ------------------------------------------------------------

type MinimalClient = { from: (table: string) => { insert: (row: unknown) => Promise<unknown> } };

/**
 * Registra o consumo. Nunca derruba a operação: perder uma linha de
 * telemetria é barato, perder a mensagem do cliente não é.
 */
export async function recordUsage(
  supabase: MinimalClient,
  params: {
    userId: string;
    usage: AIUsage;
    purpose: string;
    missionId?: string | null;
    leadId?: string | null;
    agent?: string | null;
  },
): Promise<void> {
  try {
    await supabase.from("ai_usage").insert({
      user_id: params.userId,
      mission_id: params.missionId ?? null,
      lead_id: params.leadId ?? null,
      agent: params.agent ?? null,
      purpose: params.purpose,
      provider: params.usage.provider,
      model: params.usage.model,
      prompt_tokens: params.usage.prompt_tokens,
      completion_tokens: params.usage.completion_tokens,
      latency_ms: params.usage.latency_ms,
      cost_usd: params.usage.cost_usd,
    });
  } catch (e) {
    console.error("[ai] não foi possível registrar consumo:", e);
  }
}

export { AIUnavailable };

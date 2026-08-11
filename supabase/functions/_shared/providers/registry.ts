// ============================================================
// PROVIDER REGISTRY
// ============================================================
// O motor antigo chamava cada fonte pelo nome: OSM, depois Serper, depois
// um laço de DuckDuckGo. Acrescentar a quarta fonte significava mexer no
// motor, e quando uma caía quem decidia o que fazer era um `if` escrito à
// mão — sem memória de que aquela fonte já vinha falhando desde ontem.
//
// Aqui as fontes são plugins com contrato, e o registry guarda como cada
// uma vem se comportando. Fonte que falha várias vezes seguidas é desligada
// sozinha por um tempo, em vez de continuar sendo chamada e gastando os 20
// segundos de timeout de todo mundo.

import type {
  LeadProvider, ProviderHealth, ProviderResult, ProviderState,
  SearchBudget, SearchQuery,
} from "./types.ts";
import { DEFAULT_BUDGET } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

/** Falhas seguidas até abrir o disjuntor. */
const FAILURES_TO_OPEN = 3;
/** Quanto tempo a fonte fica de fora antes de uma nova tentativa. */
const CIRCUIT_OPEN_MS = 10 * 60 * 1000;

export class ProviderRegistry {
  private providers = new Map<string, LeadProvider>();
  private states = new Map<string, ProviderState>();

  constructor(private supabase: Supa | null = null) {}

  register(provider: LeadProvider): this {
    this.providers.set(provider.id, provider);
    return this;
  }

  get(id: string): LeadProvider | undefined {
    return this.providers.get(id);
  }

  all(): LeadProvider[] {
    return [...this.providers.values()];
  }

  /**
   * Carrega o estado operacional do banco. Sem banco (teste, prévia), cada
   * provider começa saudável — a memória de falha é otimização, não regra.
   */
  async loadStates(): Promise<void> {
    if (!this.supabase) return;

    const { data, error } = await this.supabase
      .from("provider_states")
      .select("*");

    if (error) {
      console.error("[registry] não foi possível ler o estado dos providers:", error.message);
      return;
    }

    for (const row of data ?? []) {
      this.states.set(row.provider_id, row as ProviderState);
    }
  }

  private stateOf(id: string): ProviderState {
    const existing = this.states.get(id);
    if (existing) return existing;

    const provider = this.providers.get(id);
    const fresh: ProviderState = {
      provider_id: id,
      enabled: true,
      health: "healthy",
      priority: provider?.priority ?? 100,
      consecutive_failures: 0,
      circuit_open_until: null,
      last_run_at: null,
      last_error: null,
      total_runs: 0,
      total_found: 0,
      total_unique: 0,
      avg_latency_ms: 0,
    };
    this.states.set(id, fresh);
    return fresh;
  }

  /** O disjuntor está aberto para esta fonte agora? */
  private isCircuitOpen(state: ProviderState): boolean {
    if (!state.circuit_open_until) return false;
    return new Date(state.circuit_open_until).getTime() > Date.now();
  }

  /**
   * Quem pode rodar nesta busca, na ordem certa.
   *
   * A ordem importa de verdade: fonte estruturada primeiro significa que o
   * telefone bom entra antes, e no merge o dado raspado de texto livre não
   * consegue sobrescrevê-lo.
   */
  selectFor(budget: SearchBudget): { provider: LeadProvider; state: ProviderState }[] {
    const eligible: { provider: LeadProvider; state: ProviderState }[] = [];

    for (const provider of this.providers.values()) {
      const state = this.stateOf(provider.id);

      if (!state.enabled) continue;
      if (this.isCircuitOpen(state)) continue;
      if (state.health === "offline" || state.health === "not_configured") continue;

      eligible.push({ provider, state });
    }

    // Prioridade configurada primeiro; empate resolvido por quem entrega mais
    // empresa única historicamente — o que a fonte agrega, não o que ela acha.
    eligible.sort((a, b) => {
      if (a.state.priority !== b.state.priority) return a.state.priority - b.state.priority;
      return uniqueRate(b.state) - uniqueRate(a.state);
    });

    return eligible.slice(0, budget.maxProviders);
  }

  /**
   * Roda uma fonte com timeout próprio.
   *
   * O timeout vive aqui, e não dentro de cada provider, porque um provider
   * que esquece de implementá-lo travaria a busca inteira — e a regra
   * "nenhuma fonte lenta bloqueia as outras" não pode depender da disciplina
   * de quem escreveu o adaptador.
   */
  async run(provider: LeadProvider, query: SearchQuery): Promise<ProviderResult> {
    const startedAt = Date.now();

    try {
      const result = await Promise.race([
        provider.search(query),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`timeout após ${provider.timeoutMs}ms`)),
            provider.timeoutMs,
          )
        ),
      ]);

      await this.recordSuccess(provider.id, result.businesses.length, Date.now() - startedAt);
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await this.recordFailure(provider.id, message);

      return {
        providerId: provider.id,
        businesses: [],
        error: message,
        durationMs: Date.now() - startedAt,
      };
    }
  }

  private async recordSuccess(id: string, found: number, latencyMs: number): Promise<void> {
    const state = this.stateOf(id);

    state.consecutive_failures = 0;
    state.circuit_open_until = null;
    state.health = "healthy";
    state.last_run_at = new Date().toISOString();
    state.last_error = null;
    state.total_runs += 1;
    state.total_found += found;
    // Média móvel: uma execução lenta não deve apagar o histórico inteiro,
    // mas também não pode demorar cem execuções para aparecer.
    state.avg_latency_ms = state.avg_latency_ms === 0
      ? latencyMs
      : Math.round(state.avg_latency_ms * 0.8 + latencyMs * 0.2);

    await this.persist(state);
  }

  private async recordFailure(id: string, error: string): Promise<void> {
    const state = this.stateOf(id);

    state.consecutive_failures += 1;
    state.last_run_at = new Date().toISOString();
    state.last_error = error.slice(0, 400);
    state.total_runs += 1;

    if (state.consecutive_failures >= FAILURES_TO_OPEN) {
      state.health = "offline";
      state.circuit_open_until = new Date(Date.now() + CIRCUIT_OPEN_MS).toISOString();
      console.warn(`[registry] ${id} desligado por ${CIRCUIT_OPEN_MS / 60000}min: ${error}`);
    } else {
      state.health = "degraded";
    }

    await this.persist(state);
  }

  /** Quantas empresas ÚNICAS a fonte agregou — o número que realmente importa. */
  async recordUnique(id: string, unique: number): Promise<void> {
    const state = this.stateOf(id);
    state.total_unique += unique;
    await this.persist(state);
  }

  private async persist(state: ProviderState): Promise<void> {
    if (!this.supabase) return;

    try {
      await this.supabase
        .from("provider_states")
        .upsert(state, { onConflict: "provider_id" });
    } catch (e) {
      // Telemetria de provider não pode derrubar uma busca.
      console.error("[registry] falha ao gravar estado:", e);
    }
  }

  /** Checa a saúde de todas as fontes. Usado pelo painel de Super Admin. */
  async healthCheckAll(): Promise<
    { id: string; label: string; status: ProviderHealth; detail?: string; state: ProviderState }[]
  > {
    const results = await Promise.all(
      this.all().map(async (provider) => {
        const state = this.stateOf(provider.id);
        try {
          const health = await provider.healthCheck();
          // O disjuntor tem a palavra final: uma fonte pode estar configurada
          // e mesmo assim estar fora por ter falhado demais.
          const status = this.isCircuitOpen(state) ? "offline" : health.status;
          return { id: provider.id, label: provider.label, status, detail: health.detail, state };
        } catch (e) {
          return {
            id: provider.id,
            label: provider.label,
            status: "offline" as ProviderHealth,
            detail: e instanceof Error ? e.message : String(e),
            state,
          };
        }
      }),
    );

    return results;
  }
}

/** Proporção de empresas únicas que a fonte agregou sobre o que ela achou. */
function uniqueRate(state: ProviderState): number {
  if (state.total_found === 0) return 0.5; // sem histórico, nem premia nem pune
  return state.total_unique / state.total_found;
}

/**
 * Nota de qualidade da fonte, para o painel.
 *
 * Cobertura (quanto acha), precisão (quanto do que acha é novo),
 * confiabilidade (quanto não falha) e latência.
 */
export function providerScore(state: ProviderState): {
  coverage: number;
  accuracy: number;
  reliability: number;
  latency: number;
  overall: number;
} {
  const runs = Math.max(1, state.total_runs);

  const coverage = Math.min(100, Math.round((state.total_found / runs) * 2));
  const accuracy = Math.round(uniqueRate(state) * 100);
  const reliability = Math.max(0, 100 - state.consecutive_failures * 25);
  // 3s ou menos é ótimo; 30s ou mais é ruim.
  const latency = state.avg_latency_ms === 0
    ? 50
    : Math.max(0, Math.min(100, Math.round(100 - (state.avg_latency_ms - 3_000) / 270)));

  return {
    coverage,
    accuracy,
    reliability,
    latency,
    overall: Math.round(coverage * 0.3 + accuracy * 0.3 + reliability * 0.3 + latency * 0.1),
  };
}

export { DEFAULT_BUDGET };

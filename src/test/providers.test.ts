import { describe, it, expect } from 'vitest';
import { ProviderRegistry, providerScore } from '../../supabase/functions/_shared/providers/registry';
import { expandQuery, suggestExpansion } from '../../supabase/functions/_shared/providers/search';
import { normalizeBusiness } from '../../supabase/functions/_shared/providers/entity-resolution';
import type {
  LeadProvider, NormalizedBusiness, ProviderHealth, ProviderResult,
  ProviderState, RawBusiness, SearchQuery,
} from '../../supabase/functions/_shared/providers/types';
import { DEFAULT_BUDGET } from '../../supabase/functions/_shared/providers/types';

/** Provider de teste com comportamento controlável. */
class FakeProvider implements LeadProvider {
  readonly capabilities = ['search'] as never;
  calls = 0;

  constructor(
    readonly id: string,
    readonly label: string,
    readonly priority: number,
    private behavior: 'ok' | 'fail' | 'hang',
    private results: RawBusiness[] = [],
    readonly timeoutMs = 200,
  ) {}

  healthCheck(): Promise<{ status: ProviderHealth; detail?: string }> {
    return Promise.resolve({ status: 'healthy' });
  }

  async search(_query: SearchQuery): Promise<ProviderResult> {
    this.calls++;
    if (this.behavior === 'fail') throw new Error('fonte fora do ar');
    if (this.behavior === 'hang') {
      await new Promise((r) => setTimeout(r, 5_000));
    }
    return { providerId: this.id, businesses: this.results, durationMs: 1 };
  }

  normalize(raw: RawBusiness): NormalizedBusiness {
    return normalizeBusiness(raw, this.id);
  }
}

const emptyQuery: SearchQuery = { term: 'clínicas de estética', location: 'Itu - SP', limit: 50 };

describe('ProviderRegistry — seleção e ordem', () => {
  it('roda a fonte estruturada antes da fonte de texto livre', () => {
    const registry = new ProviderRegistry();
    registry.register(new FakeProvider('web', 'Web', 90, 'ok'));
    registry.register(new FakeProvider('osm', 'OSM', 10, 'ok'));

    const selected = registry.selectFor(DEFAULT_BUDGET);
    expect(selected.map((s) => s.provider.id)).toEqual(['osm', 'web']);
  });

  it('respeita o teto de providers do orçamento', () => {
    const registry = new ProviderRegistry();
    for (let i = 0; i < 8; i++) {
      registry.register(new FakeProvider(`p${i}`, `P${i}`, i, 'ok'));
    }
    expect(registry.selectFor({ ...DEFAULT_BUDGET, maxProviders: 3 })).toHaveLength(3);
  });
});

describe('ProviderRegistry — falha isolada', () => {
  it('devolve erro sem lançar, para as outras fontes seguirem', async () => {
    const registry = new ProviderRegistry();
    const quebrada = new FakeProvider('quebrada', 'Quebrada', 10, 'fail');
    registry.register(quebrada);

    const result = await registry.run(quebrada, emptyQuery);
    expect(result.businesses).toHaveLength(0);
    expect(result.error).toMatch(/fora do ar/);
  });

  it('corta a fonte lenta no timeout em vez de segurar a busca', async () => {
    const registry = new ProviderRegistry();
    const lenta = new FakeProvider('lenta', 'Lenta', 10, 'hang', [], 100);
    registry.register(lenta);

    const startedAt = Date.now();
    const result = await registry.run(lenta, emptyQuery);
    const elapsed = Date.now() - startedAt;

    expect(result.error).toMatch(/timeout/);
    // Cortou no timeout, não esperou os 5s do provider.
    expect(elapsed).toBeLessThan(1_000);
  });

  it('abre o disjuntor após falhas seguidas e para de chamar a fonte', async () => {
    const registry = new ProviderRegistry();
    const quebrada = new FakeProvider('quebrada', 'Quebrada', 10, 'fail');
    const boa = new FakeProvider('boa', 'Boa', 20, 'ok');
    registry.register(quebrada);
    registry.register(boa);

    // Três falhas seguidas é o limite.
    await registry.run(quebrada, emptyQuery);
    await registry.run(quebrada, emptyQuery);
    expect(registry.selectFor(DEFAULT_BUDGET).map((s) => s.provider.id)).toContain('quebrada');

    await registry.run(quebrada, emptyQuery);

    const selected = registry.selectFor(DEFAULT_BUDGET).map((s) => s.provider.id);
    expect(selected).not.toContain('quebrada');
    expect(selected).toContain('boa');
  });

  it('uma execução bem-sucedida zera o contador de falhas', async () => {
    const registry = new ProviderRegistry();
    const instavel = new FakeProvider('instavel', 'Instável', 10, 'fail');
    registry.register(instavel);

    await registry.run(instavel, emptyQuery);
    await registry.run(instavel, emptyQuery);

    // Passa a funcionar.
    (instavel as unknown as { behavior: string }).behavior = 'ok';
    await registry.run(instavel, emptyQuery);

    // Mais duas falhas não deveriam abrir o disjuntor: o contador reiniciou.
    (instavel as unknown as { behavior: string }).behavior = 'fail';
    await registry.run(instavel, emptyQuery);
    await registry.run(instavel, emptyQuery);

    expect(registry.selectFor(DEFAULT_BUDGET).map((s) => s.provider.id)).toContain('instavel');
  });
});

describe('healthCheckAll', () => {
  it('reporta cada fonte com o estado atual', async () => {
    const registry = new ProviderRegistry();
    registry.register(new FakeProvider('a', 'Fonte A', 10, 'ok'));
    registry.register(new FakeProvider('b', 'Fonte B', 20, 'ok'));

    const health = await registry.healthCheckAll();
    expect(health).toHaveLength(2);
    expect(health.every((h) => h.status === 'healthy')).toBe(true);
  });

  it('o disjuntor tem a palavra final sobre a saúde declarada', async () => {
    const registry = new ProviderRegistry();
    const quebrada = new FakeProvider('quebrada', 'Quebrada', 10, 'fail');
    registry.register(quebrada);

    for (let i = 0; i < 3; i++) await registry.run(quebrada, emptyQuery);

    const health = await registry.healthCheckAll();
    // O provider se declara healthy; o histórico diz o contrário.
    expect(health[0].status).toBe('offline');
  });
});

describe('providerScore', () => {
  const base: ProviderState = {
    provider_id: 'x', enabled: true, health: 'healthy', priority: 10,
    consecutive_failures: 0, circuit_open_until: null, last_run_at: null,
    last_error: null, total_runs: 10, total_found: 1000, total_unique: 800,
    avg_latency_ms: 3000,
  };

  it('premia a fonte que agrega empresa única, não a que acha muito', () => {
    const agrega = providerScore({ ...base, total_found: 100, total_unique: 90 });
    const repete = providerScore({ ...base, total_found: 1000, total_unique: 50 });
    expect(agrega.accuracy).toBeGreaterThan(repete.accuracy);
  });

  it('penaliza fonte que vem falhando', () => {
    const estavel = providerScore(base);
    const instavel = providerScore({ ...base, consecutive_failures: 3 });
    expect(instavel.reliability).toBeLessThan(estavel.reliability);
  });

  it('não pune fonte sem histórico', () => {
    const nova = providerScore({ ...base, total_runs: 0, total_found: 0, total_unique: 0, avg_latency_ms: 0 });
    expect(nova.overall).toBeGreaterThan(0);
  });
});

describe('expandQuery', () => {
  it('gera variações do nicho sem repetir o termo original', () => {
    const variants = expandQuery('clínica de estética');
    expect(variants.length).toBeGreaterThan(0);
    expect(variants).not.toContain('clínica de estética');
  });

  it('devolve vazio para nicho sem sinônimo mapeado', () => {
    expect(expandQuery('fabricante de parafusos náuticos')).toHaveLength(0);
  });
});

describe('suggestExpansion — nunca amplia em silêncio', () => {
  it('sugere quando o resultado é magro', () => {
    const s = suggestExpansion({ term: 'clínica de estética', location: 'Itu - SP', limit: 50 }, 3);
    expect(s.shouldSuggest).toBe(true);
    expect(s.suggestion).toBeTruthy();
    expect(s.reason).toMatch(/3 empresa/);
  });

  it('não sugere nada quando o resultado é suficiente', () => {
    const s = suggestExpansion({ term: 'clínica de estética', location: 'Itu - SP', limit: 50 }, 120);
    expect(s.shouldSuggest).toBe(false);
    expect(s.suggestion).toBeNull();
  });
});

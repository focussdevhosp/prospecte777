import { describe, it, expect } from 'vitest';
import {
  PROVIDERS,
  PRECO_DESCONHECIDO,
  ehRaciocinio,
  estimateCost,
} from '../../supabase/functions/_shared/ai';

const openai = PROVIDERS.find((p) => p.name === 'openai')!;

describe('ordem dos provedores', () => {
  it('OpenAI vem primeiro', () => {
    // A ordem do array é a ordem de tentativa. Quem cadastrar as três chaves
    // usa OpenAI e cai para as outras só quando ela não responde.
    expect(PROVIDERS[0].name).toBe('openai');
  });

  it('os três continuam disponíveis', () => {
    expect(PROVIDERS.map((p) => p.name)).toEqual(['openai', 'deepseek', 'lovable']);
  });

  it('cada provedor declara qual secret o habilita', () => {
    for (const p of PROVIDERS) {
      expect(p.keyEnv, p.name).toMatch(/_API_KEY$/);
      expect(p.url, p.name).toMatch(/^https:\/\//);
    }
  });

  it('todo provedor cobre os quatro papéis', () => {
    // Um papel faltando viraria `undefined` no campo `model` da requisição, e
    // o provedor responderia 400 só naquele caminho específico.
    for (const p of PROVIDERS) {
      for (const papel of ['primary', 'fast', 'cheap', 'fallback'] as const) {
        expect(p.models[papel], `${p.name}.${papel}`).toBeTruthy();
      }
    }
  });
});

describe('modelo de raciocínio', () => {
  it('reconhece as famílias que recusam temperature', () => {
    // Mandar `temperature` para esses modelos devolve 400 — e um 400 aqui
    // derruba a resposta ao cliente inteira.
    for (const m of ['o1', 'o1-mini', 'o3', 'o3-mini', 'o4-mini', 'gpt-5', 'gpt-5-mini']) {
      expect(ehRaciocinio(m), m).toBe(true);
    }
  });

  it('não confunde os modelos comuns', () => {
    for (const m of ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-nano', 'deepseek-chat']) {
      expect(ehRaciocinio(m), m).toBe(false);
    }
  });

  it('as variantes -chat- da família 5 aceitam temperature', () => {
    // Elas são as NÃO-raciocínio da família e recebem `temperature` normal.
    // Sem esta exceção, a regra pelo prefixo as trataria como raciocínio e o
    // produto perderia o controle de variação de texto sem precisar.
    for (const m of ['gpt-5-chat-latest', 'gpt-5.2-chat-latest', 'gpt-5.4-chat-latest']) {
      expect(ehRaciocinio(m), m).toBe(false);
    }
  });

  it('confirmado contra a API: gpt-5.4-mini é raciocínio', () => {
    // A API respondeu "Unsupported parameter: 'max_tokens' is not supported
    // with this model" ao formato antigo. Este teste guarda o caso real.
    expect(ehRaciocinio('gpt-5.4-mini')).toBe(true);
    expect(ehRaciocinio('gpt-5.5')).toBe(true);
  });

  it('não se confunde com maiúsculas', () => {
    expect(ehRaciocinio('O3-MINI')).toBe(true);
    expect(ehRaciocinio('GPT-4O')).toBe(false);
  });
});

describe('custo', () => {
  it('cobra o preço da tabela quando conhece o modelo', () => {
    // 1M de entrada e 1M de saída em gpt-4o = 2.5 + 10.
    expect(estimateCost(openai, 'gpt-4o', 1_000_000, 1_000_000)).toBeCloseTo(12.5, 4);
  });

  it('modelo desconhecido NUNCA custa zero', () => {
    // É a regra que protege o teto de gasto. Custo zero faria o limite diário
    // nunca fechar, e cadastrar um modelo novo em OPENAI_MODEL desligaria em
    // silêncio a única proteção contra uma conta de IA fora de controle.
    const custo = estimateCost(openai, 'modelo-que-ainda-nao-existe', 500_000, 500_000);
    expect(custo).toBeGreaterThan(0);
  });

  it('modelo desconhecido é cobrado por cima, não por baixo', () => {
    // Superestimar custa uma pausa. Subestimar custa dinheiro real.
    const desconhecido = estimateCost(openai, 'modelo-novo', 1_000_000, 1_000_000);
    const maisCaroConhecido = Math.max(
      ...Object.values(openai.price).map(([e, s]) => e + s),
    );
    expect(desconhecido).toBeGreaterThanOrEqual(maisCaroConhecido);
    expect(desconhecido).toBe(PRECO_DESCONHECIDO[0] + PRECO_DESCONHECIDO[1]);
  });

  it('zero token custa zero', () => {
    expect(estimateCost(openai, 'gpt-4o', 0, 0)).toBe(0);
    expect(estimateCost(openai, 'inexistente', 0, 0)).toBe(0);
  });

  it('saída custa mais que entrada em todos os modelos da tabela', () => {
    // Se algum par vier invertido, o orçamento erra justamente onde o gasto
    // se concentra: geração é o que este produto mais faz.
    for (const p of PROVIDERS) {
      for (const [modelo, [entrada, saida]] of Object.entries(p.price)) {
        expect(saida, `${p.name}/${modelo}`).toBeGreaterThan(entrada);
      }
    }
  });
});

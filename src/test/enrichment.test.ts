import { describe, it, expect, vi } from 'vitest';
import {
  waterfall,
  orderSources,
  isUsable,
  DEFAULT_MIN_CONFIDENCE,
  type EnrichmentSource,
  type EnrichTarget,
} from '../../supabase/functions/_shared/providers/enrichment';

const alvo: EnrichTarget = {
  businessName: 'Clínica Bella Itu',
  domain: 'bellaitu.com.br',
  city: 'Itu',
};

function fonte(
  id: string,
  cost: number,
  accuracy: number,
  resultado: { value: string; confidence: number } | null,
): EnrichmentSource {
  return {
    id,
    field: 'email',
    cost,
    accuracy,
    run: vi.fn(async () => (resultado ? { ...resultado, how: `via ${id}` } : null)),
  };
}

describe('orderSources — grátis antes de pago', () => {
  it('ordena por custo e desempata por acerto', () => {
    const ordem = orderSources([
      fonte('paga-boa', 10, 90, null),
      fonte('gratis-fraca', 0, 40, null),
      fonte('gratis-boa', 0, 70, null),
      fonte('paga-cara', 30, 95, null),
    ]).map(f => f.id);

    // Uma dedução validada por DNS custa zero e acerta em boa parte dos
    // casos. Consultar a API paga antes dela é pagar por um dado que já
    // estava ao alcance.
    expect(ordem).toEqual(['gratis-boa', 'gratis-fraca', 'paga-boa', 'paga-cara']);
  });
});

describe('waterfall — para no primeiro ACEITÁVEL', () => {
  it('não consulta as demais depois de achar', () => {
    const primeira = fonte('gratis', 0, 80, { value: 'contato@bellaitu.com.br', confidence: 85 });
    const segunda = fonte('paga', 20, 95, { value: 'outro@bellaitu.com.br', confidence: 99 });

    return waterfall([primeira, segunda], alvo).then(r => {
      expect(r.value).toBe('contato@bellaitu.com.br');
      expect(r.source).toBe('gratis');
      expect(r.tried).toEqual(['gratis']);
      expect(r.cost).toBe(0);
      // Este é o ponto do arquivo inteiro: a paga nunca foi chamada.
      expect(segunda.run).not.toHaveBeenCalled();
    });
  });

  it('acerto de baixa confiança NÃO interrompe a cascata', async () => {
    // Um e-mail ruim é pior que nenhum: ele bounce, e bounce queima o domínio
    // de quem mandou. Parar no primeiro acerto qualquer seria trocar
    // cobertura por reputação.
    const fraca = fonte('palpite', 0, 30, { value: 'chute@bellaitu.com.br', confidence: 35 });
    const boa = fonte('verificada', 20, 95, { value: 'real@bellaitu.com.br', confidence: 92 });

    const r = await waterfall([fraca, boa], alvo);

    expect(r.value).toBe('real@bellaitu.com.br');
    expect(r.source).toBe('verificada');
    expect(r.tried).toEqual(['palpite', 'verificada']);
  });

  it('fonte que devolve nada é pulada sem interromper', async () => {
    const r = await waterfall(
      [fonte('vazia', 0, 50, null), fonte('boa', 5, 90, { value: 'ok@x.com', confidence: 80 })],
      alvo,
    );
    expect(r.value).toBe('ok@x.com');
    expect(r.tried).toEqual(['vazia', 'boa']);
  });

  it('fonte que lança não derruba a cascata', async () => {
    const quebrada: EnrichmentSource = {
      id: 'quebrada', field: 'email', cost: 0, accuracy: 50,
      run: async () => { throw new Error('timeout'); },
    };

    const r = await waterfall([quebrada, fonte('boa', 5, 90, { value: 'ok@x.com', confidence: 80 })], alvo);
    expect(r.value).toBe('ok@x.com');
  });
});

describe('waterfall — quando ninguém atinge o mínimo', () => {
  it('devolve o melhor que achou, marcado como insuficiente', async () => {
    // "O melhor que achamos foi isto, com 45" e "não achamos nada" são
    // informações diferentes — a segunda faz alguém procurar de novo à toa.
    const r = await waterfall(
      [
        fonte('a', 0, 40, { value: 'chute1@x.com', confidence: 30 }),
        fonte('b', 0, 50, { value: 'chute2@x.com', confidence: 45 }),
      ],
      alvo,
    );

    expect(r.value).toBe('chute2@x.com');
    expect(r.confidence).toBe(45);
    expect(isUsable(r)).toBe(false);
    expect(r.reason).toContain('não é o bastante');
  });

  it('nenhuma achou nada diz exatamente isso', async () => {
    const r = await waterfall([fonte('a', 0, 40, null), fonte('b', 0, 50, null)], alvo);
    expect(r.value).toBeNull();
    expect(r.reason).toContain('Nenhuma das 2 fonte(s)');
  });

  it('lista vazia não quebra', async () => {
    const r = await waterfall([], alvo);
    expect(r.value).toBeNull();
    expect(r.tried).toEqual([]);
    expect(r.reason).toContain('Nenhuma fonte configurada');
  });
});

describe('waterfall — teto de custo', () => {
  it('confere ANTES de gastar, não depois', async () => {
    // Conferir depois seria descobrir o estouro com a fatura já emitida.
    const cara = fonte('cara', 50, 99, { value: 'ok@x.com', confidence: 95 });
    const r = await waterfall([fonte('gratis', 0, 40, null), cara], alvo, { maxCost: 10 });

    expect(cara.run).not.toHaveBeenCalled();
    expect(r.cost).toBe(0);
    expect(r.reason).toContain('teto de custo');
  });

  it('o custo somado inclui as que não acharam nada', async () => {
    // Quem cobra por consulta cobra mesmo quando a resposta é descartada.
    const r = await waterfall(
      [fonte('a', 3, 40, null), fonte('b', 4, 50, null), fonte('c', 5, 90, { value: 'ok@x.com', confidence: 90 })],
      alvo,
    );
    expect(r.cost).toBe(12);
    expect(r.value).toBe('ok@x.com');
  });
});

describe('isUsable — decidir usar é outra camada', () => {
  it('exige valor e confiança acima do mínimo', () => {
    expect(isUsable({
      field: 'email', value: 'a@b.com', confidence: DEFAULT_MIN_CONFIDENCE,
      source: 'x', how: 'y', tried: ['x'], cost: 0, reason: '',
    })).toBe(true);

    expect(isUsable({
      field: 'email', value: 'a@b.com', confidence: DEFAULT_MIN_CONFIDENCE - 1,
      source: 'x', how: 'y', tried: ['x'], cost: 0, reason: '',
    })).toBe(false);

    expect(isUsable({
      field: 'email', value: null, confidence: 99,
      source: null, how: null, tried: [], cost: 0, reason: '',
    })).toBe(false);
  });
});

describe('waterfall — procedência', () => {
  it('todo resultado diz quem achou e como', async () => {
    const r = await waterfall([fonte('hunter', 10, 90, { value: 'a@b.com', confidence: 88 })], alvo);
    expect(r.source).toBe('hunter');
    expect(r.how).toBe('via hunter');
    // O motivo nunca fica vazio: é o que a tela mostra quando o dado não veio.
    expect(r.reason.length).toBeGreaterThan(20);
  });
});

import { describe, it, expect } from 'vitest';
import {
  pickVariant,
  decideWinner,
  type VariantStats,
} from '../../supabase/functions/_shared/agents/ab';

const vazio: VariantStats = { sent: 0, replied: 0, converted: 0, revenueCents: 0 };
const stats = (p: Partial<VariantStats>): VariantStats => ({ ...vazio, ...p });

describe('pickVariant', () => {
  it('o mesmo lead cai sempre na mesma variante', () => {
    // Com sorteio aleatório, o lead pegaria A hoje e B no follow-up de
    // amanhã — e aí o teste não mede a mensagem, mede a mistura.
    const primeira = pickVariant('teste-1', 'lead-abc');
    for (let i = 0; i < 50; i++) {
      expect(pickVariant('teste-1', 'lead-abc')).toBe(primeira);
    }
  });

  it('divide a carteira perto do meio', () => {
    let a = 0;
    for (let i = 0; i < 2000; i++) {
      if (pickVariant('teste-1', `lead-${i}`) === 'a') a++;
    }
    // 45%–55% é folgado o bastante para não ser teste frágil e apertado o
    // bastante para pegar um hash enviesado.
    expect(a).toBeGreaterThan(900);
    expect(a).toBeLessThan(1100);
  });

  it('testes diferentes não repetem a mesma divisão', () => {
    // Sem o id do teste no hash, quem pegou A no primeiro teste pegaria A em
    // todos, e as amostras ficariam correlacionadas.
    let iguais = 0;
    for (let i = 0; i < 500; i++) {
      const lead = `lead-${i}`;
      if (pickVariant('teste-1', lead) === pickVariant('teste-2', lead)) iguais++;
    }
    expect(iguais).toBeGreaterThan(150);
    expect(iguais).toBeLessThan(350);
  });
});

describe('decideWinner — amostra', () => {
  it('não decide nada sem amostra mínima', () => {
    const d = decideWinner(stats({ sent: 10, replied: 8 }), stats({ sent: 10, replied: 1 }));
    expect(d.winner).toBeNull();
    expect(d.reason).toContain('Amostra insuficiente');
  });

  it('a amostra mínima vale por variante, não no total', () => {
    // 100 envios com 95 numa variante e 5 na outra não é amostra de nada.
    const d = decideWinner(stats({ sent: 95, replied: 20 }), stats({ sent: 5, replied: 0 }));
    expect(d.winner).toBeNull();
    expect(d.reason).toContain('Amostra insuficiente');
  });
});

describe('decideWinner — ordem das métricas', () => {
  it('receita ganha de resposta quando as duas discordam', () => {
    // É o coração deste módulo. A variante A tem MUITO mais resposta; a B
    // trouxe o dinheiro. A versão anterior do sistema declarava A vencedora
    // e ensinava o produto a exagerar.
    const a = stats({ sent: 100, replied: 40, converted: 1, revenueCents: 50_000 });
    const b = stats({ sent: 100, replied: 10, converted: 5, revenueCents: 900_000 });

    const d = decideWinner(a, b);
    expect(d.winner).toBe('b');
    expect(d.metric).toBe('receita');
  });

  it('conversão ganha de resposta quando não há receita registrada', () => {
    const a = stats({ sent: 200, replied: 80, converted: 2 });
    const b = stats({ sent: 200, replied: 20, converted: 30 });

    const d = decideWinner(a, b);
    expect(d.winner).toBe('b');
    expect(d.metric).toBe('conversao');
  });

  it('resposta só decide quando não há mais nada, e o aviso vem junto', () => {
    const a = stats({ sent: 300, replied: 90 });
    const b = stats({ sent: 300, replied: 30 });

    const d = decideWinner(a, b);
    expect(d.winner).toBe('a');
    expect(d.metric).toBe('resposta');
    // Quem lê precisa saber que isso não é sobre faturamento.
    expect(d.reason).toContain('resposta não é venda');
  });
});

describe('decideWinner — cautela', () => {
  it('receita parecida não declara vencedor', () => {
    const a = stats({ sent: 100, converted: 3, revenueCents: 300_000 });
    const b = stats({ sent: 100, converted: 3, revenueCents: 320_000 });

    const d = decideWinner(a, b);
    expect(d.winner).toBeNull();
    expect(d.metric).toBe('receita');
  });

  it('diferença de resposta pequena não vira vencedor', () => {
    const a = stats({ sent: 200, replied: 40 });
    const b = stats({ sent: 200, replied: 44 });

    const d = decideWinner(a, b);
    expect(d.winner).toBeNull();
    expect(d.confidence).toBeLessThan(95);
  });

  it('zero resposta nos dois lados diz isso em vez de fingir empate técnico', () => {
    const d = decideWinner(stats({ sent: 100 }), stats({ sent: 100 }));
    expect(d.winner).toBeNull();
    expect(d.reason).toContain('Nenhuma resposta ainda');
  });

  it('receita só de um lado basta para decidir', () => {
    // Se uma variante trouxe dinheiro e a outra nenhum, não há o que discutir.
    const a = stats({ sent: 100, replied: 30, converted: 0, revenueCents: 0 });
    const b = stats({ sent: 100, replied: 12, converted: 2, revenueCents: 400_000 });

    const d = decideWinner(a, b);
    expect(d.winner).toBe('b');
    expect(d.metric).toBe('receita');
  });

  it('toda decisão devolve motivo legível', () => {
    const casos: Array<[VariantStats, VariantStats]> = [
      [stats({ sent: 5 }), stats({ sent: 5 })],
      [stats({ sent: 100 }), stats({ sent: 100 })],
      [stats({ sent: 100, replied: 50 }), stats({ sent: 100, replied: 10 })],
      [stats({ sent: 100, converted: 10 }), stats({ sent: 100, converted: 1 })],
      [stats({ sent: 100, revenueCents: 1 }), stats({ sent: 100, revenueCents: 900_000 })],
    ];

    for (const [a, b] of casos) {
      const d = decideWinner(a, b);
      expect(d.reason.length).toBeGreaterThan(25);
    }
  });
});

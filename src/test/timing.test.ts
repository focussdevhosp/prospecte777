import { describe, it, expect } from 'vitest';
import { bestHours, type HourStat } from '../../supabase/functions/_shared/agents/timing';

const h = (hour: number, sent: number, replied: number): HourStat => ({ hour, sent, replied });

describe('bestHours', () => {
  it('sem resposta nenhuma, não recomenda nada', () => {
    // Era exatamente o estado do produto: `responses_received` só era escrito
    // com o valor 0, e mesmo assim a tela dizia "Baseado nos seus dados:
    // melhor horário às 9h (0.0% de resposta)".
    const advice = bestHours([h(9, 500, 0), h(14, 400, 0), h(16, 300, 0)]);

    expect(advice.fromData).toBe(false);
    expect(advice.hours).toEqual([]);
    expect(advice.reason).toContain('nenhuma resposta');
  });

  it('poucas respostas no total não bastam', () => {
    const advice = bestHours([h(9, 100, 2), h(14, 100, 1)]);
    expect(advice.fromData).toBe(false);
    expect(advice.reason).toContain('Poucas para comparar');
  });

  it('amostra pequena por hora não vira vencedora', () => {
    // Três envios e uma resposta são 33%, que ganharia de 200 envios com 50
    // respostas. A amostra pequena produz o número mais alto justamente por
    // ser pequena.
    const advice = bestHours([h(7, 3, 1), h(14, 200, 50)]);

    // A hora das 7h não tem volume para entrar; sobra uma só, e comparar uma
    // hora com ela mesma não é comparação.
    expect(advice.hours).not.toContain(7);
  });

  it('recomenda quando há volume e diferença real', () => {
    const advice = bestHours([
      h(9, 100, 5),
      h(14, 100, 30),
      h(19, 100, 12),
    ]);

    expect(advice.fromData).toBe(true);
    expect(advice.hours[0]).toBe(14);
    // O número apresentado precisa ser o observado, não um arredondamento
    // simpático.
    expect(advice.reason).toContain('30.0%');
    expect(advice.reason).toContain('100 envios');
  });

  it('horários equivalentes não viram descoberta', () => {
    // Apontar uma hora entre iguais é inventar uma diferença — e a pessoa
    // reorganiza a operação em cima disso.
    const advice = bestHours([
      h(9, 200, 30),
      h(14, 200, 31),
      h(16, 200, 30),
    ]);

    expect(advice.fromData).toBe(false);
    expect(advice.hours).toEqual([]);
    expect(advice.reason).toContain('parecida');
  });

  it('devolve no máximo três horários', () => {
    const advice = bestHours([
      h(8, 100, 10), h(9, 100, 20), h(10, 100, 30),
      h(11, 100, 40), h(12, 100, 5),
    ]);

    expect(advice.fromData).toBe(true);
    expect(advice.hours.length).toBe(3);
    expect(advice.hours).toEqual([11, 10, 9]);
  });

  it('toda resposta traz um motivo legível', () => {
    const casos: HourStat[][] = [
      [],
      [h(9, 10, 0)],
      [h(9, 100, 50), h(14, 100, 5)],
      [h(9, 5, 3), h(14, 5, 3), h(16, 5, 4)],
    ];

    for (const caso of casos) {
      expect(bestHours(caso).reason.length).toBeGreaterThan(25);
    }
  });

  it('os limites são configuráveis, para conta pequena', () => {
    // Volume abaixo do padrão de 20 envios por hora: recusa.
    const stats = [h(9, 12, 1), h(14, 12, 9)];

    expect(bestHours(stats).fromData).toBe(false);
    expect(bestHours(stats, { minSentPerHour: 10, minTotalReplies: 5 }).fromData).toBe(true);
  });
});

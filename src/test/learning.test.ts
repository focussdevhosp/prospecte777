import { describe, it, expect } from 'vitest';
import { learnFromOutreach, type AngleStat } from '../../supabase/functions/_shared/agents/learning';

const a = (angle: string, sent: number, replied: number, meetings = 0): AngleStat => ({
  angle, sent, replied, meetings,
});

describe('learnFromOutreach — não transformar ruído em conclusão', () => {
  it('sem envio nenhum, diz isso', () => {
    const r = learnFromOutreach([]);
    expect(r.ranking).toEqual([]);
    expect(r.summary).toContain('Nenhuma abordagem enviada');
  });

  it('amostra pequena não entra no ranking', () => {
    // Seis abordagens com duas respostas dão 33% e ganhariam de qualquer
    // coisa — não porque funciona, mas porque a amostra é pequena.
    const r = learnFromOutreach([a('diagnostico', 6, 2), a('consultiva', 8, 1)]);
    expect(r.ranking).toEqual([]);
    expect(r.preferred).toEqual([]);
    expect(r.summary).toContain('para a comparação não ser sorte');
  });

  it('um ângulo só não é comparação', () => {
    const r = learnFromOutreach([a('diagnostico', 500, 200)]);
    expect(r.ranking).toEqual([]);
  });

  it('ordena por reunião antes de resposta', () => {
    // O ângulo que provoca curiosidade ganha em resposta e some na hora de
    // marcar. É o mesmo motivo pelo qual o A/B decide por receita.
    const r = learnFromOutreach([
      a('curta', 200, 80, 2),
      a('diagnostico', 200, 40, 20),
    ]);
    expect(r.ranking[0].angle).toBe('diagnostico');
  });
});

describe('learnFromOutreach — mostrar é uma coisa, agir é outra', () => {
  const dados = [
    a('diagnostico', 40, 16, 4),
    a('consultiva', 40, 4, 0),
  ];

  it('com amostra para mostrar mas não para agir, mostra e avisa', () => {
    const r = learnFromOutreach(dados);

    expect(r.ranking.length).toBe(2);
    expect(r.preferred).toEqual([]);
    expect(r.summary).toContain('não é base para a esteira mudar sozinha');
  });

  it('com amostra grande, a esteira passa a preferir', () => {
    const r = learnFromOutreach([
      a('diagnostico', 400, 160, 40),
      a('consultiva', 400, 40, 4),
    ]);

    expect(r.preferred).toContain('diagnostico');
    expect(r.avoid).toContain('consultiva');
    expect(r.summary).toContain('já passou a preferir');
  });

  it('empate técnico não vira preferência', () => {
    // Apontar um vencedor entre iguais é inventar uma diferença — e aqui isso
    // mudaria o comportamento da máquina.
    const r = learnFromOutreach([
      a('diagnostico', 400, 100, 10),
      a('consultiva', 400, 101, 10),
      a('curta', 400, 99, 10),
    ]);

    expect(r.preferred).toEqual([]);
    expect(r.avoid).toEqual([]);
    expect(r.summary).toContain('parecida');
  });

  it('a comparação é contra a média, não contra o pior', () => {
    // Com três ângulos, o pior é sempre "o pior" mesmo quando os três estão
    // praticamente empatados. Comparar contra o pior marcaria alguém para
    // evitar em toda configuração.
    const r = learnFromOutreach([
      a('diagnostico', 300, 91, 9),
      a('consultiva', 300, 90, 9),
      a('curta', 300, 89, 9),
    ]);
    expect(r.avoid).toEqual([]);
  });

  it('os limites são configuráveis, para conta pequena', () => {
    const dadosPequenos = [a('diagnostico', 12, 6, 2), a('consultiva', 12, 1, 0)];

    expect(learnFromOutreach(dadosPequenos).ranking).toEqual([]);
    expect(
      learnFromOutreach(dadosPequenos, { minToShow: 10, minToAct: 10 }).preferred,
    ).toContain('diagnostico');
  });

  it('toda saída traz um motivo legível', () => {
    const casos: AngleStat[][] = [
      [],
      [a('curta', 3, 1)],
      [a('diagnostico', 100, 40, 10), a('consultiva', 100, 10, 1)],
      [a('diagnostico', 500, 150, 15), a('consultiva', 500, 20, 1)],
    ];
    for (const caso of casos) {
      expect(learnFromOutreach(caso).summary.length).toBeGreaterThan(30);
    }
  });
});

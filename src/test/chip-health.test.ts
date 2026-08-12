import { describe, it, expect } from 'vitest';
import {
  warmupLimit,
  assessChipHealth,
  effectiveChipLimit,
  DIAS_PARA_AQUECER,
  type ChipMetrics,
} from '../../supabase/functions/_shared/chip-health';

describe('warmupLimit — chip novo não dispara volume alto', () => {
  it('dia 1 manda pouquíssimo, mesmo com limite alto configurado', () => {
    // Um chip novo que dispara 30 no primeiro dia é um chip novo que some.
    // O limite configurado é o teto que o usuário quer, não uma autorização
    // para queimar o número.
    const r = warmupLimit(1, 200);
    expect(r.limit).toBe(5);
    expect(r.warming).toBe(true);
  });

  it('sobe em degraus ao longo do primeiro mês', () => {
    const dias = [1, 3, 5, 10, 18, 25].map(d => warmupLimit(d, 500).limit);
    // Cada faixa é maior que a anterior, e nenhuma chega perto de 500.
    for (let i = 1; i < dias.length; i++) {
      expect(dias[i]).toBeGreaterThan(dias[i - 1]);
    }
    expect(Math.max(...dias)).toBeLessThan(200);
  });

  it('depois de aquecido, vale o limite configurado', () => {
    const r = warmupLimit(DIAS_PARA_AQUECER + 1, 200);
    expect(r.limit).toBe(200);
    expect(r.warming).toBe(false);
  });

  it('limite configurado menor que a rampa continua valendo', () => {
    // Quem configurou 3 por dia quer 3 por dia, e a rampa não é permissão
    // para mandar mais.
    const r = warmupLimit(20, 3);
    expect(r.limit).toBe(3);
    expect(r.warming).toBe(false);
  });

  it('a explicação diz por que o número é baixo', () => {
    // Silêncio aqui vira "por que só mandou 8?" — e a resposta importa,
    // porque parece defeito e não é.
    const r = warmupLimit(2, 100);
    expect(r.explanation).toContain('aquecimento');
    expect(r.explanation).toContain('spam');
  });

  it('dia zero ou negativo não quebra', () => {
    expect(warmupLimit(0, 100).limit).toBe(5);
    expect(warmupLimit(-5, 100).limit).toBe(5);
  });
});

const dias = (n: number, sent: number, failed: number) =>
  Array.from({ length: n }, () => ({ sent, failed }));

describe('assessChipHealth — saúde vem de evidência', () => {
  it('sem volume, não finge medição', () => {
    // Chamar de "saudável" um chip que nunca mandou nada é o mesmo erro de
    // dizer "0% de resposta" sobre quem nunca enviou.
    const r = assessChipHealth({ recentDays: dias(3, 2, 0) });
    expect(r.health).toBe('healthy');
    expect(r.reasons[0]).toContain('pouco para avaliar');
  });

  it('falha alta é problema do número, não da rede', () => {
    const r = assessChipHealth({ recentDays: dias(3, 40, 12) });
    expect(r.health).toBe('critical');
    expect(r.suggestedLimit).toBeGreaterThan(0);
    expect(r.reasons[0]).toContain('%');
  });

  it('recuo é forte mas não é parada total', () => {
    // Volume zero depois de volume alto chama atenção tanto quanto o
    // contrário.
    const r = assessChipHealth({ recentDays: dias(3, 40, 12) });
    expect(r.suggestedLimit).toBeGreaterThanOrEqual(5);
  });

  it('falha moderada vira aviso, não crise', () => {
    const r = assessChipHealth({ recentDays: dias(3, 50, 7) });
    expect(r.health).toBe('warning');
  });

  it('bloqueio de destinatário pesa mais que falha de envio', () => {
    // É o sinal que mais pesa numa decisão de banimento.
    const semBloqueio = assessChipHealth({ recentDays: dias(3, 50, 1) });
    const comBloqueio = assessChipHealth({ recentDays: dias(3, 50, 1), blocks: 10 });

    expect(semBloqueio.health).toBe('healthy');
    expect(comBloqueio.health).toBe('critical');
    expect(comBloqueio.suggestedLimit).toBeLessThanOrEqual(5);
  });

  it('desconectado é crítico e para na hora', () => {
    const r = assessChipHealth({ recentDays: dias(3, 100, 0), connected: false });
    expect(r.health).toBe('critical');
    expect(r.suggestedLimit).toBe(0);
  });

  it('chip saudável também explica por quê', () => {
    const r = assessChipHealth({ recentDays: dias(5, 30, 0) });
    expect(r.health).toBe('healthy');
    expect(r.reasons[0]).toContain('Dentro do normal');
  });

  it('todo veredito traz motivo legível', () => {
    const casos: ChipMetrics[] = [
      { recentDays: dias(1, 1, 0) },
      { recentDays: dias(3, 50, 20) },
      { recentDays: dias(3, 50, 6) },
      { recentDays: dias(3, 50, 0), blocks: 8 },
      { recentDays: [], connected: false },
    ];
    for (const c of casos) {
      const r = assessChipHealth(c);
      expect(r.reasons.length).toBeGreaterThan(0);
      expect(r.reasons[0].length).toBeGreaterThan(20);
    }
  });
});

describe('effectiveChipLimit — vence sempre o menor', () => {
  it('aquecimento manda quando a saúde está boa', () => {
    const r = effectiveChipLimit({ dayOfLife: 3, configuredLimit: 200 });
    expect(r.limit).toBe(10);
  });

  it('saúde ruim reduz abaixo do aquecimento', () => {
    const r = effectiveChipLimit({ dayOfLife: 60, configuredLimit: 200, healthSuggestion: 8 });
    expect(r.limit).toBe(8);
    expect(r.reason).toContain('saúde');
  });

  it('saúde não AUMENTA o teto do aquecimento', () => {
    // Cada um dos tetos existe por um motivo diferente, e o mais restritivo
    // é sempre o que está protegendo algo.
    const r = effectiveChipLimit({ dayOfLife: 2, configuredLimit: 200, healthSuggestion: 150 });
    expect(r.limit).toBe(5);
  });

  it('sempre devolve motivo', () => {
    expect(effectiveChipLimit({ dayOfLife: 1, configuredLimit: 50 }).reason.length)
      .toBeGreaterThan(20);
    expect(effectiveChipLimit({ dayOfLife: 90, configuredLimit: 50, healthSuggestion: 5 }).reason.length)
      .toBeGreaterThan(20);
  });
});

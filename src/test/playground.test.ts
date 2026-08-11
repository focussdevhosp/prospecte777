import { describe, it, expect } from 'vitest';
import { notaOk } from '../components/ai/AiPlayground';
import { DEFAULT_THRESHOLDS } from '../../supabase/functions/_shared/agents/types';

// ------------------------------------------------------------
// A tela não pode mostrar verde no que o sistema recusa
// ------------------------------------------------------------
// O Laboratório existe para o usuário confiar no julgamento da IA. Se ele
// pintar uma nota como aprovada e o Quality Gate barrar a mesma mensagem, a
// tela vira a coisa que ela deveria combater.

describe('notaOk — usa os limites reais do gate', () => {
  it('factualidade exige 90, não 60', () => {
    // É a única que não se negocia. Uma cópia desatualizada aqui mostraria
    // "80" em verde numa mensagem que o gate rejeita por afirmação inventada.
    expect(notaOk('factuality', 89)).toBe(false);
    expect(notaOk('factuality', 90)).toBe(true);
    expect(DEFAULT_THRESHOLDS.factuality).toBe(90);
  });

  it('risco de spam é ao contrário: menor é melhor', () => {
    expect(notaOk('spamRisk', DEFAULT_THRESHOLDS.maxSpamRisk)).toBe(true);
    expect(notaOk('spamRisk', DEFAULT_THRESHOLDS.maxSpamRisk + 1)).toBe(false);
  });

  it('cada nota respeita exatamente o seu limite', () => {
    const pares: Array<[string, number]> = [
      ['personalization', DEFAULT_THRESHOLDS.personalization],
      ['relevance', DEFAULT_THRESHOLDS.relevance],
      ['naturalness', DEFAULT_THRESHOLDS.naturalness],
      ['offerAdherence', DEFAULT_THRESHOLDS.offerAdherence],
    ];

    for (const [chave, limite] of pares) {
      expect(notaOk(chave, limite), `${chave} no limite`).toBe(true);
      expect(notaOk(chave, limite - 1), `${chave} abaixo`).toBe(false);
    }
  });

  it('nota desconhecida não é pintada de vermelho', () => {
    // Se o gate ganhar uma sétima nota amanhã, a tela mostra o número sem
    // acusar reprovação que ninguém definiu.
    expect(notaOk('metricaNova', 3)).toBe(true);
  });
});

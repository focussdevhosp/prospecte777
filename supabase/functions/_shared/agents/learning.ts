// ============================================================
// O QUE APRENDER COM O QUE JÁ FOI ENVIADO
// ============================================================
// Cada linha de `mission_leads` guarda a estratégia usada — ângulo, gancho,
// oferta — e o desfecho: respondeu, marcou reunião, nada. São milhares de
// experimentos rodando desde o primeiro dia, e ninguém nunca olhou.
//
// O risco de "aprender" é o de sempre neste projeto: transformar ruído em
// conclusão. Com seis abordagens de um ângulo e duas respostas, a taxa dá 33%
// e ganha de qualquer coisa — não porque funciona, mas porque a amostra é
// pequena. Um sistema que se ajusta a isso fica pior a cada rodada, e com
// aparência de estar melhorando.
//
// Então a regra aqui é a mesma de `timing.ts`: só vira recomendação o que
// tem amostra, e só vira MUDANÇA DE COMPORTAMENTO o que tem amostra grande.
// Os dois limites são diferentes de propósito — sugerir algo a uma pessoa que
// vai julgar custa menos que mudar sozinho o que a máquina faz.

export interface AngleStat {
  /** "diagnostico", "consultiva", ... */
  angle: string;
  sent: number;
  replied: number;
  meetings: number;
}

export interface AngleInsight {
  angle: string;
  sent: number;
  replyRate: number;
  meetingRate: number;
}

export interface LearningReport {
  /** Ordenado do melhor para o pior. Vazio quando não há base. */
  ranking: AngleInsight[];
  /** O que a esteira deve preferir. Exige amostra bem maior que o ranking. */
  preferred: string[];
  /** O que evitar: pior que a média por margem clara. */
  avoid: string[];
  /** Frase pronta. Nunca inventa número que não existe. */
  summary: string;
}

/** Mínimo para um ângulo aparecer no ranking da tela. */
const MIN_TO_SHOW = 30;

/**
 * Mínimo para o ângulo mudar o comportamento da esteira.
 *
 * Bem maior que o de exibição, e é a decisão mais importante deste arquivo.
 * Mostrar "diagnóstico vem indo melhor" a uma pessoa que conhece a operação é
 * informação. Fazer a máquina PARAR de usar consultiva com base no mesmo
 * número é entregar a estratégia comercial a uma amostra de 30.
 */
const MIN_TO_ACT = 100;

/** Diferença mínima para não ser empate técnico. */
const MARGEM = 0.15;

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * Lê o desempenho por ângulo e diz o que fazer com isso.
 *
 * `meetings` pesa mais que `replied` na ordenação, pelo mesmo motivo que o
 * A/B decide por receita antes de resposta: o ângulo que provoca curiosidade
 * ganha em resposta e some na hora de marcar.
 */
export function learnFromOutreach(
  stats: AngleStat[],
  opts?: { minToShow?: number; minToAct?: number },
): LearningReport {
  const minShow = opts?.minToShow ?? MIN_TO_SHOW;
  const minAct = opts?.minToAct ?? MIN_TO_ACT;

  const comAmostra = stats.filter((s) => s.sent >= minShow);

  if (comAmostra.length < 2) {
    const total = stats.reduce((soma, s) => soma + s.sent, 0);
    return {
      ranking: [],
      preferred: [],
      avoid: [],
      summary:
        total === 0
          ? "Nenhuma abordagem enviada ainda. Não há o que comparar."
          : `Só ${total} abordagem(ns) até aqui, espalhadas entre os ângulos. ` +
            `São necessários ${minShow} por ângulo para a comparação não ser sorte.`,
    };
  }

  const ranking: AngleInsight[] = comAmostra
    .map((s) => ({
      angle: s.angle,
      sent: s.sent,
      replyRate: s.replied / s.sent,
      meetingRate: s.meetings / s.sent,
    }))
    // Reunião primeiro, resposta como desempate: o ângulo que provoca
    // curiosidade ganha em resposta e some na hora de marcar.
    .sort((a, b) => b.meetingRate - a.meetingRate || b.replyRate - a.replyRate);

  const melhor = ranking[0];
  const pior = ranking[ranking.length - 1];

  // A comparação é relativa à média, não ao pior: com três ângulos, o pior é
  // sempre "o pior" mesmo quando os três estão empatados.
  const mediaResposta =
    ranking.reduce((soma, r) => soma + r.replyRate, 0) / ranking.length;

  const preferred = ranking
    .filter((r) => r.sent >= minAct && r.replyRate >= mediaResposta * (1 + MARGEM))
    .map((r) => r.angle);

  const avoid = ranking
    .filter((r) => r.sent >= minAct && r.replyRate <= mediaResposta * (1 - MARGEM))
    .map((r) => r.angle);

  const empate = melhor.replyRate - pior.replyRate < 0.02;

  const summary = empate
    ? `Os ângulos vêm respondendo de forma parecida (${pct(pior.replyRate)} a ` +
      `${pct(melhor.replyRate)}). Sem diferença que justifique mudar a abordagem.`
    : `"${melhor.angle}" vem à frente: ${pct(melhor.replyRate)} de resposta em ` +
      `${melhor.sent} envios, contra ${pct(pior.replyRate)} de "${pior.angle}".` +
      (preferred.length === 0
        ? ` Ainda não é base para a esteira mudar sozinha — para isso são ${minAct} envios por ângulo.`
        : ` A esteira já passou a preferir ${preferred.map((a) => `"${a}"`).join(", ")}.`);

  return { ranking, preferred, avoid, summary };
}

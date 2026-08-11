// ============================================================
// "MELHOR HORÁRIO" PRECISA TER VINDO DE ALGUM LUGAR
// ============================================================
// A recomendação de horário era montada assim:
//
//   hourlyData[h].responses += stat.responses_received;
//   ...
//   `Baseado nos seus dados: melhor horário às ${bestHours[0]}h
//    (${hourlyRates[0].rate.toFixed(1)}% de resposta)`
//
// Só que `prospecting_stats.responses_received` é escrito por um lugar só, o
// job-processor, e sempre com o valor 0. Nada nunca incrementou aquela
// coluna. Então toda hora tinha taxa 0,0%, a ordenação por taxa era
// arbitrária, e o produto dizia com todas as letras:
//
//   "Baseado nos seus dados: melhor horário às 9h (0.0% de resposta)"
//
// O filtro que existia — `sample >= 3` — olhava só o volume ENVIADO. Volume
// de envio não é evidência sobre resposta: mil mensagens sem nenhuma resposta
// não dizem qual hora é melhor, dizem que ainda não dá para saber.
//
// Recomendação errada é pior que recomendação ausente porque a pessoa
// REORGANIZA a operação em cima dela. E "baseado nos seus dados" é a frase
// que faz alguém confiar.

export interface HourStat {
  hour: number;
  sent: number;
  replied: number;
}

export interface TimingAdvice {
  /** Horas recomendadas, da melhor para a pior. Vazio quando não dá para dizer. */
  hours: number[];
  /** `true` só quando a recomendação veio de resposta observada. */
  fromData: boolean;
  /** Frase pronta. Nunca inventa número que não existe. */
  reason: string;
}

/** Envios mínimos numa hora para ela entrar na comparação. */
const MIN_SENT_PER_HOUR = 20;

/** Respostas mínimas no total para a comparação querer dizer alguma coisa. */
const MIN_TOTAL_REPLIES = 10;

/**
 * Recomenda horários a partir do que foi observado — ou admite que não dá.
 *
 * Duas travas, e as duas precisam passar:
 *
 * 1. volume por hora. Três envios numa hora e uma resposta viram "33% de
 *    taxa", que ganharia de uma hora com 200 envios e 50 respostas. Amostra
 *    pequena produz o número mais alto justamente por ser pequena.
 * 2. respostas no total. Sem resposta nenhuma, não existe "melhor hora" nos
 *    dados — existe uma lista de zeros ordenada por acaso, que foi
 *    exatamente o que o produto vinha apresentando como conclusão.
 */
export function bestHours(stats: HourStat[], opts?: {
  minSentPerHour?: number;
  minTotalReplies?: number;
}): TimingAdvice {
  const minSent = opts?.minSentPerHour ?? MIN_SENT_PER_HOUR;
  const minReplies = opts?.minTotalReplies ?? MIN_TOTAL_REPLIES;

  const totalReplies = stats.reduce((soma, s) => soma + s.replied, 0);

  if (totalReplies < minReplies) {
    return {
      hours: [],
      fromData: false,
      reason:
        totalReplies === 0
          ? "Ainda não houve nenhuma resposta registrada — não há como dizer qual horário funciona melhor."
          : `Só ${totalReplies} resposta(s) registrada(s) até agora. Poucas para comparar horários sem chutar.`,
    };
  }

  const candidatas = stats
    .filter((s) => s.sent >= minSent)
    .map((s) => ({ ...s, taxa: s.replied / s.sent }))
    .sort((a, b) => b.taxa - a.taxa);

  if (candidatas.length < 2) {
    return {
      hours: [],
      fromData: false,
      reason:
        `Nenhum horário tem ${minSent} envios ainda. ` +
        `Comparar horas com meia dúzia de envios cada devolve a menor amostra como vencedora.`,
    };
  }

  const melhor = candidatas[0];
  const pior = candidatas[candidatas.length - 1];

  // Todas as horas com o mesmo desempenho não é descoberta, é ausência de
  // sinal. Apontar uma delas seria inventar uma diferença.
  if (melhor.taxa - pior.taxa < 0.02) {
    return {
      hours: [],
      fromData: false,
      reason:
        "Os horários testados vêm respondendo de forma parecida. " +
        "Não há diferença que justifique mudar a rotina de envio.",
    };
  }

  const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

  return {
    hours: candidatas.slice(0, 3).map((c) => c.hour),
    fromData: true,
    reason:
      `Melhor horário: ${melhor.hour}h, com ${pct(melhor.taxa)} de resposta ` +
      `em ${melhor.sent} envios. O pior da lista, ${pior.hour}h, fica em ${pct(pior.taxa)}.`,
  };
}

// ============================================================
// AQUECIMENTO E SAÚDE DO CHIP
// ============================================================
// O modo de falha que derruba operação de WhatsApp não aparece na primeira
// semana. Aparece no mês 4, quando o número começa a ser bloqueado e ninguém
// entende por quê — e a essa altura o estrago já está feito, porque número
// banido não volta.
//
// Duas coisas faltavam aqui, e são as duas que evitam isso:
//
// 1. AQUECIMENTO. Um chip novo que dispara 30 mensagens no primeiro dia é um
//    chip novo que some. O WhatsApp lê volume alto vindo de número sem
//    histórico como spam, e não há apelação. A rampa não é opinião: é a
//    diferença entre operar por meses e recomeçar do zero a cada duas
//    semanas.
//
// 2. SAÚDE DERIVADA DE EVIDÊNCIA. O campo `health` existia e era declarado —
//    alguém escrevia "healthy" e ficava healthy para sempre. Saúde que não
//    olha falha de envio é rótulo, não medição.
//
// Nada aqui fala com o banco de propósito: é a parte que dá para testar, e é
// a parte em que errar custa a conta inteira do cliente.

export type ChipHealth = "healthy" | "warning" | "critical" | "banned";

/**
 * Rampa de aquecimento, por dia de vida do chip.
 *
 * Os números são conservadores de propósito. O custo de subir devagar é
 * alguns dias a mais para chegar ao volume cheio; o de subir rápido é perder
 * o número — e com ele o histórico de conversa de todo mundo que já falou
 * com aquele contato.
 *
 * A curva é por FAIXA, não por dia exato: chip que ficou parado no fim de
 * semana não deve voltar do começo, e um degrau por dia geraria isso.
 */
const RAMPA: Array<{ ateODia: number; limite: number }> = [
  { ateODia: 2, limite: 5 },
  { ateODia: 4, limite: 10 },
  { ateODia: 7, limite: 20 },
  { ateODia: 14, limite: 40 },
  { ateODia: 21, limite: 70 },
  { ateODia: 30, limite: 100 },
];

/** Depois desta idade, o chip está aquecido e vale o limite configurado. */
export const DIAS_PARA_AQUECER = 30;

export interface WarmupStatus {
  /** Teto de hoje para este chip, já considerando o limite configurado. */
  limit: number;
  /** `true` enquanto a rampa for mais restritiva que o configurado. */
  warming: boolean;
  dayOfLife: number;
  /** Frase para a tela. Silêncio aqui vira "por que só mandou 8?". */
  explanation: string;
}

/**
 * Teto de envio de hoje para um chip.
 *
 * Vence sempre o MENOR entre a rampa e o limite configurado. Um chip de dois
 * dias com limite de 200 configurado manda 5 — a configuração é o teto que o
 * usuário quer, não uma autorização para queimar o número.
 */
export function warmupLimit(
  dayOfLife: number,
  configuredLimit: number,
): WarmupStatus {
  const dia = Math.max(1, Math.floor(dayOfLife));

  if (dia > DIAS_PARA_AQUECER) {
    return {
      limit: configuredLimit,
      warming: false,
      dayOfLife: dia,
      explanation: "Chip aquecido: vale o limite que você configurou.",
    };
  }

  const faixa = RAMPA.find((r) => dia <= r.ateODia);
  const teto = faixa?.limite ?? 100;
  const limite = Math.min(teto, configuredLimit);

  return {
    limit: limite,
    warming: teto < configuredLimit,
    dayOfLife: dia,
    explanation:
      teto < configuredLimit
        ? `Chip novo em aquecimento (dia ${dia}): ${limite} mensagens hoje, ` +
          `subindo até o seu limite de ${configuredLimit} por volta do dia ${DIAS_PARA_AQUECER}. ` +
          `Volume alto em número sem histórico é o que o WhatsApp lê como spam.`
        : `Dia ${dia} do chip. Seu limite de ${configuredLimit} já é menor que o teto de aquecimento.`,
  };
}

export interface ChipMetrics {
  /** Envios e falhas dos últimos dias, do mais recente para o mais antigo. */
  recentDays: Array<{ sent: number; failed: number }>;
  /** Quantos leads bloquearam este número no período. */
  blocks?: number;
  /** Está conectado agora? */
  connected?: boolean;
}

export interface HealthVerdict {
  health: ChipHealth;
  /** O que levou a esse veredito. Sem isso, "critical" é só uma cor. */
  reasons: string[];
  /** Sugestão de teto para hoje, quando a saúde pede recuo. */
  suggestedLimit: number | null;
}

/** Acima disto, algo está errado com o número, não com a rede. */
const FALHA_CRITICA = 0.25;
const FALHA_ALERTA = 0.1;

/**
 * Deriva a saúde do chip do que aconteceu com ele.
 *
 * Falha de envio é o sinal mais direto que existe: o WhatsApp recusando
 * mensagem é o WhatsApp dizendo que está de olho. Bloqueio de destinatário é
 * o segundo — e o mais caro, porque é o que alimenta a decisão de banir.
 *
 * Devolve `suggestedLimit` para recuo automático. Um chip com 25% de falha
 * que continua no volume cheio não está sendo usado, está sendo gasto.
 */
export function assessChipHealth(metrics: ChipMetrics): HealthVerdict {
  const reasons: string[] = [];

  if (metrics.connected === false) {
    return {
      health: "critical",
      reasons: ["O número está desconectado — nenhuma mensagem sai por ele agora."],
      suggestedLimit: 0,
    };
  }

  const dias = metrics.recentDays ?? [];
  const enviados = dias.reduce((s, d) => s + d.sent, 0);
  const falhas = dias.reduce((s, d) => s + d.failed, 0);

  // Sem volume não há medição. Chamar de "saudável" um chip que nunca mandou
  // nada é o mesmo erro de dizer "0% de resposta" sobre quem nunca enviou.
  if (enviados < 10) {
    return {
      health: "healthy",
      reasons: [`Só ${enviados} envio(s) no período — pouco para avaliar a saúde do número.`],
      suggestedLimit: null,
    };
  }

  const taxaFalha = falhas / enviados;
  let health: ChipHealth = "healthy";
  let suggestedLimit: number | null = null;

  if (taxaFalha >= FALHA_CRITICA) {
    health = "critical";
    reasons.push(
      `${Math.round(taxaFalha * 100)}% dos envios falharam (${falhas} de ${enviados}). ` +
        `Acima de 25% o problema é o número, não a rede.`,
    );
    // Recuo forte, não parada: parar de vez também é sinal, e volume zero
    // depois de volume alto chama atenção tanto quanto o contrário.
    suggestedLimit = Math.max(5, Math.floor(enviados / dias.length / 4));
  } else if (taxaFalha >= FALHA_ALERTA) {
    health = "warning";
    reasons.push(
      `${Math.round(taxaFalha * 100)}% dos envios falharam (${falhas} de ${enviados}).`,
    );
    suggestedLimit = Math.max(10, Math.floor(enviados / dias.length / 2));
  }

  const bloqueios = metrics.blocks ?? 0;
  if (bloqueios > 0) {
    const taxaBloqueio = bloqueios / enviados;
    if (taxaBloqueio >= 0.05) {
      health = "critical";
      reasons.push(
        `${bloqueios} pessoa(s) bloquearam este número (${Math.round(taxaBloqueio * 100)}% dos contatos). ` +
          `É o sinal que mais pesa numa decisão de banimento.`,
      );
      suggestedLimit = Math.min(suggestedLimit ?? Infinity, 5);
    } else if (health === "healthy") {
      health = "warning";
      reasons.push(`${bloqueios} pessoa(s) bloquearam este número no período.`);
    }
  }

  if (reasons.length === 0) {
    reasons.push(
      `${enviados} envios no período com ${Math.round(taxaFalha * 100)}% de falha. Dentro do normal.`,
    );
  }

  return { health, reasons, suggestedLimit };
}

/**
 * Junta as duas contas: quanto este chip pode mandar hoje, de verdade.
 *
 * Vence o menor. É a única regra que não pode ter exceção — cada um dos três
 * tetos existe por um motivo diferente, e o mais restritivo é sempre o que
 * está protegendo algo.
 */
export function effectiveChipLimit(input: {
  dayOfLife: number;
  configuredLimit: number;
  healthSuggestion?: number | null;
}): { limit: number; reason: string } {
  const aquecimento = warmupLimit(input.dayOfLife, input.configuredLimit);
  const saude = input.healthSuggestion;

  if (saude != null && saude < aquecimento.limit) {
    return {
      limit: saude,
      reason: `Reduzido para ${saude} por causa da saúde do número.`,
    };
  }

  return { limit: aquecimento.limit, reason: aquecimento.explanation };
}

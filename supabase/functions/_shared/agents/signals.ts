// ============================================================
// SINAL: O MOTIVO DE FALAR COM ESSA EMPRESA HOJE
// ============================================================
// A prospecção deste produto respondia "quem abordar". Não respondia "por que
// agora" — e é essa a diferença que o mercado mede: prospecção genérica fica
// em ~3% de resposta, prospecção com gatilho em ~11%.
//
// Um sinal aqui é uma MUDANÇA observada, com data e evidência. Não é uma
// dedução ("deve estar crescendo") nem uma característica estática ("não tem
// site" — isso é fato, e fato não expira). A distinção importa porque só
// mudança justifica a frase que faz a mensagem funcionar: "reparei que vocês
// acabaram de...".
//
// TODO SINAL EXPIRA. É a parte que se esquece e que estraga tudo: falar de
// uma queda de avaliação que aconteceu há seis meses não soa atento, soa
// automatizado — que é exatamente o registro que o comprador aprendeu a
// ignorar. As janelas abaixo saem do que se observa em campo: entre 15 e 45
// dias, dependendo de quanto o evento "esfria".
//
// E não existe sinal sem evidência. Se a comparação não tem os dois lados,
// não sai sinal — melhor abordar sem gatilho do que com um gatilho inventado.

export type SignalType =
  | "site_novo"
  | "site_fora_do_ar"
  | "site_piorou"
  | "site_melhorou"
  | "problema_novo"
  | "problema_resolvido"
  | "primeira_avaliacao"
  | "avaliacoes_dispararam"
  | "avaliacao_caiu";

export interface Signal {
  type: SignalType;
  /** Frase pronta, na voz de quem observou. Vai virar fato no dossiê. */
  summary: string;
  /** O que sustenta: valor antes e depois. Sem isto o sinal não é emitido. */
  evidence: Record<string, unknown>;
  /** Dias de validade a partir da detecção. */
  windowDays: number;
  /**
   * Quão forte é como gancho de abordagem, de 0 a 100. Não é probabilidade —
   * é ordenação, para escolher UM quando houver vários.
   */
  strength: number;
}

/** Estado de um lead na última conferência. */
export interface LeadSnapshot {
  hasWebsite?: boolean;
  siteReachable?: boolean;
  siteScore?: number | null;
  findingIds?: string[];
  rating?: number | null;
  reviewsCount?: number | null;
}

/**
 * Janelas de validade, em dias.
 *
 * Curtas para dor aguda: quem levou uma avaliação ruim está incomodado agora
 * e resolvido em três semanas, de um jeito ou de outro. Longas para mudança
 * estrutural: site novo continua sendo assunto por mais tempo.
 */
export const SIGNAL_WINDOWS: Record<SignalType, number> = {
  site_novo: 45,
  site_fora_do_ar: 15,
  site_piorou: 30,
  site_melhorou: 30,
  problema_novo: 30,
  problema_resolvido: 30,
  primeira_avaliacao: 45,
  avaliacoes_dispararam: 30,
  avaliacao_caiu: 21,
};

/** Variação mínima na nota do site para não ser oscilação de medição. */
const MARGEM_SCORE = 10;

/** Variação mínima na nota do Google. */
const MARGEM_RATING = 0.3;

/** Crescimento mínimo de avaliações para contar como salto. */
const SALTO_REVIEWS = 0.5;

/**
 * Compara o estado anterior com o atual e devolve os sinais.
 *
 * `previous` nulo significa primeira conferência: NÃO emite sinal nenhum.
 * Sem os dois lados não há mudança — há só o estado atual, que já é fato no
 * dossiê. Emitir "site novo" só porque é a primeira vez que olhamos seria
 * afirmar uma novidade que não observamos.
 */
export function detectSignals(
  previous: LeadSnapshot | null | undefined,
  current: LeadSnapshot,
): Signal[] {
  if (!previous) return [];

  const sinais: Signal[] = [];
  const add = (
    type: SignalType,
    summary: string,
    evidence: Record<string, unknown>,
    strength: number,
  ) => sinais.push({ type, summary, evidence, windowDays: SIGNAL_WINDOWS[type], strength });

  // ---- Site ----
  if (previous.hasWebsite === false && current.hasWebsite === true) {
    add(
      "site_novo",
      "A empresa passou a ter site — antes não tinha nenhum.",
      { antes: "sem site", depois: "com site" },
      70,
    );
  }

  if (previous.siteReachable === true && current.siteReachable === false) {
    // Site fora do ar é a dor mais concreta que existe: dá para conferir em
    // dez segundos, e quem está perdendo contato agora sabe disso.
    add(
      "site_fora_do_ar",
      "O site parou de responder — estava no ar na conferência anterior.",
      { antes: "no ar", depois: "fora do ar" },
      95,
    );
  }

  if (
    typeof previous.siteScore === "number" &&
    typeof current.siteScore === "number" &&
    current.siteReachable !== false
  ) {
    const delta = current.siteScore - previous.siteScore;

    if (delta <= -MARGEM_SCORE) {
      add(
        "site_piorou",
        `A nota técnica do site caiu de ${previous.siteScore} para ${current.siteScore}.`,
        { antes: previous.siteScore, depois: current.siteScore },
        75,
      );
    } else if (delta >= MARGEM_SCORE) {
      // Melhora não é oportunidade de venda — é aviso. Alguém está mexendo no
      // site, e provavelmente não é você. Vale abordar de outro jeito, ou não
      // abordar. O sinal existe para a pessoa decidir, não para insistir.
      add(
        "site_melhorou",
        `A nota técnica do site subiu de ${previous.siteScore} para ${current.siteScore} — alguém está cuidando disso.`,
        { antes: previous.siteScore, depois: current.siteScore },
        40,
      );
    }
  }

  // ---- Achados da auditoria ----
  const antes = new Set(previous.findingIds ?? []);
  const agora = new Set(current.findingIds ?? []);

  if (antes.size > 0 || agora.size > 0) {
    const novos = [...agora].filter((id) => !antes.has(id));
    const resolvidos = [...antes].filter((id) => !agora.has(id));

    if (novos.length > 0) {
      add(
        "problema_novo",
        `Apareceu problema novo no site que não existia na conferência anterior (${novos.length}).`,
        { novos },
        80,
      );
    }

    if (resolvidos.length > 0) {
      add(
        "problema_resolvido",
        `${resolvidos.length} problema(s) do site foram corrigidos — a empresa está investindo nisso agora.`,
        { resolvidos },
        // Força baixa de propósito: pode significar que contrataram outra
        // pessoa. Insistir na mesma oferta aqui é chegar tarde e mostrar isso.
        35,
      );
    }
  }

  // ---- Google ----
  const semAvaliacaoAntes = !previous.reviewsCount || previous.reviewsCount === 0;
  const temAvaliacaoAgora = (current.reviewsCount ?? 0) > 0;

  if (semAvaliacaoAntes && temAvaliacaoAgora) {
    add(
      "primeira_avaliacao",
      `A empresa recebeu as primeiras avaliações no Google (${current.reviewsCount}).`,
      { antes: previous.reviewsCount ?? 0, depois: current.reviewsCount },
      55,
    );
  } else if (
    typeof previous.reviewsCount === "number" &&
    typeof current.reviewsCount === "number" &&
    previous.reviewsCount > 0
  ) {
    const crescimento = (current.reviewsCount - previous.reviewsCount) / previous.reviewsCount;
    if (crescimento >= SALTO_REVIEWS && current.reviewsCount - previous.reviewsCount >= 5) {
      add(
        "avaliacoes_dispararam",
        `As avaliações no Google saltaram de ${previous.reviewsCount} para ${current.reviewsCount}.`,
        { antes: previous.reviewsCount, depois: current.reviewsCount },
        60,
      );
    }
  }

  if (
    typeof previous.rating === "number" &&
    typeof current.rating === "number" &&
    previous.rating - current.rating >= MARGEM_RATING
  ) {
    add(
      "avaliacao_caiu",
      `A nota no Google caiu de ${previous.rating.toFixed(1)}★ para ${current.rating.toFixed(1)}★.`,
      { antes: previous.rating, depois: current.rating },
      // Dor aguda e recente. É o gatilho mais forte depois do site fora do ar,
      // e o que mais rápido perde a validade.
      85,
    );
  }

  return sinais.sort((a, b) => b.strength - a.strength);
}

/**
 * Diz se um sinal ainda vale.
 *
 * Falar de uma queda de avaliação de seis meses atrás não soa atento, soa
 * automatizado — o registro exato que o comprador aprendeu a ignorar.
 */
export function isSignalActive(
  detectedAt: Date,
  windowDays: number,
  now: Date,
): boolean {
  const limite = new Date(detectedAt.getTime());
  limite.setDate(limite.getDate() + windowDays);
  return now <= limite;
}

/** Constrói o snapshot a partir da linha do lead. */
export function snapshotOf(lead: {
  website?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  site_audit?: {
    reachable?: boolean;
    score?: number;
    findings?: Array<{ id?: string }>;
  } | null;
}): LeadSnapshot {
  const audit = lead.site_audit ?? null;
  return {
    hasWebsite: Boolean(lead.website && String(lead.website).trim()),
    siteReachable: audit?.reachable,
    siteScore: typeof audit?.score === "number" ? audit.score : null,
    findingIds: (audit?.findings ?? [])
      .map((f) => f?.id)
      .filter((id): id is string => typeof id === "string")
      .sort(),
    rating: lead.rating ?? null,
    reviewsCount: lead.reviews_count ?? null,
  };
}

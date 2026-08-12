// ============================================================
// CONTRATOS DA ESTEIRA COMERCIAL
// ============================================================
// Todo dado que chega ao modelo carrega procedência. Esta é a regra que
// separa "a IA escreveu algo bonito" de "a IA escreveu algo verdadeiro".
//
// O problema original do sistema não era prompt curto: era o prompt exigir
// "pelo menos 1 número concreto" sem ter número nenhum na mão. O modelo
// obedeceu e inventou. Aqui um número só existe se vier com fonte.

/** Uma informação sobre o lead, com de onde veio e o quanto se confia nela. */
export interface Fact {
  /** Rótulo curto: "Site", "Avaliação no Google", "Segmento". */
  label: string;
  /** Valor já em português de gente: "não possui", "4.1★ com 12 avaliações". */
  value: string;
  /** De onde saiu. Aparece na tela para o humano conferir. */
  source: string;
  /** 0..1. Abaixo de 0.6 não vira afirmação em mensagem. */
  confidence: number;
}

/**
 * Leitura comercial que a IA/regra fez em cima dos fatos. Nunca pode ser
 * afirmada como verdade ao lead — no máximo virar pergunta.
 */
export interface Hypothesis {
  statement: string;
  /** Em quais fatos ela se apoia. */
  basedOn: string[];
  confidence: number;
}

export type Temperature = "frio" | "morno" | "quente" | "muito_quente";

// ------------------------------------------------------------
// LEAD 360
// ------------------------------------------------------------

export interface Dossier {
  leadId: string;
  businessName: string;
  phone: string | null;
  niche: string | null;
  location: string | null;
  website: string | null;
  stage: string;
  /** Fatos verificáveis. É o único material que pode virar afirmação. */
  facts: Fact[];
  /** Leituras comerciais. Viram pergunta, nunca afirmação. */
  hypotheses: Hypothesis[];
  /** Dores explicitamente ditas pelo lead ou achadas na auditoria. */
  observedNeeds: string[];
  /** Memória estruturada acumulada da conversa. */
  memory: MemoryEntry[];
  /** Resumo do que já foi conversado, se houve conversa. */
  conversationSummary: string | null;
  messageCount: { fromLead: number; fromAgent: number };
  lastContactAt: string | null;
  lastResponseAt: string | null;
  /** Fontes que originaram este lead. */
  origins: string[];
}

export interface MemoryEntry {
  type: "need" | "interest" | "objection" | "commitment" | "preference" | "context" | "next_action";
  key: string;
  value: string;
  confidence: number;
}

// ------------------------------------------------------------
// QUALIFICAÇÃO
// ------------------------------------------------------------

export interface IcpCriteria {
  niches?: string[];
  locations?: string[];
  /** Sinais que aumentam o fit: "sem site", "rating baixo". */
  signals?: string[];
  /** Exclusões duras: se bater, o lead é descartado. */
  exclusions?: string[];
  minRating?: number | null;
  maxRating?: number | null;
  minReviews?: number | null;
}

export interface ScoreReason {
  label: string;
  points: number;
  /** Fato que sustenta esta pontuação. */
  evidence: string;
}

export interface Qualification {
  /** 0..100 */
  score: number;
  temperature: Temperature;
  /** Cada ponto somado ou subtraído, com a evidência. Requisito FASE 4. */
  reasons: ScoreReason[];
  /** Bateu numa exclusão do ICP. */
  disqualified: boolean;
  disqualifiedReason: string | null;
  facts: Fact[];
  hypotheses: Hypothesis[];
}

// ------------------------------------------------------------
// OFERTA
// ------------------------------------------------------------

export interface Offer {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  /** Dores que esta oferta resolve. */
  painPoints: string[];
  benefits: string[];
  targetNiches: string[];
  idealClientProfile: string | null;
  /** Texto livre cadastrado pelo usuário. Única origem legítima de preço. */
  pricingInfo: string | null;
  caseStudies: string[];
  objections: Record<string, string>;
}

export interface OfferMatch {
  offer: Offer | null;
  /** 0..100 */
  confidence: number;
  /** Por que esta oferta e não outra. Auditável. */
  reasons: string[];
  /** As demais, ordenadas, para o humano poder discordar com um clique. */
  runnersUp: { offerId: string; name: string; confidence: number; reason: string }[];
}

// ------------------------------------------------------------
// ESTRATÉGIA
// ------------------------------------------------------------

export type ApproachAngle =
  | "diagnostico"      // achou um problema concreto e verificável no site/presença
  | "oportunidade"     // não há problema, há espaço para crescer
  | "consultiva"       // pergunta antes de propor
  | "curta"            // uma linha, sem contexto forte disponível
  | "prova"            // há case real cadastrado no catálogo
  | "reativacao"       // já houve contato antes
  | "follow_up";       // já houve mensagem sem resposta

/** Canais por onde uma abordagem pode sair. */
export type OutreachChannel = "whatsapp" | "email";

export type CampaignGoal =
  | "agendar_demonstracao"
  | "solicitar_orcamento"
  | "falar_com_vendedor"
  | "vender"
  | "outro";

export interface Strategy {
  angle: ApproachAngle;
  goal: CampaignGoal;
  /** O que esta primeira mensagem precisa conseguir. Não é a venda. */
  objective: string;
  /** O fato que abre a mensagem. Sempre um `Fact`, nunca hipótese. */
  hook: Fact | null;
  offer: Offer | null;
  formality: "informal" | "neutro" | "formal";
  /** Pedido mínimo. Nunca reunião na primeira mensagem. */
  cta: string;
  /**
   * Por onde esta mensagem sai.
   *
   * Era o literal `"whatsapp"` — não uma escolha, uma constante com cara de
   * campo. Muda o texto de verdade: e-mail tem assunto, aceita mais palavras
   * e não pode soar como mensagem de aplicativo; WhatsApp é o contrário.
   */
  channel: OutreachChannel;
  /** Objeções esperadas, para o Conversation Agent já chegar preparado. */
  expectedObjections: string[];
  /** Justificativa da escolha, para o feed. */
  rationale: string[];
  maxWords: number;
}

// ------------------------------------------------------------
// QUALITY GATE
// ------------------------------------------------------------

export interface QualityScores {
  personalization: number;
  relevance: number;
  naturalness: number;
  factuality: number;
  /** Quanto MENOR melhor. É risco, não qualidade. */
  spamRisk: number;
  offerAdherence: number;
}

export interface QualityIssue {
  code: string;
  severity: "block" | "warn";
  message: string;
  /** Trecho da mensagem que causou o problema. */
  excerpt?: string;
}

export interface QualityVerdict {
  approved: boolean;
  scores: QualityScores;
  /** Média ponderada 0..100 para ordenar e comparar. */
  overall: number;
  issues: QualityIssue[];
}

export interface QualityThresholds {
  personalization: number;
  relevance: number;
  naturalness: number;
  factuality: number;
  maxSpamRisk: number;
  offerAdherence: number;
}

export const DEFAULT_THRESHOLDS: QualityThresholds = {
  personalization: 60,
  relevance: 60,
  naturalness: 60,
  // Factualidade é a única que não se negocia: mensagem com afirmação
  // inventada não sai, por melhor que seja o resto.
  factuality: 90,
  maxSpamRisk: 40,
  offerAdherence: 50,
};

// ------------------------------------------------------------
// AUTONOMIA
// ------------------------------------------------------------

export type AutonomyLevel = "manual" | "assistido" | "semiautonomo" | "autonomo";

/** O que cada nível autoriza a esteira a fazer sozinha. */
export const AUTONOMY: Record<AutonomyLevel, {
  research: boolean;
  qualify: boolean;
  draft: boolean;
  /** Envia sem humano no meio. */
  send: boolean;
  /** Responde sozinho depois que o lead responde. */
  converse: boolean;
  label: string;
  description: string;
}> = {
  manual: {
    research: true, qualify: true, draft: true, send: false, converse: false,
    label: "Manual",
    description: "A IA pesquisa, qualifica e escreve. Nada é enviado — tudo fica como rascunho.",
  },
  assistido: {
    research: true, qualify: true, draft: true, send: false, converse: false,
    label: "Assistido",
    description: "A IA prepara tudo e coloca na fila. Cada contato precisa da sua aprovação.",
  },
  semiautonomo: {
    research: true, qualify: true, draft: true, send: true, converse: false,
    label: "Semiautônomo",
    description: "A IA envia o que passar no Quality Gate. As respostas ficam com você.",
  },
  autonomo: {
    research: true, qualify: true, draft: true, send: true, converse: true,
    label: "Autônomo",
    description: "A IA executa a esteira inteira dentro dos limites, horários e opt-out configurados.",
  },
};

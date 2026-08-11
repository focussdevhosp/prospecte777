// ============================================================
// QUALITY AGENT — O PORTÃO
// ============================================================
// Nada saía revisado. A mensagem ia da IA direto para o WhatsApp do lead, e
// quando a IA falhava saía um texto fixo afirmando resultado que nunca
// aconteceu ("já subiu de 3.6 pra 4.7 em 30 dias").
//
// Este módulo é determinístico e roda antes de qualquer IA revisora, por três
// motivos: é instantâneo, é de graça, e pega a maior parte dos problemas. Um
// revisor de IA custa dinheiro e é menos confiável para verificar se um
// número tem fonte — isso é comparação de string, não julgamento.
//
// A nota que não se negocia é FACTUALITY. As outras podem ser afrouxadas por
// configuração; afirmação inventada não.

import type {
  Dossier,
  QualityIssue,
  QualityScores,
  QualityThresholds,
  QualityVerdict,
  Strategy,
} from "./types.ts";
import { DEFAULT_THRESHOLDS } from "./types.ts";
import { allowedNumbers } from "./dossier.ts";

// ------------------------------------------------------------
// DETECTORES
// ------------------------------------------------------------

/** Aberturas que denunciam mala direta no primeiro segundo de leitura. */
const GENERIC_OPENERS = [
  /^\s*ol[áa][,!\s]+(tudo bem|espero que)/i,
  /^\s*prezad[oa]/i,
  /^\s*bom dia[,!\s]*$/i,
  /venho por meio desta/i,
  /espero que esteja bem/i,
  /gostaria de (apresentar|oferecer)/i,
  /somos (uma empresa )?especialistas? em/i,
  /trabalhamos com solu[çc][õo]es/i,
];

/** Frases que não dizem nada e servem para qualquer empresa. */
const FILLER_PHRASES = [
  /presen[çc]a digital(?!\s+(fraca|ausente|inexistente))/i,
  /solu[çc][õo]es? (digitais?|personalizadas?|inovadoras?)/i,
  /alavancar (seus? |o )?(resultados?|neg[óo]cios?|vendas)/i,
  /transformar (sua|seu|a|o) (empresa|neg[óo]cio)/i,
  /levar (sua|seu) (empresa|neg[óo]cio) (para|ao) (o )?pr[óo]ximo n[íi]vel/i,
  /aumentar (sua|a) visibilidade/i,
  /maximizar (seus?|o) (resultados?|potencial)/i,
];

/**
 * Promessa de resultado garantido — problema jurídico, não só de estilo.
 *
 * A janela `[^.!?]{0,40}` existe porque a promessa raramente vem colada:
 * "garanto que o resultado vem rápido", "garantimos um aumento nas vendas".
 * Casar só a forma justaposta deixava a maioria dos casos passar.
 */
const GUARANTEE_CLAIMS = [
  /\bgarant(o|imos|ido|ida|ia|e)\b[^.!?]{0,40}\b(resultado|retorno|aumento|crescimento|venda|faturamento|clientes?)/i,
  /\b(resultado|retorno|aumento)\b[^.!?]{0,20}\bgarantid[oa]\b/i,
  /100% de (garantia|satisfa[çc][ãa]o|resultado)/i,
  /sem risco (nenhum|algum)/i,
  /\bcom certeza\b[^.!?]{0,30}\b(vender|faturar|crescer|aumentar|dobrar)/i,
  /\b(vai|v[ãa]o)\b[^.!?]{0,15}\b(dobrar|triplicar)\b[^.!?]{0,20}\b(vendas?|faturamento|clientes?)/i,
];

/** Afirmação sobre a operação interna do lead que ninguém verificou. */
const UNVERIFIABLE_CLAIMS = [
  /(sei|vi|notei|percebi|reparei) que (voc[êe]s?|a empresa|o neg[óo]cio) (est[áa]|tem|t[êe]m|perde|perdem|sofre)/i,
  /voc[êe]s? (est[ãa]o|deve[m]? estar) (perdendo|deixando de (ganhar|faturar|vender))/i,
  /seu (faturamento|or[çc]amento|time|sistema atual)/i,
  /sei que (voc[êe]s?|a )/i,
];

/** Prova social sem lastro no catálogo. */
const FABRICATED_PROOF = [
  /(fiz|montei|entreguei|fechei) (isso |algo )?(pra|para) (uma |um |outra |outro )?[a-zç]+ (parecid|similar|igual)/i,
  /outro cliente (meu|nosso) (daqui|da regi[ãa]o|de)/i,
  /acabei de (fazer|entregar|montar) (pra|para)/i,
  /(j[áa] )?(subiu|dobrou|triplicou|aumentou) de \d/i,
];

/** Padrões de risco de bloqueio/denúncia no WhatsApp. */
const SPAM_MARKERS = [
  { re: /[A-ZÀ-Ú]{6,}/, weight: 12, label: "palavra inteira em maiúsculas" },
  { re: /!{2,}/, weight: 12, label: "excesso de exclamação" },
  { re: /(promo[çc][ãa]o|desconto|oferta) (imperd[íi]vel|exclusiv|especial|rel[âa]mpago)/i, weight: 25, label: "linguagem de promoção agressiva" },
  { re: /[úu]ltim[ao]s? (vagas?|dias?|horas?|chance)/i, weight: 25, label: "urgência artificial" },
  { re: /clique (aqui|agora|no link)/i, weight: 20, label: "chamada para clique" },
  { re: /(gr[áa]tis|de gra[çc]a)\s*!*/i, weight: 10, label: "apelo a gratuidade" },
  { re: /\b(ganhe|receba)\b.{0,20}\b(agora|hoje|j[áa])\b/i, weight: 18, label: "promessa de ganho imediato" },
  { re: /(https?:\/\/|www\.)/i, weight: 15, label: "link no primeiro contato" },
  { re: /(💰|🤑|🔥{2,}|‼️|📢)/u, weight: 12, label: "emoji de propaganda" },
];

// ------------------------------------------------------------
// AVALIAÇÃO
// ------------------------------------------------------------

export interface GateInput {
  message: string;
  dossier: Dossier;
  strategy: Strategy;
  thresholds?: Partial<QualityThresholds>;
  /** Mensagens já enviadas a este lead — para barrar repetição. */
  previousMessages?: string[];
}

export function evaluate(input: GateInput): QualityVerdict {
  const thresholds: QualityThresholds = { ...DEFAULT_THRESHOLDS, ...input.thresholds };
  const message = (input.message ?? "").trim();
  const issues: QualityIssue[] = [];

  // ---- Guarda de sanidade ----
  if (message.length === 0) {
    return blocked(issues, {
      code: "empty",
      severity: "block",
      message: "A mensagem está vazia.",
    });
  }

  const words = message.split(/\s+/).filter(Boolean);

  const scores: QualityScores = {
    personalization: scorePersonalization(message, input.dossier, issues),
    relevance: scoreRelevance(message, input.dossier, input.strategy, issues),
    naturalness: scoreNaturalness(message, words, issues),
    factuality: scoreFactuality(message, evidenceFrom(input.dossier, input.strategy), issues),
    spamRisk: scoreSpamRisk(message, issues),
    offerAdherence: scoreOfferAdherence(message, input.strategy, issues),
  };

  // ---- Limite de tamanho: regra dura da estratégia ----
  if (words.length > input.strategy.maxWords * 1.35) {
    issues.push({
      code: "too_long",
      severity: "block",
      message: `A mensagem tem ${words.length} palavras; o limite desta estratégia é ${input.strategy.maxWords}.`,
    });
  }

  // ---- Repetição: mandar de novo o que já foi mandado é o pior sinal ----
  for (const previous of input.previousMessages ?? []) {
    if (similarity(message, previous) > 0.7) {
      issues.push({
        code: "repeated",
        severity: "block",
        message: "Esta mensagem é quase idêntica a outra já enviada para este lead.",
        excerpt: previous.slice(0, 80),
      });
      break;
    }
  }

  const overall = Math.round(
    scores.personalization * 0.2 +
      scores.relevance * 0.2 +
      scores.naturalness * 0.15 +
      scores.factuality * 0.3 +
      scores.offerAdherence * 0.1 +
      (100 - scores.spamRisk) * 0.05,
  );

  const belowThreshold =
    scores.personalization < thresholds.personalization ||
    scores.relevance < thresholds.relevance ||
    scores.naturalness < thresholds.naturalness ||
    scores.factuality < thresholds.factuality ||
    scores.spamRisk > thresholds.maxSpamRisk ||
    scores.offerAdherence < thresholds.offerAdherence;

  if (belowThreshold) {
    issues.push({
      code: "below_threshold",
      severity: "block",
      message: describeThresholdFailure(scores, thresholds),
    });
  }

  return {
    approved: !issues.some((i) => i.severity === "block"),
    scores,
    overall,
    issues,
  };
}

function blocked(issues: QualityIssue[], issue: QualityIssue): QualityVerdict {
  issues.push(issue);
  return {
    approved: false,
    overall: 0,
    scores: {
      personalization: 0, relevance: 0, naturalness: 0,
      factuality: 0, spamRisk: 100, offerAdherence: 0,
    },
    issues,
  };
}

// ------------------------------------------------------------
// NOTAS
// ------------------------------------------------------------

function scorePersonalization(message: string, dossier: Dossier, issues: QualityIssue[]): number {
  let score = 30;

  // Nome real da empresa citado
  if (containsBusinessName(message, dossier.businessName)) {
    score += 25;
  } else {
    issues.push({
      code: "no_business_name",
      severity: "warn",
      message: "A mensagem não cita o nome da empresa.",
    });
  }

  // Fato específico do dossiê reaproveitado no texto
  const specificFacts = dossier.facts.filter(
    (f) => !["Empresa", "Segmento", "Localização"].includes(f.label) && f.confidence >= 0.7,
  );
  const usedFacts = specificFacts.filter((f) => usesFact(message, f.value));
  score += Math.min(30, usedFacts.length * 15);

  if (usedFacts.length === 0 && specificFacts.length > 0) {
    issues.push({
      code: "ignored_context",
      severity: "warn",
      message: "Havia contexto específico disponível e a mensagem não usou nada dele.",
    });
  }

  // Nicho ou cidade dão um empurrão pequeno — são fracos como personalização.
  if (dossier.niche && new RegExp(escapeRe(dossier.niche.split(/\s+/)[0]), "i").test(message)) score += 8;
  if (dossier.location && new RegExp(escapeRe(dossier.location.split(/[-,]/)[0].trim()), "i").test(message)) score += 7;

  // Frase de encher linguiça derruba a nota: é o oposto de personalizar.
  for (const filler of FILLER_PHRASES) {
    const hit = message.match(filler);
    if (hit) {
      score -= 25;
      issues.push({
        code: "filler_phrase",
        severity: "warn",
        message: "Contém frase genérica que serviria para qualquer empresa.",
        excerpt: hit[0],
      });
    }
  }

  return clamp(score);
}

function scoreRelevance(
  message: string,
  dossier: Dossier,
  strategy: Strategy,
  issues: QualityIssue[],
): number {
  let score = 50;

  // O gancho definido pela estratégia precisa aparecer.
  if (strategy.hook) {
    if (usesFact(message, strategy.hook.value)) {
      score += 30;
    } else {
      score -= 10;
      issues.push({
        code: "hook_missing",
        severity: "warn",
        message: `A estratégia definiu como gancho "${strategy.hook.value}", e a mensagem não usou.`,
      });
    }
  }

  // Precisa terminar pedindo algo. Mensagem sem pedido não gera resposta.
  const hasAsk = /\?|\bposso\b|\bquer\b|\bfaz sentido\b|\bte mando\b|\bme (diz|fala|avisa)\b/i.test(message);
  if (hasAsk) {
    score += 20;
  } else {
    score -= 25;
    issues.push({
      code: "no_cta",
      severity: "warn",
      message: "A mensagem não faz pergunta nem pedido — não há motivo para o lead responder.",
    });
  }

  // Pedir reunião no primeiro contato derruba resposta.
  const isFirstTouch = dossier.messageCount.fromAgent === 0;
  if (isFirstTouch && /\b(reuni[ãa]o|call|ag(enda|endar)|hor[áa]rio|marcar)\b/i.test(message)) {
    score -= 20;
    issues.push({
      code: "premature_meeting",
      severity: "warn",
      message: "Pede reunião logo no primeiro contato — o pedido grande cedo demais reduz a resposta.",
    });
  }

  return clamp(score);
}

function scoreNaturalness(message: string, words: string[], issues: QualityIssue[]): number {
  let score = 75;

  for (const opener of GENERIC_OPENERS) {
    const hit = message.match(opener);
    if (hit) {
      score -= 35;
      issues.push({
        code: "generic_opener",
        severity: "warn",
        message: "Abertura de mala direta.",
        excerpt: hit[0],
      });
      break;
    }
  }

  // Formalidade de e-mail corporativo no WhatsApp soa a robô.
  const formal = message.match(/\b(atenciosamente|cordialmente|sr\.|sra\.|vossa|desde j[áa] agrade[çc]o)\b/i);
  if (formal) {
    score -= 25;
    issues.push({
      code: "too_formal",
      severity: "warn",
      message: "Formalidade de e-mail corporativo.",
      excerpt: formal[0],
    });
  }

  // Markdown vaza direto do modelo e denuncia automação.
  if (/(\*\*|^#{1,6}\s|^[-*]\s+\w+.*\n[-*]\s)/m.test(message)) {
    score -= 20;
    issues.push({
      code: "markdown",
      severity: "warn",
      message: "Contém markdown ou lista — WhatsApp mostra os símbolos crus.",
    });
  }

  // Muitos emojis viram propaganda.
  const emojis = (message.match(/\p{Extended_Pictographic}/gu) ?? []).length;
  if (emojis > 2) {
    score -= 15;
    issues.push({ code: "emoji_excess", severity: "warn", message: `${emojis} emojis na mensagem.` });
  }

  // Texto longo demais de desconhecido não é lido.
  if (words.length > 90) score -= 15;
  // Texto curto demais não diz nada.
  if (words.length < 8) {
    score -= 20;
    issues.push({ code: "too_short", severity: "warn", message: "Mensagem curta demais para gerar resposta." });
  }

  return clamp(score);
}

/**
 * A nota que importa. Procura afirmação sem lastro no dossiê.
 */
/**
 * Tudo que dá lastro a uma afirmação, reunido num objeto só.
 *
 * A checagem de factualidade recebia `dossier` e `strategy` inteiros, o que a
 * prendia à primeira abordagem — a única etapa que tem esses dois. A conversa
 * depois da resposta do lead não tem estratégia nenhuma, e era justamente
 * onde nada era conferido: o primeiro contato passava por seis avaliações e a
 * segunda mensagem, por nenhuma. Uma estatística inventada na quarta troca
 * custa a mesma credibilidade que na primeira.
 */
export interface FactualityEvidence {
  /** Números que podem aparecer sem inventar: vieram de fato observado. */
  allowedNumbers: string[];
  /** Valores dos fatos observados, para sustentar afirmação sobre o lead. */
  factValues: string[];
  /** Existe preço cadastrado que autorize falar em valor. */
  hasPricing: boolean;
  /** Existe caso de sucesso cadastrado que autorize citar cliente anterior. */
  hasCaseStudies: boolean;
}

/** Monta a evidência a partir do que a esteira de primeira abordagem produz. */
export function evidenceFrom(dossier: Dossier, strategy: Strategy): FactualityEvidence {
  return {
    allowedNumbers: allowedNumbers(dossier),
    factValues: dossier.facts.map((f) => f.value),
    hasPricing: Boolean(strategy.offer?.pricingInfo),
    hasCaseStudies: (strategy.offer?.caseStudies.length ?? 0) > 0,
  };
}

/**
 * Confere só a factualidade de um texto. Entrada leve, para quem não tem
 * dossiê nem estratégia — a conversa, o follow-up, a proposta.
 *
 * Devolve os problemas que impedem o envio, não uma nota de estilo. Texto
 * feio é problema de qualidade; texto que afirma o que não aconteceu é outra
 * categoria de coisa.
 */
export function checkFactuality(
  message: string,
  evidence: FactualityEvidence,
): { score: number; issues: QualityIssue[]; approved: boolean } {
  const issues: QualityIssue[] = [];
  const score = scoreFactuality((message ?? "").trim(), evidence, issues);
  return {
    score,
    issues,
    approved: !issues.some((i) => i.severity === "block"),
  };
}

function scoreFactuality(
  message: string,
  evidence: FactualityEvidence,
  issues: QualityIssue[],
): number {
  let score = 100;

  // ---- Número sem fonte ----
  const allowed = new Set(evidence.allowedNumbers);
  // Números que sempre podem aparecer sem virem do dossiê: contagem trivial
  // de tempo em frases como "2 minutos", "1 minuto".
  const trivial = /\b(1|2|3|5|10)\s*(min|minuto|minutos|segundo|segundos)\b/i;

  const numberMatches = [...message.matchAll(/(?:R\$\s*)?\d+(?:[.,]\d+)?\s*(?:%|mil|k|x|reais)?/gi)];
  for (const match of numberMatches) {
    const raw = match[0];
    if (trivial.test(raw)) continue;

    const bare = raw.replace(/[^\d.,]/g, "").replace(",", ".");
    if (allowed.has(bare)) continue;

    // Percentual, dinheiro e "mil" nunca são coincidência: é estatística
    // inventada, que foi exatamente o defeito original do sistema.
    const isClaim = /%|R\$|mil|reais|k\b|x\b/i.test(raw);
    score -= isClaim ? 60 : 20;
    issues.push({
      code: "unsourced_number",
      severity: isClaim ? "block" : "warn",
      message: `O número "${raw.trim()}" não veio de nenhum fato do dossiê.`,
      excerpt: raw.trim(),
    });
  }

  // ---- Preço fora do catálogo ----
  // A regra vale mesmo quando o número TEM lastro. Se o lead disse "posso
  // pagar 500", o agente pode repetir 500 — mas não pode responder "fechamos
  // por R$ 500" sem esse preço existir no catálogo. Repetir é escutar;
  // cravar valor é assumir compromisso comercial que ninguém autorizou.
  //
  // Exige indício de PREÇO, não só de dinheiro. "Você comentou que fatura 40
  // mil" cita valor e não fala de preço nenhum — barrar isso impediria o
  // agente de demonstrar que prestou atenção, que é o oposto do objetivo.
  //
  // A conferência é por frase, e pergunta não conta. "Seu orçamento tá na
  // faixa de 500?" é qualificação — o agente está perguntando, não cravando.
  // "Fica 500 por mês" é proposta. A mesma quantia, papéis opostos.
  const PRICE_CUE =
    /\b(pre[çc]o|custa|custo|investimento|mensalidade|or[çc]amento|fica|sai por|cobro|cobramos)\b/i;

  const cravaPreco = message.split(/(?<=[.!?])\s+/).some((frase) => {
    if (frase.trim().endsWith("?")) return false;
    if (!PRICE_CUE.test(frase)) return false;

    // Tira as expressões de tempo antes de procurar número: "custa 2 minutos
    // do seu tempo" fala de custo e não tem valor nenhum.
    const semTempo = frase.replace(/\b\d+\s*(min|minutos?|segundos?|horas?|dias?)\b/gi, "");
    return /\d/.test(semTempo);
  });

  if (cravaPreco && !evidence.hasPricing) {
    score -= 50;
    issues.push({
      code: "price_without_catalog",
      severity: "block",
      message: "A mensagem crava um valor e não há preço cadastrado no catálogo desta oferta.",
    });
  }

  // ---- Prova social sem case cadastrado ----
  for (const pattern of FABRICATED_PROOF) {
    const hit = message.match(pattern);
    if (hit && !evidence.hasCaseStudies) {
      score -= 55;
      issues.push({
        code: "fabricated_proof",
        severity: "block",
        message: "Cita cliente ou resultado anterior, e não há caso cadastrado no catálogo.",
        excerpt: hit[0],
      });
      break;
    }
  }

  // ---- Garantia de resultado ----
  for (const pattern of GUARANTEE_CLAIMS) {
    const hit = message.match(pattern);
    if (hit) {
      score -= 60;
      issues.push({
        code: "guarantee",
        severity: "block",
        message: "Promete resultado garantido.",
        excerpt: hit[0],
      });
      break;
    }
  }

  // ---- Afirmação sobre a operação interna do lead ----
  // A regra é sobre AFIRMAR. Pergunta não afirma nada, e o prompt manda
  // justamente transformar hipótese em pergunta — "vocês estão perdendo
  // clientes?" no lugar de "vocês estão perdendo clientes". Enquanto o gate
  // barrava as duas formas igual, a saída que o próprio prompt oferecia era
  // uma armadilha: o modelo obedecia e continuava reprovado.
  const afirmacoes = message
    .split(/(?<=[.!?])\s+/)
    .filter((frase) => !frase.trim().endsWith("?"));

  for (const pattern of UNVERIFIABLE_CLAIMS) {
    const hit = afirmacoes.map((frase) => frase.match(pattern)).find(Boolean);
    if (!hit) continue;

    // Só é problema se o que vem depois não estiver no dossiê.
    const supported = evidence.factValues.some((value) => usesFact(message, value));
    if (!supported) {
      score -= 45;
      issues.push({
        code: "unverifiable_claim",
        severity: "block",
        message: "Afirma algo sobre a situação interna da empresa que não foi observado.",
        excerpt: hit[0],
      });
      break;
    }
  }

  return clamp(score);
}

function scoreSpamRisk(message: string, issues: QualityIssue[]): number {
  let risk = 0;

  for (const marker of SPAM_MARKERS) {
    const hit = message.match(marker.re);
    if (hit) {
      risk += marker.weight;
      issues.push({
        code: "spam_marker",
        severity: "warn",
        message: `Risco de bloqueio: ${marker.label}.`,
        excerpt: hit[0].slice(0, 40),
      });
    }
  }

  return clamp(risk);
}

function scoreOfferAdherence(message: string, strategy: Strategy, issues: QualityIssue[]): number {
  const offer = strategy.offer;
  // Sem oferta definida a mensagem só pode abrir conversa — e aí adesão
  // não se aplica; devolver nota cheia evita reprovar por algo que não foi pedido.
  if (!offer) return 100;

  let score = 50;

  const offerWords = offer.name
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 3);
  const mentioned = offerWords.some((w) => new RegExp(escapeRe(w), "i").test(message));

  if (mentioned) score += 30;

  const benefitMentioned = offer.benefits.some((b) =>
    b.toLowerCase().split(/\s+/).filter((w) => w.length > 4).some((w) => new RegExp(escapeRe(w), "i").test(message))
  );
  if (benefitMentioned) score += 20;

  if (!mentioned && !benefitMentioned) {
    issues.push({
      code: "offer_absent",
      severity: "warn",
      message: `A mensagem não conecta com a oferta escolhida ("${offer.name}").`,
    });
  }

  // Vender várias coisas ao mesmo tempo dilui e confunde.
  const listPattern = /\b\w+,\s*\w+(,\s*\w+)+\s*(e|ou)\s+\w+/;
  if (listPattern.test(message)) {
    score -= 20;
    issues.push({
      code: "multiple_offers",
      severity: "warn",
      message: "Parece listar vários serviços. Uma oferta por mensagem converte mais.",
    });
  }

  return clamp(score);
}

// ------------------------------------------------------------
// AUXILIARES
// ------------------------------------------------------------

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** O nome pode aparecer parcial ("Clínica Sorriso" → "Sorriso"). */
function containsBusinessName(message: string, businessName: string): boolean {
  const msg = normalizeText(message);
  const parts = normalizeText(businessName)
    .split(/\s+/)
    .filter((w) => w.length > 3 && !["clinica", "loja", "centro", "casa", "grupo", "studio", "espaco"].includes(w));

  if (parts.length === 0) return msg.includes(normalizeText(businessName));
  return parts.some((p) => msg.includes(p));
}

/** O fato foi realmente aproveitado, e não só tangenciado. */
function usesFact(message: string, factValue: string): boolean {
  const msg = normalizeText(message);
  const words = normalizeText(factValue)
    .split(/\s+/)
    .filter((w) => w.length > 4);

  if (words.length === 0) return false;
  const hits = words.filter((w) => msg.includes(w)).length;
  return hits / words.length >= 0.4;
}

/** Jaccard sobre palavras. Suficiente para pegar reenvio do mesmo texto. */
function similarity(a: string, b: string): number {
  const setA = new Set(normalizeText(a).split(/\s+/).filter((w) => w.length > 3));
  const setB = new Set(normalizeText(b).split(/\s+/).filter((w) => w.length > 3));
  if (setA.size === 0 || setB.size === 0) return 0;

  let shared = 0;
  for (const w of setA) if (setB.has(w)) shared++;
  return shared / Math.min(setA.size, setB.size);
}

function describeThresholdFailure(scores: QualityScores, t: QualityThresholds): string {
  const failed: string[] = [];
  if (scores.factuality < t.factuality) failed.push(`factualidade ${scores.factuality} < ${t.factuality}`);
  if (scores.personalization < t.personalization) failed.push(`personalização ${scores.personalization} < ${t.personalization}`);
  if (scores.relevance < t.relevance) failed.push(`relevância ${scores.relevance} < ${t.relevance}`);
  if (scores.naturalness < t.naturalness) failed.push(`naturalidade ${scores.naturalness} < ${t.naturalness}`);
  if (scores.spamRisk > t.maxSpamRisk) failed.push(`risco de spam ${scores.spamRisk} > ${t.maxSpamRisk}`);
  if (scores.offerAdherence < t.offerAdherence) failed.push(`aderência à oferta ${scores.offerAdherence} < ${t.offerAdherence}`);
  return `Abaixo do limite configurado: ${failed.join(", ")}.`;
}

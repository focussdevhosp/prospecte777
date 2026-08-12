// ============================================================
// STRATEGY AGENT
// ============================================================
// Decide COMO abordar antes de escrever. Sem esta etapa, o copywriter recebe
// um lead e um serviço e improvisa — e improviso em escala vira template.
//
// A escolha do ângulo depende de uma pergunta só: o que eu realmente sei
// sobre esta empresa?
//
//   Sei de um problema verificado  → diagnóstico (afirmo, tenho prova)
//   Sei que já falamos antes       → reativação / follow-up
//   Sei pouco                      → consultiva (pergunto) ou curta
//
// Fingir diagnóstico sem ter o dado é exatamente o que produzia
// "notei que vocês podem melhorar a presença digital" — frase que serve para
// qualquer empresa do planeta e por isso não serve para nenhuma.

import type {
  OutreachChannel,
  ApproachAngle,
  CampaignGoal,
  Dossier,
  Fact,
  Offer,
  OfferMatch,
  Qualification,
  Strategy,
} from "./types.ts";

export interface StrategyInput {
  dossier: Dossier;
  qualification: Qualification;
  match: OfferMatch;
  goal: CampaignGoal;
  /** Estilo configurado pelo dono da conta. */
  formality?: "informal" | "neutro" | "formal";
  /** Por onde sai. Padrão WhatsApp, que era o único canal até existir e-mail. */
  channel?: OutreachChannel;
}

/**
 * CTA por objetivo. A primeira mensagem NUNCA pede reunião: o pedido grande
 * na abertura é o que faz a pessoa não responder. Pede-se permissão para
 * mandar algo — o passo seguinte é que leva à agenda.
 */
const FIRST_TOUCH_CTA: Record<CampaignGoal, string> = {
  agendar_demonstracao: "peça permissão para mostrar como funciona — não peça o horário ainda",
  solicitar_orcamento: "pergunte se pode enviar uma estimativa — não peça dados ainda",
  falar_com_vendedor: "pergunte se faz sentido trocar uma ideia rápida",
  vender: "pergunte se pode explicar em uma mensagem como funciona",
  outro: "faça uma pergunta curta e fácil de responder",
};

/** No segundo contato em diante o pedido pode crescer. */
const FOLLOW_UP_CTA: Record<CampaignGoal, string> = {
  agendar_demonstracao: "ofereça mostrar funcionando e sugira que ele diga um horário",
  solicitar_orcamento: "ofereça montar a proposta",
  falar_com_vendedor: "ofereça uma conversa rápida",
  vender: "pergunte se quer seguir com a contratação",
  outro: "proponha o próximo passo concreto",
};

export function buildStrategy(input: StrategyInput): Strategy {
  const { dossier, qualification, match, goal } = input;
  const channel: OutreachChannel = input.channel ?? "whatsapp";
  const rationale: string[] = [];

  const isFollowUp = dossier.messageCount.fromAgent > 0;
  const hasReplied = dossier.messageCount.fromLead > 0;

  // ---- O gancho: sempre um fato, nunca uma hipótese ----
  const hook = pickHook(dossier);
  if (hook) {
    rationale.push(`Gancho: ${hook.label} — ${hook.value} (fonte: ${hook.source})`);
  } else {
    rationale.push("Nenhum fato forte disponível — a mensagem não vai afirmar nada sobre a empresa.");
  }

  // ---- Ângulo ----
  const angle = pickAngle({ dossier, hook, isFollowUp, hasReplied, match });
  rationale.push(`Ângulo: ${angle} — ${ANGLE_WHY[angle]}`);

  // ---- Oferta ----
  if (match.offer) {
    rationale.push(`Oferta: ${match.offer.name} (confiança ${match.confidence}%) — ${match.reasons[0] ?? "sem motivo registrado"}`);
  } else {
    rationale.push("Sem oferta no catálogo — a mensagem só pode abrir conversa, não propor.");
  }

  // ---- Tamanho ----
  // Primeira mensagem curta é regra do produto, não preferência estética:
  // texto longo de desconhecido no WhatsApp é ignorado ou denunciado.
  // O limite muda com o canal, e a diferença não é estética. No WhatsApp a
  // mensagem aparece inteira na notificação: passar de meia dúzia de linhas
  // é pedir para ser fechada antes de ser lida. No e-mail, a mesma
  // brevidade parece recado sem contexto — e recado sem contexto de
  // remetente desconhecido vira spam na cabeça de quem recebe.
  const limiteBase = isFollowUp ? 40 : angle === "curta" ? 30 : 55;
  const maxWords = channel === "email" ? Math.round(limiteBase * 2.2) : limiteBase;
  rationale.push(`Limite: ${maxWords} palavras (${isFollowUp ? "follow-up" : "primeiro contato"})`);

  const cta = isFollowUp || hasReplied ? FOLLOW_UP_CTA[goal] : FIRST_TOUCH_CTA[goal];

  return {
    angle,
    goal,
    objective: hasReplied
      ? "Avançar a conversa um passo em direção ao objetivo da missão."
      : "Conseguir uma resposta. Não é vender nem agendar ainda.",
    hook,
    offer: match.offer,
    formality: input.formality ?? "informal",
    cta,
    channel,
    expectedObjections: expectedObjections(match.offer, qualification),
    rationale,
    maxWords,
  };
}

const ANGLE_WHY: Record<ApproachAngle, string> = {
  diagnostico: "há problema verificado no site, dá para afirmar com prova",
  oportunidade: "não há problema evidente, mas há espaço concreto de ganho",
  consultiva: "sabe-se pouco sobre a empresa; perguntar é mais honesto que supor",
  curta: "contexto muito raso; mensagem mínima tem mais chance que texto vago",
  prova: "há caso real cadastrado no catálogo para usar como referência",
  reativacao: "houve contato anterior sem resposta há bastante tempo",
  follow_up: "já houve mensagem recente sem resposta",
};

/**
 * Escolhe o fato que abre a mensagem, na ordem em que ele é convincente.
 *
 * Problema verificado no site vence tudo: é objetivo, é checável e o lead
 * consegue confirmar sozinho em dez segundos.
 */
function pickHook(dossier: Dossier): Fact | null {
  const byLabel = (label: string) =>
    dossier.facts.find((f) => f.label === label && f.confidence >= 0.7);

  // Mudança recente ganha de tudo. É a diferença entre "reparei que o site de
  // vocês saiu do ar" e "vi que vocês não têm site" — a primeira tem data e
  // motivo para a mensagem chegar hoje; a segunda vale há dois anos e o
  // destinatário sabe disso.
  const mudanca = dossier.facts.find((f) => f.label === "Mudança recente");
  if (mudanca) return mudanca;

  const siteProblem = dossier.facts.find(
    (f) => f.label === "Problema verificado no site",
  );
  if (siteProblem) return siteProblem;

  const noSite = dossier.facts.find(
    (f) => f.label === "Site" && /não foi encontrado/i.test(f.value),
  );
  if (noSite) return noSite;

  const need = byLabel("Necessidade dita pelo lead");
  if (need) return need;

  const bio = byLabel("Bio do Instagram");
  if (bio) return bio;

  const rating = byLabel("Avaliação pública");
  if (rating && !/sem avaliações/i.test(rating.value)) return rating;

  return null;
}

function pickAngle(ctx: {
  dossier: Dossier;
  hook: Fact | null;
  isFollowUp: boolean;
  hasReplied: boolean;
  match: OfferMatch;
}): ApproachAngle {
  const { dossier, hook, isFollowUp, hasReplied, match } = ctx;

  if (isFollowUp && !hasReplied) {
    const days = daysSince(dossier.lastContactAt);
    return days != null && days > 30 ? "reativacao" : "follow_up";
  }

  if (hook?.label === "Problema verificado no site") return "diagnostico";
  if (hook?.label === "Site" && /não foi encontrado/i.test(hook.value)) return "diagnostico";
  if (hook?.label === "Necessidade dita pelo lead") return "consultiva";

  if (match.offer && match.offer.caseStudies.length > 0 && match.confidence >= 60) {
    return "prova";
  }

  if (match.confidence >= 50 && dossier.observedNeeds.length > 0) return "oportunidade";
  if (hook) return "consultiva";
  return "curta";
}

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

/**
 * O que provavelmente vem de volta. Serve para o Conversation Agent já
 * chegar com resposta pronta em vez de improvisar na hora.
 */
function expectedObjections(offer: Offer | null, qualification: Qualification): string[] {
  const objections: string[] = [];

  // Objeções já ditas por este lead vêm primeiro — são certeza, não previsão.
  for (const reason of qualification.reasons) {
    if (reason.label === "Objeções em aberto") {
      objections.push(...reason.evidence.split("; "));
    }
  }

  if (offer) {
    objections.push(...Object.keys(offer.objections));
  }

  if (objections.length === 0) {
    objections.push("já tenho fornecedor", "está caro", "não tenho interesse", "me chama depois");
  }

  return [...new Set(objections)].slice(0, 6);
}

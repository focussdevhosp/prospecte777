// ============================================================
// O QUE A CONVERSA PODE AFIRMAR
// ============================================================
// O contrato de veracidade — só afirmar o que foi observado, hipótese vira
// pergunta — valia para a primeira abordagem e parava ali. Da segunda
// mensagem em diante a IA falava sem nenhuma conferência.
//
// Isso é ao contrário do risco real. A primeira mensagem é curta e o lead
// desconfia dela por natureza. É na conversa, depois que ele começou a
// confiar, que um número inventado vira decisão de compra tomada em cima de
// coisa que nunca aconteceu.
//
// Aqui se monta a evidência da CONVERSA: o que pode ser afirmado agora,
// incluindo — e isso é o ponto delicado — o que o próprio lead disse.

import type { Dossier, Fact, Hypothesis } from "./types.ts";
import type { FactualityEvidence } from "./quality-gate.ts";

/** Linha de `lead_memory`. */
export interface MemoryRow {
  memory_type?: string | null;
  key?: string | null;
  value?: string | null;
  confidence?: number | null;
}

/** Linha de `chat_messages`. */
export interface MessageRow {
  sender_type?: string | null;
  content?: string | null;
}

/** Linha de `service_intelligence`. */
export interface ServiceRow {
  pricing_info?: string | null;
  case_studies?: string[] | null;
}

/**
 * Extrai todos os números de um texto, em forma comparável.
 *
 * Mesma normalização usada em `allowedNumbers`: sem cifrão, sem símbolo de
 * porcentagem, vírgula virando ponto. "R$ 3.500,00" e "3500,00" precisam
 * bater, senão o valor que o próprio lead disse seria acusado de inventado.
 */
export function numbersIn(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(/\d+(?:[.,]\d+)?/g)) {
    found.push(match[0].replace(",", "."));
  }
  return found;
}

/**
 * Monta a evidência de uma conversa em andamento.
 *
 * A decisão que mais importa aqui: **número dito pelo lead é fato.** Se ele
 * escreveu "hoje eu faturo uns 40 mil", o agente pode responder falando em 40
 * mil — repetir o que a pessoa acabou de dizer é escutar, não inventar.
 * Sem isso, a checagem barraria justamente a resposta mais atenta que o
 * agente poderia dar, e o efeito prático seria ninguém querer usar a
 * checagem.
 *
 * O que continua proibido é o número que aparece do nada: nem o lead disse,
 * nem está no dossiê, nem no catálogo.
 */
export function buildConversationEvidence(input: {
  lead: Record<string, unknown>;
  memories?: MemoryRow[] | null;
  messages?: MessageRow[] | null;
  services?: ServiceRow[] | null;
  portfolioCount?: number;
}): FactualityEvidence {
  const { lead } = input;

  const factValues: string[] = [];
  const allowed: string[] = [];

  const push = (value: unknown) => {
    const texto = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
    if (!texto) return;
    factValues.push(texto);
    allowed.push(...numbersIn(texto));
  };

  // ---- Dados cadastrais, que alguém observou de fato ----
  push(lead.business_name);
  push(lead.niche);
  push(lead.location);
  push(lead.website);
  push(lead.address);
  if (lead.rating != null) push(String(lead.rating));
  if (lead.reviews_count != null) push(String(lead.reviews_count));

  // ---- Achados da auditoria de site ----
  const audit = lead.site_audit as { findings?: Array<{ title?: string; detail?: string }> } | null;
  for (const finding of audit?.findings ?? []) {
    push(finding.title);
    push(finding.detail);
  }

  // ---- Memória comercial ----
  // Só o que foi registrado com confiança alta. Memória incerta serve para
  // guiar a próxima pergunta, não para virar afirmação na cara do cliente.
  for (const memory of input.memories ?? []) {
    if ((memory.confidence ?? 1) < 0.7) continue;
    push(memory.value);
  }

  // ---- O que o próprio lead escreveu ----
  for (const message of input.messages ?? []) {
    if (message.sender_type !== "lead") continue;
    const texto = (message.content ?? "").trim();
    if (!texto) continue;
    factValues.push(texto);
    allowed.push(...numbersIn(texto));
  }

  // ---- Catálogo ----
  const services = input.services ?? [];
  const hasPricing = services.some(
    (s) => typeof s.pricing_info === "string" && s.pricing_info.trim().length > 0,
  );
  // Portfólio publicado conta como caso: são trabalhos que existem e cujo
  // link pode ser mandado. Case escrito no catálogo também.
  const hasCaseStudies =
    (input.portfolioCount ?? 0) > 0 ||
    services.some((s) => (s.case_studies?.length ?? 0) > 0);

  for (const service of services) {
    if (service.pricing_info) push(service.pricing_info);
  }

  return {
    allowedNumbers: [...new Set(allowed)],
    factValues,
    hasPricing,
    hasCaseStudies,
  };
}

/**
 * Separa, para o prompt, o que pode ser afirmado do que só pode virar
 * pergunta.
 *
 * O prompt da conversa listava "Dores identificadas" e "Oportunidades" em pé
 * de igualdade com o nome da empresa — como se fossem todos a mesma coisa.
 * Não são: o nome foi lido de um cadastro, a dor foi deduzida por um modelo.
 * Misturados, o segundo era afirmado com a mesma segurança do primeiro, e o
 * lead ouvia "sei que vocês estão perdendo clientes" sobre uma dedução.
 */
export function renderConversationEvidence(
  facts: Fact[],
  hypotheses: Hypothesis[],
): string {
  const linhas: string[] = [];

  linhas.push("# FATOS OBSERVADOS (pode afirmar — sempre com a origem à mão)");
  if (facts.length === 0) {
    linhas.push("- Nada observado além do que o lead disse nesta conversa.");
  } else {
    for (const fact of facts) {
      linhas.push(`- ${fact.label}: ${fact.value} [fonte: ${fact.source}]`);
    }
  }

  linhas.push("");
  linhas.push("# HIPÓTESES (NÃO pode afirmar — só perguntar)");
  if (hypotheses.length === 0) {
    linhas.push("- Nenhuma.");
  } else {
    for (const hypothesis of hypotheses) {
      linhas.push(`- ${hypothesis.statement} → vire pergunta, nunca afirmação.`);
    }
  }

  return linhas.join("\n");
}

/** Atalho quando já existe um dossiê montado. */
export function renderDossierEvidence(dossier: Dossier): string {
  return renderConversationEvidence(dossier.facts, dossier.hypotheses);
}

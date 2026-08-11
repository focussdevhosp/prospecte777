// ============================================================
// RESEARCH + ENRICHMENT AGENT — LEAD 360
// ============================================================
// O gerador de mensagem antigo recebia seis campos: nome, nicho, cidade,
// rating, reviews e "tem site sim/não". Enquanto isso o banco já guardava
// auditoria completa do site, dores observadas, memória da conversa e
// histórico — coletados por outras partes do produto e nunca usados na hora
// que mais importa.
//
// Este módulo junta tudo num dossiê, e cada item sai etiquetado com a fonte.
// O que não tem fonte não entra.

import type { Dossier, Fact, Hypothesis, MemoryEntry } from "./types.ts";

// Formato mínimo das linhas lidas — evita depender do tipo gerado do Supabase.
export interface LeadRow {
  id: string;
  business_name: string;
  phone?: string | null;
  niche?: string | null;
  location?: string | null;
  website?: string | null;
  stage?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  email?: string | null;
  address?: string | null;
  company_description?: string | null;
  industry?: string | null;
  employee_count?: string | null;
  founded_year?: number | null;
  instagram_url?: string | null;
  instagram_bio?: string | null;
  facebook_url?: string | null;
  linkedin_url?: string | null;
  pain_points?: string[] | null;
  service_opportunities?: string[] | null;
  conversation_summary?: string | null;
  source?: string | null;
  site_audit?: SiteAuditRow | null;
  site_audited_at?: string | null;
  last_contact_at?: string | null;
  last_response_at?: string | null;
  total_messages_exchanged?: number | null;
  enriched_at?: string | null;
}

interface SiteAuditRow {
  url?: string | null;
  reachable?: boolean;
  score?: number;
  pitch?: string;
  findings?: { id: string; severity: string; title: string; impact: string; opportunity: string }[];
  checked_at?: string;
}

export interface MemoryRow {
  memory_type: string;
  key: string;
  value: string;
  confidence?: number | null;
}

export interface MessageRow {
  sender_type: string;
  content: string;
  sent_at?: string | null;
}

const SOURCE_LABEL: Record<string, string> = {
  openstreetmap: "OpenStreetMap (cadastro do estabelecimento)",
  duckduckgo: "busca na web",
  serper: "Google Places",
  serpapi: "Google Maps",
  import: "importação do usuário",
  manual: "cadastro manual",
  whatsapp_group: "grupo de WhatsApp",
  instagram: "perfil do Instagram",
  facebook: "página do Facebook",
  cnpj: "base pública de CNPJ",
};

function sourceLabel(raw?: string | null): string {
  if (!raw) return "origem não registrada";
  return SOURCE_LABEL[raw] ?? raw;
}

const MEMORY_TYPE_MAP: Record<string, MemoryEntry["type"]> = {
  need: "need",
  pain: "need",
  interest: "interest",
  preference: "preference",
  objection: "objection",
  commitment: "commitment",
  context: "context",
  personal: "context",
  next_action: "next_action",
};

/**
 * Monta o dossiê. Função pura: recebe linhas, devolve estrutura. Toda a
 * decisão de "isto é fato ou é leitura minha" acontece aqui, num lugar só.
 */
export function buildDossier(input: {
  lead: LeadRow;
  memories?: MemoryRow[];
  messages?: MessageRow[];
}): Dossier {
  const { lead } = input;
  const facts: Fact[] = [];
  const hypotheses: Hypothesis[] = [];
  const observedNeeds: string[] = [];
  const origins: string[] = [];

  const origin = sourceLabel(lead.source);
  origins.push(origin);

  // ---- Identidade ----
  facts.push({
    label: "Empresa",
    value: lead.business_name,
    source: origin,
    confidence: 1,
  });

  if (lead.niche) {
    facts.push({ label: "Segmento", value: lead.niche, source: origin, confidence: 0.9 });
  }
  if (lead.location) {
    facts.push({ label: "Localização", value: lead.location, source: origin, confidence: 0.9 });
  }
  if (lead.address) {
    facts.push({ label: "Endereço", value: lead.address, source: origin, confidence: 0.8 });
  }

  // ---- Reputação pública ----
  if (typeof lead.rating === "number") {
    const reviews = lead.reviews_count ?? 0;
    facts.push({
      label: "Avaliação pública",
      value: `${lead.rating.toFixed(1)}★ com ${reviews} avaliaç${reviews === 1 ? "ão" : "ões"}`,
      source: origin,
      confidence: 0.85,
    });

    // Leitura comercial — explicitamente hipótese, não fato.
    if (lead.rating < 4 && reviews >= 5) {
      hypotheses.push({
        statement: "A reputação pública abaixo de 4 estrelas pode estar afastando cliente que pesquisa antes de comprar.",
        basedOn: ["Avaliação pública"],
        confidence: 0.6,
      });
    }
    if (reviews > 0 && reviews < 10) {
      hypotheses.push({
        statement: "Com poucas avaliações, a empresa tem menos prova social que concorrentes já estabelecidos.",
        basedOn: ["Avaliação pública"],
        confidence: 0.55,
      });
    }
  } else {
    facts.push({
      label: "Avaliação pública",
      value: "sem avaliações registradas na fonte",
      source: origin,
      confidence: 0.7,
    });
  }

  // ---- Presença digital ----
  if (lead.website) {
    facts.push({ label: "Site", value: lead.website, source: origin, confidence: 0.9 });
  } else {
    facts.push({
      label: "Site",
      value: "não foi encontrado site próprio",
      source: origin,
      confidence: 0.75,
    });
    observedNeeds.push("Não tem site próprio");
  }

  const socials: string[] = [];
  if (lead.instagram_url) socials.push("Instagram");
  if (lead.facebook_url) socials.push("Facebook");
  if (lead.linkedin_url) socials.push("LinkedIn");
  if (socials.length > 0) {
    facts.push({
      label: "Redes sociais",
      value: socials.join(", "),
      source: "enriquecimento",
      confidence: 0.85,
    });
  }
  if (lead.instagram_bio) {
    facts.push({
      label: "Bio do Instagram",
      value: lead.instagram_bio.slice(0, 200),
      source: "perfil público do Instagram",
      confidence: 0.9,
    });
  }

  // ---- Auditoria de site: a melhor fonte de fato que existe aqui ----
  // Ela é determinística e verificável no HTML. É o material que transforma
  // "melhorar sua presença digital" em "seu site não abre direito no celular".
  const audit = lead.site_audit;
  if (audit && Array.isArray(audit.findings) && audit.findings.length > 0) {
    const checked = audit.checked_at ?? lead.site_audited_at ?? null;
    const auditSource = `auditoria técnica do site${checked ? ` em ${formatDate(checked)}` : ""}`;

    if (typeof audit.score === "number") {
      facts.push({
        label: "Nota técnica do site",
        value: `${audit.score}/100`,
        source: auditSource,
        confidence: 1,
      });
    }

    // Só os mais graves. Um prompt com 11 achados vira ruído.
    const ranked = [...audit.findings].sort(
      (a, b) => severityWeight(b.severity) - severityWeight(a.severity),
    );

    for (const finding of ranked.slice(0, 4)) {
      facts.push({
        label: "Problema verificado no site",
        value: finding.title,
        source: auditSource,
        confidence: 1,
      });
      observedNeeds.push(finding.opportunity);

      if (finding.impact) {
        hypotheses.push({
          statement: finding.impact,
          basedOn: [finding.title],
          confidence: 0.7,
        });
      }
    }
  }

  // ---- Dados de empresa ----
  if (lead.company_description) {
    facts.push({
      label: "Descrição da empresa",
      value: lead.company_description.slice(0, 300),
      source: "enriquecimento",
      confidence: 0.8,
    });
  }
  if (lead.employee_count) {
    facts.push({ label: "Porte", value: lead.employee_count, source: "enriquecimento", confidence: 0.7 });
  }
  if (lead.founded_year) {
    facts.push({
      label: "Fundação",
      value: String(lead.founded_year),
      source: "enriquecimento",
      confidence: 0.75,
    });
  }

  // ---- Dores já registradas ----
  for (const pain of lead.pain_points ?? []) {
    if (pain && !observedNeeds.includes(pain)) observedNeeds.push(pain);
  }
  for (const opp of lead.service_opportunities ?? []) {
    if (opp && !observedNeeds.includes(opp)) observedNeeds.push(opp);
  }

  // ---- Memória estruturada ----
  const memory: MemoryEntry[] = (input.memories ?? [])
    .filter((m) => (m.confidence ?? 1) >= 0.5)
    .map((m) => ({
      type: MEMORY_TYPE_MAP[m.memory_type] ?? "context",
      key: m.key,
      value: m.value,
      confidence: m.confidence ?? 1,
    }));

  // O que o próprio lead disse vale mais que qualquer inferência nossa.
  for (const m of memory) {
    if (m.type === "need" && !observedNeeds.includes(m.value)) {
      observedNeeds.push(m.value);
      facts.push({
        label: "Necessidade dita pelo lead",
        value: m.value,
        source: "conversa com o lead",
        confidence: Math.min(1, m.confidence),
      });
    }
    if (m.type === "objection") {
      facts.push({
        label: "Objeção levantada",
        value: m.value,
        source: "conversa com o lead",
        confidence: Math.min(1, m.confidence),
      });
    }
    if (m.type === "commitment") {
      facts.push({
        label: "Combinado com o lead",
        value: `${m.key}: ${m.value}`,
        source: "conversa com o lead",
        confidence: Math.min(1, m.confidence),
      });
    }
  }

  // ---- Histórico ----
  const messages = input.messages ?? [];
  const fromLead = messages.filter((m) => m.sender_type === "lead").length;
  const fromAgent = messages.filter((m) => m.sender_type !== "lead").length;

  if (fromAgent > 0) {
    facts.push({
      label: "Histórico de contato",
      value: `${fromAgent} mensagem${fromAgent > 1 ? "s" : ""} enviada${fromAgent > 1 ? "s" : ""}, ${fromLead} resposta${fromLead === 1 ? "" : "s"}`,
      source: "histórico da plataforma",
      confidence: 1,
    });
  }

  return {
    leadId: lead.id,
    businessName: lead.business_name,
    phone: lead.phone ?? null,
    niche: lead.niche ?? null,
    location: lead.location ?? null,
    website: lead.website ?? null,
    stage: lead.stage ?? "Contato",
    facts,
    hypotheses,
    observedNeeds: dedupe(observedNeeds),
    memory,
    conversationSummary: lead.conversation_summary ?? null,
    messageCount: { fromLead, fromAgent },
    lastContactAt: lead.last_contact_at ?? null,
    lastResponseAt: lead.last_response_at ?? null,
    origins,
  };
}

function severityWeight(severity: string): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[severity] ?? 0;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
}

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter(Boolean))];
}

/**
 * Renderiza o dossiê para o prompt.
 *
 * As duas seções são separadas de propósito. O modelo recebe instrução
 * explícita de só afirmar o que está em FATOS — e o Quality Gate confere
 * depois se ele obedeceu.
 */
export function renderDossierForPrompt(dossier: Dossier): string {
  const strongFacts = dossier.facts.filter((f) => f.confidence >= 0.6);

  const parts: string[] = [];

  parts.push(
    "## FATOS OBSERVADOS (só isto pode ser afirmado)\n" +
      strongFacts.map((f) => `- ${f.label}: ${f.value}  [fonte: ${f.source}]`).join("\n"),
  );

  if (dossier.hypotheses.length > 0) {
    parts.push(
      "## HIPÓTESES COMERCIAIS (NÃO afirme — no máximo vire pergunta)\n" +
        dossier.hypotheses
          .slice(0, 4)
          .map((h) => `- ${h.statement}`)
          .join("\n"),
    );
  }

  if (dossier.observedNeeds.length > 0) {
    parts.push(
      "## OPORTUNIDADES MAPEADAS\n" +
        dossier.observedNeeds.slice(0, 6).map((n) => `- ${n}`).join("\n"),
    );
  }

  if (dossier.memory.length > 0) {
    parts.push(
      "## O QUE O LEAD JÁ DISSE\n" +
        dossier.memory.slice(0, 10).map((m) => `- [${m.type}] ${m.key}: ${m.value}`).join("\n"),
    );
  }

  if (dossier.conversationSummary) {
    parts.push(`## RESUMO DA CONVERSA ATÉ AQUI\n${dossier.conversationSummary}`);
  }

  return parts.join("\n\n");
}

/**
 * Extrai os números que o dossiê autoriza a mensagem a citar.
 * O Quality Gate usa isto para reprovar estatística que apareceu do nada.
 */
export function allowedNumbers(dossier: Dossier): string[] {
  const numbers: string[] = [];
  for (const fact of dossier.facts) {
    for (const match of fact.value.matchAll(/\d+(?:[.,]\d+)?/g)) {
      numbers.push(match[0].replace(",", "."));
    }
  }
  return [...new Set(numbers)];
}

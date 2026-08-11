// ============================================================
// OFFER MATCHER
// ============================================================
// Antes a oferta vinha de um `<select>` no frontend: o usuário escolhia um
// serviço e ele era empurrado para os 300 leads da lista igualmente. Ou pior,
// a mensagem listava tudo que a empresa vende.
//
// Aqui cada lead recebe UMA oferta, escolhida pelo problema que ele realmente
// tem, com o motivo registrado. Vender cinco coisas ao mesmo tempo é o jeito
// mais rápido de não vender nenhuma.
//
// A pontuação é determinística. O catálogo (`service_intelligence`) é a única
// fonte de verdade sobre o que a empresa vende, por quanto e para quem.

import type { Dossier, Offer, OfferMatch } from "./types.ts";

function normalize(text: string): string {
  return text.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function overlaps(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na.length < 3 || nb.length < 3) return false;
  return na.includes(nb) || nb.includes(na);
}

/**
 * Palavras que ligam um achado de auditoria à oferta que o resolve.
 *
 * O módulo de auditoria já devolve `opportunity` em texto ("Site responsivo",
 * "Integração de WhatsApp e atendimento automatizado"). Estas chaves fazem a
 * ponte quando o nome comercial da oferta é diferente do texto da auditoria.
 */
const NEED_KEYWORDS: { keys: string[]; needs: string[] }[] = [
  { keys: ["site", "landing", "página", "pagina", "web"], needs: ["site", "landing", "página", "responsiv", "seo", "hospedagem", "domínio", "dominio"] },
  { keys: ["whatsapp", "atendimento", "chatbot", "agente", "bot", "ia"], needs: ["whatsapp", "atendimento", "contato", "chatbot", "agente"] },
  { keys: ["automação", "automacao", "automatiz"], needs: ["automa", "atendimento", "processo", "agendamento"] },
  { keys: ["crm", "gestão", "gestao", "sistema"], needs: ["crm", "gest", "organiz", "funil", "lead"] },
  { keys: ["agendamento", "agenda", "booking"], needs: ["agend", "falta", "confirma"] },
  { keys: ["seo", "busca", "google"], needs: ["seo", "título", "titulo", "descrição", "descricao", "google", "busca"] },
  { keys: ["social", "rede", "instagram"], needs: ["social", "instagram", "facebook", "rede"] },
  { keys: ["reputação", "reputacao", "review", "avaliaç"], needs: ["avalia", "reputa", "review", "estrela"] },
  { keys: ["tráfego", "trafego", "anúncio", "anuncio", "ads", "mídia", "midia"], needs: ["anális", "analis", "analytics", "medição", "medicao", "rastrea", "tráfego", "trafego"] },
];

interface Scored {
  offer: Offer;
  score: number;
  reasons: string[];
}

/**
 * Escolhe a melhor oferta para este lead.
 *
 * `allowedOfferIds` vem da missão: o usuário marcou quais produtos aquela
 * campanha pode oferecer. Fora dessa lista nada é considerado, mesmo que o
 * fit seja perfeito — respeitar a decisão comercial do dono vem antes.
 */
export function matchOffer(
  dossier: Dossier,
  catalog: Offer[],
  allowedOfferIds?: string[],
): OfferMatch {
  const pool = allowedOfferIds && allowedOfferIds.length > 0
    ? catalog.filter((o) => allowedOfferIds.includes(o.id))
    : catalog;

  if (pool.length === 0) {
    return {
      offer: null,
      confidence: 0,
      reasons: ["Nenhuma oferta disponível — cadastre serviços no catálogo antes de abordar."],
      runnersUp: [],
    };
  }

  const needsText = dossier.observedNeeds.join(" ");
  const factsText = dossier.facts.map((f) => `${f.label} ${f.value}`).join(" ");
  const memoryInterests = dossier.memory
    .filter((m) => m.type === "interest" || m.type === "need")
    .map((m) => m.value)
    .join(" ");

  const scored: Scored[] = pool.map((offer) => {
    let score = 0;
    const reasons: string[] = [];

    // ---- 1. O lead pediu explicitamente. Não há sinal mais forte. ----
    if (memoryInterests && overlaps(memoryInterests, offer.name)) {
      score += 45;
      reasons.push(`O próprio lead mencionou interesse em algo como "${offer.name}"`);
    }

    // ---- 2. Nicho declarado como alvo da oferta ----
    if (dossier.niche && offer.targetNiches.length > 0) {
      const hit = offer.targetNiches.find((n) => overlaps(dossier.niche!, n));
      if (hit) {
        score += 20;
        reasons.push(`A oferta atende "${hit}", que é o segmento do lead`);
      }
    }

    // ---- 3. Dor observada bate com dor que a oferta resolve ----
    for (const pain of offer.painPoints) {
      if (needsText && overlaps(needsText, pain)) {
        score += 15;
        reasons.push(`Resolve "${pain}", que aparece nas oportunidades mapeadas do lead`);
        break;
      }
    }

    // ---- 4. Ponte por palavra-chave entre auditoria e oferta ----
    const offerText = normalize(`${offer.name} ${offer.slug} ${offer.description ?? ""}`);
    for (const group of NEED_KEYWORDS) {
      const offerMatches = group.keys.some((k) => offerText.includes(normalize(k)));
      if (!offerMatches) continue;

      const evidence = dossier.observedNeeds.find((need) =>
        group.needs.some((n) => normalize(need).includes(normalize(n)))
      );
      if (evidence) {
        score += 25;
        reasons.push(`Problema verificado no lead: "${evidence}"`);
        break;
      }
    }

    // ---- 5. ICP textual da oferta ----
    if (offer.idealClientProfile && dossier.niche) {
      if (overlaps(offer.idealClientProfile, dossier.niche)) {
        score += 10;
        reasons.push("O perfil de cliente ideal da oferta descreve este segmento");
      }
    }

    // ---- 6. Sem site é caso especial: quase sempre a porta de entrada ----
    const noSite = dossier.facts.some(
      (f) => f.label === "Site" && /não foi encontrado/i.test(f.value),
    );
    if (noSite && /site|landing|p[áa]gina/.test(offerText)) {
      score += 20;
      reasons.push("A empresa não tem site próprio — é a lacuna mais concreta que existe");
    }

    // ---- 7. Desempate por resultado histórico da própria oferta ----
    // Sem inventar: só entra se já houver envio suficiente para significar algo.
    if (offer.caseStudies.length > 0 && factsText) {
      score += 3;
      reasons.push("Há caso real cadastrado para usar como prova");
    }

    return { offer, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  // Nenhum sinal: em vez de escolher no chute, devolve a primeira permitida
  // com confiança baixa e diz claramente que foi por falta de sinal. O
  // Strategy Agent usa isso para escolher um ângulo consultivo (perguntar)
  // em vez de diagnóstico (afirmar).
  if (best.score === 0) {
    return {
      offer: best.offer,
      confidence: 15,
      reasons: [
        "Nenhum sinal específico encontrado neste lead — oferta escolhida por ser a primeira autorizada na missão.",
        "Recomendado abordar de forma consultiva, perguntando antes de propor.",
      ],
      runnersUp: scored.slice(1, 4).map((s) => ({
        offerId: s.offer.id,
        name: s.offer.name,
        confidence: 0,
        reason: "sem sinal",
      })),
    };
  }

  // Confiança sobe com a pontuação e com a distância para a segunda colocada:
  // duas ofertas empatadas significam que a escolha foi arbitrária.
  const runnerUpScore = scored[1]?.score ?? 0;
  const separation = best.score - runnerUpScore;
  const confidence = Math.max(
    10,
    Math.min(100, Math.round(best.score * 0.8 + Math.min(separation, 25))),
  );

  return {
    offer: best.offer,
    confidence,
    reasons: best.reasons,
    runnersUp: scored.slice(1, 4).map((s) => ({
      offerId: s.offer.id,
      name: s.offer.name,
      confidence: Math.min(100, Math.round(s.score * 0.8)),
      reason: s.reasons[0] ?? "sem sinal específico",
    })),
  };
}

/** Converte a linha de `service_intelligence` no contrato interno. */
export function offerFromRow(row: Record<string, unknown>): Offer {
  const objections: Record<string, string> = {};
  const rawObjections = row.objection_responses;
  if (rawObjections && typeof rawObjections === "object" && !Array.isArray(rawObjections)) {
    for (const [k, v] of Object.entries(rawObjections as Record<string, unknown>)) {
      if (typeof v === "string") objections[k] = v;
    }
  }

  return {
    id: String(row.id ?? ""),
    name: String(row.service_name ?? "Serviço"),
    slug: String(row.service_slug ?? ""),
    description: (row.description as string) ?? null,
    painPoints: asStringArray(row.pain_points),
    benefits: asStringArray(row.benefits),
    targetNiches: asStringArray(row.target_niches),
    idealClientProfile: (row.ideal_client_profile as string) ?? null,
    pricingInfo: (row.pricing_info as string) ?? null,
    caseStudies: asStringArray(row.case_studies),
    objections,
  };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v.length > 0);
}

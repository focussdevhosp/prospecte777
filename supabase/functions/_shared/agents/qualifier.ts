// ============================================================
// QUALIFICATION AGENT
// ============================================================
// A nota antiga era um número que aparecia do nada: `score = 50` e uma
// sequência de somas escondidas numa edge function. Ninguém conseguia
// responder "por que este lead vale 78?".
//
// Aqui cada ponto vem com a evidência que o gerou. Isso não é enfeite: sem
// explicação não dá para calibrar ICP, não dá para confiar na priorização e
// o vendedor humano não consegue discordar com fundamento.
//
// Determinístico de propósito. O mesmo lead sempre recebe a mesma nota —
// requisito para A/B teste honesto e para o learning loop não se enganar.

import type {
  Dossier,
  Fact,
  Hypothesis,
  IcpCriteria,
  Qualification,
  ScoreReason,
  Temperature,
} from "./types.ts";

const BASE_SCORE = 40;

function normalize(text: string): string {
  return text.toLowerCase().trim().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function matchesAny(haystack: string, needles: string[]): string | null {
  const h = normalize(haystack);
  for (const needle of needles) {
    const n = normalize(needle);
    if (n.length > 0 && (h.includes(n) || n.includes(h))) return needle;
  }
  return null;
}

/**
 * Calcula o fit do lead com o ICP da missão.
 *
 * `icp` vazio significa "sem ICP definido": a nota sai só dos sinais de
 * oportunidade, sem penalizar o lead por não bater com um alvo que ninguém
 * configurou.
 */
export function qualify(dossier: Dossier, icp: IcpCriteria = {}): Qualification {
  const reasons: ScoreReason[] = [];
  const facts: Fact[] = [];
  const hypotheses: Hypothesis[] = [...dossier.hypotheses];

  const add = (label: string, points: number, evidence: string) => {
    if (points !== 0) reasons.push({ label, points, evidence });
  };

  // ---- Exclusões: decisão de corte, antes de qualquer pontuação ----
  if (icp.exclusions && icp.exclusions.length > 0) {
    const searchable = [
      dossier.businessName,
      dossier.niche ?? "",
      dossier.location ?? "",
      ...dossier.observedNeeds,
    ].join(" ");

    const hit = matchesAny(searchable, icp.exclusions);
    if (hit) {
      return {
        score: 0,
        temperature: "frio",
        reasons: [{ label: "Excluído pelo ICP", points: 0, evidence: `bate com a exclusão "${hit}"` }],
        disqualified: true,
        disqualifiedReason: `Excluído pelo ICP: "${hit}"`,
        facts,
        hypotheses,
      };
    }
  }

  // Sem telefone não há prospecção por WhatsApp. Não é penalidade, é bloqueio.
  if (!dossier.phone) {
    return {
      score: 0,
      temperature: "frio",
      reasons: [{ label: "Sem telefone", points: 0, evidence: "não há número comercial registrado" }],
      disqualified: true,
      disqualifiedReason: "Sem telefone comercial — não é possível abordar por WhatsApp",
      facts,
      hypotheses,
    };
  }

  // ---- Fit de segmento ----
  if (icp.niches && icp.niches.length > 0) {
    const hit = dossier.niche ? matchesAny(dossier.niche, icp.niches) : null;
    if (hit) {
      add("Segmento bate com o ICP", 20, `segmento "${dossier.niche}" corresponde a "${hit}"`);
      facts.push({
        label: "Fit de segmento",
        value: `dentro do ICP (${hit})`,
        source: "ICP da missão",
        confidence: 1,
      });
    } else {
      add("Segmento fora do ICP", -15, `segmento "${dossier.niche ?? "não identificado"}" não consta no ICP`);
    }
  }

  // ---- Fit de localização ----
  if (icp.locations && icp.locations.length > 0) {
    const hit = dossier.location ? matchesAny(dossier.location, icp.locations) : null;
    if (hit) {
      add("Localização bate com o ICP", 12, `"${dossier.location}" corresponde a "${hit}"`);
    } else {
      add("Fora da região alvo", -10, `"${dossier.location ?? "sem localização"}" não consta no ICP`);
    }
  }

  // ---- Sinais de oportunidade (o que faz este lead valer a mensagem) ----
  const siteProblems = dossier.facts.filter((f) => f.label === "Problema verificado no site");
  if (siteProblems.length > 0) {
    // Problema verificado no HTML é o sinal mais forte que existe aqui:
    // é o único que dá para provar ao lead sem depender de opinião.
    const points = Math.min(24, 8 * siteProblems.length);
    add(
      "Problemas verificados no site",
      points,
      siteProblems.map((p) => p.value).join("; "),
    );
    facts.push(...siteProblems);
  }

  const noSite = dossier.facts.find(
    (f) => f.label === "Site" && /não foi encontrado/i.test(f.value),
  );
  if (noSite) {
    add("Não tem site próprio", 18, "nenhum site encontrado nas fontes consultadas");
    facts.push(noSite);
  }

  // ---- Reputação ----
  const ratingFact = dossier.facts.find((f) => f.label === "Avaliação pública");
  const ratingValue = ratingFact ? parseFloat(ratingFact.value) : NaN;
  const reviewsValue = ratingFact
    ? Number(ratingFact.value.match(/com (\d+) avalia/)?.[1] ?? NaN)
    : NaN;

  if (Number.isFinite(ratingValue)) {
    if (icp.minRating != null && ratingValue < icp.minRating) {
      add("Avaliação abaixo do mínimo do ICP", -12, `${ratingValue}★ < ${icp.minRating}★`);
    } else if (icp.maxRating != null && ratingValue > icp.maxRating) {
      add("Avaliação acima da faixa do ICP", -8, `${ratingValue}★ > ${icp.maxRating}★`);
    }

    if (ratingValue >= 4.5) {
      // Empresa bem avaliada costuma ter operação organizada — cliente melhor,
      // mesmo que a dor seja menor.
      add("Boa reputação", 8, `${ratingValue}★ indica operação que já funciona`);
    } else if (ratingValue < 3.8 && Number.isFinite(reviewsValue) && reviewsValue >= 5) {
      add("Reputação com espaço para melhora", 10, `${ratingValue}★ com ${reviewsValue} avaliações`);
    }
  }

  if (Number.isFinite(reviewsValue)) {
    if (icp.minReviews != null && reviewsValue < icp.minReviews) {
      add("Poucas avaliações para o ICP", -8, `${reviewsValue} < ${icp.minReviews}`);
    } else if (reviewsValue >= 50) {
      add("Empresa estabelecida", 8, `${reviewsValue} avaliações públicas`);
    }
  }

  // ---- Sinais configurados no ICP ----
  if (icp.signals && icp.signals.length > 0) {
    const searchable = [...dossier.observedNeeds, ...dossier.facts.map((f) => f.value)].join(" ");
    const matched = icp.signals.filter((s) => matchesAny(searchable, [s]));
    if (matched.length > 0) {
      add(
        "Sinais do ICP presentes",
        Math.min(15, 5 * matched.length),
        matched.join(", "),
      );
    }
  }

  // ---- Engajamento: o sinal mais confiável de todos ----
  if (dossier.messageCount.fromLead > 0) {
    const points = Math.min(25, 10 + 5 * dossier.messageCount.fromLead);
    add("Já respondeu", points, `${dossier.messageCount.fromLead} resposta(s) recebida(s)`);
    facts.push({
      label: "Engajamento",
      value: `respondeu ${dossier.messageCount.fromLead} vez(es)`,
      source: "histórico da plataforma",
      confidence: 1,
    });
  }

  const interests = dossier.memory.filter((m) => m.type === "interest");
  if (interests.length > 0) {
    add("Demonstrou interesse", 15, interests.map((m) => m.value).join("; "));
  }

  const commitments = dossier.memory.filter((m) => m.type === "commitment");
  if (commitments.length > 0) {
    add("Assumiu compromisso", 12, commitments.map((m) => `${m.key}: ${m.value}`).join("; "));
  }

  const objections = dossier.memory.filter((m) => m.type === "objection");
  if (objections.length > 0) {
    add("Objeções em aberto", -8, objections.map((m) => m.value).join("; "));
  }

  // ---- Contato sem retorno ----
  if (dossier.messageCount.fromAgent >= 3 && dossier.messageCount.fromLead === 0) {
    add(
      "Não respondeu a vários contatos",
      -15,
      `${dossier.messageCount.fromAgent} mensagens enviadas sem resposta`,
    );
  }

  // ---- Fechamento ----
  const total = reasons.reduce((sum, r) => sum + r.points, BASE_SCORE);
  const score = Math.max(0, Math.min(100, Math.round(total)));

  return {
    score,
    temperature: temperatureFor(score, dossier),
    reasons,
    disqualified: false,
    disqualifiedReason: null,
    facts,
    hypotheses,
  };
}

/**
 * Temperatura por comportamento, não só por nota.
 *
 * Um lead que respondeu e pediu preço é quente mesmo que o fit seja médio.
 * Um lead com fit perfeito que nunca respondeu continua frio — e tratar isso
 * como quente é o que faz vendedor perder tempo com a lista errada.
 */
function temperatureFor(score: number, dossier: Dossier): Temperature {
  const hasInterest = dossier.memory.some((m) => m.type === "interest");
  const hasCommitment = dossier.memory.some((m) => m.type === "commitment");
  const replied = dossier.messageCount.fromLead;

  if (hasCommitment || (replied >= 2 && hasInterest)) return "muito_quente";
  if (replied >= 1 && (hasInterest || score >= 60)) return "quente";
  if (replied >= 1) return "morno";
  if (score >= 75) return "morno";
  return "frio";
}

/** Frase pronta para o feed e para a tela do lead. */
export function explainQualification(q: Qualification): string {
  if (q.disqualified) return q.disqualifiedReason ?? "Desqualificado";

  const top = [...q.reasons]
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 3)
    .map((r) => `${r.label} (${r.points > 0 ? "+" : ""}${r.points})`);

  return `Score ${q.score}/100 · ${q.temperature.replace("_", " ")} · ${top.join(", ")}`;
}

// ============================================================
// QUEM ATENDE ESTE LEAD
// ============================================================
// `leads.assigned_to` existe desde o começo e nada nunca escreveu nele. Sem
// dono, o produto é software de um operador só: uma agência com três SDRs
// não consegue usar, porque todo mundo vê a mesma fila e ou dois abordam a
// mesma empresa, ou ninguém aborda.
//
// A decisão de distribuição fica aqui, sem banco, porque é onde errar custa
// caro e onde dá para provar que está certo.

export interface Member {
  userId: string;
  /** Fora do rodízio: férias, saiu, ainda não configurou o WhatsApp. */
  active: boolean;
  /** Leads em aberto com esta pessoa agora. */
  openLoad: number;
  /** Nichos que ela atende. Vazio = atende qualquer um. */
  niches?: string[];
  /** Teto de leads abertos. 0 ou ausente = sem teto. */
  capacity?: number;
}

export type AssignmentStrategy = "carga" | "rodizio" | "nicho";

export interface AssignmentResult {
  userId: string | null;
  /** Por que esta pessoa. Vai para o histórico do lead. */
  reason: string;
}

/**
 * Escolhe quem atende, sem nunca tirar lead de quem já está conversando.
 *
 * A estratégia padrão é CARGA, e não rodízio, e a diferença importa mais do
 * que parece. Rodízio distribui quantidade igual; carga distribui trabalho
 * igual. Quem tem 200 leads abertos e recebe a mesma fatia de quem tem 10
 * acumula uma fila que nunca vai atender — e lead parado na fila de alguém é
 * pior que lead sem dono, porque parece atendido.
 */
export function pickAssignee(
  members: Member[],
  opts?: { strategy?: AssignmentStrategy; niche?: string | null; counter?: number },
): AssignmentResult {
  const strategy = opts?.strategy ?? "carga";
  const niche = (opts?.niche ?? "").toLowerCase();

  const disponiveis = members.filter((m) => {
    if (!m.active) return false;
    // Teto respeitado ANTES de qualquer estratégia: quem está cheio está
    // cheio, e a distribuição mais justa não muda isso.
    if (m.capacity && m.capacity > 0 && m.openLoad >= m.capacity) return false;
    return true;
  });

  if (disponiveis.length === 0) {
    const semTeto = members.filter((m) => m.active).length;
    return {
      userId: null,
      reason:
        semTeto === 0
          ? "Ninguém disponível na equipe — todos inativos."
          : "Todo mundo atingiu o teto de leads abertos. O lead fica sem dono até alguém liberar.",
    };
  }

  // ---- Nicho ----
  // Quem declara nicho tem preferência sobre quem atende qualquer coisa: um
  // especialista em clínicas fecha mais clínica, e a distribuição "justa"
  // que ignora isso troca receita por simetria.
  if (strategy === "nicho" && niche) {
    const especialistas = disponiveis.filter((m) =>
      (m.niches ?? []).some((n) => niche.includes(n.toLowerCase()) || n.toLowerCase().includes(niche)),
    );

    if (especialistas.length > 0) {
      const escolhido = menorCarga(especialistas);
      return {
        userId: escolhido.userId,
        reason: `Atende "${niche}" e está com ${escolhido.openLoad} lead(s) aberto(s).`,
      };
    }
    // Sem especialista, cai na carga — melhor alguém que ninguém.
  }

  // ---- Rodízio ----
  if (strategy === "rodizio") {
    const ordenados = [...disponiveis].sort((a, b) => a.userId.localeCompare(b.userId));
    const escolhido = ordenados[(opts?.counter ?? 0) % ordenados.length];
    return {
      userId: escolhido.userId,
      reason: `Rodízio: é a vez desta pessoa entre ${ordenados.length} disponíveis.`,
    };
  }

  // ---- Carga (padrão) ----
  const escolhido = menorCarga(disponiveis);
  return {
    userId: escolhido.userId,
    reason: `Menor carga da equipe: ${escolhido.openLoad} lead(s) aberto(s).`,
  };
}

/** Menor carga; empate desfeito pelo id, para a escolha ser reproduzível. */
function menorCarga(members: Member[]): Member {
  return [...members].sort(
    (a, b) => a.openLoad - b.openLoad || a.userId.localeCompare(b.userId),
  )[0];
}

/**
 * Diz se um lead pode trocar de dono.
 *
 * A regra que evita o pior estrago desta funcionalidade: **lead em conversa
 * não muda de dono**. Trocar a pessoa no meio de um diálogo faz o cliente
 * recomeçar a explicar tudo, e faz o vendedor perder o contexto que ele
 * construiu. Rebalancear carteira é bom; rebalancear conversa é dano.
 */
export function podeReatribuir(lead: {
  assigned_to?: string | null;
  last_response_at?: string | null;
  stage?: string | null;
}): { pode: boolean; motivo: string } {
  if (!lead.assigned_to) {
    return { pode: true, motivo: "Sem dono." };
  }

  if (lead.last_response_at) {
    return {
      pode: false,
      motivo:
        "O lead já respondeu — trocar de responsável agora faz o cliente " +
        "recomeçar a explicar tudo e o vendedor perder o contexto.",
    };
  }

  if (lead.stage && ["Proposta", "Negociação", "Ganho"].includes(lead.stage)) {
    return {
      pode: false,
      motivo: `O lead está em "${lead.stage}" — negociação em andamento não troca de mãos.`,
    };
  }

  return { pode: true, motivo: "Ainda não houve conversa." };
}

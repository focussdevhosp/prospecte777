// ============================================================
// FOLLOW-UP PRECISA DECIDIR, NÃO SÓ CONTAR DIAS
// ============================================================
// A regra era só calendário: passou 1, 3, 5, 7 ou 14 dias desde o último
// contato, manda mais uma. Nada olhava o que o lead tinha dito.
//
// Na prática isso produzia a cobrança que todo mundo já recebeu: a pessoa
// escreve "esse mês não dá, me chama em setembro" e leva três mensagens em
// agosto. Não é excesso de zelo comercial — é prova de que ninguém leu. E o
// custo não é a mensagem ignorada: é o lead que estava quente virar bloqueio.
//
// Aqui se decide entre cinco caminhos. A decisão é separada do envio de
// propósito: é a única parte que dá para testar sem banco, sem rede e sem
// esperar setembro chegar.

export type FollowUpAction = "enviar" | "esperar" | "encerrar" | "transferir";

export interface FollowUpDecision {
  action: FollowUpAction;
  /** Frase pronta para o feed. Quem lê precisa entender sem abrir o código. */
  reason: string;
  /** Quando `action` é "esperar": a partir de quando vale tentar de novo. */
  waitUntil?: Date;
}

export interface MemoryLike {
  memory_type?: string | null;
  key?: string | null;
  value?: string | null;
  confidence?: number | null;
}

export interface FollowUpInput {
  now: Date;
  daysSinceContact: number;
  followUpCount: number;
  maxFollowUps: number;
  /** O lead respondeu depois da nossa última mensagem? */
  repliedAfterLastContact: boolean;
  memories?: MemoryLike[] | null;
  temperature?: string | null;
  /** Cadência em dias. O padrão espaça de propósito. */
  cadence?: number[];
}

const DEFAULT_CADENCE = [1, 3, 7, 14, 30];

/** Recusa definitiva: insistir depois disso é desrespeito, não persistência. */
const RECUSA_DEFINITIVA =
  /\b(n[ãa]o (tenho|temos) interesse|n[ãa]o quero|n[ãa]o me (interessa|liga|manda)|para de|pare de|sai(r)? da lista|descadastr|me (tira|remove))/i;

/** Adiamento: o negócio não morreu, só não é agora. */
const ADIAMENTO =
  /\b(agora n[ãa]o|esse m[êe]s n[ãa]o|mais pra frente|mais tarde|depois|semana que vem|m[êe]s que vem|ano que vem|sem or[çc]amento|apertado)/i;

const MESES: Record<string, number> = {
  janeiro: 0, fevereiro: 1, mar: 2, "março": 2, marco: 2, abril: 3, maio: 4,
  junho: 5, julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

/**
 * Tenta achar uma data no que o lead disse.
 *
 * Aceita ISO, DD/MM(/AAAA) e nome de mês. Nome de mês sem ano vira a próxima
 * ocorrência: quem diz "me chama em março" em novembro está falando do março
 * que vem, não do que já passou.
 *
 * Devolve `null` quando não encontra — e aí o compromisso vira espera padrão,
 * nunca uma data inventada. Chutar aqui significaria calar por meses sem o
 * lead ter pedido isso.
 */
export function parseFutureDate(text: string, now: Date): Date | null {
  const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return d > now ? d : null;
  }

  const br = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (br) {
    const ano = br[3]
      ? Number(br[3].length === 2 ? `20${br[3]}` : br[3])
      : now.getFullYear();
    const d = new Date(ano, Number(br[2]) - 1, Number(br[1]));
    if (d > now) return d;
    // Sem ano e a data já passou: é do ano que vem.
    if (!br[3]) {
      const proximo = new Date(ano + 1, Number(br[2]) - 1, Number(br[1]));
      return proximo;
    }
    return null;
  }

  const lower = text.toLowerCase();
  for (const [nome, mes] of Object.entries(MESES)) {
    if (!new RegExp(`\\b${nome}\\b`).test(lower)) continue;
    const esteAno = new Date(now.getFullYear(), mes, 1);
    return esteAno > now ? esteAno : new Date(now.getFullYear() + 1, mes, 1);
  }

  return null;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Decide o que fazer com este lead agora.
 *
 * A ordem das regras é a ordem da prioridade, e ela não é arbitrária: o que o
 * lead PEDIU vem antes do que o calendário sugere. Um sistema que inverte
 * isso é um sistema que ouve e ignora, que é pior que um que não ouve.
 */
export function decideFollowUp(input: FollowUpInput): FollowUpDecision {
  const memories = (input.memories ?? []).filter((m) => (m.confidence ?? 1) >= 0.6);
  const cadence = input.cadence ?? DEFAULT_CADENCE;

  // ---- 1. Ele respondeu e a bola está com a gente ----
  if (input.repliedAfterLastContact) {
    return {
      action: "esperar",
      reason: "O lead respondeu e ainda não foi respondido — quem deve a próxima mensagem somos nós.",
    };
  }

  // ---- 2. Recusa explícita ----
  for (const memory of memories) {
    const texto = `${memory.key ?? ""} ${memory.value ?? ""}`;
    if (memory.memory_type === "objection" && RECUSA_DEFINITIVA.test(texto)) {
      return {
        action: "encerrar",
        reason: `O lead recusou de forma direta ("${(memory.value ?? "").slice(0, 60)}"). Insistir depois disso queima o número e a marca.`,
      };
    }
  }

  // ---- 3. Compromisso com data ----
  // Vem antes da cadência: se a pessoa marcou quando quer ser procurada, o
  // calendário do sistema não tem nada a dizer sobre isso.
  for (const memory of memories) {
    if (memory.memory_type !== "commitment" && memory.memory_type !== "next_action") continue;
    const texto = `${memory.key ?? ""} ${memory.value ?? ""}`;
    const data = parseFutureDate(texto, input.now);
    if (data) {
      return {
        action: "esperar",
        reason: `O lead pediu para ser procurado em ${data.toLocaleDateString("pt-BR")}. Antes disso, silêncio é o combinado.`,
        waitUntil: data,
      };
    }
  }

  // ---- 4. Adiamento sem data ----
  for (const memory of memories) {
    if (memory.memory_type !== "objection") continue;
    const texto = `${memory.key ?? ""} ${memory.value ?? ""}`;
    if (ADIAMENTO.test(texto)) {
      return {
        action: "esperar",
        reason: `O lead adiou sem marcar data ("${(memory.value ?? "").slice(0, 60)}"). Volta em 30 dias.`,
        waitUntil: addDays(input.now, 30),
      };
    }
  }

  // ---- 5. Lead quente que parou de responder ----
  // Mais um follow-up automático aqui é desperdício do melhor lead da
  // carteira. Quem chegou a esquentar merece uma pessoa.
  if (
    (input.temperature === "quente" || input.temperature === "muito_quente") &&
    input.followUpCount >= 1
  ) {
    return {
      action: "transferir",
      reason: "Lead quente que parou de responder depois de já ter sido cutucado. Vale uma pessoa, não mais um automático.",
    };
  }

  // ---- 6. Esgotou a cadência ----
  if (input.followUpCount >= input.maxFollowUps) {
    return {
      action: "encerrar",
      reason: `Já foram ${input.followUpCount} tentativas sem resposta. Continuar é gastar reputação do número por nada.`,
    };
  }

  // ---- 7. Ainda não chegou a hora ----
  const alvo = cadence[Math.min(input.followUpCount, cadence.length - 1)];
  if (input.daysSinceContact < alvo) {
    return {
      action: "esperar",
      reason: `Faltam ${alvo - input.daysSinceContact} dia(s) para o próximo toque desta cadência.`,
      waitUntil: addDays(input.now, alvo - input.daysSinceContact),
    };
  }

  return {
    action: "enviar",
    reason: `${input.daysSinceContact} dias sem resposta e ${input.followUpCount} toque(s) até aqui.`,
  };
}

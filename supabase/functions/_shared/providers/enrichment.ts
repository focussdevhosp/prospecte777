// ============================================================
// ENRIQUECIMENTO EM CASCATA
// ============================================================
// A busca por empresas roda todas as fontes EM PARALELO, e está certo: cada
// fonte enxerga um pedaço diferente do mercado, e o que uma acha a outra não
// tem. Descoberta é união.
//
// Enriquecimento é o oposto. Quando a pergunta é "qual o e-mail DESTA
// empresa", a segunda fonte só interessa se a primeira falhou. Rodar quatro
// em paralelo para descartar três respostas é pagar quatro vezes por uma —
// e as que cobram por consulta cobram mesmo quando a resposta é descartada.
//
// Então aqui é cascata: tenta em ordem, para no primeiro acerto ACEITÁVEL.
//
// A palavra "aceitável" carrega a decisão mais importante deste arquivo. Um
// e-mail de baixa confiança é pior que nenhum: ele bounce, e bounce queima o
// domínio de quem mandou. O mesmo vale para telefone — número errado é
// mensagem para um estranho, e no WhatsApp isso vira denúncia. Parar no
// primeiro acerto QUALQUER seria trocar cobertura por reputação, que é a
// troca que este produto não pode fazer.

export type EnrichableField = "email" | "phone" | "website" | "instagram";

export interface EnrichTarget {
  businessName: string;
  domain?: string | null;
  city?: string | null;
  niche?: string | null;
}

export interface EnrichedValue {
  value: string;
  /** 0 a 100. Abaixo do mínimo, a cascata continua procurando. */
  confidence: number;
  /** Como foi obtido, em linguagem de gente. Vai para a procedência do dado. */
  how: string;
}

export interface EnrichmentSource {
  id: string;
  field: EnrichableField;
  /**
   * Custo relativo por consulta. 0 = grátis (dedução, DNS, cache).
   * Ordena a cascata: o grátis tenta antes do pago, sempre.
   */
  cost: number;
  /** Acerto histórico esperado, 0 a 100. Desempata entre fontes de mesmo custo. */
  accuracy: number;
  run: (target: EnrichTarget) => Promise<EnrichedValue | null>;
}

export interface WaterfallResult {
  field: EnrichableField;
  value: string | null;
  confidence: number;
  /** Qual fonte acertou. `null` quando nenhuma acertou. */
  source: string | null;
  how: string | null;
  /** Fontes efetivamente consultadas, na ordem. Serve para conferir o gasto. */
  tried: string[];
  /** Soma do custo das consultadas — inclusive as que não acharam nada. */
  cost: number;
  /** Por que parou. Sempre preenchido. */
  reason: string;
}

/** Abaixo disso, o dado não é usado. Ver o comentário do topo. */
export const DEFAULT_MIN_CONFIDENCE = 60;

/**
 * Ordena a cascata: grátis antes de pago, e entre iguais o mais certeiro
 * primeiro.
 *
 * A ordem importa mais que a lista. Uma dedução de padrão validada por DNS
 * custa zero e acerta em boa parte dos casos; consultar a API paga antes dela
 * é pagar por um dado que já estava ao alcance.
 */
export function orderSources(sources: EnrichmentSource[]): EnrichmentSource[] {
  return [...sources].sort((a, b) => a.cost - b.cost || b.accuracy - a.accuracy);
}

/**
 * Percorre as fontes até achar um valor aceitável.
 *
 * Guarda o melhor resultado abaixo do mínimo enquanto procura: se nenhuma
 * fonte atingir o limite, ainda dá para dizer "o melhor que achamos foi isto,
 * com 45 de confiança" em vez de "não achamos nada". São informações
 * diferentes — a segunda faz alguém procurar de novo à toa.
 *
 * Fonte que lança não interrompe a cascata: a próxima assume. O que a fonte
 * NÃO pode fazer é devolver palpite com nota alta, e isso é responsabilidade
 * de quem a escreve.
 */
export async function waterfall(
  sources: EnrichmentSource[],
  target: EnrichTarget,
  opts?: { minConfidence?: number; maxCost?: number },
): Promise<WaterfallResult> {
  const minimo = opts?.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
  const tetoCusto = opts?.maxCost ?? Infinity;

  const ordenadas = orderSources(sources);
  const field = ordenadas[0]?.field ?? "email";

  const tried: string[] = [];
  let cost = 0;
  let melhorAbaixo: { value: string; confidence: number; how: string; source: string } | null = null;

  if (ordenadas.length === 0) {
    return {
      field,
      value: null,
      confidence: 0,
      source: null,
      how: null,
      tried,
      cost,
      reason: "Nenhuma fonte configurada para este dado.",
    };
  }

  for (const fonte of ordenadas) {
    // O teto é conferido ANTES de gastar. Conferir depois seria descobrir o
    // estouro com a fatura já emitida.
    if (cost + fonte.cost > tetoCusto) {
      return {
        field,
        value: melhorAbaixo?.value ?? null,
        confidence: melhorAbaixo?.confidence ?? 0,
        source: melhorAbaixo?.source ?? null,
        how: melhorAbaixo?.how ?? null,
        tried,
        cost,
        reason:
          `Parou no teto de custo antes de consultar ${fonte.id}.` +
          (melhorAbaixo
            ? ` O melhor até aqui tem ${melhorAbaixo.confidence} de confiança, abaixo do mínimo de ${minimo}.`
            : ""),
      };
    }

    tried.push(fonte.id);
    cost += fonte.cost;

    let resultado: EnrichedValue | null = null;
    try {
      resultado = await fonte.run(target);
    } catch (e) {
      console.error(`[cascata] ${fonte.id} falhou:`, e);
      continue;
    }

    if (!resultado?.value) continue;

    if (resultado.confidence >= minimo) {
      return {
        field: fonte.field,
        value: resultado.value,
        confidence: resultado.confidence,
        source: fonte.id,
        how: resultado.how,
        tried,
        cost,
        reason: `Encontrado por ${fonte.id} com ${resultado.confidence} de confiança.`,
      };
    }

    if (!melhorAbaixo || resultado.confidence > melhorAbaixo.confidence) {
      melhorAbaixo = { ...resultado, source: fonte.id };
    }
  }

  return {
    field,
    value: melhorAbaixo?.value ?? null,
    confidence: melhorAbaixo?.confidence ?? 0,
    source: melhorAbaixo?.source ?? null,
    how: melhorAbaixo?.how ?? null,
    tried,
    cost,
    reason: melhorAbaixo
      ? `Nenhuma fonte atingiu ${minimo} de confiança. O melhor foi ${melhorAbaixo.source} ` +
        `com ${melhorAbaixo.confidence} — não é o bastante para usar sem conferir.`
      : `Nenhuma das ${tried.length} fonte(s) encontrou nada.`,
  };
}

/**
 * Diz se o valor pode ser usado sem conferência humana.
 *
 * Separado de propósito: `waterfall` devolve o melhor que achou, e QUEM
 * decide usar é outra camada. Misturar as duas coisas levaria a gravar um
 * palpite de 45 no cadastro do lead como se fosse dado confirmado — e daí
 * ninguém mais sabe distinguir.
 */
export function isUsable(
  result: WaterfallResult,
  minConfidence = DEFAULT_MIN_CONFIDENCE,
): boolean {
  return Boolean(result.value) && result.confidence >= minConfidence;
}

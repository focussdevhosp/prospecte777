// ============================================================
// TESTE A/B: SORTEIO ESTÁVEL E DECISÃO PELO QUE IMPORTA
// ============================================================
// A tela de A/B tinha 463 linhas, cálculo de significância estatística,
// exibição de vencedor e de conversões. E nenhuma linha de código jamais
// passou `ab_test_id` para o envio — então `variant_a_sent` nunca saía de
// zero, e `variant_a_responses` e `variant_a_conversions` não eram escritos
// por absolutamente nada.
//
// Resultado: uma tela inteira em que todo número é permanentemente zero, e
// um teste-z que sempre devolve 0 porque o denominador nunca existe. Pior
// que funcionalidade ausente: a ausente avisa que falta algo.
//
// Duas decisões moram aqui, e são as duas únicas partes testáveis sem banco:
// como um lead cai numa variante, e qual variante ganhou.

// ------------------------------------------------------------
// SORTEIO
// ------------------------------------------------------------

/**
 * Hash FNV-1a, 32 bits, com finalização de avalanche.
 *
 * O `fmix32` no fim não é enfeite. O FNV-1a multiplica por um primo ÍMPAR, e
 * multiplicação por ímpar preserva o bit mais baixo — ou seja, o último bit
 * do FNV-1a é simplesmente o XOR dos últimos bits de todos os caracteres.
 * Não é hash, é paridade.
 *
 * Com `% 2` em cima disso, "teste-1:lead-5" e "teste-2:lead-5" caíam SEMPRE
 * em variantes opostas: os dois textos diferem em um caractere ('1' contra
 * '2'), a paridade sempre inverte. Dois testes rodando juntos dividiriam a
 * carteira exatamente ao contrário um do outro — anticorrelação perfeita, tão
 * ruim quanto correlação perfeita, e invisível até alguém contar.
 *
 * O fmix32 (do MurmurHash3) espalha os bits altos para os baixos, e aí o bit
 * final passa a depender da entrada inteira.
 */
function hash32(texto: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }

  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;

  return h >>> 0;
}

/**
 * Decide a variante deste lead neste teste.
 *
 * Derivada do par (teste, lead), não sorteada. A diferença importa: com
 * `Math.random()`, o mesmo lead poderia receber a variante A hoje e a B no
 * follow-up de amanhã — e aí o teste não mede a mensagem, mede a mistura. E
 * um reprocessamento do lote reatribuiria todo mundo, embaralhando dados já
 * coletados.
 *
 * O id do teste entra no hash para que dois testes simultâneos não caiam
 * exatamente na mesma divisão da carteira: sem isso, o lead que pegou A no
 * primeiro teste pegaria A em todos, e as amostras ficariam correlacionadas.
 */
export function pickVariant(testId: string, leadId: string): "a" | "b" {
  return hash32(`${testId}:${leadId}`) % 2 === 0 ? "a" : "b";
}

// ------------------------------------------------------------
// DECISÃO
// ------------------------------------------------------------

export interface VariantStats {
  sent: number;
  replied: number;
  converted: number;
  /** Em centavos, para não somar float. */
  revenueCents: number;
}

export interface AbDecision {
  /** `null` enquanto não há motivo para decidir. */
  winner: "a" | "b" | null;
  /** Confiança em pontos percentuais (90, 95, 99) ou 0. */
  confidence: number;
  /** Qual métrica decidiu. */
  metric: "receita" | "conversao" | "resposta" | null;
  /** Frase pronta para a tela. Nunca vazia. */
  reason: string;
}

/**
 * Teste-z de duas proporções. Devolve o z absoluto.
 */
function zScore(sucessoA: number, totalA: number, sucessoB: number, totalB: number): number {
  if (totalA === 0 || totalB === 0) return 0;

  const taxaA = sucessoA / totalA;
  const taxaB = sucessoB / totalB;
  const combinada = (sucessoA + sucessoB) / (totalA + totalB);

  if (combinada === 0 || combinada === 1) return 0;

  const erro = Math.sqrt(combinada * (1 - combinada) * (1 / totalA + 1 / totalB));
  if (erro === 0) return 0;

  return Math.abs(taxaA - taxaB) / erro;
}

function confidenceFor(z: number): number {
  if (z >= 2.576) return 99;
  if (z >= 1.96) return 95;
  if (z >= 1.645) return 90;
  return 0;
}

/**
 * Decide o vencedor.
 *
 * A ordem das métricas é a coisa mais importante deste arquivo. A versão
 * anterior decidia por TAXA DE RESPOSTA, que é justamente a métrica que
 * engana: a mensagem mais chamativa — a que promete demais, a que usa
 * urgência artificial — ganha em resposta e perde em venda. Otimizar por
 * resposta é treinar o sistema a exagerar.
 *
 * Então: receita primeiro, negócio fechado depois, resposta só como último
 * recurso — e, quando é resposta que decide, a tela precisa dizer isso, para
 * ninguém tomar a conclusão como se fosse sobre faturamento.
 *
 * `minSample` é por variante, não no total: 100 envios sendo 95 numa
 * variante e 5 na outra não é amostra de nada.
 */
export function decideWinner(
  a: VariantStats,
  b: VariantStats,
  minSample = 50,
): AbDecision {
  if (a.sent < minSample || b.sent < minSample) {
    const falta = Math.max(minSample - a.sent, minSample - b.sent);
    return {
      winner: null,
      confidence: 0,
      metric: null,
      reason: `Amostra insuficiente: faltam ${falta} envio(s) na variante menos usada para a comparação valer.`,
    };
  }

  // ---- 1. Receita ----
  // Aqui não cabe teste-z: receita não é proporção, é soma de valores muito
  // diferentes entre si. Um contrato grande distorce a média inteira. Então a
  // regra é grosseira de propósito e honesta sobre isso: só declara vencedor
  // com uma diferença que nenhum contrato isolado explicaria.
  const receitaTotal = a.revenueCents + b.revenueCents;
  if (receitaTotal > 0) {
    const receitaA = a.revenueCents / a.sent;
    const receitaB = b.revenueCents / b.sent;
    const maior = Math.max(receitaA, receitaB);
    const menor = Math.min(receitaA, receitaB);

    if (menor === 0 || maior / menor >= 1.3) {
      const vencedor = receitaA > receitaB ? "a" : "b";
      const reais = (v: number) => (v / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      return {
        winner: vencedor,
        confidence: 0,
        metric: "receita",
        reason:
          `Vence por receita por envio: ${reais(receitaA)} (A) contra ${reais(receitaB)} (B). ` +
          `Receita não é proporção — a diferença é grande, mas não vem com significância estatística.`,
      };
    }

    return {
      winner: null,
      confidence: 0,
      metric: "receita",
      reason:
        "As duas variantes trouxeram receita parecida por envio. " +
        "Sem diferença que valha trocar a mensagem que já está rodando.",
    };
  }

  // ---- 2. Negócio fechado ----
  if (a.converted + b.converted > 0) {
    const z = zScore(a.converted, a.sent, b.converted, b.sent);
    const conf = confidenceFor(z);
    if (conf >= 95) {
      const vencedor = a.converted / a.sent > b.converted / b.sent ? "a" : "b";
      return {
        winner: vencedor,
        confidence: conf,
        metric: "conversao",
        reason: `Vence em negócios fechados, com ${conf}% de confiança. É a métrica boa: mede venda, não curiosidade.`,
      };
    }
    return {
      winner: null,
      confidence: conf,
      metric: "conversao",
      reason: "Já há negócios fechados, mas a diferença ainda pode ser sorte. Deixe rodar mais.",
    };
  }

  // ---- 3. Resposta ----
  const z = zScore(a.replied, a.sent, b.replied, b.sent);
  const conf = confidenceFor(z);

  if (conf >= 95) {
    const vencedor = a.replied / a.sent > b.replied / b.sent ? "a" : "b";
    return {
      winner: vencedor,
      confidence: conf,
      metric: "resposta",
      reason:
        `Vence em taxa de resposta, com ${conf}% de confiança. ` +
        `Atenção: resposta não é venda — a mensagem que promete demais costuma ganhar aqui e perder na frente. ` +
        `Se ainda não houve negócio fechado, trate como indício, não como conclusão.`,
    };
  }

  return {
    winner: null,
    confidence: conf,
    metric: null,
    reason:
      a.replied + b.replied === 0
        ? "Nenhuma resposta ainda nas duas variantes. Nada a comparar."
        : "A diferença entre as variantes ainda pode ser sorte. Deixe rodar mais.",
  };
}

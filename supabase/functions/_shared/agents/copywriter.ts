// ============================================================
// COPY AGENT
// ============================================================
// O prompt antigo exigia "pelo menos 1 número concreto" e dava como exemplo
// "R$ 3-5 mil/mês em vendas perdidas" e "cada review a menos = 12% menos
// ligação". Nenhum desses números existia em lugar nenhum. Duas linhas
// depois o mesmo prompt dizia "não invente dados" — e o modelo, obviamente,
// obedeceu à instrução mais específica.
//
// Aqui a regra é invertida: o prompt lista os fatos disponíveis e proíbe
// qualquer afirmação fora dessa lista. Se não há número, a mensagem sai sem
// número. Mensagem sem estatística funciona; mensagem com estatística falsa
// destrói a relação no primeiro "de onde você tirou isso?".

import type { Dossier, Strategy } from "./types.ts";
import { renderDossierForPrompt } from "./dossier.ts";

export interface CopyContext {
  dossier: Dossier;
  strategy: Strategy;
  sender: {
    agentName: string;
    persona?: string | null;
    communicationStyle?: string | null;
    emojiUsage?: string | null;
    companyName?: string | null;
  };
}

const ANGLE_PLAYBOOK: Record<Strategy["angle"], string> = {
  diagnostico:
    "Abra citando o problema verificado — ele consegue conferir sozinho em segundos, e é isso que dá credibilidade. " +
    "Diga o que aquilo custa a ele em linguagem de dono de negócio, SEM inventar percentual ou valor. " +
    "Feche com o pedido mínimo.",

  oportunidade:
    "Não há problema evidente. Não invente um. Aponte o espaço concreto de ganho ligado à oferta e pergunte se faz sentido.",

  consultiva:
    "Você sabe pouco sobre a operação dele. Então PERGUNTE em vez de afirmar. " +
    "Uma pergunta específica do segmento vale mais que qualquer diagnóstico chutado.",

  curta:
    "Contexto raso. Mensagem mínima: apresente-se em meia linha e faça uma pergunta direta. " +
    "Não tente parecer que conhece a empresa — não conhece.",

  prova:
    "Use o caso real cadastrado como referência. Cite apenas o que está no material — nada de resultado aproximado ou lembrado.",

  reativacao:
    "Já houve contato faz tempo e ele não respondeu. Reconheça isso com naturalidade, traga um motivo NOVO para voltar, " +
    "e deixe explícito que é fácil dizer não.",

  follow_up:
    "Já houve mensagem recente sem resposta. NÃO pergunte 'viu minha mensagem?'. " +
    "Traga algo novo ou seja direto: uma linha, sem cobrança.",
};

/**
 * Monta o prompt do sistema. Contexto enxuto de propósito: mandar o banco
 * inteiro para o modelo aumenta custo, aumenta latência e piora a saída —
 * o modelo se perde entre o dado relevante e o ruído.
 */
export function buildCopyPrompt(ctx: CopyContext): { system: string; user: string } {
  const { dossier, strategy, sender } = ctx;
  const offer = strategy.offer;

  const emoji = sender.emojiUsage ?? "no máximo 1, e só se cair natural";
  const style = sender.communicationStyle ?? "direto, humano, sem jargão comercial";

  // ---- Bloco da oferta: só o que está cadastrado ----
  const offerBlock = offer
    ? [
      `Nome: ${offer.name}`,
      offer.description ? `O que é: ${offer.description}` : null,
      offer.benefits.length > 0 ? `Benefícios cadastrados: ${offer.benefits.slice(0, 4).join("; ")}` : null,
      offer.painPoints.length > 0 ? `Dores que resolve: ${offer.painPoints.slice(0, 4).join("; ")}` : null,
      offer.caseStudies.length > 0 && strategy.angle === "prova"
        ? `Casos reais cadastrados (use SÓ estes, palavra por palavra do que está aqui):\n${offer.caseStudies.slice(0, 2).map((c) => `  - ${c}`).join("\n")}`
        : null,
    ].filter(Boolean).join("\n")
    : "Nenhuma oferta definida. NÃO proponha serviço específico — apenas abra conversa.";

  const system = `# QUEM VOCÊ É
Você é ${sender.agentName}${sender.companyName ? `, da ${sender.companyName}` : ""}, escrevendo pessoalmente no WhatsApp do dono de um negócio.
${sender.persona ?? ""}

Estilo: ${style}
Emojis: ${emoji}

# A REGRA QUE VALE MAIS QUE TODAS AS OUTRAS
Você só pode AFIRMAR o que está na lista de FATOS OBSERVADOS que vem na próxima mensagem.

Isso significa, sem exceção:
- NÃO invente estatística, percentual, valor em reais, prazo ou quantidade. Se o número não está nos FATOS, ele não existe.
- NÃO invente caso de sucesso, cliente anterior, resultado obtido ou "fiz pra uma empresa parecida".
- NÃO invente preço, desconto, condição ou prazo de entrega.
- NÃO afirme nada sobre a operação interna dele (faturamento, equipe, sistema que usa, concorrente).
- HIPÓTESE não é fato. Se quiser usar, vire pergunta: "vocês têm dificuldade com X?" — nunca "sei que vocês têm dificuldade com X".
- Se faltar material, escreva uma mensagem mais curta. Mensagem curta e verdadeira ganha de mensagem rica e inventada.

# O QUE VOCÊ OFERECE
${offerBlock}

# ESTRATÉGIA DESTA MENSAGEM
Ângulo: ${strategy.angle}
${ANGLE_PLAYBOOK[strategy.angle]}

Objetivo: ${strategy.objective}
Pedido final: ${strategy.cta}

# FORMATO
- Máximo ${strategy.maxWords} palavras. Conte antes de responder.
- 1 a 3 frases. Sem parágrafo longo.
- Português do Brasil falado. Contrações naturais ("tá", "pra") são bem-vindas.
- Comece com "Oi", "Opa", "E aí" ou direto no assunto. NUNCA "Prezado", "Espero que esteja bem", "Venho por meio desta", "Gostaria de apresentar".
- Sem markdown, sem bullet, sem título, sem aspas em volta, sem assinatura.
- UMA ideia só. Um problema, uma oferta, um pedido.
- Não liste serviços. Não escreva propaganda.

# SAÍDA
Responda APENAS com o texto da mensagem. Nada antes, nada depois.`;

  const user = `${renderDossierForPrompt(dossier)}

${strategy.hook
    ? `## COMECE POR ESTE FATO\n${strategy.hook.label}: ${strategy.hook.value}\n(fonte: ${strategy.hook.source})`
    : "## ATENÇÃO\nNão há fato forte sobre esta empresa. Não finja conhecê-la. Escreva algo curto e honesto, e faça uma pergunta."}

Escreva a mensagem agora, em no máximo ${strategy.maxWords} palavras.`;

  return { system, user };
}

/**
 * Prompt de reescrita. Recebe o veredito do Quality Gate e conserta apenas o
 * que foi apontado — reescrever do zero costuma trocar um problema por outro.
 */
export function buildRewritePrompt(
  ctx: CopyContext,
  previous: string,
  issues: { code: string; message: string; excerpt?: string }[],
): { system: string; user: string } {
  const base = buildCopyPrompt(ctx);

  const user = `A mensagem abaixo foi REPROVADA na revisão.

MENSAGEM REPROVADA:
${previous}

MOTIVOS:
${issues.map((i) => `- ${i.message}${i.excerpt ? ` (trecho: "${i.excerpt}")` : ""}`).join("\n")}

${renderDossierForPrompt(ctx.dossier)}

Reescreva corrigindo EXATAMENTE esses pontos. Mantenha o que estava bom.
Se o problema foi afirmação sem fonte, REMOVA a afirmação — não troque por outra.
Máximo ${ctx.strategy.maxWords} palavras. Responda apenas com a mensagem.`;

  return { system: base.system, user };
}

/** Limpa enfeite que o modelo às vezes coloca apesar da instrução. */
export function cleanMessage(raw: string): string {
  return raw
    .trim()
    .replace(/^```[a-z]*\s*|\s*```$/g, "")
    .replace(/^["'«»]+|["'«»]+$/g, "")
    .replace(/^\*\*|\*\*$/g, "")
    .replace(/^(mensagem|resposta|saída)\s*:\s*/i, "")
    .trim();
}

// ============================================================
// QUEM PODE MANDAR MENSAGEM QUANDO O FREIO ESTÁ PUXADO
// ============================================================
// A parada de emergência foi criada com a promessa de que "quem aperta o
// botão espera que TUDO pare". Não parava. `outbound_paused` era consultado
// por `mission_can_send()`, e só as missões passavam por ali — o agente
// conversacional e os follow-ups agendados continuavam mandando mensagem
// normalmente, cada um pelo seu caminho.
//
// Freio que para uma parte é pior que freio nenhum: com freio nenhum a
// pessoa vai desconectar o WhatsApp na mão. Com freio pela metade ela acha
// que resolveu e vai dormir.
//
// A distinção que importa não é qual função chamou, é se uma PESSOA decidiu
// mandar aquela mensagem específica agora. A parada de emergência existe
// para a máquina parar de agir sozinha, não para impedir alguém de responder
// um cliente que está do outro lado esperando.

/** Quem pediu o envio. */
export type SendInitiator = "human" | "automation";

/**
 * Interpreta o campo `initiated_by` do corpo da requisição.
 *
 * Falha fechada de propósito: qualquer coisa que não seja exatamente
 * `"human"` conta como automação. Um chamador novo que esqueça o campo é
 * tratado como robô — o erro nesse sentido segura uma mensagem a mais, e no
 * outro sentido fura a parada de emergência.
 */
export function initiatorOf(value: unknown): SendInitiator {
  return value === "human" ? "human" : "automation";
}

/**
 * Diz por que este envio não pode sair, ou `null` se pode.
 *
 * Devolver o motivo em vez de um booleano é o que permite a tela dizer o que
 * aconteceu. "Não foi possível enviar" manda a pessoa procurar defeito onde
 * não tem; "os envios estão pausados" ela resolve em dois cliques.
 */
export function outboundBlockReason(input: {
  initiatedBy: SendInitiator;
  outboundPaused: boolean;
}): "outbound_paused" | null {
  if (input.initiatedBy === "human") return null;
  return input.outboundPaused ? "outbound_paused" : null;
}

// ============================================================
// O QUE FAZER QUANDO O ENVIO FALHA
// ============================================================
// Antes, toda resposta ruim do `whatsapp-send` virava status 'failed', que é
// final e não tem botão de tentar de novo na tela. Um 502 momentâneo da
// Evolution apagava um lead que já tinha sido pesquisado, qualificado,
// casado com uma oferta, escrito pela IA e aprovado pelo Quality Gate.
//
// A classificação vive aqui, fora da edge function, por um motivo prático:
// é a única parte dessa decisão que dá para testar sem banco e sem rede. Uma
// regra que decide se um lead é descartado merece teste.

/** Situação em que a tentativa parou. */
export type SendFailureKind =
  /** O número pediu para não receber. Sai da fila e não volta. */
  | "opt_out"
  /** Repetir produz exatamente o mesmo erro. */
  | "definitive"
  /** Descreve o mundo naquele instante, não o lead. Vale insistir. */
  | "transient";

/**
 * Classifica a falha a partir do que o `whatsapp-send` devolveu.
 *
 * `status` é o HTTP; `body` é o corpo em texto. Passe `null` em `status`
 * quando a requisição nem chegou a ter resposta (timeout, DNS, conexão
 * derrubada) — isso nunca é definitivo: a mensagem pode não ter sequer
 * chegado ao destino.
 *
 * As faixas vêm do `whatsapp-send`:
 *   400  número inválido, mensagem vazia, mensagem longa demais
 *   409  sem chip disponível  |  número na blacklist (traz "blacklisted")
 *   502  a Evolution recusou o envio
 *   503  WhatsApp não configurado ou desconectado
 *
 * Só o 400 fala sobre o lead ou sobre a mensagem. O resto fala sobre a
 * infraestrutura, e infraestrutura volta.
 */
export function classifySendFailure(
  status: number | null,
  body: string | null | undefined,
): SendFailureKind {
  const texto = body ?? "";

  // O opt-out chega como 409 com `code: "blacklisted"`. É a única resposta
  // que precisa ser lida, e não só contada: 409 também significa "nenhum chip
  // disponível", que é o oposto — nesse caso o lead não fez nada, a conta é
  // que está sem meio de enviar.
  if (status === 409 && /blacklist/i.test(texto)) return "opt_out";

  if (status === 400) return "definitive";

  return "transient";
}

/**
 * Teto de tentativas.
 *
 * Cinco, e não três, porque as falhas longas — WhatsApp desconectado, fora do
 * horário, parada de emergência, limite diário — são barradas antes por
 * `mission_can_send` e nem chegam a virar tentativa. O que chega aqui é
 * oscilação curta.
 *
 * Na dúvida, insistir: o custo de uma tentativa a mais é uma linha de log; o
 * de uma a menos é um lead qualificado com mensagem pronta jogado fora.
 */
export const MAX_SEND_ATTEMPTS = 5;

/**
 * Diz se ainda vale tentar de novo.
 *
 * `attempts` é o total já contabilizado, incluindo a que acabou de falhar.
 */
export function shouldRetrySend(kind: SendFailureKind, attempts: number): boolean {
  if (kind !== "transient") return false;
  return attempts < MAX_SEND_ATTEMPTS;
}

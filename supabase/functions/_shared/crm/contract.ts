// ============================================================
// LEVAR O LEAD PARA O CRM QUE A EMPRESA JÁ USA
// ============================================================
// A PME brasileira que compra prospecção JÁ TEM CRM. Se o lead não flui para
// lá, o vendedor passa a trabalhar em duas telas — e em duas semanas volta
// para a que ele já usava. É a causa mais comum de abandono deste tipo de
// ferramenta, e não é problema de qualidade: é de encaixe.
//
// Três decisões que atravessam todos os adaptadores:
//
// 1. SÓ EMPURRA, NÃO PUXA. O CRM deles é a verdade sobre o funil; este
//    produto é a verdade sobre a prospecção. Sincronização nos dois sentidos
//    é onde nasce o conflito que ninguém resolve — dois sistemas discordando
//    sobre o estágio do mesmo negócio, e o vendedor no meio.
//
// 2. NUNCA SOBRESCREVE O QUE JÁ EXISTE LÁ. Se o contato já está no CRM, a
//    integração acrescenta a atividade e para. Apagar um campo que o vendedor
//    preencheu à mão é a forma mais rápida de perder a confiança dele — e
//    ninguém devolve confiança de ferramenta.
//
// 3. FALHA NÃO SEGURA A PROSPECÇÃO. CRM fora do ar não pode impedir uma
//    abordagem de sair. A integração é registro, não caminho crítico.

export type CrmProvider = "rd_station" | "pipedrive" | "hubspot" | "webhook";

export interface CrmLead {
  name: string;
  phone?: string | null;
  email?: string | null;
  company?: string | null;
  website?: string | null;
  niche?: string | null;
  location?: string | null;
  /** Nota da qualificação, quando existe. */
  score?: number | null;
  /** Por que este lead foi abordado. Vale mais que o score no CRM do outro. */
  reason?: string | null;
  origin?: string | null;
}

export interface CrmResult {
  ok: boolean;
  /** Id do registro no CRM de destino, quando o provedor devolve. */
  externalId?: string | null;
  /** Sempre preenchido. É o que a tela mostra quando algo não foi. */
  message: string;
  /** `true` quando o contato já existia lá e nada foi sobrescrito. */
  alreadyExisted?: boolean;
}

export interface CrmAdapter {
  provider: CrmProvider;
  label: string;
  /** Nome do secret que habilita este destino. */
  credentialEnv: string;
  push: (lead: CrmLead, credential: string, config?: Record<string, unknown>) => Promise<CrmResult>;
}

/**
 * Resposta padrão para destino sem credencial.
 *
 * "Não configurado" é diferente de "quebrado", e a mensagem precisa dizer
 * qual dos dois — senão alguém passa a tarde procurando defeito onde só falta
 * preencher um campo.
 */
export function naoConfigurado(adapter: CrmAdapter): CrmResult {
  return {
    ok: false,
    message:
      `${adapter.label} não está configurado. Cadastre ${adapter.credentialEnv} ` +
      `nos secrets das edge functions para habilitar este destino.`,
  };
}

/**
 * Monta a descrição que vai como observação no CRM de destino.
 *
 * O CRM do cliente não tem dossiê, nem score, nem quality gate. O que ele
 * pode receber é o resumo do porquê — e é justamente isso que faz o vendedor
 * de lá confiar num lead que ele não capturou.
 */
export function descricaoParaCrm(lead: CrmLead): string {
  const partes: string[] = [];

  if (lead.reason) partes.push(lead.reason);
  if (lead.score != null) partes.push(`Nota de qualificação: ${lead.score}/100.`);
  if (lead.niche) partes.push(`Nicho: ${lead.niche}.`);
  if (lead.location) partes.push(`Local: ${lead.location}.`);
  if (lead.website) partes.push(`Site: ${lead.website}.`);
  if (lead.origin) partes.push(`Origem do dado: ${lead.origin}.`);

  partes.push("Capturado e qualificado pela prospecção automática.");

  return partes.join(" ");
}

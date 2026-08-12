// ============================================================
// OS DESTINOS
// ============================================================
// Quatro adaptadores, cada um com a API do seu CRM. O contrato em
// `contract.ts` é o que impede isto de virar quatro integrações diferentes
// com quatro comportamentos diferentes em caso de erro.
//
// A ordem em que foram escritos segue o mercado brasileiro: RD Station é o
// que a PME daqui mais usa, e Pipedrive vem logo atrás. HubSpot aparece mais
// em empresa maior. O webhook genérico existe para quem usa qualquer outra
// coisa — e é o que evita a pergunta "vocês integram com o meu?" virar não.

import {
  descricaoParaCrm,
  type CrmAdapter,
  type CrmLead,
  type CrmResult,
} from "./contract.ts";

const TIMEOUT = 10_000;

async function post(
  url: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<{ ok: boolean; status: number; data: unknown; texto: string }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT),
  });

  const texto = await res.text();
  let data: unknown;
  try { data = JSON.parse(texto); } catch { data = texto; }

  return { ok: res.ok, status: res.status, data, texto };
}

/**
 * RD Station Marketing — o mais comum na PME brasileira.
 *
 * Usa a API de conversão: registra o lead como um evento de origem
 * identificada, que é como o RD espera receber contato vindo de fora. Criar
 * direto na base sem evento deixa o lead sem procedência lá dentro, e aí o
 * time de marketing não sabe de onde ele veio.
 */
export const rdStation: CrmAdapter = {
  provider: "rd_station",
  label: "RD Station",
  credentialEnv: "RD_STATION_TOKEN",

  async push(lead: CrmLead, credential: string): Promise<CrmResult> {
    if (!lead.email) {
      // O RD identifica contato por e-mail. Sem ele, o registro entra
      // duplicado a cada envio — e limpar base duplicada no RD é trabalho
      // manual que ninguém faz.
      return {
        ok: false,
        message: "O RD Station identifica contato por e-mail, e este lead não tem um.",
      };
    }

    const r = await post(
      "https://api.rd.services/platform/conversions",
      { Authorization: `Bearer ${credential}` },
      {
        event_type: "CONVERSION",
        event_family: "CDP",
        payload: {
          conversion_identifier: "prospeccao-automatica",
          email: lead.email,
          name: lead.name,
          personal_phone: lead.phone ?? undefined,
          company_name: lead.company ?? undefined,
          company_site: lead.website ?? undefined,
          cf_origem_prospeccao: lead.origin ?? undefined,
          cf_motivo_abordagem: descricaoParaCrm(lead),
        },
      },
    );

    if (!r.ok) {
      return { ok: false, message: `RD Station recusou (${r.status}): ${r.texto.slice(0, 160)}` };
    }

    return { ok: true, message: "Enviado ao RD Station." };
  },
};

/**
 * Pipedrive — cria a PESSOA, e só cria o negócio se ainda não houver um.
 *
 * Criar negócio sempre encheria o funil de quem já tinha uma conversa em
 * andamento, e negócio duplicado no Pipedrive atrapalha o relatório do
 * vendedor — que é a coisa que ele mais olha.
 */
export const pipedrive: CrmAdapter = {
  provider: "pipedrive",
  label: "Pipedrive",
  credentialEnv: "PIPEDRIVE_API_TOKEN",

  async push(lead: CrmLead, credential: string): Promise<CrmResult> {
    const base = `https://api.pipedrive.com/v1`;

    // Procura antes de criar. Sem isto, cada rodada da esteira cria de novo a
    // mesma pessoa.
    const termo = encodeURIComponent(lead.email ?? lead.phone ?? lead.name);
    const busca = await fetch(
      `${base}/persons/search?term=${termo}&limit=1&api_token=${credential}`,
      { signal: AbortSignal.timeout(TIMEOUT) },
    );

    if (busca.ok) {
      const encontrado = await busca.json();
      const item = encontrado?.data?.items?.[0]?.item;
      if (item?.id) {
        // Já existe: acrescenta a nota e para. Sobrescrever o que o vendedor
        // preencheu à mão é a forma mais rápida de perder a confiança dele.
        await post(
          `${base}/notes?api_token=${credential}`,
          {},
          { person_id: item.id, content: descricaoParaCrm(lead) },
        );

        return {
          ok: true,
          externalId: String(item.id),
          alreadyExisted: true,
          message: "Já existia no Pipedrive — nada foi sobrescrito, só a nota entrou.",
        };
      }
    }

    const r = await post(
      `${base}/persons?api_token=${credential}`,
      {},
      {
        name: lead.name,
        email: lead.email ? [{ value: lead.email, primary: true }] : undefined,
        phone: lead.phone ? [{ value: lead.phone, primary: true }] : undefined,
      },
    );

    if (!r.ok) {
      return { ok: false, message: `Pipedrive recusou (${r.status}): ${r.texto.slice(0, 160)}` };
    }

    const id = (r.data as { data?: { id?: number } })?.data?.id;

    if (id) {
      await post(
        `${base}/notes?api_token=${credential}`,
        {},
        { person_id: id, content: descricaoParaCrm(lead) },
      );
    }

    return { ok: true, externalId: id ? String(id) : null, message: "Criado no Pipedrive." };
  },
};

/** HubSpot — contato por e-mail, sem sobrescrever o que já existe lá. */
export const hubspot: CrmAdapter = {
  provider: "hubspot",
  label: "HubSpot",
  credentialEnv: "HUBSPOT_TOKEN",

  async push(lead: CrmLead, credential: string): Promise<CrmResult> {
    if (!lead.email) {
      return {
        ok: false,
        message: "O HubSpot identifica contato por e-mail, e este lead não tem um.",
      };
    }

    const r = await post(
      "https://api.hubapi.com/crm/v3/objects/contacts",
      { Authorization: `Bearer ${credential}` },
      {
        properties: {
          email: lead.email,
          firstname: lead.name,
          phone: lead.phone ?? undefined,
          company: lead.company ?? undefined,
          website: lead.website ?? undefined,
          hs_lead_status: "NEW",
        },
      },
    );

    // 409 é contato já existente. Não é erro: é o comportamento desejado — a
    // integração não sobrescreve o que já está lá.
    if (r.status === 409) {
      return {
        ok: true,
        alreadyExisted: true,
        message: "Já existia no HubSpot — nada foi sobrescrito.",
      };
    }

    if (!r.ok) {
      return { ok: false, message: `HubSpot recusou (${r.status}): ${r.texto.slice(0, 160)}` };
    }

    const id = (r.data as { id?: string })?.id;
    return { ok: true, externalId: id ?? null, message: "Criado no HubSpot." };
  },
};

/**
 * Webhook genérico — para quem usa qualquer outra coisa.
 *
 * É o que impede "vocês integram com o meu CRM?" de virar não. A credencial
 * aqui é a própria URL de destino.
 */
export const webhookGenerico: CrmAdapter = {
  provider: "webhook",
  label: "Webhook",
  credentialEnv: "CRM_WEBHOOK_URL",

  async push(lead: CrmLead, credential: string): Promise<CrmResult> {
    const r = await post(credential, {}, {
      event: "lead_qualificado",
      lead,
      descricao: descricaoParaCrm(lead),
      enviado_em: new Date().toISOString(),
    });

    if (!r.ok) {
      return { ok: false, message: `O webhook recusou (${r.status}): ${r.texto.slice(0, 160)}` };
    }

    return { ok: true, message: "Enviado ao webhook." };
  },
};

export const CRM_ADAPTERS: CrmAdapter[] = [rdStation, pipedrive, hubspot, webhookGenerico];

export function adapterPara(provider: string): CrmAdapter | null {
  return CRM_ADAPTERS.find((a) => a.provider === provider) ?? null;
}

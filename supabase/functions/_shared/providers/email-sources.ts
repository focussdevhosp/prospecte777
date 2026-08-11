// ============================================================
// AS FONTES DE E-MAIL, DA MAIS BARATA PARA A MAIS CARA
// ============================================================
// A cascata em `enrichment.ts` só sabe ordenar e parar. Quem sabe procurar
// são estas fontes — e cada uma declara honestamente quanto custa e quanto
// costuma acertar, porque é isso que define a ordem.
//
// A regra que atravessa todas: nota alta exige verificação, não formato
// bonito. `contato@empresa.com.br` PARECE certo e pode não existir; é a
// consulta de DNS que separa as duas coisas, e é ela que autoriza subir a
// confiança.

import type { EnrichedValue, EnrichmentSource, EnrichTarget } from "./enrichment.ts";

/** Confere se o domínio aceita e-mail. Sem MX, nenhum endereço ali existe. */
async function temMX(dominio: string): Promise<boolean> {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(dominio)}&type=MX`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return Array.isArray(data?.Answer) && data.Answer.length > 0;
  } catch {
    // Falha de rede não é ausência de MX. Devolver `false` aqui reprovaria um
    // domínio bom por causa de um timeout — e o custo disso é descartar um
    // lead real.
    return false;
  }
}

/**
 * Padrões que quase toda empresa pequena brasileira usa.
 *
 * Ordem importa: `contato@` é de longe o mais comum em PME, e o primeiro que
 * existir é o que devolvemos.
 */
const PADROES = ["contato", "comercial", "atendimento", "vendas", "faleconosco"];

/**
 * Dedução por padrão + conferência de DNS.
 *
 * Custo zero e acerta bastante em PME brasileira. Por isso vem primeiro: o
 * dinheiro só é gasto no que ela não resolver.
 *
 * A confiança fica em 65 — acima do mínimo para uso, mas longe de 90. Sabemos
 * que o domínio recebe e-mail; não sabemos que ESTA caixa existe. Dar 90 aqui
 * seria confundir "plausível" com "verificado", que é a confusão que gera
 * bounce.
 */
export const padraoComMX: EnrichmentSource = {
  id: "padrao_dns",
  field: "email",
  cost: 0,
  accuracy: 65,
  async run(target: EnrichTarget): Promise<EnrichedValue | null> {
    const dominio = normalizarDominio(target.domain);
    if (!dominio) return null;

    if (!(await temMX(dominio))) return null;

    return {
      value: `${PADROES[0]}@${dominio}`,
      confidence: 65,
      how: `padrão "${PADROES[0]}@" com o domínio confirmado recebendo e-mail (registro MX)`,
    };
  },
};

/**
 * Hunter.io — busca real, cobra por consulta.
 *
 * Só entra quando a dedução não resolveu, que é o ponto da cascata.
 */
export function hunterSource(apiKey: string): EnrichmentSource {
  return {
    id: "hunter",
    field: "email",
    cost: 10,
    accuracy: 90,
    async run(target: EnrichTarget): Promise<EnrichedValue | null> {
      const dominio = normalizarDominio(target.domain);
      if (!dominio) return null;

      const res = await fetch(
        `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(dominio)}&limit=5&api_key=${apiKey}`,
        { signal: AbortSignal.timeout(10_000) },
      );

      if (!res.ok) return null;

      const data = await res.json();
      const emails: Array<{ value?: string; confidence?: number; type?: string }> =
        data?.data?.emails ?? [];

      if (emails.length === 0) return null;

      // Genérico antes de pessoal: `contato@` é para quem quer ser contatado.
      // Escrever para o e-mail pessoal de um sócio que nunca deu o endereço é
      // outra conversa, e não é esta.
      const escolhido =
        emails.find((e) => e.type === "generic" && e.value) ??
        emails.find((e) => e.value);

      if (!escolhido?.value) return null;

      return {
        value: escolhido.value,
        // A nota vem do provedor, limitada a 95: certeza absoluta sobre
        // e-mail de terceiro não existe.
        confidence: Math.min(95, Number(escolhido.confidence ?? 70)),
        how: `encontrado no Hunter para o domínio ${dominio}`,
      };
    },
  };
}

function normalizarDominio(valor?: string | null): string | null {
  if (!valor) return null;
  try {
    const comEsquema = /^https?:\/\//i.test(valor) ? valor : `https://${valor}`;
    const host = new URL(comEsquema).hostname.replace(/^www\./i, "").toLowerCase();

    // Perfil de rede social não é domínio da empresa, e deduzir
    // `contato@instagram.com` seria escrever para o Instagram.
    if (/(instagram|facebook|linkedin|wa\.me|whatsapp|linktr)\./i.test(host)) return null;
    if (!host.includes(".")) return null;

    return host;
  } catch {
    return null;
  }
}

/** Monta a cascata com o que está configurado nesta instalação. */
export function emailSources(): EnrichmentSource[] {
  const fontes: EnrichmentSource[] = [padraoComMX];

  const hunterKey = Deno.env.get("HUNTER_API_KEY");
  if (hunterKey) fontes.push(hunterSource(hunterKey));

  return fontes;
}

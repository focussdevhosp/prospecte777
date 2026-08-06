// ============================================================
// AUDITORIA DO SITE DO LEAD
// ============================================================
// As ferramentas do app sabem achar empresa. Nenhuma sabia responder a
// pergunta seguinte: "por que essa empresa precisa do que eu vendo?"
//
// O vendedor abria o site do lead, olhava, e escrevia a abordagem no
// achismo. Aqui o site é analisado e cada problema encontrado vira um
// argumento concreto — com o dado na mão, não com adjetivo.
//
// Tudo é verificável no HTML: ou tem tag de viewport ou não tem. Nada aqui
// depende de opinião nem de IA.

export type Severity = "critical" | "high" | "medium" | "low";

export interface Finding {
  id: string;
  severity: Severity;
  /** O que foi encontrado, em português de cliente. */
  title: string;
  /** Por que isso custa dinheiro para ele. */
  impact: string;
  /** O que você vende que resolve. */
  opportunity: string;
}

export interface SiteAudit {
  url: string | null;
  reachable: boolean;
  status?: number;
  /** 0 a 100: quanto o site está bem. Baixo = muita oportunidade. */
  score: number;
  findings: Finding[];
  /** Resumo de uma linha para colar na mensagem. */
  pitch: string;
  checked_at: string;
}

const TIMEOUT_MS = 12_000;

async function fetchSite(url: string): Promise<{ html: string; status: number; finalUrl: string } | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; ProspecteBot/1.0; auditoria de site)",
        Accept: "text/html,application/xhtml+xml",
      },
    });

    const html = await res.text();
    return { html, status: res.status, finalUrl: res.url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeUrl(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return null;

  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const u = new URL(withScheme);
    // Perfil de rede social não é site da empresa — auditar não faz sentido.
    if (/facebook|instagram|linkedin|twitter|x\.com|tiktok|linktr\.ee/i.test(u.hostname)) {
      return null;
    }
    return u.toString();
  } catch {
    return null;
  }
}

const WEIGHT: Record<Severity, number> = {
  critical: 30,
  high: 18,
  medium: 10,
  low: 4,
};

/**
 * Roda a auditoria. Cada achado é uma verificação objetiva no HTML —
 * sem IA, sem chute, e o mesmo site sempre dá o mesmo resultado.
 */
export async function auditSite(rawUrl: string | null | undefined): Promise<SiteAudit> {
  const checkedAt = new Date().toISOString();

  // ---- Sem site: o achado mais valioso de todos ----
  const url = rawUrl ? normalizeUrl(rawUrl) : null;
  if (!url) {
    return {
      url: null,
      reachable: false,
      score: 0,
      findings: [{
        id: "no_site",
        severity: "critical",
        title: "A empresa não tem site próprio",
        impact:
          "Quem procura no Google não encontra, e quem encontra pelas redes não tem para onde ir. " +
          "Toda a presença depende de plataformas de terceiros.",
        opportunity: "Criação de site ou landing page",
      }],
      pitch: "não tem site próprio",
      checked_at: checkedAt,
    };
  }

  const page = await fetchSite(url);

  // ---- Site fora do ar ----
  if (!page) {
    return {
      url,
      reachable: false,
      score: 0,
      findings: [{
        id: "unreachable",
        severity: "critical",
        title: "O site não carrega",
        impact:
          "O endereço existe mas não responde. Cliente que tenta acessar desiste, " +
          "e o Google acaba tirando a página dos resultados.",
        opportunity: "Recuperação e hospedagem do site",
      }],
      pitch: "o site está fora do ar",
      checked_at: checkedAt,
    };
  }

  const { html, status, finalUrl } = page;
  const lower = html.toLowerCase();
  const findings: Finding[] = [];

  if (status >= 400) {
    findings.push({
      id: "http_error",
      severity: "critical",
      title: `O site responde com erro ${status}`,
      impact: "Visitante e Google recebem erro em vez da página.",
      opportunity: "Correção e manutenção do site",
    });
  }

  // ---- HTTPS ----
  if (!finalUrl.startsWith("https://")) {
    findings.push({
      id: "no_https",
      severity: "high",
      title: "O site não tem certificado de segurança (HTTPS)",
      impact:
        "O navegador mostra 'Não seguro' na barra de endereço. " +
        "Em site com formulário ou pagamento, é motivo direto de desistência.",
      opportunity: "Instalação de certificado SSL",
    });
  }

  // ---- Responsivo ----
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  if (!hasViewport) {
    findings.push({
      id: "not_responsive",
      severity: "critical",
      title: "O site não é adaptado para celular",
      impact:
        "A maior parte do acesso hoje vem do celular. Sem adaptação, o visitante " +
        "precisa dar zoom para ler — e o Google rebaixa a posição do site na busca.",
      opportunity: "Site responsivo",
    });
  }

  // ---- WhatsApp ----
  const hasWhatsApp = /wa\.me|api\.whatsapp\.com|whatsapp:\/\//i.test(html);
  if (!hasWhatsApp) {
    findings.push({
      id: "no_whatsapp",
      severity: "high",
      title: "Não há botão de WhatsApp no site",
      impact:
        "É o canal que o brasileiro usa para comprar. Sem botão, quem se interessou " +
        "tem que copiar o número na mão — e a maioria não faz isso.",
      opportunity: "Integração de WhatsApp e atendimento automatizado",
    });
  }

  // ---- Formas de contato ----
  const hasForm = /<form/i.test(lower);
  const hasEmailLink = /mailto:/i.test(lower);
  if (!hasForm && !hasEmailLink && !hasWhatsApp) {
    findings.push({
      id: "no_contact",
      severity: "critical",
      title: "Não há nenhuma forma de contato na página",
      impact: "O visitante interessado não tem como falar com a empresa. A visita se perde.",
      opportunity: "Formulário de contato e captação de leads",
    });
  }

  // ---- Redes sociais ----
  const hasSocial = /instagram\.com|facebook\.com|linkedin\.com/i.test(lower);
  if (!hasSocial) {
    findings.push({
      id: "no_social",
      severity: "medium",
      title: "O site não aponta para nenhuma rede social",
      impact: "Perde a prova social que faz o visitante confiar antes de comprar.",
      opportunity: "Gestão de redes sociais",
    });
  }

  // ---- SEO básico ----
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
  if (!title || title.length < 10) {
    findings.push({
      id: "no_title",
      severity: "high",
      title: "A página não tem título configurado",
      impact:
        "É o texto azul que aparece no resultado do Google. Sem ele, o site aparece " +
        "com o endereço cru e quase ninguém clica.",
      opportunity: "Otimização para buscadores (SEO)",
    });
  }

  const hasDescription = /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html);
  if (!hasDescription) {
    findings.push({
      id: "no_description",
      severity: "medium",
      title: "A página não tem descrição para o Google",
      impact: "O buscador inventa o resumo, geralmente pegando um trecho solto do menu.",
      opportunity: "Otimização para buscadores (SEO)",
    });
  }

  // ---- Rastreamento ----
  const hasAnalytics = /gtag\(|googletagmanager|google-analytics|fbq\(|clarity\.ms/i.test(lower);
  if (!hasAnalytics) {
    findings.push({
      id: "no_analytics",
      severity: "medium",
      title: "Não há nenhuma ferramenta de medição instalada",
      impact:
        "A empresa não sabe quantas pessoas visitam, de onde vêm nem o que fazem. " +
        "Sem isso, qualquer investimento em anúncio é feito no escuro.",
      opportunity: "Implantação de analytics e rastreamento de conversão",
    });
  }

  // ---- Sinal de abandono ----
  // Rodapé com ano velho é o indício mais confiável de site parado.
  const years = [...html.matchAll(/©\s*(20\d{2})|copyright[^0-9]{0,12}(20\d{2})/gi)]
    .map((m) => Number(m[1] ?? m[2]))
    .filter((y) => y >= 2000 && y <= 2100);

  if (years.length > 0) {
    const newest = Math.max(...years);
    const currentYear = new Date().getUTCFullYear();
    if (currentYear - newest >= 2) {
      findings.push({
        id: "stale",
        severity: "high",
        title: `O site parece parado desde ${newest}`,
        impact:
          "Quem visita entende que a empresa não cuida da presença digital — " +
          "e às vezes que nem está mais funcionando.",
        opportunity: "Reformulação e manutenção do site",
      });
    }
  }

  // ---- Construtor de site gratuito ----
  const builder = /wix\.com|weebly|jimdo|webnode|blogspot|wordpress\.com/i.exec(lower)?.[0];
  if (builder) {
    findings.push({
      id: "free_builder",
      severity: "medium",
      title: `Site feito em plataforma gratuita (${builder})`,
      impact:
        "Normalmente vem com propaganda da plataforma, endereço compartilhado e " +
        "limite de personalização. Passa impressão de empresa pequena.",
      opportunity: "Site próprio com domínio e identidade da marca",
    });
  }

  // ---- Nota final ----
  const penalty = findings.reduce((sum, f) => sum + WEIGHT[f.severity], 0);
  const score = Math.max(0, Math.min(100, 100 - penalty));

  // Ordena por gravidade para o pitch usar o problema mais forte.
  const order: Severity[] = ["critical", "high", "medium", "low"];
  findings.sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity));

  const pitch = findings.length === 0
    ? "o site está bem cuidado"
    : findings.length === 1
      ? findings[0].title.toLowerCase()
      : `${findings[0].title.toLowerCase()} e mais ${findings.length - 1} ponto${findings.length > 2 ? "s" : ""}`;

  return { url: finalUrl, reachable: true, status, score, findings, pitch, checked_at: checkedAt };
}

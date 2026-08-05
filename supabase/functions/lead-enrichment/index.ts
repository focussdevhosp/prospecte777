import {
  checkRateLimit,
  corsHeaders,
  handleCors,
  json,
  rateLimited,
  requireUserOrInternal,
} from "../_shared/auth.ts";

// ── ViaCEP ──────────────────────────────────────────────
async function lookupCep(cep: string) {
  const clean = cep.replace(/\D/g, "");
  if (clean.length !== 8) return { error: "CEP inválido" };
  const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
  const data = await res.json();
  if (data.erro) return { error: "CEP não encontrado" };
  return data;
}

// ── BrasilAPI ───────────────────────────────────────────
async function brasilApi(endpoint: string) {
  const res = await fetch(`https://brasilapi.com.br/api/${endpoint}`);
  if (!res.ok) return { error: `BrasilAPI error: ${res.status}` };
  return await res.json();
}

async function lookupCnpjBrasil(cnpj: string) {
  const clean = cnpj.replace(/\D/g, "");
  if (clean.length !== 14) return { error: "CNPJ inválido" };
  return brasilApi(`cnpj/v1/${clean}`);
}

async function lookupDdd(ddd: string) {
  return brasilApi(`ddd/v1/${ddd}`);
}

async function lookupCepBrasil(cep: string) {
  const clean = cep.replace(/\D/g, "");
  return brasilApi(`cep/v2/${clean}`);
}

async function lookupBanks() {
  return brasilApi(`banks/v1`);
}

async function lookupHolidays(year: string) {
  return brasilApi(`feriados/v1/${year}`);
}

// ── Clearbit Logo ───────────────────────────────────────
function getLogoUrl(domain: string) {
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return {
    logo_url: `https://logo.clearbit.com/${clean}`,
    domain: clean,
  };
}

// ── WHOIS / RDAP ────────────────────────────────────────
async function lookupWhois(domain: string) {
  const clean = domain.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  
  // Try RDAP first (structured JSON, free, no auth)
  try {
    const rdapRes = await fetch(`https://rdap.registro.br/domain/${clean}`);
    if (rdapRes.ok) {
      const data = await rdapRes.json();
      const events = data.events || [];
      const registration = events.find((e: any) => e.eventAction === "registration");
      const expiration = events.find((e: any) => e.eventAction === "expiration");
      const lastChanged = events.find((e: any) => e.eventAction === "last changed");
      
      const entities = data.entities || [];
      let registrantName = null;
      let registrantEmail = null;
      
      for (const entity of entities) {
        const vcard = entity.vcardArray;
        if (vcard && vcard[1]) {
          for (const field of vcard[1]) {
            if (field[0] === "fn") registrantName = field[3];
            if (field[0] === "email") registrantEmail = field[3];
          }
        }
      }
      
      return {
        source: "rdap_br",
        domain: clean,
        status: data.status,
        registered_at: registration?.eventDate || null,
        expires_at: expiration?.eventDate || null,
        last_changed: lastChanged?.eventDate || null,
        registrant_name: registrantName,
        registrant_email: registrantEmail,
        nameservers: (data.nameservers || []).map((ns: any) => ns.ldhName),
      };
    }
  } catch (_e) { /* fallback below */ }
  
  // Fallback: global RDAP via IANA
  try {
    const tld = clean.split(".").pop();
    const bootstrapRes = await fetch("https://data.iana.org/rdap/dns.json");
    const bootstrap = await bootstrapRes.json();
    
    let rdapServer = null;
    for (const service of bootstrap.services) {
      if (service[0].includes(tld)) {
        rdapServer = service[1][0];
        break;
      }
    }
    
    if (rdapServer) {
      const url = `${rdapServer}domain/${clean}`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        const events = data.events || [];
        const registration = events.find((e: any) => e.eventAction === "registration");
        const expiration = events.find((e: any) => e.eventAction === "expiration");
        
        return {
          source: "rdap_global",
          domain: clean,
          status: data.status,
          registered_at: registration?.eventDate || null,
          expires_at: expiration?.eventDate || null,
          nameservers: (data.nameservers || []).map((ns: any) => ns.ldhName),
        };
      }
    }
  } catch (_e) { /* give up */ }
  
  return { error: "Não foi possível consultar WHOIS para este domínio" };
}

// ── Enrich lead (batch of all available data) ───────────
async function enrichLead(lead: { phone?: string; website?: string; address?: string }) {
  const results: Record<string, unknown> = {};

  // Extract DDD from phone
  if (lead.phone) {
    const digits = lead.phone.replace(/\D/g, "");
    // Brazilian phone: strip country code 55, get DDD (2 digits)
    const ddd = digits.startsWith("55") ? digits.substring(2, 4) : digits.substring(0, 2);
    if (ddd.length === 2) {
      try {
        results.ddd_info = await lookupDdd(ddd);
      } catch (_e) { /* skip */ }
    }
  }

  // Logo + WHOIS from website
  if (lead.website) {
    results.logo = getLogoUrl(lead.website);
    try {
      results.whois = await lookupWhois(lead.website);
    } catch (_e) { /* skip */ }
  }

  return results;
}

// ── Router ──────────────────────────────────────────────
Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;

  if (auth.ctx.kind === "user") {
    const limit = await checkRateLimit(auth.ctx.supabase, auth.ctx.userId, "lead-enrichment", 120, 60);
    if (!limit.allowed) return rateLimited(limit.resetIn);
  }

  try {
    const { action, ...params } = await req.json();

    switch (action) {
      case "cep":
        return json(await lookupCep(params.cep));
      case "cep_brasil":
        return json(await lookupCepBrasil(params.cep));
      case "cnpj":
        return json(await lookupCnpjBrasil(params.cnpj));
      case "ddd":
        return json(await lookupDdd(params.ddd));
      case "banks":
        return json(await lookupBanks());
      case "holidays":
        return json(await lookupHolidays(params.year || new Date().getFullYear().toString()));
      case "logo":
        return json(getLogoUrl(params.domain));
      case "whois":
        return json(await lookupWhois(params.domain));
      case "enrich":
        return json(await enrichLead(params.lead || {}));
      default:
        return json({ error: "Ação inválida. Use: cep, cep_brasil, cnpj, ddd, banks, holidays, logo, whois, enrich" }, 400);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro interno" }, 500);
  }
});

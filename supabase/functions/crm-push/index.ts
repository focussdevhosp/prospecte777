// ============================================================
// EMPURRAR O LEAD PARA O CRM DO CLIENTE
// ============================================================
// Regra que atravessa tudo aqui: FALHA NÃO SEGURA A PROSPECÇÃO. Esta function
// é registro, não caminho crítico. CRM fora do ar não pode impedir uma
// abordagem de sair — por isso quem chama daqui de dentro nunca deve esperar
// pela resposta nem tratá-la como bloqueio.
//
// O que ela protege, em compensação: o lead não entra duas vezes no CRM do
// cliente. Duplicata lá é estrago que ele leva meses para limpar à mão, e a
// esteira roda de novo a cada poucos minutos.

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  failure,
  json,
  requireUserOrInternal,
} from "../_shared/auth.ts";
import { adapterPara } from "../_shared/crm/adapters.ts";
import type { CrmLead } from "../_shared/crm/contract.ts";

interface Integracao {
  provider: string;
  credential: string;
  config: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const ctx = auth.ctx;

  try {
    const body = await req.json();
    const leadId = body.lead_id;

    if (!leadId) {
      return json({ error: "lead_id é obrigatório." }, 400);
    }

    // Dono explícito, como em todo caminho que age em nome de alguém: sem
    // saber de quem é o lead não há como escolher o CRM certo — e mandar para
    // o CRM da empresa errada é vazamento, não erro de integração.
    const ownerId = ctx.kind === "user" ? ctx.userId : body.user_id;
    if (!ownerId) {
      return json({
        error: "Não foi possível identificar o dono deste lead.",
        code: "owner_unknown",
      }, 400);
    }

    // service_role porque a credencial tem SELECT revogado de `authenticated`.
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: lead } = await admin
      .from("leads")
      .select(
        "id, user_id, business_name, phone, email, website, niche, location, " +
        "lead_score, pain_points, notes, source, created_at",
      )
      .eq("id", leadId)
      .maybeSingle();

    if (!lead) return json({ error: "Lead não encontrado." }, 404);
    if (lead.user_id !== ownerId) return json({ error: "Lead de outra conta." }, 403);

    const { data: integracoes } = await admin
      .from("crm_integrations")
      .select("provider, credential, config")
      .eq("user_id", ownerId)
      .eq("active", true);

    if (!integracoes?.length) {
      return json({
        ok: true,
        skipped: "sem_integracao",
        message: "Nenhum CRM configurado nesta conta. Nada foi enviado.",
      });
    }

    // Quem já foi não vai de novo. O índice parcial no banco é a garantia
    // final, mas conferir antes evita gastar chamada paga para levar 409.
    const { data: jaForam } = await admin
      .from("crm_push_log")
      .select("provider")
      .eq("lead_id", leadId)
      .eq("ok", true);

    const enviados = new Set((jaForam ?? []).map((r) => r.provider));

    // O motivo sai do que FOI OBSERVADO — as dores levantadas na análise, ou
    // a anotação de quem olhou. Nunca um texto genérico bonito: o vendedor do
    // outro lado precisa poder conferir, e frase de efeito sem lastro é o que
    // faz ele parar de confiar no lead que não capturou.
    const motivo = (lead.pain_points ?? []).length
      ? `Pontos levantados na análise: ${(lead.pain_points as string[]).join("; ")}.`
      : (lead.notes || null);

    const crmLead: CrmLead = {
      name: lead.business_name,
      phone: lead.phone,
      email: lead.email,
      company: lead.business_name,
      website: lead.website,
      niche: lead.niche,
      location: lead.location,
      score: lead.lead_score,
      reason: motivo,
      origin: lead.source
        ? `${lead.source}, em ${new Date(lead.created_at).toLocaleDateString("pt-BR")}`
        : null,
    };

    const resultados: Array<Record<string, unknown>> = [];

    for (const integ of (integracoes as Integracao[])) {
      if (enviados.has(integ.provider)) {
        resultados.push({
          provider: integ.provider,
          ok: true,
          skipped: true,
          message: "Já havia sido enviado a este destino.",
        });
        continue;
      }

      const adapter = adapterPara(integ.provider);
      if (!adapter) {
        // Destino cadastrado que o código não conhece: acontece quando alguém
        // remove um adaptador sem limpar a configuração. Registrar é melhor
        // que ignorar — senão a linha fica lá parecendo ativa para sempre.
        resultados.push({
          provider: integ.provider,
          ok: false,
          message: `Destino "${integ.provider}" não é mais suportado.`,
        });
        continue;
      }

      let r;
      try {
        r = await adapter.push(crmLead, integ.credential, integ.config);
      } catch (e) {
        // Timeout, DNS, servidor fora. Vira falha registrada, nunca exceção
        // que derruba o envio para os outros destinos.
        r = {
          ok: false,
          message: `Não foi possível falar com ${adapter.label}: ` +
            (e instanceof Error ? e.message : String(e)),
        };
      }

      await admin.from("crm_push_log").insert({
        user_id: ownerId,
        lead_id: leadId,
        provider: integ.provider,
        ok: r.ok,
        external_id: r.externalId ?? null,
        message: r.message,
        already_existed: r.alreadyExisted === true,
      });

      await admin
        .from("crm_integrations")
        .update(
          r.ok
            ? { last_ok_at: new Date().toISOString(), last_error: null, last_error_at: null }
            : { last_error: r.message, last_error_at: new Date().toISOString() },
        )
        .eq("user_id", ownerId)
        .eq("provider", integ.provider);

      resultados.push({ provider: integ.provider, ...r });
    }

    return json({ ok: true, resultados });
  } catch (error) {
    return failure(error, "Não foi possível enviar o lead ao CRM.");
  }
});

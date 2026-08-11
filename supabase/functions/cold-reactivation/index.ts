import {
  corsHeaders,
  handleCors,
  requirePaidPlan,
  requireUserOrInternal,
} from "../_shared/auth.ts";
import { callAI, recordUsage } from "../_shared/ai.ts";
import { checkFactuality } from "../_shared/agents/quality-gate.ts";
import { buildConversationEvidence } from "../_shared/agents/conversation.ts";
import { decideFollowUp } from "../_shared/agents/follow-up-policy.ts";

// ============================================================
// OS OITO TEMPLATES POR NICHO FORAM REMOVIDOS
// ============================================================
// Eles anunciavam lançamentos de produto, na voz da empresa do usuário, que
// quase certamente nunca existiram:
//
//   restaurantes: "lançamos um sistema de delivery próprio sem taxas do iFood"
//   academias:    "lançamos um app de treino que os alunos usam em casa"
//   clinicas:     "lançamos uma integração nova com o WhatsApp"
//   ecommerce:    "automação de pós-venda que aumenta recompra em 25%"
//
// Não é mensagem genérica: é anúncio falso de produto, assinado pelo cliente.
// O lead que responde "legal, me manda o app de treino" descobre que não
// existe app nenhum — e a conta de quem mentiu não é do sistema, é da empresa
// que mandou. O último ainda inventava um percentual.
//
// O que sobrou como texto fixo afirma SÓ o que os dados sustentam: que houve
// um contato antes (está no banco) e que passou tempo desde então (a consulta
// filtra por 20 dias). Uma frase pode ser fixa sem ser mentira — o que não
// pode é afirmar o que ninguém verificou.

const DIAS_PARA_ESFRIAR = 20;

/**
 * Texto mínimo honesto.
 *
 * Note o que ele NÃO diz: não tem "novidades", não tem lançamento, não tem
 * resultado. A versão anterior deste mesmo texto começava com "Tenho
 * novidades que podem te interessar" — e novidade que não existe é a maneira
 * mais rápida de conseguir uma resposta e desperdiçá-la.
 */
function textoMinimo(businessName: string): string {
  return (
    `Oi, ${businessName}! Tudo bem?\n\n` +
    `Faz um tempo desde a nossa última conversa. ` +
    `Ainda faz sentido a gente retomar, ou prefere que eu não insista?`
  );
}

Deno.serve(async (req) => {
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const paywall = await requirePaidPlan(auth.ctx);
  if (paywall) return paywall;

  try {
    const supabase = auth.ctx.supabase;

    // O cron varre todas as contas; um usuário logado só pode disparar a
    // reativação da própria — senão uma chamada manual mandaria mensagem
    // pela conta de todo mundo.
    const usersQuery = supabase
      .from("user_settings")
      .select("user_id, whatsapp_instance_id, onboarding_niche, auto_reactivation_enabled, agent_name")
      .eq("auto_reactivation_enabled", true)
      .eq("whatsapp_connected", true);

    if (auth.ctx.kind === "user") usersQuery.eq("user_id", auth.ctx.userId);

    const { data: usersWithReactivation } = await usersQuery;

    const now = new Date();
    const coldThreshold = new Date(
      now.getTime() - DIAS_PARA_ESFRIAR * 24 * 60 * 60 * 1000,
    ).toISOString();

    const results: Array<Record<string, unknown>> = [];
    let skipped = 0;

    for (const userSetting of usersWithReactivation || []) {
      const { data: coldLeads } = await supabase
        .from("leads")
        .select("*")
        .eq("user_id", userSetting.user_id)
        .in("stage", ["Contato", "Qualificado"])
        .lt("last_contact_at", coldThreshold)
        .not("phone", "is", null)
        .limit(10);

      if (!coldLeads?.length) continue;

      // Catálogo real do usuário. É o que autoriza falar de serviço — sem
      // isso a mensagem só pode falar do que já aconteceu entre os dois.
      const { data: servicos } = await supabase
        .from("service_intelligence")
        .select("service_name, description, benefits, pricing_info, case_studies, target_niches")
        .eq("user_id", userSetting.user_id);

      for (const lead of coldLeads) {
        const lastContact = new Date(lead.last_contact_at || lead.created_at);
        const diasSemContato = Math.floor(
          (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24),
        );

        const { data: memories } = await supabase
          .from("lead_memory")
          .select("memory_type, key, value, confidence")
          .eq("lead_id", lead.id)
          .limit(20);

        // ---- A REATIVAÇÃO TAMBÉM PRECISA RESPEITAR O QUE FOI DITO ----
        // Antes, um lead que tinha recusado explicitamente voltava para a
        // fila 20 dias depois só por ter esfriado. "Esfriou" e "não quer" são
        // coisas diferentes, e o banco sabia distinguir desde sempre —
        // ninguém consultava.
        const decision = decideFollowUp({
          now,
          daysSinceContact: diasSemContato,
          followUpCount: lead.follow_up_count || 0,
          maxFollowUps: 3,
          repliedAfterLastContact: Boolean(
            lead.last_response_at && new Date(lead.last_response_at) > lastContact,
          ),
          memories,
          temperature: lead.temperature,
          // Reativação tem cadência própria: quem esfriou não é cutucado a
          // cada três dias.
          cadence: [DIAS_PARA_ESFRIAR, 45, 90],
        });

        if (decision.action !== "enviar") {
          skipped++;
          if (decision.action === "encerrar") {
            await supabase
              .from("leads")
              .update({ stage: "Perdido", next_follow_up_at: null })
              .eq("id", lead.id);
          }
          continue;
        }

        // ---- ESCREVER ----
        let mensagem = "";
        try {
          const catalogo = (servicos ?? [])
            .map((s) =>
              `- ${s.service_name}: ${s.description || "sem descrição"}` +
              (s.benefits?.length ? ` | benefícios: ${s.benefits.join(", ")}` : ""),
            )
            .join("\n");

          const memoriaTexto = (memories ?? [])
            .filter((m) => (m.confidence ?? 1) >= 0.7)
            .map((m) => `- [${m.memory_type}] ${m.key}: ${m.value}`)
            .join("\n");

          const generated = await callAI({
            messages: [{
              role: "user",
              content: `Você é ${userSetting.agent_name || "um consultor comercial"}.

# A REGRA QUE VALE MAIS QUE TODAS AS OUTRAS
Só afirme o que estiver escrito abaixo. NÃO anuncie lançamento, novidade,
produto novo, caso de sucesso, cliente anterior, percentual ou resultado.
Se não houver material, escreva menos.

# SITUAÇÃO
Você falou com ${lead.business_name}${lead.niche ? ` (${lead.niche})` : ""} há
${diasSemContato} dias e a conversa esfriou. Não houve recusa.

# O QUE ELE JÁ DISSE
${memoriaTexto || "Nada registrado."}

# SEU CATÁLOGO REAL (só pode citar daqui)
${catalogo || "Nenhum serviço cadastrado — não fale de serviço nenhum."}

Escreva UMA mensagem de retomada, curta (2-3 frases), que:
1. reconheça honestamente que passou tempo, sem inventar motivo;
2. pergunte algo sobre o momento ATUAL do negócio dele;
3. deixe fácil dizer não — quem não quer ser mais procurado precisa
   conseguir dizer isso sem constrangimento;
4. não use emoji além de no máximo um.

Responda APENAS com a mensagem.`,
            }],
            role: "primary",
            temperature: 0.8,
            max_tokens: 250,
            purpose: "cold_reactivation",
          });

          await recordUsage(supabase, {
            userId: userSetting.user_id,
            usage: generated.usage,
            purpose: "cold_reactivation",
            leadId: lead.id,
            agent: "reactivation",
          });

          const candidato = generated.text.trim();
          const evidence = buildConversationEvidence({
            lead,
            memories,
            services: servicos,
            portfolioCount: 0,
          });

          if (candidato && checkFactuality(candidato, evidence).approved) {
            mensagem = candidato;
          } else if (candidato) {
            console.warn(`[reativação] texto reprovado para ${lead.business_name}; usando o mínimo.`);
          }
        } catch (e) {
          console.error("[reativação] IA indisponível:", e);
        }

        // Sem IA, cai no texto mínimo — que é honesto, não genérico-mentiroso.
        // A diferença importa: ele afirma apenas que houve contato antes e que
        // passou tempo, e as duas coisas estão no banco.
        if (!mensagem) mensagem = textoMinimo(lead.business_name);

        const { error: sendError } = await supabase.functions.invoke("whatsapp-send", {
          body: {
            phone: lead.phone,
            message: mensagem,
            instance_id: userSetting.whatsapp_instance_id,
            user_id: userSetting.user_id,
            initiated_by: "automation",
          },
        });

        if (sendError) {
          console.error(`[reativação] recusada para ${lead.phone}: ${sendError.message}`);
          skipped++;
          continue;
        }

        await supabase.from("chat_messages").insert({
          lead_id: lead.id,
          sender_type: "agent",
          content: mensagem,
          status: "sent",
        });

        await supabase.from("activity_log").insert({
          user_id: userSetting.user_id,
          lead_id: lead.id,
          activity_type: "automated_message",
          description: `Reativação enviada para ${lead.business_name} após ${diasSemContato} dias.`,
        });

        const newFollowUpCount = (lead.follow_up_count || 0) + 1;
        const updates: Record<string, unknown> = {
          last_contact_at: now.toISOString(),
          follow_up_count: newFollowUpCount,
        };

        if (newFollowUpCount >= 3) {
          updates.stage = "Perdido";
          updates.next_follow_up_at = null;
        } else {
          updates.next_follow_up_at = new Date(
            now.getTime() + 45 * 24 * 60 * 60 * 1000,
          ).toISOString();
        }

        await supabase.from("leads").update(updates).eq("id", lead.id);
        results.push({ lead_id: lead.id, name: lead.business_name, attempt: newFollowUpCount });
      }
    }

    return new Response(
      JSON.stringify({ processed: results.length, skipped, results }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Cold reactivation error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

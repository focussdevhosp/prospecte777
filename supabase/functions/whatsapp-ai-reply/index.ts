import { createClient } from "npm:@supabase/supabase-js@2";
import {
  corsHeaders,
  handleCors as sharedHandleCors,
  requirePaidPlan,
  requireUserOrInternal,
} from "../_shared/auth.ts";

// Advanced AI Tools with full intelligence capabilities
const AI_TOOLS = [
  // ===== SCHEDULING & MEETING =====
  {
    type: "function",
    function: {
      name: "scheduleMeeting",
      description: "Agendar uma reunião/call com o cliente. Use quando o cliente aceitar ou pedir para agendar.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "Título da reunião" },
          date: { type: "string", description: "Data no formato YYYY-MM-DD" },
          time: { type: "string", description: "Horário no formato HH:MM" },
          duration: { type: "number", description: "Duração em minutos (padrão: 30)" },
          notes: { type: "string", description: "Notas sobre o que será discutido" },
        },
        required: ["title", "date", "time"],
      },
    },
  },

  // ===== LEAD MANAGEMENT =====
  {
    type: "function",
    function: {
      name: "updateLeadStage",
      description: "Atualizar o estágio do lead no funil quando houver progresso claro",
      parameters: {
        type: "object",
        properties: {
          new_stage: {
            type: "string",
            enum: ["Contato", "Qualificado", "Proposta", "Negociação", "Ganho", "Perdido"],
          },
          reason: { type: "string", description: "Motivo da mudança de estágio" },
        },
        required: ["new_stage", "reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "updateLeadTemperature",
      description: "Atualizar a temperatura do lead baseado no interesse demonstrado",
      parameters: {
        type: "object",
        properties: {
          temperature: { type: "string", enum: ["quente", "morno", "frio"] },
          analysis: { type: "string", description: "Análise do sentimento/interesse" },
        },
        required: ["temperature", "analysis"],
      },
    },
  },

  // ===== QUALIFICATION & INTELLIGENCE =====
  {
    type: "function",
    function: {
      name: "qualifyLeadBANT",
      description: "Atualizar a qualificação BANT do lead baseado em informações reveladas na conversa",
      parameters: {
        type: "object",
        properties: {
          budget: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["unknown", "no_budget", "limited", "adequate", "high"] },
              details: { type: "string" },
              confidence: { type: "number", description: "0-100" },
            },
          },
          authority: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["unknown", "influencer", "evaluator", "decision_maker", "buyer"] },
              details: { type: "string" },
              confidence: { type: "number" },
            },
          },
          need: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["unknown", "no_need", "latent", "active", "urgent"] },
              details: { type: "string" },
              confidence: { type: "number" },
            },
          },
          timeline: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["unknown", "no_timeline", "long_term", "short_term", "immediate"] },
              details: { type: "string" },
              confidence: { type: "number" },
            },
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "detectBuyingSignal",
      description: "Registrar um sinal de compra detectado na conversa do cliente",
      parameters: {
        type: "object",
        properties: {
          signal_type: {
            type: "string",
            enum: [
              "price_inquiry", "timeline_mention", "competitor_comparison",
              "feature_interest", "urgency_expression", "decision_maker_mention",
              "budget_disclosure", "meeting_request", "proposal_request", "other"
            ],
          },
          signal_strength: { type: "number", description: "Força do sinal 0-100" },
          signal_text: { type: "string", description: "Trecho que indica o sinal" },
          context: { type: "string", description: "Contexto adicional" },
        },
        required: ["signal_type", "signal_strength", "signal_text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "predictCloseProbability",
      description: "Atualizar a probabilidade de fechamento baseado no contexto atual da conversa",
      parameters: {
        type: "object",
        properties: {
          probability: { type: "number", description: "Probabilidade de 0-100" },
          predicted_close_date: { type: "string", description: "Data estimada de fechamento YYYY-MM-DD" },
          deal_value_estimate: { type: "number", description: "Valor estimado do negócio" },
          reasoning: { type: "string", description: "Justificativa para a predição" },
        },
        required: ["probability", "reasoning"],
      },
    },
  },

  // ===== ESCALATION & HUMAN HANDOFF =====
  {
    type: "function",
    function: {
      name: "escalateToHuman",
      description: "Escalar a conversa para um humano quando necessário (situação complexa, oportunidade de alto valor, reclamação)",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            enum: [
              "complex_objection", "high_value_opportunity", "complaint",
              "technical_question", "urgent_request", "closing_opportunity",
              "competitor_threat", "custom_request", "sentiment_negative"
            ],
          },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          context: { type: "string", description: "Resumo da situação" },
          recommended_action: { type: "string", description: "Ação recomendada para o humano" },
        },
        required: ["reason", "priority", "context"],
      },
    },
  },

  // ===== FOLLOW-UP INTELLIGENCE =====
  {
    type: "function",
    function: {
      name: "scheduleIntelligentFollowUp",
      description: "Agendar um follow-up inteligente baseado no contexto da conversa",
      parameters: {
        type: "object",
        properties: {
          trigger_reason: {
            type: "string",
            enum: [
              "no_response", "partial_interest", "price_objection",
              "timing_objection", "buying_signal", "engagement_drop",
              "scheduled", "pattern_based"
            ],
          },
          scheduled_days_from_now: { type: "number", description: "Dias a partir de agora para follow-up" },
          message_strategy: { type: "string", description: "Estratégia/tom da mensagem de follow-up" },
        },
        required: ["trigger_reason", "scheduled_days_from_now"],
      },
    },
  },

  // ===== PROPOSAL GENERATION =====
  {
    type: "function",
    function: {
      name: "generateProposal",
      description: "Gerar uma proposta personalizada baseada nas necessidades identificadas do cliente",
      parameters: {
        type: "object",
        properties: {
          service_name: { type: "string", description: "Nome do serviço principal" },
          identified_needs: {
            type: "array",
            items: { type: "string" },
            description: "Necessidades identificadas na conversa",
          },
          proposed_solution: { type: "string", description: "Solução proposta" },
          deliverables: {
            type: "array",
            items: { type: "string" },
            description: "Entregáveis incluídos",
          },
          estimated_value: { type: "number", description: "Valor estimado" },
          timeline: { type: "string", description: "Prazo de entrega" },
        },
        required: ["service_name", "identified_needs", "proposed_solution"],
      },
    },
  },

  // ===== PATTERN LEARNING =====
  {
    type: "function",
    function: {
      name: "recordInteractionPattern",
      description: "Registrar padrões de interação para aprendizado (horário, tipo de resposta, efetividade)",
      parameters: {
        type: "object",
        properties: {
          interaction_type: {
            type: "string",
            enum: ["positive_response", "objection", "question", "interest", "rejection", "neutral"],
          },
          effective_approach: { type: "string", description: "Abordagem que funcionou bem" },
          hour_of_day: { type: "number", description: "Hora do dia (0-23)" },
          notes: { type: "string" },
        },
        required: ["interaction_type"],
      },
    },
  },

  // ===== EXISTING TOOLS =====
  {
    type: "function",
    function: {
      name: "identifyPainPoints",
      description: "Identificar e registrar as dores/necessidades do cliente",
      parameters: {
        type: "object",
        properties: {
          pain_points: {
            type: "array",
            items: { type: "string" },
            description: "Lista de dores identificadas",
          },
          service_opportunities: {
            type: "array",
            items: { type: "string" },
            description: "Serviços que podem resolver",
          },
        },
        required: ["pain_points"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "suggestService",
      description: "Recomendar o serviço mais adequado",
      parameters: {
        type: "object",
        properties: {
          service_name: { type: "string" },
          match_reason: { type: "string" },
          key_benefits: { type: "array", items: { type: "string" } },
        },
        required: ["service_name", "match_reason"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "handleObjection",
      description: "Registrar e responder a objeções do cliente",
      parameters: {
        type: "object",
        properties: {
          objection_type: {
            type: "string",
            enum: ["price", "timing", "need", "trust", "competition", "other"],
          },
          objection_text: { type: "string" },
          recommended_response: { type: "string" },
        },
        required: ["objection_type", "objection_text"],
      },
    },
  },
];

// Execute tool calls
async function executeToolCall(
  supabase: any,
  toolName: string,
  args: any,
  leadId: string,
  userId: string,
  leadNiche: string | null
): Promise<string> {
  console.log(`Executing tool: ${toolName}`, args);
  const now = new Date();

  switch (toolName) {
    case "scheduleMeeting": {
      // Parse the date - if year is in the past, use current year
      let dateStr = args.date;
      const now = new Date();
      const currentYear = now.getFullYear();
      const parsedYear = parseInt(dateStr.split('-')[0]);
      
      // Fix if AI sends a past year
      if (parsedYear < currentYear) {
        dateStr = `${currentYear}-${dateStr.slice(5)}`;
        console.log(`Fixed past year in date: ${args.date} -> ${dateStr}`);
      }
      
      const scheduledAt = new Date(`${dateStr}T${args.time}:00`);
      
      // If the date is still in the past, add 1 year
      if (scheduledAt < now) {
        scheduledAt.setFullYear(scheduledAt.getFullYear() + 1);
        console.log(`Date was in past, moved to next year: ${scheduledAt.toISOString()}`);
      }
      
      const { data: meeting, error } = await supabase
        .from("meetings")
        .insert({
          user_id: userId,
          lead_id: leadId,
          title: args.title,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: args.duration || 30,
          notes: args.notes || null,
          status: "scheduled",
        })
        .select()
        .single();

      if (error) return `Erro ao agendar: ${error.message}`;

      await supabase
        .from("leads")
        .update({ stage: "Proposta", next_follow_up_at: scheduledAt.toISOString() })
        .eq("id", leadId);

      await supabase.from("activity_log").insert({
        user_id: userId,
        lead_id: leadId,
        activity_type: "meeting_scheduled",
        description: `Reunião "${args.title}" agendada para ${args.date} às ${args.time}`,
        metadata: { meeting_id: meeting.id },
      });

      return `Reunião agendada: ${args.date} às ${args.time}`;
    }

    case "updateLeadStage": {
      await supabase.from("leads").update({ stage: args.new_stage }).eq("id", leadId);
      await supabase.from("activity_log").insert({
        user_id: userId,
        lead_id: leadId,
        activity_type: "stage_change",
        description: `Estágio: ${args.new_stage} - ${args.reason}`,
      });
      return `Estágio: ${args.new_stage}`;
    }

    case "updateLeadTemperature": {
      await supabase
        .from("leads")
        .update({ temperature: args.temperature, conversation_summary: args.analysis })
        .eq("id", leadId);
      return `Temperatura: ${args.temperature}`;
    }

    case "qualifyLeadBANT": {
      const qualification: any = { lead_id: leadId, user_id: userId, updated_at: now.toISOString() };
      let score = 0;
      
      if (args.budget) {
        qualification.budget_status = args.budget.status;
        qualification.budget_details = args.budget.details;
        qualification.budget_confidence = args.budget.confidence;
        if (args.budget.status === "high") score += 25;
        else if (args.budget.status === "adequate") score += 20;
        else if (args.budget.status === "limited") score += 10;
      }
      if (args.authority) {
        qualification.authority_status = args.authority.status;
        qualification.authority_details = args.authority.details;
        qualification.authority_confidence = args.authority.confidence;
        if (args.authority.status === "buyer" || args.authority.status === "decision_maker") score += 25;
        else if (args.authority.status === "evaluator") score += 15;
      }
      if (args.need) {
        qualification.need_status = args.need.status;
        qualification.need_details = args.need.details;
        qualification.need_confidence = args.need.confidence;
        if (args.need.status === "urgent") score += 25;
        else if (args.need.status === "active") score += 20;
        else if (args.need.status === "latent") score += 10;
      }
      if (args.timeline) {
        qualification.timeline_status = args.timeline.status;
        qualification.timeline_details = args.timeline.details;
        qualification.timeline_confidence = args.timeline.confidence;
        if (args.timeline.status === "immediate") score += 25;
        else if (args.timeline.status === "short_term") score += 20;
        else if (args.timeline.status === "long_term") score += 10;
      }
      
      qualification.qualification_score = score;

      await supabase.from("lead_qualification").upsert(qualification, { onConflict: "lead_id" });
      
      return `BANT atualizado. Score: ${score}/100`;
    }

    case "detectBuyingSignal": {
      await supabase.from("buying_signals").insert({
        lead_id: leadId,
        user_id: userId,
        signal_type: args.signal_type,
        signal_strength: args.signal_strength,
        signal_text: args.signal_text,
        context: args.context,
      });

      // If strong buying signal, update lead temperature
      if (args.signal_strength >= 70) {
        await supabase.from("leads").update({ temperature: "quente" }).eq("id", leadId);
      }

      return `Sinal de compra: ${args.signal_type} (${args.signal_strength}%)`;
    }

    case "predictCloseProbability": {
      await supabase
        .from("lead_qualification")
        .upsert({
          lead_id: leadId,
          user_id: userId,
          close_probability: args.probability,
          predicted_close_date: args.predicted_close_date || null,
          deal_value_estimate: args.deal_value_estimate || null,
          updated_at: now.toISOString(),
        }, { onConflict: "lead_id" });

      await supabase.from("activity_log").insert({
        user_id: userId,
        lead_id: leadId,
        activity_type: "prediction_updated",
        description: `Probabilidade de fechamento: ${args.probability}%`,
        metadata: { reasoning: args.reasoning, value: args.deal_value_estimate },
      });

      return `Probabilidade: ${args.probability}%`;
    }

    case "escalateToHuman": {
      await supabase.from("agent_escalations").insert({
        lead_id: leadId,
        user_id: userId,
        escalation_reason: args.reason,
        priority: args.priority,
        context: args.context,
        recommended_action: args.recommended_action,
        status: "pending",
      });

      // Log for notification
      await supabase.from("activity_log").insert({
        user_id: userId,
        lead_id: leadId,
        activity_type: "escalation",
        description: `🚨 ESCALADO: ${args.reason} (${args.priority})`,
        metadata: { context: args.context, action: args.recommended_action },
      });

      return `Escalado para humano: ${args.reason} [${args.priority}]`;
    }

    case "scheduleIntelligentFollowUp": {
      const scheduledAt = new Date();
      scheduledAt.setDate(scheduledAt.getDate() + args.scheduled_days_from_now);

      await supabase.from("intelligent_followups").insert({
        lead_id: leadId,
        user_id: userId,
        trigger_reason: args.trigger_reason,
        scheduled_at: scheduledAt.toISOString(),
        message_template: args.message_strategy || null,
        status: "pending",
      });

      await supabase
        .from("leads")
        .update({ next_follow_up_at: scheduledAt.toISOString() })
        .eq("id", leadId);

      return `Follow-up agendado: ${args.scheduled_days_from_now} dias`;
    }

    case "generateProposal": {
      // Find service intelligence if available
      const { data: serviceData } = await supabase
        .from("service_intelligence")
        .select("id, pricing_info")
        .eq("user_id", userId)
        .ilike("service_name", `%${args.service_name}%`)
        .limit(1)
        .single();

      const { data: proposal, error } = await supabase
        .from("generated_proposals")
        .insert({
          lead_id: leadId,
          user_id: userId,
          service_id: serviceData?.id || null,
          proposal_title: `Proposta: ${args.service_name}`,
          identified_needs: args.identified_needs,
          proposed_solution: args.proposed_solution,
          deliverables: args.deliverables || [],
          pricing_breakdown: args.estimated_value ? { estimated: args.estimated_value } : {},
          timeline: args.timeline || "A definir",
          status: "draft",
        })
        .select()
        .single();

      if (error) return `Erro ao gerar proposta: ${error.message}`;

      await supabase.from("activity_log").insert({
        user_id: userId,
        lead_id: leadId,
        activity_type: "proposal_generated",
        description: `Proposta gerada: ${args.service_name}`,
        metadata: { proposal_id: proposal.id },
      });

      return `Proposta criada: ${proposal.id}`;
    }

    case "recordInteractionPattern": {
      const niche = leadNiche || "geral";
      
      // Upsert pattern data
      const { data: existing } = await supabase
        .from("niche_patterns")
        .select("*")
        .eq("user_id", userId)
        .eq("niche", niche)
        .single();

      const updateData: any = {
        user_id: userId,
        niche: niche,
        updated_at: now.toISOString(),
      };

      if (args.interaction_type === "positive_response") {
        updateData.total_responses = (existing?.total_responses || 0) + 1;
        
        // Track best hours
        if (args.hour_of_day !== undefined) {
          const hourStats = existing?.response_rate_by_hour || {};
          hourStats[args.hour_of_day] = (hourStats[args.hour_of_day] || 0) + 1;
          updateData.response_rate_by_hour = hourStats;
          
          // Update best contact hours
          const sortedHours = Object.entries(hourStats)
            .sort((a: any, b: any) => b[1] - a[1])
            .slice(0, 3)
            .map(([h]) => parseInt(h));
          updateData.best_contact_hours = sortedHours;
        }
        
        if (args.effective_approach) {
          updateData.best_opening_style = args.effective_approach;
        }
      }

      updateData.total_contacts = (existing?.total_contacts || 0) + 1;
      
      if (updateData.total_contacts > 0 && updateData.total_responses) {
        updateData.response_rate = (updateData.total_responses / updateData.total_contacts) * 100;
      }

      await supabase.from("niche_patterns").upsert(updateData, { onConflict: "user_id,niche,location" });

      return `Padrão registrado: ${args.interaction_type}`;
    }

    case "identifyPainPoints": {
      const { data: lead } = await supabase
        .from("leads")
        .select("pain_points, service_opportunities")
        .eq("id", leadId)
        .single();

      await supabase
        .from("leads")
        .update({
          pain_points: [...new Set([...(lead?.pain_points || []), ...args.pain_points])],
          service_opportunities: args.service_opportunities
            ? [...new Set([...(lead?.service_opportunities || []), ...args.service_opportunities])]
            : lead?.service_opportunities,
        })
        .eq("id", leadId);

      return `Dores: ${args.pain_points.join(", ")}`;
    }

    case "suggestService": {
      await supabase.from("activity_log").insert({
        user_id: userId,
        lead_id: leadId,
        activity_type: "service_suggested",
        description: `Serviço: ${args.service_name} - ${args.match_reason}`,
        metadata: { benefits: args.key_benefits },
      });
      return `Sugestão: ${args.service_name}`;
    }

    case "handleObjection": {
      // Record objection for pattern learning
      const niche = leadNiche || "geral";
      const { data: patterns } = await supabase
        .from("niche_patterns")
        .select("common_objections, successful_responses")
        .eq("user_id", userId)
        .eq("niche", niche)
        .single();

      const objections = patterns?.common_objections || [];
      objections.push({
        type: args.objection_type,
        text: args.objection_text,
        timestamp: now.toISOString(),
      });

      if (args.recommended_response) {
        const responses = patterns?.successful_responses || [];
        responses.push({
          objection_type: args.objection_type,
          response: args.recommended_response,
          timestamp: now.toISOString(),
        });
        
        await supabase
          .from("niche_patterns")
          .upsert({
            user_id: userId,
            niche: niche,
            common_objections: objections.slice(-20), // Keep last 20
            successful_responses: responses.slice(-20),
            updated_at: now.toISOString(),
          }, { onConflict: "user_id,niche,location" });
      }

      await supabase.from("activity_log").insert({
        user_id: userId,
        lead_id: leadId,
        activity_type: "objection_handled",
        description: `Objeção (${args.objection_type}): "${args.objection_text}"`,
        metadata: { response: args.recommended_response },
      });

      return `Objeção registrada: ${args.objection_type}`;
    }

    default:
      return `Tool ${toolName} não implementada`;
  }
}

Deno.serve(async (req) => {
  const preflight = sharedHandleCors(req);
  if (preflight) return preflight;

  // Cada chamada aqui gasta token de IA e pode disparar WhatsApp. Aberta,
  // era uma torneira de custo para qualquer um na internet.
  const auth = await requireUserOrInternal(req);
  if (auth.error) return auth.error;
  const paywall = await requirePaidPlan(auth.ctx);
  if (paywall) return paywall;

  try {
    const { lead_id, message_content, auto_reply_enabled } = await req.json();

    if (!lead_id || !message_content) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id or message_content" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = auth.ctx.supabase;

    // Get lead info with qualification data
    const leadQuery = supabase.from("leads").select("*").eq("id", lead_id);
    if (auth.ctx.kind === "user") leadQuery.eq("user_id", auth.ctx.userId);

    const { data: lead, error: leadError } = await leadQuery.single();

    if (leadError || !lead) {
      throw new Error("Lead not found");
    }

    // Get lead qualification data
    const { data: qualification } = await supabase
      .from("lead_qualification")
      .select("*")
      .eq("lead_id", lead_id)
      .single();

    // Get recent buying signals
    const { data: buyingSignals } = await supabase
      .from("buying_signals")
      .select("*")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(5);

    // Get niche patterns for this lead's niche
    const { data: nichePatterns } = await supabase
      .from("niche_patterns")
      .select("*")
      .eq("user_id", lead.user_id)
      .eq("niche", lead.niche || "geral")
      .single();

    // Get pending escalations
    const { data: pendingEscalations } = await supabase
      .from("agent_escalations")
      .select("*")
      .eq("lead_id", lead_id)
      .eq("status", "pending")
      .limit(1);

    // Get user settings for AI context
    const { data: settings } = await supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", lead.user_id)
      .single();

    if (!auto_reply_enabled && !settings?.auto_prospecting_enabled) {
      return new Response(
        JSON.stringify({ success: false, reason: "Auto-reply disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get conversation history
    const { data: messages } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("lead_id", lead_id)
      .order("sent_at", { ascending: true })
      .limit(50);

    // Get service intelligence
    const { data: serviceIntelligence } = await supabase
      .from("service_intelligence")
      .select("*")
      .eq("user_id", lead.user_id);

    // Build services knowledge
    const servicesKnowledge = (serviceIntelligence || []).map(s => `
### ${s.service_name}
${s.description || ''}
- Benefícios: ${s.benefits?.join(', ') || 'N/A'}
- Dores que resolve: ${s.pain_points?.join(', ') || 'N/A'}
- Preço: ${s.pricing_info || 'Sob consulta'}
- Nichos alvo: ${s.target_niches?.join(', ') || 'Diversos'}
${s.case_studies?.length ? `- Cases: ${s.case_studies.join('; ')}` : ''}
${s.objection_responses ? `- Objeções: ${JSON.stringify(s.objection_responses)}` : ''}
`).join('\n');

    // Get templates
    const { data: templates } = await supabase
      .from("message_templates")
      .select("name, content, niche, response_rate")
      .eq("user_id", lead.user_id)
      .order("response_rate", { ascending: false })
      .limit(5);

    // Get long-term lead memory (insights from prior conversation)
    const { data: leadMemories } = await supabase
      .from("lead_memory")
      .select("memory_type, key, value, confidence")
      .eq("lead_id", lead_id)
      .order("updated_at", { ascending: false })
      .limit(20);

    // Get objection library (matched by keywords in the current message)
    const lowerMsg = (message_content || "").toLowerCase();
    const { data: allObjections } = await supabase
      .from("objection_responses")
      .select("category, objection_keywords, objection_example, response_template, angle")
      .eq("user_id", lead.user_id)
      .eq("is_active", true);
    const matchedObjections = (allObjections || []).filter(o =>
      (o.objection_keywords || []).some((kw: string) => lowerMsg.includes((kw || "").toLowerCase()))
    ).slice(0, 3);

    // Get portfolio sites (for social proof when relevant)
    const { data: portfolio } = await supabase
      .from("portfolio_sites")
      .select("title, url, niche, description")
      .eq("user_id", lead.user_id)
      .eq("is_active", true)
      .limit(6);

    // Build conversation context
    const conversationHistory = (messages || []).map((m) => ({
      role: m.sender_type === "lead" ? "user" : "assistant",
      content: m.content,
    }));


    // Metrics
    const leadMessages = (messages || []).filter(m => m.sender_type === "lead").length;
    const agentMessages = (messages || []).filter(m => m.sender_type !== "lead").length;
    const conversationEngagement = leadMessages > 0 ? (leadMessages / Math.max(agentMessages, 1)) : 0;
    const now = new Date();
    const currentHour = now.getHours();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    const currentDateFormatted = now.toLocaleDateString('pt-BR', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Build BANT summary
    const bantSummary = qualification ? `
- Budget: ${qualification.budget_status || 'desconhecido'} (${qualification.budget_confidence || 0}% confiança)
- Authority: ${qualification.authority_status || 'desconhecido'} (${qualification.authority_confidence || 0}% confiança)
- Need: ${qualification.need_status || 'desconhecido'} (${qualification.need_confidence || 0}% confiança)
- Timeline: ${qualification.timeline_status || 'desconhecido'} (${qualification.timeline_confidence || 0}% confiança)
- Score de Qualificação: ${qualification.qualification_score || 0}/100
- Probabilidade de Fechamento: ${qualification.close_probability || 0}%
${qualification.deal_value_estimate ? `- Valor Estimado: R$${qualification.deal_value_estimate}` : ''}
` : 'Ainda não qualificado';

    // Buying signals summary
    const signalsSummary = buyingSignals?.length 
      ? buyingSignals.map(s => `• ${s.signal_type} (${s.signal_strength}%): "${s.signal_text?.slice(0, 50)}..."`).join('\n')
      : 'Nenhum sinal detectado';

    // Niche patterns summary
    const patternsSummary = nichePatterns ? `
- Melhores horários: ${nichePatterns.best_contact_hours?.join('h, ') || 'Indefinido'}h
- Taxa de resposta: ${nichePatterns.response_rate?.toFixed(1) || 0}%
- Melhor abordagem: ${nichePatterns.best_opening_style || 'A descobrir'}
- Objeções comuns: ${nichePatterns.common_objections?.slice(-3).map((o: any) => o.type).join(', ') || 'N/A'}
` : 'Sem dados de padrões ainda';

    // Derive conversation stage from BANT + message count + signals
    const qScore = qualification?.qualification_score || 0;
    const closeProb = qualification?.close_probability || 0;
    const hasBuyingSignal = (buyingSignals?.length || 0) > 0;
    let convStage: string;
    let stagePlaybook: string;
    if (leadMessages === 0) {
      convStage = "PRIMEIRO CONTATO (aguardando resposta)";
      stagePlaybook = "Não envie ainda — só responda quando o lead falar.";
    } else if (leadMessages <= 2 && qScore < 30) {
      convStage = "ABERTURA / QUEBRA-GELO";
      stagePlaybook = `Objetivo: gerar CONEXÃO e descobrir a DOR real.
- Reconheça o que ele disse com 1 frase curta.
- Faça UMA pergunta aberta sobre o negócio dele (ex: "como vocês captam cliente hoje?", "o que mais dá trabalho na semana?").
- NÃO ofereça serviço ainda. NÃO fale preço. NÃO peça reunião.`;
    } else if (qScore < 60 && !hasBuyingSignal) {
      convStage = "DESCOBERTA / QUALIFICAÇÃO (SPIN)";
      stagePlaybook = `Objetivo: mapear DOR + AUTORIDADE + ORÇAMENTO sem parecer interrogatório.
- Valide o que ele já revelou ("faz sentido, muita gente do ${lead.niche || 'setor'} passa por isso").
- Faça 1 pergunta de IMPLICAÇÃO ou NECESSIDADE (ex: "quanto isso custa por mês em cliente perdido?", "se resolvesse isso, o que mudaria pra vocês?").
- Chame qualifyLeadBANT com o que descobriu.`;
    } else if (qScore >= 60 || hasBuyingSignal) {
      convStage = "APRESENTAÇÃO DE SOLUÇÃO";
      stagePlaybook = `Objetivo: conectar a DOR dele com sua SOLUÇÃO específica + prova.
- Mostre COMO você resolve — em 2-3 frases, sem jargão.
- Traga 1 prova (case rápido, número, resultado com outro cliente parecido).
- Termine com CTA de baixa fricção: "posso te mandar um exemplo?", "quer ver um print?".
- Se ele demonstrar interesse claro → proponha uma call de 15min e use scheduleMeeting.`;
    } else {
      convStage = "FECHAMENTO";
      stagePlaybook = `Objetivo: agendar reunião ou fechar.
- Confirme o entendimento da dor + solução.
- Proponha PRÓXIMO PASSO concreto com data/hora (ex: "posso te ligar amanhã 14h ou prefere 16h?").
- Use scheduleMeeting assim que ele aceitar.
- Se hesitar, use handleObjection.`;
    }

    if (closeProb >= 70) convStage += " 🔥 ALTA PROBABILIDADE";

    // Detect short/single-word replies for special handling
    const lastLeadMsg = [...(messages || [])].reverse().find(m => m.sender_type === "lead")?.content?.trim() || "";
    const isShortReply = lastLeadMsg.split(/\s+/).length <= 3;

    // Build super intelligent system prompt
    const systemPrompt = `# IDENTIDADE
Você é ${settings?.agent_name || "um especialista em vendas consultivas"}.
${settings?.agent_persona || "Você é um consultor experiente, humano, direto e curioso. Você OUVE mais do que fala."}

# COMUNICAÇÃO
- Estilo: ${settings?.communication_style || "Consultivo, humano, coloquial"}
- Emojis: ${settings?.emoji_usage || "Máximo 1 por mensagem, só quando fizer sentido"}
- Tamanho: SEMPRE curto. 1 a 3 frases. Máximo 60 palavras.
- Tom: WhatsApp entre pessoas reais. Zero formalidade, zero jargão corporativo.
- NUNCA use: "prezado", "gostaria de", "venho por meio", "atenciosamente", "sr./sra.", markdown, bullets.
- Escreva como fala. Contrações naturais ("tá", "pra", "cê"). Mas mantenha respeito.

# BASE DE CONHECIMENTO
${settings?.knowledge_base || ""}

# SERVIÇOS E EXPERTISE
${servicesKnowledge || settings?.services_offered?.join(', ') || 'Serviços de marketing digital'}

# TEMPLATES QUE MAIS CONVERTEM (referência de tom)
${templates?.map(t => `- ${t.name} (${t.response_rate?.toFixed(0) || 0}%): "${t.content?.slice(0, 80)}..."`).join('\n') || 'N/A'}

# CONTEXTO DO LEAD
- Empresa: ${lead.business_name}
- Nicho: ${lead.niche || "Não identificado"}
- Localização: ${lead.location || "—"}
- Site: ${lead.website || "NÃO TEM"}
- Avaliação: ${lead.rating ? `${lead.rating}★ (${lead.reviews_count || 0} reviews)` : "sem avaliações"}
- Estágio no funil: ${lead.stage}
- Temperatura: ${lead.temperature || "frio"}
- Dores identificadas: ${lead.pain_points?.join(', ') || "ainda a descobrir"}
- Oportunidades: ${lead.service_opportunities?.join(', ') || "a mapear"}
- Resumo da conversa: ${lead.conversation_summary || "Primeira interação"}

# QUALIFICAÇÃO BANT
${bantSummary}

# SINAIS DE COMPRA DETECTADOS
${signalsSummary}

# PADRÕES DO NICHO "${lead.niche || 'geral'}"
${patternsSummary}

# 🧠 MEMÓRIA DO LEAD (insights coletados em interações anteriores — USE para personalizar)
${(leadMemories && leadMemories.length)
  ? leadMemories.map(m => `- [${m.memory_type}] ${m.key}: ${m.value}${m.confidence < 0.8 ? ` (confiança ${Math.round((m.confidence||0)*100)}%)` : ''}`).join('\n')
  : 'Nenhuma memória ainda — colete dor, decisor, orçamento, prazo nesta conversa.'}

# 🛡️ OBJEÇÕES DETECTADAS NA MENSAGEM ATUAL (use como referência, NÃO copie literalmente)
${matchedObjections.length
  ? matchedObjections.map(o => `- ${o.category.toUpperCase()} (${o.angle || 'padrão'}): "${o.response_template?.slice(0, 180)}..."`).join('\n')
  : 'Sem match direto — se houver objeção, use handleObjection.'}

# 🎨 PORTFÓLIO DISPONÍVEL (envie link só quando o lead pedir prova/exemplo do nicho dele)
${(portfolio && portfolio.length)
  ? portfolio.map(p => `- ${p.title} [${p.niche || 'geral'}]: ${p.url}`).join('\n')
  : 'Sem portfólio cadastrado.'}


# CONTEXTO ATUAL
- Data de hoje: ${currentDateFormatted} (${currentDate})
- Hora: ${currentHour}h
- Quando o cliente disser "hoje", use ${currentDate}. "amanhã" = +1 dia.
- Engajamento: ${conversationEngagement > 1 ? "ALTO (ele responde mais que você)" : conversationEngagement > 0.5 ? "MÉDIO" : "BAIXO (ele responde pouco)"}
- Mensagens dele: ${leadMessages} | suas: ${agentMessages}
${pendingEscalations?.length ? `\n⚠️ ESCALAÇÃO PENDENTE: ${pendingEscalations[0].escalation_reason}` : ''}

# 🎯 ESTÁGIO DA CONVERSA: ${convStage}
${stagePlaybook}

${isShortReply ? `# ⚡ ATENÇÃO: RESPOSTA CURTA
O lead respondeu curto ("${lastLeadMsg}"). Isso pode significar interesse rápido OU desinteresse. Reaja assim:
- Se "sim", "pode", "manda", "quero" → entregue o prometido IMEDIATAMENTE + faça a próxima pergunta.
- Se "não", "não tenho interesse" → agradeça sem pressão, deixe porta aberta ("qualquer coisa tô por aqui, sucesso!"), use updateLeadTemperature pra frio.
- Se "quanto?", "valor?", "preço?" → NÃO cravar preço ainda. Diga faixa/depende do escopo + peça 2 min pra entender o cenário.
- Se pergunta técnica curta → responda direto sem enrolar.
` : ''}

# FERRAMENTAS INTELIGENTES (use SEMPRE que fizer sentido)

## Qualificação
- **qualifyLeadBANT**: chame toda vez que ele revelar orçamento, decisor, dor ou prazo.
- **detectBuyingSignal**: registre perguntas sobre preço, prazo, "como funciona", "quero começar".
- **predictCloseProbability**: atualize após virada significativa.
- **identifyPainPoints**: registre dor mencionada.

## Ação
- **scheduleMeeting**: assim que ele aceitar horário.
- **generateProposal**: quando dor + interesse estiverem claros.
- **handleObjection**: em qualquer objeção (preço, tempo, confiança).
- **escalateToHuman**: valor alto (>R$10k), reclamação, técnico complexo, fechamento delicado.

## Movimento
- **updateLeadStage** / **updateLeadTemperature**: mova assim que houver mudança real.
- **scheduleIntelligentFollowUp**: agende follow-up com contexto.
- **recordInteractionPattern**: registre padrões que funcionaram.

# REGRAS INEGOCIÁVEIS
✅ SEMPRE reconheça o que ele disse antes de responder (1 frase).
✅ SEMPRE termine com pergunta OU CTA claro — nunca deixe a bola no ar.
✅ UMA ideia por mensagem. Não empilhe 3 perguntas.
✅ Use o NOME da empresa/pessoa quando fizer diferença.
✅ Prova > promessa. "fiz pra outro X e deu Y" > "vou fazer sua empresa crescer".
✅ Se não sabe uma resposta técnica ou de preço específico → escale, não invente.

❌ NUNCA repita coisa que você já disse na conversa (olhe o histórico).
❌ NUNCA seja robótico ("Entendi sua necessidade. Vamos prosseguir...").
❌ NUNCA force a venda. Se ele hesita, dê espaço + traga prova.
❌ NUNCA prometa resultado específico com número que você não pode garantir.

# OBJETIVO FINAL
Avançar UM passo no funil a cada mensagem. Sempre saiba qual é o PRÓXIMO PASSO e conduza pra lá com naturalidade.
${qualification?.close_probability && qualification.close_probability >= 70 ? "\n🔥 ALTA PROBABILIDADE — proponha próximo passo concreto (call/reunião) AGORA." : ""}`;

    // Add current message
    conversationHistory.push({
      role: "user",
      content: message_content,
    });

    // Call DeepSeek AI
    const DEEPSEEK_API_KEY = Deno.env.get("DEEPSEEK_API_KEY");
    if (!DEEPSEEK_API_KEY) {
      throw new Error("DEEPSEEK_API_KEY not configured");
    }

    console.log(`Processing intelligent reply for lead ${lead_id} via DeepSeek`);

    const aiResponse = await fetch(
      "https://api.deepseek.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            ...conversationHistory,
          ],
          tools: AI_TOOLS,
          tool_choice: "auto",
          temperature: 0.7,
          max_tokens: 1500,
        }),
      }
    );

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      throw new Error("Failed to generate AI response");
    }

    const aiData = await aiResponse.json();
    const choice = aiData.choices?.[0];
    const assistantMessage = choice?.message;

    // Process tool calls
    const toolResults: string[] = [];
    if (assistantMessage?.tool_calls?.length > 0) {
      console.log(`AI requested ${assistantMessage.tool_calls.length} tool calls`);
      
      for (const toolCall of assistantMessage.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs;
        try {
          toolArgs = JSON.parse(toolCall.function.arguments);
        } catch (e) {
          console.error(`Failed to parse args for ${toolName}:`, toolCall.function.arguments);
          continue;
        }
        
        const result = await executeToolCall(
          supabase,
          toolName,
          toolArgs,
          lead_id,
          lead.user_id,
          lead.niche
        );
        
        toolResults.push(result);
        console.log(`Tool ${toolName}: ${result}`);
      }

      // Follow-up call for final response
      const followUpMessages = [
        ...conversationHistory,
        assistantMessage,
        ...assistantMessage.tool_calls.map((tc: any, i: number) => ({
          role: "tool",
          tool_call_id: tc.id,
          content: toolResults[i] || "Executado",
        })),
      ];

      const followUpResponse = await fetch(
        "https://api.deepseek.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "deepseek-chat",
            messages: [
              { role: "system", content: systemPrompt },
              ...followUpMessages,
            ],
            temperature: 0.7,
            max_tokens: 500,
          }),
        }
      );

      if (followUpResponse.ok) {
        const followUpData = await followUpResponse.json();
        const finalContent = followUpData.choices?.[0]?.message?.content;
        if (finalContent) {
          assistantMessage.content = finalContent;
        }
      }
    }

    const generatedReply = assistantMessage?.content || "";

    if (!generatedReply) {
      throw new Error("Empty AI response");
    }

    console.log(`Generated reply: ${generatedReply.slice(0, 100)}...`);
    console.log(`Tools executed: ${toolResults.length > 0 ? toolResults.join(' | ') : 'none'}`);

    // Update lead
    await supabase
      .from("leads")
      .update({ last_response_at: new Date().toISOString() })
      .eq("id", lead_id);

    // Auto-send if enabled
    const shouldAutoSend = settings?.auto_prospecting_enabled && auto_reply_enabled;

    if (shouldAutoSend && settings?.whatsapp_instance_id) {
      const EVOLUTION_API_URL = Deno.env.get("EVOLUTION_API_URL");
      const EVOLUTION_API_KEY = Deno.env.get("EVOLUTION_API_KEY");

      if (EVOLUTION_API_URL && EVOLUTION_API_KEY) {
        let formattedPhone = lead.phone.replace(/\D/g, "");
        if (!formattedPhone.startsWith("55") && formattedPhone.length <= 11) {
          formattedPhone = "55" + formattedPhone;
        }

        // Human-like delay
        const delay = Math.floor(Math.random() * 2000) + 1000;
        await new Promise(resolve => setTimeout(resolve, delay));

        const sendResponse = await fetch(
          `${EVOLUTION_API_URL}/message/sendText/${settings.whatsapp_instance_id}`,
          {
            method: "POST",
            headers: {
              apikey: EVOLUTION_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              number: formattedPhone,
              text: generatedReply,
            }),
          }
        );

        if (sendResponse.ok) {
          await supabase.from("chat_messages").insert({
            lead_id,
            content: generatedReply,
            sender_type: "agent",
            status: "sent",
          });

          await supabase
            .from("leads")
            .update({ last_contact_at: new Date().toISOString() })
            .eq("id", lead_id);

          return new Response(
            JSON.stringify({
              success: true,
              action: "sent",
              reply: generatedReply,
              tools_executed: toolResults,
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        action: "suggested",
        reply: generatedReply,
        tools_executed: toolResults,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("AI reply error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to generate reply" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

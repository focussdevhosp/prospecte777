// ============================================================
// CONTROLE DO AGENTE SDR
// ============================================================
// O que separa um SDR que parece gente de um robô não é o texto que a IA
// escreve — é saber a hora de não responder.
//
// Este módulo é a portaria: opt-out, handoff para humano, dedup de webhook
// reentregue, agrupamento de mensagens em rajada e trava de loop.

// Tipo estrutural mínimo em vez de importar de "npm:@supabase/supabase-js".
// Assim este módulo (que carrega as regras de negócio do agente) pode ser
// testado pelo vitest sem o resolvedor de specifier do Deno.
type SupabaseClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

// ------------------------------------------------------------
// INTENÇÕES QUE MUDAM O RUMO DA CONVERSA
// ------------------------------------------------------------

/**
 * Pedido de parada. Precisa vir antes de qualquer IA: responder aqui é
 * infração de LGPD, denúncia de spam e chip queimado.
 *
 * Palavras curtas ("pare", "sair") exigem casamento de palavra inteira,
 * senão "separe" e "sairemos" disparam o opt-out sem querer.
 */
const OPT_OUT_PATTERNS: { re: RegExp; keyword: string }[] = [
  { re: /\b(pare|parem|para)\b.*\b(de\s+)?(mandar|enviar|mensagem|mensagens)\b/i, keyword: "pare de mandar" },
  { re: /\bn[ãa]o\s+(quero|desejo|tenho\s+interesse)\b/i, keyword: "não quero" },
  { re: /\bn[ãa]o\s+me\s+(mande|envie|chame|perturbe|incomode)\b/i, keyword: "não me mande" },
  { re: /\bme\s+(tira|remove|retira|exclui)\s+(da|de)\s+lista\b/i, keyword: "me tira da lista" },
  { re: /\b(descadastrar|descadastre|cancelar\s+inscri[çc][ãa]o)\b/i, keyword: "descadastrar" },
  { re: /\b(spam|golpe|denunciar|den[úu]ncia)\b/i, keyword: "spam" },
  { re: /^\s*(sair|stop|parar|pare)\s*[.!]?\s*$/i, keyword: "stop" },
  { re: /\bbloquear\b/i, keyword: "bloquear" },
];

/** Sinais de que um humano precisa assumir agora. */
const HANDOFF_PATTERNS: { re: RegExp; reason: string }[] = [
  // O artigo é opcional e varia ("com uma pessoa", "com o responsável",
  // "com algum atendente"), então precisa ser tolerante aqui.
  { re: /\b(falar|conversar)\s+com\s+((o|a|um|uma|algum|alguma)\s+)?(pessoa|humano|atendente|respons[áa]vel|gerente|dono|vendedor)\b/i, reason: "pediu atendimento humano" },
  { re: /\b(passa|passar|transfere|transferir|chama|chamar)\s+(me\s+)?(para|pra|pro)\s+((o|a|um|uma)\s+)?(pessoa|humano|atendente|respons[áa]vel|gerente|vendedor)\b/i, reason: "pediu atendimento humano" },
  // Sem flag `u`, o \b do JS é ASCII: depois de "robô" a fronteira não
  // existe, porque "ô" já não conta como caractere de palavra. Por isso o
  // fim aqui é (?!\w) em vez de \b.
  { re: /\b(voc[êe]|isso|isto)\s+[ée]\s+(um\s+)?(rob[ôo]|bot|m[áa]quina|ia)(?!\w)/i, reason: "percebeu que é robô" },
  { re: /\b(rob[ôo]|bot)\s+(n[ée]|certo|mesmo)(?!\w)/i, reason: "percebeu que é robô" },
  { re: /\b(quero|vou|vamos|podemos|bora)\s+(fechar|contratar|assinar|comprar)\b/i, reason: "sinal de fechamento" },
  { re: /\b(fechado|fechou|pode\s+(fazer|come[çc]ar|emitir))\b/i, reason: "sinal de fechamento" },
  { re: /\b(advogado|processo|procon|justi[çc]a|judicial)\b/i, reason: "risco jurídico" },
  { re: /\b(absurdo|palha[çc]ada|vergonha|p[ée]ssimo|horr[íi]vel|inaceit[áa]vel)\b/i, reason: "cliente irritado" },
  { re: /\b(reclama[çc][ãa]o|reclamar)\b/i, reason: "reclamação" },
];

export type InboundIntent =
  | { kind: "opt_out"; keyword: string }
  | { kind: "handoff"; reason: string }
  | { kind: "normal" };

/**
 * Lê a mensagem do lead antes de gastar um token de IA com ela.
 * Opt-out tem prioridade sobre tudo.
 */
export function classifyInbound(message: string): InboundIntent {
  const text = (message ?? "").trim();
  if (!text) return { kind: "normal" };

  for (const { re, keyword } of OPT_OUT_PATTERNS) {
    if (re.test(text)) return { kind: "opt_out", keyword };
  }

  for (const { re, reason } of HANDOFF_PATTERNS) {
    if (re.test(text)) return { kind: "handoff", reason };
  }

  return { kind: "normal" };
}

// ------------------------------------------------------------
// DEDUP DE ENTRADA
// ------------------------------------------------------------

/**
 * A Evolution reentrega o webhook quando não recebe 200 a tempo. Sem esta
 * trava, a mesma mensagem do lead gerava duas respostas do agente.
 *
 * Devolve true se a mensagem é nova.
 */
export async function recordInbound(
  supabase: SupabaseClient,
  leadId: string,
  content: string,
  externalId: string | null,
): Promise<boolean> {
  if (externalId) {
    const { error } = await supabase.from("chat_messages").insert({
      lead_id: leadId,
      sender_type: "lead",
      content,
      status: "delivered",
      external_id: externalId,
    });

    // 23505 = violação de unicidade, ou seja, já processamos esta mensagem.
    if (error) {
      if (error.code === "23505") {
        console.log(`[agent] mensagem ${externalId} já processada, ignorando`);
        return false;
      }
      throw error;
    }
    return true;
  }

  // Sem id externo (formato de webhook antigo), cai para janela de tempo:
  // mesma mensagem, mesmo lead, últimos 30 segundos.
  const { data: recent } = await supabase
    .from("chat_messages")
    .select("id")
    .eq("lead_id", leadId)
    .eq("sender_type", "lead")
    .eq("content", content)
    .gte("sent_at", new Date(Date.now() - 30_000).toISOString())
    .limit(1);

  if (recent && recent.length > 0) {
    console.log("[agent] mensagem repetida em 30s, ignorando");
    return false;
  }

  await supabase.from("chat_messages").insert({
    lead_id: leadId,
    sender_type: "lead",
    content,
    status: "delivered",
  });
  return true;
}

// ------------------------------------------------------------
// AGRUPAMENTO DE RAJADA
// ------------------------------------------------------------

/** Quanto esperar o lead terminar de escrever antes de responder. */
const DEBOUNCE_MS = 8_000;
/** Teto: mesmo que ele siga digitando, respondemos em algum momento. */
const MAX_WAIT_MS = 25_000;

export interface DebounceOutcome {
  shouldReply: boolean;
  aggregated: string;
  messageCount: number;
}

/**
 * Pessoa manda "oi", "tudo bem?", "quanto custa?" em três mensagens. O
 * agente antigo respondia três vezes — nada denuncia mais um robô.
 *
 * Aqui esperamos o silêncio e respondemos o assunto inteiro de uma vez.
 * Se outra execução do webhook já está cuidando desta conversa, esta sai.
 */
export async function debounceInbound(
  supabase: SupabaseClient,
  leadId: string,
  userId: string,
): Promise<DebounceOutcome> {
  const now = new Date();

  const { data: existing } = await supabase
    .from("pending_replies")
    .select("*")
    .eq("lead_id", leadId)
    .maybeSingle();

  if (existing) {
    // Outra execução já está no comando; esta só registra e sai.
    await supabase
      .from("pending_replies")
      .update({
        last_seen_at: now.toISOString(),
        message_count: (existing.message_count ?? 1) + 1,
      })
      .eq("lead_id", leadId);

    if (existing.processing) {
      return { shouldReply: false, aggregated: "", messageCount: 0 };
    }
  } else {
    await supabase.from("pending_replies").insert({
      lead_id: leadId,
      user_id: userId,
      first_seen_at: now.toISOString(),
      last_seen_at: now.toISOString(),
      message_count: 1,
    });
  }

  // Espera o lead parar de digitar.
  const startedAt = Date.now();
  while (Date.now() - startedAt < MAX_WAIT_MS) {
    await new Promise((r) => setTimeout(r, 2_000));

    const { data: state } = await supabase
      .from("pending_replies")
      .select("last_seen_at, processing")
      .eq("lead_id", leadId)
      .maybeSingle();

    if (!state) return { shouldReply: false, aggregated: "", messageCount: 0 };
    if (state.processing) return { shouldReply: false, aggregated: "", messageCount: 0 };

    const quietFor = Date.now() - new Date(state.last_seen_at).getTime();
    if (quietFor >= DEBOUNCE_MS) break;
  }

  // Assume o comando. Se outra execução chegou primeiro, esta desiste.
  const { data: claimed } = await supabase
    .from("pending_replies")
    .update({ processing: true })
    .eq("lead_id", leadId)
    .eq("processing", false)
    .select()
    .maybeSingle();

  if (!claimed) return { shouldReply: false, aggregated: "", messageCount: 0 };

  // Junta tudo que ele mandou nesta rajada.
  const { data: burst } = await supabase
    .from("chat_messages")
    .select("content, sent_at")
    .eq("lead_id", leadId)
    .eq("sender_type", "lead")
    .gte("sent_at", claimed.first_seen_at)
    .order("sent_at", { ascending: true });

  const aggregated = (burst ?? []).map((m) => m.content).join("\n").trim();

  return {
    shouldReply: true,
    aggregated,
    messageCount: burst?.length ?? 1,
  };
}

/** Libera a conversa para a próxima rajada. */
export async function releaseDebounce(
  supabase: SupabaseClient,
  leadId: string,
): Promise<void> {
  await supabase.from("pending_replies").delete().eq("lead_id", leadId);
}

// ------------------------------------------------------------
// PORTARIA
// ------------------------------------------------------------

export interface GateResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Última checagem antes de gastar IA e disparar WhatsApp. As regras moram
 * no banco (agent_can_reply) para valerem igual em qualquer caminho de
 * código que queira responder.
 */
export async function agentGate(
  supabase: SupabaseClient,
  leadId: string,
  maxRepliesPerDay = 30,
): Promise<GateResult> {
  const { data, error } = await supabase.rpc("agent_can_reply", {
    p_lead_id: leadId,
    p_max_replies_per_day: maxRepliesPerDay,
  });

  if (error) {
    console.error("[agent] falha na portaria:", error.message);
    // Falha fechada: na dúvida, o agente fica calado. Silêncio é
    // recuperável; mensagem indevida não.
    return { allowed: false, reason: "erro_na_verificacao" };
  }

  if (data) return { allowed: false, reason: String(data) };
  return { allowed: true };
}

export async function countReply(supabase: SupabaseClient, leadId: string): Promise<void> {
  await supabase.rpc("agent_count_reply", { p_lead_id: leadId });
}

export async function handoff(
  supabase: SupabaseClient,
  leadId: string,
  reason: string,
): Promise<void> {
  await supabase.rpc("agent_handoff", { p_lead_id: leadId, p_reason: reason });
}

export async function optOut(
  supabase: SupabaseClient,
  leadId: string,
  keyword: string,
): Promise<void> {
  await supabase.rpc("agent_opt_out", { p_lead_id: leadId, p_keyword: keyword });
}

// ------------------------------------------------------------
// HORÁRIO COMERCIAL
// ------------------------------------------------------------

/**
 * Mensagem automática às 3h da manhã é o jeito mais rápido de virar
 * denúncia. Respeita a janela configurada pelo dono da conta.
 */
export function withinBusinessHours(settings: {
  auto_start_hour?: number | null;
  auto_end_hour?: number | null;
  work_days_only?: boolean | null;
}): boolean {
  // Servidor roda em UTC; o público é Brasil (UTC-3).
  const now = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const hour = now.getUTCHours();
  const day = now.getUTCDay();

  if (settings.work_days_only && (day === 0 || day === 6)) return false;

  const start = settings.auto_start_hour ?? 8;
  const end = settings.auto_end_hour ?? 20;

  return hour >= start && hour < end;
}

// ------------------------------------------------------------
// MEMÓRIA
// ------------------------------------------------------------

export interface LeadMemory {
  memory_type: string;
  key: string;
  value: string;
  confidence: number;
}

const MEMORY_SECTIONS: { type: string; title: string }[] = [
  { type: "personal", title: "Sobre a pessoa" },
  { type: "preference", title: "Preferências" },
  { type: "commitment", title: "Combinados" },
  { type: "objection", title: "Objeções já levantadas" },
  { type: "context", title: "Contexto do negócio" },
];

/**
 * Monta o bloco de memória do prompt.
 *
 * A versão anterior despejava até 50 registros sem ordem de importância nem
 * corte de confiança — o prompt inchava e a IA se perdia entre fato
 * relevante e ruído antigo. Aqui entra o que é confiável, limitado por
 * seção, com o mais recente primeiro.
 */
export function formatMemory(memories: LeadMemory[]): string {
  if (!memories?.length) return "";

  const confident = memories.filter((m) => (m.confidence ?? 1) >= 0.5);
  if (!confident.length) return "";

  const parts: string[] = [];

  for (const section of MEMORY_SECTIONS) {
    const items = confident
      .filter((m) => m.memory_type === section.type)
      .slice(0, 8)
      .map((m) => `- ${m.key}: ${m.value}`);

    if (items.length > 0) {
      parts.push(`### ${section.title}\n${items.join("\n")}`);
    }
  }

  if (!parts.length) return "";

  return `\n## O que você já sabe deste lead\n` +
    `(Use naturalmente. Nunca diga "segundo minhas anotações".)\n\n` +
    parts.join("\n\n");
}

export async function loadMemory(
  supabase: SupabaseClient,
  leadId: string,
): Promise<string> {
  const { data } = await supabase
    .from("lead_memory")
    .select("memory_type, key, value, confidence")
    .eq("lead_id", leadId)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("confidence", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(40);

  return formatMemory((data ?? []) as LeadMemory[]);
}

// ============================================
// CAMADA DE AUTENTICAÇÃO DAS EDGE FUNCTIONS
// ============================================
//
// Toda edge function deve começar por uma destas três portas:
//
//   requireUser(req)            -> só usuário logado (chamadas do app)
//   requireInternal(req)        -> só chamada interna (pg_cron / outra function)
//   requireUserOrInternal(req)  -> as duas (ex.: job-processor, chamado pelos dois)
//
// "Interno" é provado de duas formas, sem precisar cadastrar secret novo:
//   1. Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
//      (é o que o supabase-js manda quando uma function invoca outra
//       usando o service role client)
//   2. x-internal-secret: <segredo guardado em private.app_config>
//      (é o que o pg_cron manda; o segredo é gerado no banco e nunca
//       aparece no repositório)
//
import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-internal-secret",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
};

export const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
export const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ??
  Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "";

export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  return null;
}

/** Client com service role. Ignora RLS — use só depois de autenticar. */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AuthContext =
  | { kind: "user"; userId: string; user: Record<string, unknown>; supabase: SupabaseClient }
  | { kind: "internal"; userId: null; user: null; supabase: SupabaseClient };

function bearer(req: Request): string | null {
  const header = req.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** Comparação em tempo constante — evita vazar o segredo por timing. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function isInternalCall(req: Request, supabase: SupabaseClient): Promise<boolean> {
  // 1. Service role no Authorization (function -> function)
  const token = bearer(req);
  if (token && SERVICE_ROLE_KEY && safeEqual(token, SERVICE_ROLE_KEY)) return true;

  // 2. Segredo interno no header (pg_cron -> function)
  const secret = req.headers.get("x-internal-secret");
  if (!secret) return false;

  const { data, error } = await supabase.rpc("verify_internal_secret", {
    p_secret: secret,
  });
  if (error) {
    console.error("[auth] falha ao verificar segredo interno:", error.message);
    return false;
  }
  return data === true;
}

/**
 * Exige um usuário autenticado. O JWT vem do supabase.functions.invoke()
 * do frontend, que anexa a sessão automaticamente.
 */
export async function requireUser(
  req: Request,
): Promise<{ ctx: AuthContext; error: null } | { ctx: null; error: Response }> {
  const supabase = serviceClient();
  const token = bearer(req);

  if (!token) {
    return { ctx: null, error: json({ error: "Não autorizado: faça login novamente." }, 401) };
  }

  // Valida o JWT com a chave pública (nunca com service role, que aceitaria
  // o próprio service role key como se fosse um usuário).
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.getUser(token);

  if (error || !data?.user) {
    return { ctx: null, error: json({ error: "Sessão inválida ou expirada." }, 401) };
  }

  return {
    ctx: { kind: "user", userId: data.user.id, user: data.user as unknown as Record<string, unknown>, supabase },
    error: null,
  };
}

/** Exige que a chamada venha do pg_cron ou de outra edge function. */
export async function requireInternal(
  req: Request,
): Promise<{ ctx: AuthContext; error: null } | { ctx: null; error: Response }> {
  const supabase = serviceClient();
  if (await isInternalCall(req, supabase)) {
    return { ctx: { kind: "internal", userId: null, user: null, supabase }, error: null };
  }
  return { ctx: null, error: json({ error: "Não autorizado." }, 401) };
}

/** Aceita usuário logado OU chamada interna. */
export async function requireUserOrInternal(
  req: Request,
): Promise<{ ctx: AuthContext; error: null } | { ctx: null; error: Response }> {
  const supabase = serviceClient();
  if (await isInternalCall(req, supabase)) {
    return { ctx: { kind: "internal", userId: null, user: null, supabase }, error: null };
  }
  return await requireUser(req);
}

/**
 * Como requireUserOrInternal, mas também aceita o token pessoal de API
 * (`hunter_api_token`), usado por quem integra de fora pela /api-reference.
 */
export async function requireUserInternalOrApiKey(
  req: Request,
): Promise<{ ctx: AuthContext; error: null } | { ctx: null; error: Response }> {
  const supabase = serviceClient();

  if (await isInternalCall(req, supabase)) {
    return { ctx: { kind: "internal", userId: null, user: null, supabase }, error: null };
  }

  const token = bearer(req) ?? req.headers.get("x-api-key");
  if (token) {
    const { data } = await supabase
      .from("user_settings")
      .select("user_id")
      .eq("hunter_api_token", token)
      .maybeSingle();

    if (data?.user_id) {
      return {
        ctx: { kind: "user", userId: data.user_id, user: { id: data.user_id }, supabase },
        error: null,
      };
    }
  }

  return await requireUser(req);
}

/**
 * Segredo interno em texto — usado para montar a URL do webhook que a
 * Evolution vai chamar de volta. Só sai daqui para dentro da Evolution.
 */
export async function getInternalSecret(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.rpc("get_internal_secret");
  if (error) {
    console.error("[auth] não foi possível ler o segredo interno:", error.message);
    return null;
  }
  return typeof data === "string" && data.length > 0 ? data : null;
}

/**
 * A Evolution não manda header customizado, então o webhook se autentica
 * por query string (`?s=<segredo>`), que só nós e ela conhecemos.
 */
export async function verifyWebhookSecret(req: Request): Promise<boolean> {
  const url = new URL(req.url);
  const secret = url.searchParams.get("s");
  if (!secret) return false;

  const { data, error } = await serviceClient().rpc("verify_internal_secret", {
    p_secret: secret,
  });
  if (error) {
    console.error("[auth] falha ao verificar segredo do webhook:", error.message);
    return false;
  }
  return data === true;
}

// ============================================
// ASSINATURA
// ============================================

const SUBSCRIPTION_GRACE_MS = 1000 * 60 * 60 * 24 * 3; // 3 dias de tolerância

export type PlanCheck = {
  active: boolean;
  plan: string;
  status: string | null;
  reason?: string;
};

/**
 * Fonte da verdade sobre acesso pago. O frontend também checa, mas ele é
 * só cosmético — quem barra de verdade é isto aqui.
 */
export async function getSubscription(
  supabase: SupabaseClient,
  userId: string,
): Promise<PlanCheck> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, status, expires_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("[auth] erro ao ler assinatura:", error.message);
    // Falha fechada: sem confirmação de pagamento, sem acesso pago.
    return { active: false, plan: "free", status: null, reason: "erro ao verificar assinatura" };
  }

  if (!data) return { active: false, plan: "free", status: null, reason: "sem assinatura" };

  const status = data.status as string;
  if (status !== "active") {
    return { active: false, plan: data.plan ?? "free", status, reason: `assinatura ${status}` };
  }

  if (data.expires_at) {
    const expiresAt = new Date(data.expires_at).getTime();
    if (Number.isFinite(expiresAt) && Date.now() > expiresAt + SUBSCRIPTION_GRACE_MS) {
      return { active: false, plan: data.plan ?? "free", status, reason: "assinatura vencida" };
    }
  }

  return { active: true, plan: data.plan ?? "pro", status };
}

/** Admin da plataforma não passa por paywall. */
export async function isAdmin(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();

  if (error) {
    console.error("[auth] erro ao checar admin:", error.message);
    return false;
  }
  return !!data;
}

/**
 * Porta única para recursos pagos. Chamada interna passa direto (o cron só
 * processa trabalho de quem já foi validado na entrada), e admin também —
 * sem isso o dono da plataforma ficaria trancado fora do próprio produto.
 */
export async function requirePaidPlan(
  ctx: AuthContext,
): Promise<Response | null> {
  if (ctx.kind === "internal") return null;

  const sub = await getSubscription(ctx.supabase, ctx.userId);
  if (sub.active) return null;

  if (await isAdmin(ctx.supabase, ctx.userId)) return null;

  return json(
    {
      error: "Este recurso exige uma assinatura ativa.",
      code: "subscription_required",
      reason: sub.reason,
      checkout: "https://pay.cakto.com.br/o5dfn8a_827823",
    },
    402,
  );
}

/**
 * Resolve de quem é o trabalho.
 *
 * Várias functions recebiam `user_id` no corpo e usavam service role em cima
 * dele sem conferir nada — qualquer um mandava o UUID de outra pessoa e
 * operava a conta alheia. Agora o corpo só manda quando a chamada é interna;
 * para usuário logado, quem vale é o JWT.
 */
export function resolveUserId(
  ctx: AuthContext,
  bodyUserId?: unknown,
): { userId: string; error: null } | { userId: null; error: Response } {
  if (ctx.kind === "internal") {
    if (typeof bodyUserId === "string" && bodyUserId.length > 0) {
      return { userId: bodyUserId, error: null };
    }
    return { userId: null, error: json({ error: "user_id é obrigatório em chamada interna." }, 400) };
  }

  if (typeof bodyUserId === "string" && bodyUserId.length > 0 && bodyUserId !== ctx.userId) {
    return { userId: null, error: json({ error: "Você não pode operar em nome de outra conta." }, 403) };
  }

  return { userId: ctx.userId, error: null };
}

/**
 * Confirma que a instância de WhatsApp pertence mesmo a quem está chamando.
 *
 * Precisa olhar também `extra_chip_instances`: com a rotação ligada, o envio
 * sai por um chip secundário, cujo instance_id não é o `whatsapp_instance_id`
 * da conta. Checar só a coluna principal barraria os próprios chips do dono.
 */
export async function assertOwnsInstance(
  ctx: AuthContext,
  instanceId: string,
): Promise<Response | null> {
  if (ctx.kind === "internal") return null;
  if (!instanceId) return json({ error: "instance_id é obrigatório." }, 400);

  const { data, error } = await ctx.supabase
    .from("user_settings")
    .select("whatsapp_instance_id, extra_chip_instances")
    .eq("user_id", ctx.userId)
    .maybeSingle();

  if (error) {
    console.error("[auth] erro ao verificar dono da instância:", error.message);
    return json({ error: "Não foi possível validar a conexão de WhatsApp." }, 500);
  }

  if (!data) {
    return json({ error: "Esta conexão de WhatsApp não pertence à sua conta." }, 403);
  }

  const owned = new Set<string>();
  if (data.whatsapp_instance_id) owned.add(String(data.whatsapp_instance_id));

  const extras = Array.isArray(data.extra_chip_instances) ? data.extra_chip_instances : [];
  for (const chip of extras) {
    const id = (chip as Record<string, unknown>)?.instance_id;
    if (id) owned.add(String(id));
  }

  if (!owned.has(instanceId)) {
    return json({ error: "Esta conexão de WhatsApp não pertence à sua conta." }, 403);
  }
  return null;
}

// ============================================
// RATE LIMIT PERSISTENTE
// ============================================

/**
 * O rate limit antigo era um Map em memória: sumia a cada cold start e não
 * era compartilhado entre instâncias, ou seja, não limitava nada de verdade.
 * Este conta no banco.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  identity: string,
  action: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<{ allowed: boolean; remaining: number; resetIn: number }> {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_identity: identity,
    p_action: action,
    p_max: maxRequests,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error("[auth] rate limit indisponível:", error.message);
    // Falha aberta: um problema no contador não pode derrubar o produto.
    return { allowed: true, remaining: maxRequests, resetIn: 0 };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    allowed: row?.allowed ?? true,
    remaining: row?.remaining ?? 0,
    resetIn: row?.reset_in_seconds ?? windowSeconds,
  };
}

export function rateLimited(resetIn: number): Response {
  return new Response(
    JSON.stringify({
      error: "Você fez muitas requisições. Aguarde um instante.",
      code: "rate_limited",
      retry_after: resetIn,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(resetIn),
      },
    },
  );
}

/** Erro genérico pro cliente, erro real no log. */
export function failure(error: unknown, publicMessage = "Ocorreu um erro interno."): Response {
  console.error("[erro]", error instanceof Error ? error.stack ?? error.message : error);
  return json({ error: publicMessage }, 500);
}

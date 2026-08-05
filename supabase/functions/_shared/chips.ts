// ============================================================
// ROTAÇÃO DE CHIPS
// ============================================================
// A tela de Configurações deixa cadastrar chips extras, escolher quais
// estão ativos e a estratégia de rotação (single / round_robin / random /
// health). Nada disso existia no backend: `chip_rotation_enabled`,
// `chip_rotation_strategy`, `active_chip_ids` e `extra_chip_instances` eram
// gravados e nunca lidos. Todo envio saía por `whatsapp_instance_id`, o chip
// principal — inclusive para quem configurou três.
//
// Isso importa porque rotação é metade do anti-ban: distribuir o volume
// entre números é o que evita que um único chip bata o limite do WhatsApp.

type SupabaseClient = {
  from: (table: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<{ data: any; error: any }>;
};

export type ChipHealth = "healthy" | "warning" | "critical" | "banned";

export interface Chip {
  id: string;
  instance_id: string;
  label: string;
  health: ChipHealth;
  /** Mensagens que este chip já mandou hoje. */
  sent_today: number;
}

export type RotationStrategy = "single" | "round_robin" | "random" | "health";

/** Peso de cada estado de saúde na escolha. Chip banido nunca entra. */
const HEALTH_RANK: Record<ChipHealth, number> = {
  healthy: 3,
  warning: 2,
  critical: 1,
  banned: 0,
};

interface RawSettings {
  whatsapp_instance_id?: string | null;
  whatsapp_connected?: boolean | null;
  chip_rotation_enabled?: boolean | null;
  chip_rotation_strategy?: string | null;
  active_chip_ids?: unknown;
  extra_chip_instances?: unknown;
}

/**
 * Monta a lista de chips utilizáveis a partir das configurações, na mesma
 * forma que a tela usa: o principal mais os extras, filtrados pelos ativos.
 */
export function listChips(settings: RawSettings): Chip[] {
  const chips: Chip[] = [];

  if (settings.whatsapp_connected && settings.whatsapp_instance_id) {
    chips.push({
      id: "main",
      instance_id: settings.whatsapp_instance_id,
      label: "Chip Principal",
      health: "healthy",
      sent_today: 0,
    });
  }

  const extras = Array.isArray(settings.extra_chip_instances)
    ? settings.extra_chip_instances
    : [];

  for (const raw of extras) {
    const chip = raw as Record<string, unknown>;
    if (!chip?.instance_id) continue;
    chips.push({
      id: String(chip.id ?? chip.instance_id),
      instance_id: String(chip.instance_id),
      label: String(chip.label ?? "Chip"),
      health: (String(chip.health ?? "healthy") as ChipHealth),
      sent_today: 0,
    });
  }

  // Lista vazia de ativos significa "todos" — é o que a tela assume.
  const active = Array.isArray(settings.active_chip_ids) ? settings.active_chip_ids : [];
  if (active.length === 0) return chips;

  const allowed = new Set(active.map(String));
  const filtered = chips.filter((c) => allowed.has(c.id));

  // Se a seleção não bate com nenhum chip existente, é melhor mandar pelo
  // principal do que não mandar nada.
  return filtered.length > 0 ? filtered : chips;
}

/**
 * Escolhe o chip da vez.
 *
 * `counter` é o número de envios já feitos nesta execução; serve para o
 * round-robin avançar sem precisar guardar estado entre chamadas.
 */
export function pickChip(
  chips: Chip[],
  strategy: RotationStrategy,
  counter: number,
): Chip | null {
  const usable = chips.filter((c) => c.health !== "banned");
  if (usable.length === 0) return null;
  if (usable.length === 1) return usable[0];

  switch (strategy) {
    case "round_robin":
      return usable[counter % usable.length];

    case "random":
      return usable[Math.floor(Math.random() * usable.length)];

    case "health": {
      // Melhor saúde primeiro; entre iguais, quem mandou menos hoje.
      const sorted = [...usable].sort((a, b) => {
        const rank = HEALTH_RANK[b.health] - HEALTH_RANK[a.health];
        return rank !== 0 ? rank : a.sent_today - b.sent_today;
      });
      return sorted[0];
    }

    case "single":
    default:
      return usable[0];
  }
}

/**
 * Carrega os chips de um usuário já com o volume enviado hoje por cada um,
 * que é o que a estratégia "health" precisa para equilibrar a carga.
 */
export async function loadChips(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ chips: Chip[]; strategy: RotationStrategy; enabled: boolean }> {
  const { data: settings } = await supabase
    .from("user_settings")
    .select("whatsapp_instance_id, whatsapp_connected, chip_rotation_enabled, chip_rotation_strategy, active_chip_ids, extra_chip_instances")
    .eq("user_id", userId)
    .maybeSingle();

  if (!settings) return { chips: [], strategy: "single", enabled: false };

  const chips = listChips(settings as RawSettings);
  const enabled = !!settings.chip_rotation_enabled;
  const strategy = (settings.chip_rotation_strategy ?? "single") as RotationStrategy;

  // Rotação desligada = comportamento antigo, só o principal.
  if (!enabled) {
    return { chips: chips.slice(0, 1), strategy: "single", enabled: false };
  }

  // Volume de hoje por chip, para a estratégia por saúde.
  const { data: usage } = await supabase.rpc("get_chip_usage_today", {
    p_user_id: userId,
  });

  if (Array.isArray(usage)) {
    const byInstance = new Map<string, number>(
      usage.map((u: { instance_id: string; sent_count: number }) => [u.instance_id, u.sent_count]),
    );
    for (const chip of chips) {
      chip.sent_today = byInstance.get(chip.instance_id) ?? 0;
    }
  }

  return { chips, strategy, enabled };
}

/** Contabiliza o envio no chip que o atendeu. */
export async function recordChipSend(
  supabase: SupabaseClient,
  userId: string,
  instanceId: string,
  failed = false,
): Promise<void> {
  try {
    await supabase.rpc("record_chip_send", {
      p_user_id: userId,
      p_instance_id: instanceId,
      p_failed: failed,
    });
  } catch (e) {
    // Telemetria não pode derrubar o envio.
    console.error("[chips] falha ao registrar envio:", e);
  }
}

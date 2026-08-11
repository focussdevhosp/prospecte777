// ============================================================
// GRAVAR OS SINAIS DETECTADOS
// ============================================================
// A detecção mora em `agents/signals.ts`, sem banco, porque é o que dá para
// testar. Aqui fica a parte que fala com o Postgres.
//
// Roda logo depois de cada auditoria de site: é o momento em que temos o
// estado novo na mão e o anterior ainda gravado. Fazer isso num job separado
// significaria comparar contra um snapshot já sobrescrito — ou seja, nunca
// detectar mudança nenhuma.

import { detectSignals, snapshotOf, type LeadSnapshot } from "./agents/signals.ts";

interface Supa {
  from: (table: string) => {
    update: (row: unknown) => { eq: (col: string, v: unknown) => Promise<{ error: unknown }> };
    insert: (row: unknown) => Promise<{ error: { code?: string; message: string } | null }>;
  };
}

interface LeadRow {
  id: string;
  user_id: string;
  website?: string | null;
  rating?: number | null;
  reviews_count?: number | null;
  site_audit?: { reachable?: boolean; score?: number; findings?: Array<{ id?: string }> } | null;
  signal_snapshot?: LeadSnapshot | null;
}

/**
 * Compara o estado do lead com o da última conferência, grava os sinais novos
 * e atualiza o snapshot.
 *
 * Devolve quantos sinais foram registrados. Nunca lança: sinal é vantagem
 * competitiva, não requisito — se a gravação falhar, a abordagem continua
 * acontecendo sem gatilho, que é o comportamento de antes.
 */
export async function recordSignals(
  supabase: Supa,
  lead: LeadRow,
  now: Date = new Date(),
): Promise<number> {
  try {
    const atual = snapshotOf(lead);
    const sinais = detectSignals(lead.signal_snapshot ?? null, atual);

    // O snapshot é atualizado SEMPRE, inclusive quando não houve sinal. Sem
    // isso, a primeira conferência nunca viraria base para a segunda e o
    // sistema ficaria eternamente sem detectar mudança.
    await supabase
      .from("leads")
      .update({ signal_snapshot: atual, signal_checked_at: now.toISOString() })
      .eq("id", lead.id);

    let gravados = 0;

    for (const sinal of sinais) {
      const expira = new Date(now.getTime());
      expira.setDate(expira.getDate() + sinal.windowDays);

      const { error } = await supabase.from("lead_signals").insert({
        lead_id: lead.id,
        user_id: lead.user_id,
        type: sinal.type,
        summary: sinal.summary,
        evidence: sinal.evidence,
        strength: sinal.strength,
        detected_at: now.toISOString(),
        expires_at: expira.toISOString(),
      });

      // 23505 = já existe um sinal ativo deste tipo para este lead. Esperado
      // quando a conferência roda duas vezes antes de o anterior vencer.
      if (error && error.code !== "23505") {
        console.error(`[sinais] falha ao gravar ${sinal.type}:`, error.message);
        continue;
      }
      if (!error) gravados++;
    }

    if (gravados > 0) {
      console.log(`[sinais] ${gravados} sinal(is) novo(s) para o lead ${lead.id}`);
    }

    return gravados;
  } catch (e) {
    console.error("[sinais] falha na detecção:", e);
    return 0;
  }
}

// ============================================================
// LIGAR O TESTE A/B NO ENVIO DE VERDADE
// ============================================================
// A decisão de qual variante e a de quem venceu moram em
// `_shared/agents/ab.ts`, sem banco, porque é o que dá para testar. Aqui fica
// só a parte que fala com o banco.
//
// Este arquivo existe porque a funcionalidade inteira estava desconectada:
// havia tabela, tela, teste-z e coluna de vencedor, e nenhum caminho de envio
// passava `ab_test_id`. O que faltava não era matemática — era o fio.

import { pickVariant } from "./agents/ab.ts";

/**
 * Só o que este arquivo usa do cliente. Tipar o mínimo, e não `any`, deixa o
 * compilador conferir a forma das chamadas sem arrastar o tipo gerado do
 * Supabase — que muda a cada regeneração do schema.
 */
interface Supa {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, value: unknown) => {
        eq: (col: string, value: unknown) => {
          order: (col: string, opts: { ascending: boolean }) => {
            limit: (n: number) => Promise<{ data: AbTestRow[] | null }>;
          };
        };
      };
    };
    insert: (row: unknown) => Promise<{ error: { code?: string; message: string } | null }>;
  };
  rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown>;
}

interface AbTestRow {
  id: string;
  niche: string | null;
  variant_a_content: string | null;
  variant_b_content: string | null;
}

export interface AbSelection {
  /** Texto a usar. É o `fallback` quando nenhum teste está rodando. */
  template: string;
  testId: string | null;
  variant: "a" | "b" | null;
}

/**
 * Escolhe o texto deste lead, entrando num teste A/B se houver um rodando.
 *
 * Um teste com nicho definido só vale para leads daquele nicho: comparar a
 * mesma mensagem entre restaurante e escritório de advocacia não mede a
 * mensagem, mede a mistura de público.
 *
 * Falha em silêncio de propósito. Se a consulta quebrar, o envio segue com o
 * texto original — deixar de mandar mensagem porque a telemetria caiu seria
 * trocar um problema pequeno por um grande.
 */
export async function selectAbTemplate(
  supabase: Supa,
  params: {
    userId: string;
    leadId: string;
    niche?: string | null;
    fallback: string;
  },
): Promise<AbSelection> {
  const semTeste: AbSelection = { template: params.fallback, testId: null, variant: null };

  try {
    const { data: tests } = await supabase
      .from("ab_tests")
      .select("id, niche, variant_a_content, variant_b_content")
      .eq("user_id", params.userId)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(10);

    if (!tests?.length) return semTeste;

    const alvo = tests.find(
      (t) => !t.niche || (params.niche && t.niche.toLowerCase() === params.niche.toLowerCase()),
    );

    if (!alvo) return semTeste;

    const variant = pickVariant(alvo.id, params.leadId);
    const conteudo = variant === "a" ? alvo.variant_a_content : alvo.variant_b_content;

    // Variante sem conteúdo não é variante. Melhor não entrar no teste do que
    // contar uma amostra de mensagem vazia.
    if (!conteudo || !String(conteudo).trim()) return semTeste;

    return { template: String(conteudo), testId: alvo.id, variant };
  } catch (e) {
    console.error("[ab] falha ao selecionar variante:", e);
    return semTeste;
  }
}

/**
 * Registra que este lead recebeu esta variante.
 *
 * `ON CONFLICT DO NOTHING`: reprocessar um lote não pode contar a mesma
 * pessoa como duas amostras — a significância viraria ficção. E como
 * `pickVariant` é determinística, a segunda tentativa cairia na mesma
 * variante de qualquer jeito.
 *
 * Chamado DEPOIS do envio confirmado. Registrar antes contaria como amostra
 * quem foi barrado pela lista de bloqueio e nunca recebeu nada.
 */
export async function recordAbSend(
  supabase: Supa,
  params: { testId: string; variant: "a" | "b"; leadId: string; userId: string },
): Promise<void> {
  try {
    const { error } = await supabase.from("ab_assignments").insert({
      ab_test_id: params.testId,
      lead_id: params.leadId,
      user_id: params.userId,
      variant: params.variant,
    });

    // 23505 = violação de unicidade: o lead já estava no teste. Esperado.
    if (error && error.code !== "23505") {
      console.error("[ab] falha ao registrar atribuição:", error.message);
      return;
    }

    await supabase.rpc("ab_sync_counters", { p_test_id: params.testId });
  } catch (e) {
    console.error("[ab] falha ao registrar atribuição:", e);
  }
}

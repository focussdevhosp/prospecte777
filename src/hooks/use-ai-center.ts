import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// CENTRO DE CUSTO E LABORATÓRIO DA IA
// ============================================================
// `ai_cost_summary()` e a ação `preview_lead` do orquestrador existiam sem
// nenhuma tela lendo delas — o inverso do defeito que vinha aparecendo nos
// ciclos anteriores.
//
// E havia um beco sem saída: o teto de gasto diário nasce em US$ 5, bloqueia
// o lote quando estoura, e a mensagem de erro diz "Ajuste o limite em
// Configurações para continuar" — apontando para uma tela que não existia.
// Quem batesse no teto ficava com as missões paradas sem caminho de volta.

export interface AiCostSummary {
  today: number;
  month: number;
  daily_cap: number | null;
  monthly_cap: number | null;
  by_agent: Record<string, number>;
  avg_latency_ms: number;
}

export function useAiCost() {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['ai-cost', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('ai_cost_summary', { p_user_id: user!.id });
      if (error) throw error;
      return data as unknown as AiCostSummary;
    },
    enabled: !!user?.id,
    refetchInterval: 60_000,
  });

  return { cost: data, isLoading, refetch };
}

/**
 * Teto de gasto de IA, por dia e por mês.
 *
 * Os dois são gravados em `user_settings` e lidos por `ai_budget_check()`
 * antes de cada lote. Sem esta tela, o valor padrão era o único possível.
 */
export function useAiBudget() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const update = useMutation({
    mutationFn: async (caps: { daily: number; monthly: number }) => {
      if (!user?.id) throw new Error('Sessão expirada.');

      const { error } = await supabase
        .from('user_settings')
        .update({
          ai_daily_budget_usd: caps.daily,
          ai_monthly_budget_usd: caps.monthly,
        })
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-cost'] });
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      toast({
        title: 'Teto atualizado',
        description: 'Vale a partir do próximo lote. Missões paradas por estouro voltam sozinhas.',
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Não foi possível salvar o teto', description: e.message, variant: 'destructive' }),
  });

  return { updateBudget: update.mutate, isSaving: update.isPending };
}

// ------------------------------------------------------------
// LABORATÓRIO
// ------------------------------------------------------------

/** O que a esteira produz para um lead, sem enviar nada. */
export interface LeadPreview {
  outcome: {
    decision: string;
    reason: string;
  } | null;
  dossier: {
    facts: Array<{ label: string; value: string; source: string }>;
    hypotheses: Array<{ statement: string; basedOn: string }>;
  } | null;
  qualification: {
    score: number;
    temperature: string;
    reasons: Array<{ label: string; points: number; evidence: string }>;
    disqualified?: boolean;
    disqualifiedReason?: string;
  } | null;
  offer_match: {
    offer: { name: string } | null;
    confidence: number;
    reasons: string[];
  } | null;
  strategy: {
    angle: string;
    hook: { label: string; value: string; source: string } | null;
    cta: string;
    maxWords: number;
    reasoning?: string[];
  } | null;
  message: string | null;
  quality: {
    approved: boolean;
    overall: number;
    scores: Record<string, number>;
    issues: Array<{ code: string; severity: string; message: string; excerpt?: string }>;
  } | null;
  rewrites: number;
}

/**
 * Roda a esteira inteira em modo seco.
 *
 * É a resposta mais direta à pergunta "por que a IA escreveu isso?": mostra
 * cada fato com a origem, cada ponto do score com a evidência, a oferta
 * escolhida com o motivo, e as seis notas do Quality Gate. Nada é enviado e
 * nada é gravado.
 */
export function usePreviewLead() {
  const { toast } = useToast();

  const preview = useMutation({
    mutationFn: async (params: { leadId: string; missionId?: string; goal?: string }) => {
      const { data, error } = await supabase.functions.invoke('sales-orchestrator', {
        body: {
          action: 'preview_lead',
          lead_id: params.leadId,
          mission_id: params.missionId,
          goal: params.goal,
        },
      });

      if (error) {
        let detail = error.message;
        try {
          const parsed = await (error as { context?: Response }).context?.json();
          if (parsed?.error) detail = parsed.error;
        } catch {
          /* mantém a mensagem original */
        }
        throw new Error(detail);
      }
      if (data?.error) throw new Error(data.error);

      return data as LeadPreview;
    },
    onError: (e: Error) =>
      toast({ title: 'A prévia falhou', description: e.message, variant: 'destructive' }),
  });

  return {
    runPreview: preview.mutate,
    preview: preview.data,
    isRunning: preview.isPending,
    error: preview.error as Error | null,
    reset: preview.reset,
  };
}

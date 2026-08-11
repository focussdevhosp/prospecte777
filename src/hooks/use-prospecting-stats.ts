import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { bestHours } from '../../supabase/functions/_shared/agents/timing';

export interface ProspectingStats {
  id: string;
  user_id: string;
  niche: string;
  location: string | null;
  hour_of_day: number | null;
  day_of_week: number | null;
  messages_sent: number;
  /** OBSOLETA: nunca foi incrementada. 0 aqui significa "não medido". */
  responses_received: number;
  /** OBSOLETA: mesma situação de `responses_received`. */
  positive_responses: number;
  date: string;
  created_at: string;
}

export interface BestTimeSlot {
  hour: number;
  responseRate: number;
  messagesSent: number;
}

export interface NichePerformance {
  niche: string;
  totalSent: number;
  totalResponses: number;
  responseRate: number;
  positiveRate: number;
}

export function useProspectingStats() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: stats, isLoading } = useQuery({
    queryKey: ['prospecting-stats', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('prospecting_stats')
        .select('*')
        .eq('user_id', user.id)
        .order('date', { ascending: false })
        .limit(1000);

      if (error) throw error;
      return data as ProspectingStats[];
    },
    enabled: !!user?.id,
  });

  // ------------------------------------------------------------
  // As três funções que ficavam aqui foram removidas
  // ------------------------------------------------------------
  // `getBestTimeSlots`, `getNichePerformance` e `getBestHourForNiche`
  // somavam `stat.responses_received` e `stat.positive_responses` — duas
  // colunas que NENHUM código jamais incrementou. O job-processor as escreve
  // sempre com 0, e ponto.
  //
  // O resultado era uma taxa de resposta de 0% para toda hora e todo nicho,
  // com a ordenação decidida pelo acaso da iteração. Nenhuma tela chegou a
  // consumi-las, o que é a única razão de isso não ter virado conselho ruim
  // na cara do usuário — o `ai-prospecting` fazia a mesma conta e virava.
  //
  // Quem precisa desse número usa `useBestHours()` abaixo, que lê de
  // `prospecting_hour_stats` — derivada da conversa real, sem coluna
  // intermediária para alguém esquecer de atualizar.

  // Record a stat entry
  const recordStat = useMutation({
    mutationFn: async (stat: Omit<ProspectingStats, 'id' | 'user_id' | 'created_at'>) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('prospecting_stats')
        .insert({ ...stat, user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['prospecting-stats', user?.id] });
    },
  });

  return {
    stats: stats || [],
    isLoading,
    recordStat: recordStat.mutate,
  };
}

/**
 * Horários com envio e resposta de verdade, vindos do banco.
 *
 * `bestHours` decide se há evidência suficiente para recomendar. Quando não
 * há, devolve `hours: []` e o motivo — e a tela mostra o motivo em vez de um
 * horário inventado. É a mesma função que o `ai-prospecting` usa, para os
 * dois nunca discordarem.
 */
export function useBestHours(days = 90) {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['best-hours', user?.id, days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('prospecting_hour_stats', {
        p_user_id: user!.id,
        p_days: days,
      });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user?.id,
  });

  const advice = bestHours(
    (data ?? []).map((row) => ({
      hour: Number(row.hour_of_day),
      sent: Number(row.sent),
      replied: Number(row.replied),
    })),
  );

  return { ...advice, hourly: data ?? [], isLoading };
}

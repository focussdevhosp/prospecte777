import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { DashboardMetrics, LeadStage } from '@/types/database';
import { format, subDays } from 'date-fns';

/**
 * Números do painel.
 *
 * ANTES: baixava TODOS os leads da conta e contava no navegador.
 *
 *   .from('leads').select('id, stage, temperature, created_at').eq('user_id', ...)
 *
 * Sem limite explícito — e o PostgREST deste projeto tem `max_rows = 1000`.
 * Acima disso ele devolve os primeiros mil e não avisa. Nenhum erro, nenhum
 * aviso. Numa conta com 1.500 leads, "Total de Leads" mostraria 1000 para
 * sempre, e o funil, a conversão e as temperaturas sairiam de uma amostra
 * truncada — nem aleatória, apenas a ordem que o banco devolveu.
 *
 * Quanto mais o cliente usasse o produto, mais errado ficaria a primeira tela
 * que ele abre. E errado em silêncio, que é o tipo que ninguém corrige.
 *
 * AGORA: uma agregação no banco. Exata, sem teto, e uma ida de rede em vez de
 * baixar a carteira inteira a cada minuto.
 */
const DIAS_DO_GRAFICO = 90;

interface MetricasDoBanco {
  totalLeads: number;
  leadsThisMonth: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  conversionRate: number;
  meetingsScheduled: number;
  meetingsThisWeek: number;
  leadsByStage: Record<LeadStage, number>;
  leadsByDate: Record<string, number>;
}

export function useDashboardMetrics() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['dashboard-metrics', user?.id],
    queryFn: async (): Promise<DashboardMetrics & { leadsByDate: Record<string, number> }> => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase.rpc('dashboard_metrics', {
        p_user_id: user.id,
        p_days: DIAS_DO_GRAFICO,
      });

      if (error) throw error;

      const m = (data ?? {}) as unknown as MetricasDoBanco;

      // O gráfico precisa de TODOS os dias da janela, inclusive os de captura
      // zero. O banco só devolve os dias que tiveram lead — dia sem captura
      // simplesmente não existe na tabela. Preencher aqui é o que evita a
      // linha do gráfico "pular" os dias parados e mentir sobre a constância
      // da operação.
      const leadsByDate: Record<string, number> = {};
      for (let i = DIAS_DO_GRAFICO - 1; i >= 0; i--) {
        leadsByDate[format(subDays(new Date(), i), 'yyyy-MM-dd')] = 0;
      }
      for (const [dia, qtd] of Object.entries(m.leadsByDate ?? {})) {
        if (dia in leadsByDate) leadsByDate[dia] = Number(qtd) || 0;
      }

      return {
        totalLeads: m.totalLeads ?? 0,
        leadsThisMonth: m.leadsThisMonth ?? 0,
        meetingsScheduled: m.meetingsScheduled ?? 0,
        meetingsThisWeek: m.meetingsThisWeek ?? 0,
        conversionRate: Number(m.conversionRate ?? 0),
        hotLeads: m.hotLeads ?? 0,
        warmLeads: m.warmLeads ?? 0,
        coldLeads: m.coldLeads ?? 0,
        leadsByStage: m.leadsByStage ?? ({} as Record<LeadStage, number>),
        leadsByDate,
      };
    },
    enabled: !!user?.id,
    refetchInterval: 60000,
  });
}

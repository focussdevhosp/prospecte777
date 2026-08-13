import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

export interface JobLog {
  id: string;
  job_id: string;
  user_id: string;
  level: 'info' | 'error' | 'warning' | 'success';
  message: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export function useJobLogs(jobId?: string) {
  const { user } = useAuth();

  const { data: logs, isLoading, refetch } = useQuery({
    queryKey: ['job-logs', user?.id, jobId],
    queryFn: async () => {
      if (!user?.id) return [];

      // Use any type since job_logs table was just created and types aren't regenerated yet
      const { data, error } = await (supabase as any)
        .from('job_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(jobId ? 100 : 50);

      if (error) {
        // Table might not exist yet, return empty array
        console.warn('Job logs query error:', error);
        return [];
      }

      // Filter by jobId if provided (doing it in JS since we're using any type)
      let filteredData = data || [];
      if (jobId) {
        filteredData = filteredData.filter((log: any) => log.job_id === jobId);
      }

      return filteredData as JobLog[];
    },
    enabled: !!user?.id,

    // Log so cresce enquanto ha job rodando. Fora disso, tres segundos e um
    // relogio batendo no banco para descobrir que nada mudou — e ele batia
    // assim em qualquer tela que monte este hook, o dia inteiro.
    refetchInterval: (query) => {
      const logs = (query.state.data ?? []) as JobLog[];
      const ultimo = logs[0]?.created_at;
      if (!ultimo) return 30_000;

      // Houve linha nova nos ultimos dois minutos? Entao tem job vivo.
      const minutos = (Date.now() - new Date(ultimo).getTime()) / 60_000;
      return minutos < 2 ? 3000 : 30_000;
    },
  });

  // Get recent logs for display (last 50)
  const recentLogs = logs?.slice(0, 50) || [];

  // Format log for display
  const formatLog = (log: JobLog): string => {
    const timestamp = new Date(log.created_at).toLocaleTimeString('pt-BR');
    const emoji = 
      log.level === 'success' ? '✓' :
      log.level === 'error' ? '✗' :
      log.level === 'warning' ? '⚠️' : 'ℹ️';
    return `[${timestamp}] ${emoji} ${log.message}`;
  };

  // Get log color class
  const getLogColorClass = (log: JobLog): string => {
    switch (log.level) {
      case 'success':
        return 'text-success dark:text-success';
      case 'error':
        return 'text-destructive';
      case 'warning':
        return 'text-warning dark:text-warning';
      default:
        return 'text-foreground';
    }
  };

  return {
    logs: logs || [],
    recentLogs,
    isLoading,
    refetch,
    formatLog,
    getLogColorClass,
  };
}

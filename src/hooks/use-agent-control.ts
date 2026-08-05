import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

/**
 * Controle do agente SDR por lead.
 *
 * Antes o agente respondia toda mensagem que entrava e não havia como
 * desligá-lo numa conversa específica: se ele começasse a atrapalhar um
 * negócio, a única saída era desconectar o WhatsApp inteiro.
 */
export type AgentStatus = 'active' | 'paused' | 'handoff' | 'opted_out';

export const AGENT_STATUS_LABEL: Record<AgentStatus, string> = {
  active: 'IA respondendo',
  paused: 'IA pausada',
  handoff: 'Esperando você',
  opted_out: 'Pediu para parar',
};

export const AGENT_STATUS_TONE: Record<AgentStatus, 'success' | 'muted' | 'warning' | 'danger'> = {
  active: 'success',
  paused: 'muted',
  handoff: 'warning',
  opted_out: 'danger',
};

export interface HandoffLead {
  id: string;
  business_name: string;
  phone: string;
  agent_status: AgentStatus;
  agent_paused_reason: string | null;
  agent_paused_at: string | null;
  temperature: string | null;
  stage: string | null;
  last_response_at: string | null;
}

/** Leads em que a IA saiu e um humano precisa entrar. */
export function useHandoffQueue() {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['handoff-queue', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('leads')
        .select('id, business_name, phone, agent_status, agent_paused_reason, agent_paused_at, temperature, stage, last_response_at')
        .eq('user_id', user.id)
        .eq('agent_status', 'handoff')
        .order('agent_paused_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data ?? []) as HandoffLead[];
    },
    enabled: !!user?.id,
    // Fila de espera precisa estar fresca: é cliente parado esperando resposta.
    refetchInterval: 1000 * 60,
    staleTime: 1000 * 30,
  });

  return { leads: data ?? [], isLoading, refetch };
}

export function useAgentControl() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['handoff-queue'] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  };

  const setStatus = useMutation({
    mutationFn: async ({ leadId, status }: { leadId: string; status: AgentStatus }) => {
      const { error } = await supabase
        .from('leads')
        .update({
          agent_status: status,
          agent_paused_reason: status === 'active' ? null : 'ajuste manual',
          agent_paused_at: status === 'active' ? null : new Date().toISOString(),
        })
        .eq('id', leadId);

      if (error) throw error;
      return status;
    },
    onSuccess: (status) => {
      invalidate();
      toast({
        title: status === 'active' ? 'IA reativada' : 'IA pausada',
        description: status === 'active'
          ? 'O agente volta a responder este lead.'
          : 'O agente não responde mais este lead até você reativar.',
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Não foi possível alterar', description: error.message, variant: 'destructive' });
    },
  });

  return {
    pauseAgent: (leadId: string) => setStatus.mutate({ leadId, status: 'paused' }),
    resumeAgent: (leadId: string) => setStatus.mutate({ leadId, status: 'active' }),
    /** Assume a conversa: some da fila de espera e a IA fica fora. */
    takeOver: (leadId: string) => setStatus.mutate({ leadId, status: 'paused' }),
    isUpdating: setStatus.isPending,
  };
}

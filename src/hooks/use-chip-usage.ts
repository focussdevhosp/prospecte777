import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';

/**
 * Quanto cada chip mandou hoje.
 *
 * A tela de multi-chip deixava configurar rotação sem mostrar resultado
 * nenhum — não dava para saber se ela estava funcionando, nem qual número
 * estava carregando o volume. Como a rotação existe justamente para
 * distribuir carga, sem este número ela é um botão que não se pode
 * verificar.
 */
export interface ChipUsage {
  instance_id: string;
  sent_count: number;
  failed_count: number;
}

export function useChipUsage() {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['chip-usage', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.rpc('get_chip_usage_today', {
        p_user_id: user.id,
      });
      if (error) throw error;
      return (data ?? []) as unknown as ChipUsage[];
    },
    enabled: !!user?.id,
    staleTime: 1000 * 30,
    refetchInterval: 1000 * 60,
  });

  const usage = data ?? [];
  const byInstance = new Map(usage.map((u) => [u.instance_id, u]));
  const totalSent = usage.reduce((sum, u) => sum + (u.sent_count ?? 0), 0);
  const totalFailed = usage.reduce((sum, u) => sum + (u.failed_count ?? 0), 0);

  return {
    usage,
    /** Envios de hoje de um chip específico. */
    forInstance: (instanceId: string) => byInstance.get(instanceId) ?? null,
    totalSent,
    totalFailed,
    isLoading,
    refetch,
  };
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

/**
 * Radar de Oportunidades.
 *
 * As ferramentas existentes sabem achar empresa. Nenhuma respondia a
 * pergunta seguinte: dos 800 leads que eu capturei, por qual eu começo?
 * O ranking aqui é por necessidade — quanto pior a presença digital do
 * lead, mais alto ele aparece, porque é onde há mais o que vender.
 */
export interface OpportunityLead {
  id: string;
  business_name: string;
  phone: string;
  niche: string | null;
  website: string | null;
  stage: string;
  rating: number | null;
  reviews_count: number | null;
  site_score: number;
  site_pitch: string | null;
  opportunity_score: number;
  reasons: string[];
}

export interface SiteFinding {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  impact: string;
  opportunity: string;
}

export interface SiteAudit {
  url: string | null;
  reachable: boolean;
  score: number;
  findings: SiteFinding[];
  pitch: string;
  checked_at: string;
}

export function useOpportunityRadar(limit = 50) {
  const { user } = useAuth();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['opportunity-radar', user?.id, limit],
    queryFn: async () => {
      if (!user?.id) return [];
      const { data, error } = await supabase.rpc('opportunity_radar', {
        p_user_id: user.id,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as unknown as OpportunityLead[];
    },
    enabled: !!user?.id,
    staleTime: 1000 * 60 * 2,
  });

  return { leads: data ?? [], isLoading, refetch };
}

export function useSiteAudit() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['opportunity-radar'] });
    queryClient.invalidateQueries({ queryKey: ['leads'] });
    queryClient.invalidateQueries({ queryKey: ['lead'] });
  };

  const auditOne = useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.functions.invoke('site-audit', {
        body: { action: 'audit_lead', lead_id: leadId },
      });
      if (error) throw error;
      return data as { audit: SiteAudit; business_name: string };
    },
    onSuccess: (data) => {
      invalidate();
      const count = data.audit.findings.length;
      toast({
        title: count === 0 ? 'Site sem problemas encontrados' : `${count} oportunidade${count === 1 ? '' : 's'} encontrada${count === 1 ? '' : 's'}`,
        description: count === 0
          ? 'Este lead está bem servido no digital — o argumento terá que ser outro.'
          : data.audit.pitch,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Não foi possível auditar', description: error.message, variant: 'destructive' });
    },
  });

  const auditBatch = useMutation({
    mutationFn: async (leadIds?: string[]) => {
      const { data, error } = await supabase.functions.invoke('site-audit', {
        body: { action: 'audit_batch', lead_ids: leadIds },
      });
      if (error) throw error;
      return data as { audited: number; results: unknown[] };
    },
    onSuccess: (data) => {
      invalidate();
      toast({
        title: data.audited === 0
          ? 'Nada pendente de auditoria'
          : `${data.audited} site${data.audited === 1 ? '' : 's'} analisado${data.audited === 1 ? '' : 's'}`,
        description: data.audited > 0
          ? 'A lista foi reordenada: quem tem mais problema aparece primeiro.'
          : undefined,
      });
    },
    onError: (error: Error) => {
      toast({ title: 'Falha na análise em lote', description: error.message, variant: 'destructive' });
    },
  });

  return {
    auditLead: auditOne.mutate,
    isAuditing: auditOne.isPending,
    auditBatch: auditBatch.mutate,
    isAuditingBatch: auditBatch.isPending,
  };
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Lead, LeadStage, LeadTemperature } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useEffect } from 'react';

export function useLeads(filters?: {
  stage?: LeadStage;
  temperature?: LeadTemperature;
  search?: string;
  messageSent?: boolean;
}) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: leads, isLoading, error } = useQuery({
    queryKey: ['leads', user?.id, filters],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');

      let query = supabase
        .from('leads')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (filters?.stage) {
        query = query.eq('stage', filters.stage);
      }
      if (filters?.temperature) {
        query = query.eq('temperature', filters.temperature);
      }
      if (filters?.search) {
        query = query.or(`business_name.ilike.%${filters.search}%,phone.ilike.%${filters.search}%`);
      }
      if (filters?.messageSent !== undefined) {
        query = query.eq('message_sent', filters.messageSent);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as unknown as Lead[];
    },
    enabled: !!user?.id,
  });

  // Subscribe to realtime updates for leads
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`leads-realtime-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'leads',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log('Lead realtime update:', payload.eventType);
          queryClient.invalidateQueries({ queryKey: ['leads', user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, queryClient]);

  const createLead = useMutation({
    mutationFn: async (lead: Omit<Lead, 'id' | 'user_id' | 'created_at' | 'updated_at'>) => {
      if (!user?.id) throw new Error('User not authenticated');

      const { data, error } = await supabase
        .from('leads')
        .insert({ ...lead, user_id: user.id } as never)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as Lead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', user?.id] });
      toast({
        title: 'Lead criado',
        description: 'O lead foi adicionado com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao criar lead',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const updateLead = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Lead> & { id: string }) => {
      const { data, error } = await supabase
        .from('leads')
        .update(updates as never)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as Lead;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', user?.id] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar lead',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteLead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('leads')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', user?.id] });
      toast({
        title: 'Lead excluído',
        description: 'O lead foi removido com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir lead',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const deleteLeads = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from('leads')
        .delete()
        .in('id', ids);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', user?.id] });
      toast({
        title: 'Leads excluídos',
        description: 'Os leads foram removidos com sucesso.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao excluir leads',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  /**
   * Aplica o mesmo campo a vários leads numa requisição só.
   *
   * As ações em massa da tela chamavam `updateLead` dentro de um forEach:
   * 500 leads selecionados viravam 500 PATCHes, e como cada um invalida a
   * query de leads no onSuccess, mais 500 refetches da lista inteira. Na
   * prática a aba travava e parte das atualizações se perdia.
   */
  const bulkUpdate = useMutation({
    mutationFn: async ({ ids, changes }: { ids: string[]; changes: Partial<Lead> }) => {
      if (ids.length === 0) return 0;

      const { error } = await supabase
        .from('leads')
        .update(changes as never)
        .in('id', ids);

      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['leads', user?.id] });
      toast({
        title: `${count} lead${count === 1 ? '' : 's'} atualizado${count === 1 ? '' : 's'}`,
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao atualizar leads',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  /**
   * Tags são por lead, então o valor final difere de um para outro e não
   * cabe num único UPDATE. O upsert em lote resolve numa requisição.
   */
  const bulkTag = useMutation({
    mutationFn: async ({ ids, tag, mode }: { ids: string[]; tag: string; mode: 'add' | 'remove' }) => {
      const current = (leads ?? []).filter((l) => ids.includes(l.id));

      const rows = current.map((lead) => {
        const tags = lead.tags ?? [];
        const next = mode === 'add'
          ? (tags.includes(tag) ? tags : [...tags, tag])
          : tags.filter((t) => t !== tag);
        return { id: lead.id, tags: next };
      });

      if (rows.length === 0) return 0;

      const { error } = await supabase
        .from('leads')
        .upsert(rows as never, { onConflict: 'id' });

      if (error) throw error;
      return rows.length;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads', user?.id] });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao aplicar a tag',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey: ['leads', user?.id] });

  return {
    leads: leads || [],
    isLoading,
    error,
    refetch,
    createLead: createLead.mutate,
    updateLead: updateLead.mutate,
    deleteLead: deleteLead.mutate,
    deleteLeads: deleteLeads.mutate,
    bulkUpdate: bulkUpdate.mutate,
    bulkTag: bulkTag.mutate,
    isCreating: createLead.isPending,
    isUpdating: updateLead.isPending || bulkUpdate.isPending || bulkTag.isPending,
    isDeleting: deleteLead.isPending || deleteLeads.isPending,
  };
}

export function useLead(leadId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['lead', leadId],
    queryFn: async () => {
      if (!leadId) throw new Error('Lead ID required');

      const { data, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (error) throw error;
      return data as unknown as Lead;
    },
    enabled: !!leadId && !!user?.id,
  });
}

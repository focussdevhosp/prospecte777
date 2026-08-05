import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface ServiceIntelligence {
  id: string;
  user_id: string;
  service_name: string;
  service_slug: string;
  description: string | null;
  benefits: string[] | null;
  pain_points: string[] | null;
  objection_responses: Record<string, string> | null;
  pricing_info: string | null;
  case_studies: string[] | null;
  faq: Array<{ question: string; answer: string }> | null;
  opening_templates: string[] | null;
  follow_up_templates: string[] | null;
  closing_templates: string[] | null;
  remarketing_templates: string[] | null;
  target_niches: string[] | null;
  ideal_client_profile: string | null;
  total_sent: number;
  total_responses: number;
  total_meetings: number;
  conversion_rate: number;
  created_at: string;
  updated_at: string;
}

export function useServiceIntelligence() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isGenerating, setIsGenerating] = useState(false);

  // Fetch all services
  const { data: services, isLoading, refetch } = useQuery({
    queryKey: ['service-intelligence'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_intelligence')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ServiceIntelligence[];
    },
  });

  // Generate new service intelligence
  const generateService = useMutation({
    mutationFn: async ({ serviceName, context }: { serviceName: string; context?: string }) => {
      setIsGenerating(true);
      
      const { data, error } = await supabase.functions.invoke('generate-service-intelligence', {
        body: { service_name: serviceName, context },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['service-intelligence'] });
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      
      toast({
        title: 'Serviço criado com sucesso!',
        description: data.message || 'Inteligência gerada e pronta para uso.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar serviço',
        description: error.message || 'Não foi possível gerar a inteligência.',
        variant: 'destructive',
      });
    },
    onSettled: () => {
      setIsGenerating(false);
    },
  });

  // Update service intelligence
  const updateService = useMutation({
    mutationFn: async ({ 
      serviceId, 
      updates 
    }: { 
      serviceId: string; 
      updates: Partial<ServiceIntelligence>;
    }) => {
      const { data, error } = await supabase
        .from('service_intelligence')
        .update(updates)
        .eq('id', serviceId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-intelligence'] });
      toast({
        title: 'Serviço atualizado',
        description: 'As alterações foram salvas.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete service intelligence
  const deleteService = useMutation({
    mutationFn: async (serviceId: string) => {
      const { error } = await supabase
        .from('service_intelligence')
        .delete()
        .eq('id', serviceId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['service-intelligence'] });
      toast({
        title: 'Serviço removido',
        description: 'O serviço foi excluído da base de conhecimento.',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao remover',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update service metrics (sent, responses, meetings)
  const updateMetrics = useMutation({
    mutationFn: async ({ 
      serviceSlug, 
      metric 
    }: { 
      serviceSlug: string; 
      metric: 'sent' | 'response' | 'meeting';
    }) => {
      const { data: service } = await supabase
        .from('service_intelligence')
        .select('total_sent, total_responses, total_meetings')
        .eq('service_slug', serviceSlug)
        .single();

      if (!service) return;

      const updates: {
        total_sent?: number;
        total_responses?: number;
        total_meetings?: number;
        conversion_rate?: number;
      } = {};

      if (metric === 'sent') {
        updates.total_sent = (service.total_sent || 0) + 1;
      } else if (metric === 'response') {
        updates.total_responses = (service.total_responses || 0) + 1;
      } else if (metric === 'meeting') {
        updates.total_meetings = (service.total_meetings || 0) + 1;
      }

      // Recalculate conversion rate
      const totalSent = updates.total_sent || service.total_sent || 1;
      const totalMeetings = updates.total_meetings || service.total_meetings || 0;
      updates.conversion_rate = (totalMeetings / totalSent) * 100;

      await supabase
        .from('service_intelligence')
        .update(updates)
        .eq('service_slug', serviceSlug);
    },
  });

  return {
    services,
    isLoading,
    isGenerating,
    refetch,
    generateService: generateService.mutate,
    updateService: updateService.mutate,
    deleteService: deleteService.mutate,
    updateMetrics: updateMetrics.mutate,
    isUpdating: updateService.isPending,
    isDeleting: deleteService.isPending,
  };
}

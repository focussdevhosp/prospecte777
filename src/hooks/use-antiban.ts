import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

export interface AntiBanConfig {
  id: string;
  user_id: string;
  min_delay_seconds: number;
  max_delay_seconds: number;
  warmup_enabled: boolean;
  warmup_day: number;
  warmup_start_date: string | null;
  warmup_daily_limit: number;
  warmup_increment_percent: number;
  typing_enabled: boolean;
  min_typing_seconds: number;
  max_typing_seconds: number;
  rest_pause_enabled: boolean;
  messages_before_rest: number;
  rest_duration_minutes: number;
  daily_limit: number;
  hourly_limit: number;
  blacklist_keywords: string[];
  chip_health: 'healthy' | 'warning' | 'critical' | 'banned';
  last_health_check_at: string | null;
  messages_sent_today: number;
  messages_sent_hour: number;
  last_message_sent_at: string | null;
  last_rest_at: string | null;
}

export interface MessageVariation {
  id: string;
  user_id: string;
  category: string;
  variations: string[];
  is_active: boolean;
}

export interface QueueStatus {
  total: number;
  pending?: number;
  scheduled?: number;
  typing?: number;
  sending?: number;
  sent?: number;
  failed?: number;
  cancelled?: number;
  config?: {
    chip_health: string;
    messages_sent_today: number;
    messages_sent_hour: number;
    daily_limit: number;
    hourly_limit: number;
    warmup_day: number;
  };
}

export interface ChipHealthLog {
  id: string;
  health_status: string;
  messages_sent_hour: number;
  messages_sent_day: number;
  failed_messages_hour: number;
  connection_status: string;
  risk_factors: string[];
  recommendations: string[];
  created_at: string;
}

export function useAntiBan() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch antiban config
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ['antiban-config', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('antiban_config')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching antiban config:', error);
        return null;
      }

      // Create default config if not exists
      if (!data) {
        const { data: newConfig, error: insertError } = await supabase
          .from('antiban_config')
          .insert({ user_id: user.id })
          .select()
          .single();

        if (insertError) {
          console.error('Error creating antiban config:', insertError);
          return null;
        }
        return newConfig as AntiBanConfig;
      }

      return data as AntiBanConfig;
    },
    enabled: !!user?.id,
    staleTime: 30000,
  });

  // Fetch message variations
  const { data: variations, isLoading: variationsLoading } = useQuery({
    queryKey: ['message-variations', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('message_variations')
        .select('*')
        .eq('user_id', user.id)
        .order('category');

      if (error) {
        console.error('Error fetching variations:', error);
        return [];
      }

      return data as MessageVariation[];
    },
    enabled: !!user?.id,
  });

  // Fetch queue status
  const { data: queueStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['queue-status', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase.functions.invoke('antiban-queue-processor', {
        body: { action: 'get_status', user_id: user.id },
      });

      if (error) {
        console.error('Error fetching queue status:', error);
        return null;
      }

      return data as QueueStatus;
    },
    enabled: !!user?.id,
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch health history
  const { data: healthHistory } = useQuery({
    queryKey: ['health-history', user?.id],
    queryFn: async () => {
      if (!user?.id) return [];

      const { data, error } = await supabase
        .from('chip_health_logs')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(24);

      if (error) {
        console.error('Error fetching health history:', error);
        return [];
      }

      return data as ChipHealthLog[];
    },
    enabled: !!user?.id,
  });

  // Update config mutation
  const updateConfigMutation = useMutation({
    mutationFn: async (updates: Partial<AntiBanConfig>) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('antiban_config')
        .update(updates)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['antiban-config'] });
    },
    // Estes sao os limites que protegem o chip. Salvar em silencio uma
    // alteracao que nao foi gravada e pior que nao deixar alterar: o usuario
    // afrouxa o intervalo achando que afrouxou, ou aperta achando que
    // apertou, e opera com um numero diferente do que ve na tela.
    onError: (e: Error) =>
      toast({
        title: 'As protecoes nao foram salvas',
        description: `${e.message} — os limites anteriores continuam valendo.`,
        variant: 'destructive',
      }),
  });

  // Add variation mutation
  const addVariationMutation = useMutation({
    mutationFn: async ({ category, variations: vars }: { category: string; variations: string[] }) => {
      if (!user?.id) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('message_variations')
        .insert({
          user_id: user.id,
          category,
          variations: vars,
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-variations'] });
    },
  });

  // Delete variation mutation
  const deleteVariationMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('message_variations')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['message-variations'] });
    },
  });

  // Add to queue
  const addToQueue = useCallback(async (
    items: Array<{
      phone: string;
      content: string;
      leadId?: string;
      priority?: number;
    }>
  ) => {
    if (!user?.id) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('antiban-queue-processor', {
      body: {
        action: 'add_to_queue',
        user_id: user.id,
        items,
      },
    });

    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ['queue-status'] });
    return data;
  }, [user?.id, queryClient]);

  // Start processing queue
  const startProcessing = useCallback(async (batchId?: string) => {
    if (!user?.id) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('antiban-queue-processor', {
      body: {
        action: 'process_queue',
        user_id: user.id,
        batch_id: batchId,
      },
    });

    if (error) throw error;
    return data;
  }, [user?.id]);

  // Cancel batch
  const cancelBatch = useCallback(async (batchId: string) => {
    if (!user?.id) throw new Error('Not authenticated');

    const { data, error } = await supabase.functions.invoke('antiban-queue-processor', {
      body: {
        action: 'cancel_batch',
        user_id: user.id,
        batch_id: batchId,
      },
    });

    if (error) throw error;
    queryClient.invalidateQueries({ queryKey: ['queue-status'] });
    return data;
  }, [user?.id, queryClient]);

  // Start warmup
  const startWarmup = useCallback(async () => {
    if (!user?.id) throw new Error('Not authenticated');

    await updateConfigMutation.mutateAsync({
      warmup_enabled: true,
      warmup_start_date: new Date().toISOString().split('T')[0],
      warmup_day: 1,
    });
  }, [user?.id, updateConfigMutation]);

  // Calculate current daily limit based on warmup
  const calculateCurrentLimit = useCallback(() => {
    if (!config) return 200;
    
    if (!config.warmup_enabled || !config.warmup_start_date) {
      return config.daily_limit;
    }

    const startDate = new Date(config.warmup_start_date);
    const today = new Date();
    const daysSinceStart = Math.floor(
      (today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const calculatedLimit = config.warmup_daily_limit * 
      Math.pow(1 + (config.warmup_increment_percent / 100), daysSinceStart);

    return Math.min(Math.floor(calculatedLimit), config.daily_limit);
  }, [config]);

  return {
    config,
    configLoading,
    variations,
    variationsLoading,
    queueStatus,
    healthHistory,
    updateConfig: updateConfigMutation.mutate,
    isUpdatingConfig: updateConfigMutation.isPending,
    addVariation: addVariationMutation.mutate,
    deleteVariation: deleteVariationMutation.mutate,
    addToQueue,
    startProcessing,
    cancelBatch,
    startWarmup,
    refetchStatus,
    calculateCurrentLimit,
  };
}

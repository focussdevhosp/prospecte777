import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { UserSettings, PersonalityTrait } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { Json } from '@/integrations/supabase/types';

// Helper to safely parse arrays from JSON
function parseJsonArray<T>(data: Json | null, defaultValue: T[] = []): T[] {
  if (!data) return defaultValue;
  if (Array.isArray(data)) {
    return data as unknown as T[];
  }
  return defaultValue;
}

// Helper to convert UserSettings to database format
function toDbFormat(updates: Partial<UserSettings>): Record<string, unknown> {
  const dbUpdates: Record<string, unknown> = { ...updates };
  if (updates.message_variations !== undefined) {
    dbUpdates.message_variations = updates.message_variations as unknown as Json;
  }
  if (updates.personality_traits !== undefined) {
    dbUpdates.personality_traits = updates.personality_traits as unknown as Json;
  }
  return dbUpdates;
}

// Helper to convert database result to UserSettings
function fromDbFormat(data: Record<string, unknown>): UserSettings {
  return {
    ...data,
    message_variations: parseJsonArray(data.message_variations as Json),
    personality_traits: parseJsonArray<PersonalityTrait>(data.personality_traits as Json),
    // Ensure all new fields have defaults
    agent_type: (data.agent_type as string) || 'consultivo',
    communication_style: (data.communication_style as string) || 'formal',
    response_length: (data.response_length as string) || 'medio',
    emoji_usage: (data.emoji_usage as string) || 'moderado',
    objection_handling: (data.objection_handling as string) || 'suave',
    closing_style: (data.closing_style as string) || 'consultivo',
    follow_up_tone: (data.follow_up_tone as string) || 'amigavel',
    greeting_style: (data.greeting_style as string) || 'padrao',
    value_proposition_focus: (data.value_proposition_focus as string) || 'beneficios',
    // Search API preferences
    serper_api_key: (data.serper_api_key as string) || null,
    preferred_search_api: (data.preferred_search_api as string) || 'serper',
  } as UserSettings;
}

export function useUserSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading, error, refetch } = useQuery({
    queryKey: ['user-settings', user?.id],
    queryFn: async () => {
      if (!user?.id) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error) throw error;
      return fromDbFormat(data as unknown as Record<string, unknown>);
    },
    enabled: !!user?.id,
  });

  const updateSettings = useMutation({
    mutationFn: async (updates: Partial<UserSettings>) => {
      if (!user?.id) throw new Error('User not authenticated');

      // toDbFormat devolve um mapa dinâmico (camelCase -> snake_case); o
      // cliente tipado não consegue provar que as chaves são colunas reais.
      const payload = toDbFormat(updates) as never;

      const { data, error } = await supabase
        .from('user_settings')
        .update(payload)
        .eq('user_id', user.id)
        .select()
        .single();

      if (error) throw error;
      return fromDbFormat(data as unknown as Record<string, unknown>);
    },
    onMutate: async (updates) => {
      await queryClient.cancelQueries({ queryKey: ['user-settings', user?.id] });
      const previous = queryClient.getQueryData(['user-settings', user?.id]);
      queryClient.setQueryData(['user-settings', user?.id], (old: any) => old ? { ...old, ...updates } : old);
      return { previous };
    },
    onError: (error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['user-settings', user?.id], context.previous);
      }
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings', user?.id] });
    },
  });

  return {
    settings,
    isLoading,
    error,
    refetch,
    updateSettings: updateSettings.mutate,
    isUpdating: updateSettings.isPending,
  };
}

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

export interface ABTestRow {
  id: string;
  user_id: string;
  name: string;
  niche: string | null;
  status: string;
  variant_a_template_id: string | null;
  variant_b_template_id: string | null;
  variant_a_name: string;
  variant_b_name: string;
  variant_a_content: string;
  variant_b_content: string;
  variant_a_sent: number;
  variant_b_sent: number;
  variant_a_responses: number;
  variant_b_responses: number;
  variant_a_conversions: number;
  variant_b_conversions: number;
  winner: string | null;
  confidence: number | null;
  /**
   * Qual métrica decidiu: `receita`, `conversao` ou `resposta`.
   *
   * A coluna `winner` sozinha guardava "variant_a" e mais nada. Quem abre a
   * tela três semanas depois não tinha como saber se aquilo foi decidido por
   * venda ou por curiosidade — e são conclusões muito diferentes.
   */
  decision_metric: string | null;
  decision_reason: string | null;
  min_sample_size: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useABTests() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: tests, isLoading } = useQuery({
    queryKey: ['ab-tests', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ab_tests' as any)
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as ABTestRow[];
    },
    enabled: !!user?.id,
  });

  const createTest = useMutation({
    mutationFn: async (payload: {
      name: string;
      niche: string;
      variant_a_name: string;
      variant_b_name: string;
      variant_a_content: string;
      variant_b_content: string;
      variant_a_template_id?: string;
      variant_b_template_id?: string;
    }) => {
      const { error } = await supabase.from('ab_tests' as any).insert({
        user_id: user!.id,
        ...payload,
        status: 'running',
        started_at: new Date().toISOString(),
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ab-tests'] });
      toast({ title: 'Teste A/B criado e iniciado!' });
    },
  });

  const updateTest = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ABTestRow> & { id: string }) => {
      const { error } = await supabase
        .from('ab_tests' as any)
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ab-tests'] }),
  });

  const deleteTest = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ab_tests' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ab-tests'] });
      toast({ title: 'Teste excluído' });
    },
  });

  return {
    tests: tests || [],
    isLoading,
    createTest: createTest.mutate,
    updateTest: updateTest.mutate,
    deleteTest: deleteTest.mutate,
    isCreating: createTest.isPending,
  };
}

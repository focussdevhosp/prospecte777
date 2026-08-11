import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// PERFIL IDEAL DE CLIENTE, REUTILIZÁVEL
// ============================================================
// O ICP morava só dentro da missão. Quem roda cinco campanhas parecidas
// redigitava o mesmo perfil cinco vezes — e é assim que o campo passa a ficar
// sempre vazio, levando junto a parte da qualificação que era específica
// daquele negócio.

export interface IcpProfile {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  niches: string[];
  locations: string[];
  signals: string[];
  exclusions: string[];
  min_rating: number | null;
  max_rating: number | null;
  min_reviews: number | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export type IcpProfileInput = Omit<
  IcpProfile,
  'id' | 'user_id' | 'created_at' | 'updated_at'
>;

/** O formato que `create_mission` espera. Converter num lugar só evita divergência. */
export function profileToMissionIcp(p: Pick<IcpProfile,
  'niches' | 'locations' | 'signals' | 'exclusions' | 'min_rating' | 'max_rating' | 'min_reviews'
>) {
  return {
    icp_niches: p.niches,
    icp_locations: p.locations,
    icp_signals: p.signals,
    icp_exclusions: p.exclusions,
    icp_min_rating: p.min_rating,
    icp_max_rating: p.max_rating,
    icp_min_reviews: p.min_reviews,
  };
}

export function useIcpProfiles() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['icp-profiles', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('icp_profiles')
        .select('*')
        .eq('user_id', user!.id)
        // O padrão primeiro: é o que a tela de criar missão pré-seleciona.
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as IcpProfile[];
    },
    enabled: !!user?.id,
  });

  const create = useMutation({
    mutationFn: async (input: IcpProfileInput) => {
      if (!user?.id) throw new Error('Sessão expirada.');

      const { data, error } = await supabase
        .from('icp_profiles')
        .insert({ ...input, user_id: user.id })
        .select()
        .single();

      if (error) {
        // 23505 = nome repetido. A mensagem crua do Postgres não ajuda quem
        // está olhando um formulário.
        if (error.code === '23505') {
          throw new Error('Já existe um perfil com esse nome. Escolha outro.');
        }
        throw error;
      }
      return data as IcpProfile;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['icp-profiles'] });
      toast({ title: 'Perfil salvo', description: 'Disponível na próxima missão que você criar.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Não foi possível salvar', description: e.message, variant: 'destructive' }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...changes }: Partial<IcpProfileInput> & { id: string }) => {
      const { error } = await supabase.from('icp_profiles').update(changes).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['icp-profiles'] });
      // Missão que já rodou não muda: o `icp` dela é cópia, e as notas dos
      // leads foram calculadas com a régua antiga.
      toast({
        title: 'Perfil atualizado',
        description: 'Vale para as próximas missões. As que já rodaram mantêm a régua com que foram calculadas.',
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Não foi possível atualizar', description: e.message, variant: 'destructive' }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('icp_profiles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['icp-profiles'] });
      toast({ title: 'Perfil removido' });
    },
    onError: (e: Error) =>
      toast({ title: 'Não foi possível remover', description: e.message, variant: 'destructive' }),
  });

  return {
    profiles: data ?? [],
    defaultProfile: (data ?? []).find(p => p.is_default) ?? null,
    isLoading,
    createProfile: create.mutateAsync,
    updateProfile: update.mutate,
    removeProfile: remove.mutate,
    isSaving: create.isPending || update.isPending,
  };
}

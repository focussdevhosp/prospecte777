import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// DESTINOS DE CRM
// ============================================================
// A credencial NUNCA volta para cá. A coluna `credential` tem o SELECT
// revogado de `authenticated` no banco, então nem um `select('*')` distraído
// consegue trazer o token do CRM do cliente para dentro do navegador.
//
// Isso tem uma consequência de tela que precisa ficar explícita: não dá para
// mostrar "••••1234" nem pré-preencher o campo ao editar. A tela mostra se
// existe credencial (`configurado`), e trocar exige digitar de novo. É menos
// confortável e é o comportamento certo.

export type CrmProvider = 'rd_station' | 'pipedrive' | 'hubspot' | 'webhook';

export interface CrmIntegration {
  id: string;
  provider: CrmProvider;
  active: boolean;
  config: Record<string, unknown>;
  last_ok_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  pushed_count: number;
  created_at: string;
}

export interface CrmOverviewRow {
  provider: CrmProvider;
  active: boolean;
  enviados: number;
  ja_existiam: number;
  falhas: number;
  ultimo_ok: string | null;
  ultimo_erro: string | null;
  ultimo_erro_em: string | null;
}

export const CRM_LABELS: Record<CrmProvider, { nome: string; campo: string; ajuda: string }> = {
  rd_station: {
    nome: 'RD Station',
    campo: 'Token da API',
    ajuda: 'Em Integrações → API do RD Station. Identifica contato por e-mail, então leads sem e-mail não são enviados.',
  },
  pipedrive: {
    nome: 'Pipedrive',
    campo: 'API token',
    ajuda: 'Em Configurações pessoais → API. Procura a pessoa antes de criar: se já existir, só acrescenta a nota.',
  },
  hubspot: {
    nome: 'HubSpot',
    campo: 'Private app token',
    ajuda: 'Precisa do escopo crm.objects.contacts.write. Contato que já existe lá não é sobrescrito.',
  },
  webhook: {
    nome: 'Webhook',
    campo: 'URL de destino',
    ajuda: 'Recebe um POST com o lead em JSON. Serve para qualquer CRM que os outros quatro não cobrem.',
  },
};

export function useCrmIntegrations() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: integrations, isLoading } = useQuery({
    queryKey: ['crm-integrations', user?.id],
    queryFn: async () => {
      // Colunas listadas uma a uma de propósito: `select('*')` tentaria
      // trazer `credential` e o banco recusaria a consulta inteira.
      const { data, error } = await supabase
        .from('crm_integrations')
        .select('id, provider, active, config, last_ok_at, last_error, last_error_at, pushed_count, created_at')
        .order('provider');

      if (error) throw error;
      return (data ?? []) as unknown as CrmIntegration[];
    },
    enabled: !!user?.id,
  });

  const { data: overview } = useQuery({
    queryKey: ['crm-overview', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('crm_overview');
      if (error) throw error;
      return (data ?? []) as unknown as CrmOverviewRow[];
    },
    enabled: !!user?.id,
  });

  const salvar = useMutation({
    mutationFn: async (input: { provider: CrmProvider; credential: string; active?: boolean }) => {
      if (!user?.id) throw new Error('Sessão expirada.');

      const { error } = await supabase
        .from('crm_integrations')
        .upsert(
          {
            user_id: user.id,
            provider: input.provider,
            credential: input.credential.trim(),
            active: input.active ?? true,
          },
          { onConflict: 'user_id,provider' },
        );

      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-integrations'] });
      qc.invalidateQueries({ queryKey: ['crm-overview'] });
      toast({
        title: 'Destino salvo',
        description: 'Os próximos leads qualificados vão para lá. Os anteriores não são reenviados.',
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Não foi possível salvar', description: e.message, variant: 'destructive' }),
  });

  const alternar = useMutation({
    mutationFn: async ({ provider, active }: { provider: CrmProvider; active: boolean }) => {
      const { error } = await supabase
        .from('crm_integrations')
        .update({ active })
        .eq('provider', provider);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['crm-integrations'] }),
    onError: (e: Error) =>
      toast({ title: 'Não foi possível alterar', description: e.message, variant: 'destructive' }),
  });

  const remover = useMutation({
    mutationFn: async (provider: CrmProvider) => {
      const { error } = await supabase.from('crm_integrations').delete().eq('provider', provider);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm-integrations'] });
      qc.invalidateQueries({ queryKey: ['crm-overview'] });
      toast({ title: 'Destino removido' });
    },
  });

  /** Envio avulso, para conferir a credencial sem esperar a próxima missão. */
  const testar = useMutation({
    mutationFn: async (leadId: string) => {
      const { data, error } = await supabase.functions.invoke('crm-push', {
        body: { lead_id: leadId },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data: unknown) => {
      qc.invalidateQueries({ queryKey: ['crm-overview'] });
      const r = (data as { resultados?: Array<{ provider: string; ok: boolean; message: string }> })?.resultados ?? [];
      const falhou = r.find((x) => !x.ok);

      toast(
        falhou
          ? { title: `${CRM_LABELS[falhou.provider as CrmProvider]?.nome ?? falhou.provider} recusou`, description: falhou.message, variant: 'destructive' }
          : { title: 'Lead enviado', description: r.map((x) => x.message).join(' ') || 'Sem destinos ativos.' },
      );
    },
    onError: (e: Error) =>
      toast({ title: 'O envio não completou', description: e.message, variant: 'destructive' }),
  });

  return {
    integrations: integrations ?? [],
    overview: overview ?? [],
    isLoading,
    salvar: salvar.mutate,
    alternar: alternar.mutate,
    remover: remover.mutate,
    testar: testar.mutate,
    isSaving: salvar.isPending,
    isTesting: testar.isPending,
  };
}

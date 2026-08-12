import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

// ============================================================
// MISSÕES DE PROSPECÇÃO
// ============================================================
// Toda escrita passa pela edge function `sales-orchestrator`, nunca direto
// na tabela. Os limites (horário, teto diário, parada de emergência, posse
// das ofertas) valem no servidor — se o front pudesse inserir direto, cada
// regra dessas precisaria existir duas vezes.

export type AutonomyLevel = 'manual' | 'assistido' | 'semiautonomo' | 'autonomo';
export type MissionStatus = 'draft' | 'running' | 'paused' | 'completed' | 'failed';
export type CampaignGoal =
  | 'agendar_demonstracao' | 'solicitar_orcamento'
  | 'falar_com_vendedor' | 'vender' | 'outro';

/** Os mesmos três valores do CHECK em `missions.channel`. */
export type MissionChannel = 'whatsapp' | 'email' | 'email_depois_whatsapp';

export const AUTONOMY_LABELS: Record<AutonomyLevel, { label: string; description: string }> = {
  manual: {
    label: 'Manual',
    description: 'A IA pesquisa, qualifica e escreve. Nada é enviado — tudo fica como rascunho.',
  },
  assistido: {
    label: 'Assistido',
    description: 'A IA prepara tudo e coloca na fila. Cada contato precisa da sua aprovação.',
  },
  semiautonomo: {
    label: 'Semiautônomo',
    description: 'A IA envia o que passar no Quality Gate. As respostas ficam com você.',
  },
  autonomo: {
    label: 'Autônomo',
    description: 'A IA executa a esteira inteira dentro dos limites, horários e opt-out configurados.',
  },
};

export const GOAL_LABELS: Record<CampaignGoal, string> = {
  agendar_demonstracao: 'Agendar demonstração',
  solicitar_orcamento: 'Solicitar orçamento',
  falar_com_vendedor: 'Falar com vendedor',
  vender: 'Vender',
  outro: 'Outro',
};

export interface Mission {
  id: string;
  user_id: string;
  name: string;
  segment: string | null;
  niche: string;
  city: string | null;
  state: string | null;
  region: string | null;
  keywords: string[];
  icp: Record<string, unknown>;
  target_count: number;
  offer_ids: string[];
  goal: CampaignGoal;
  channel: string;
  autonomy_level: AutonomyLevel;
  daily_limit: number;
  start_hour: number;
  end_hour: number;
  work_days_only: boolean;
  status: MissionStatus;
  paused_at: string | null;
  paused_reason: string | null;
  leads_found: number;
  leads_qualified: number;
  leads_drafted: number;
  leads_contacted: number;
  leads_replied: number;
  meetings_booked: number;
  last_run_at: string | null;
  created_at: string;
}

export interface AgentEvent {
  id: number;
  mission_id: string | null;
  lead_id: string | null;
  agent: string;
  event: string;
  summary: string;
  detail: Record<string, unknown> | null;
  level: 'info' | 'success' | 'warning' | 'error';
  created_at: string;
}

export interface QualityScores {
  personalization: number;
  relevance: number;
  naturalness: number;
  factuality: number;
  spamRisk: number;
  offerAdherence: number;
}

export interface MissionLead {
  id: string;
  mission_id: string;
  lead_id: string;
  status: string;
  score: number | null;
  temperature: string | null;
  draft_message: string | null;
  rewrite_count: number;
  qualification: {
    score: number;
    temperature: string;
    reasons: { label: string; points: number; evidence: string }[];
    disqualifiedReason: string | null;
  } | null;
  offer_match: {
    offer: { name: string } | null;
    confidence: number;
    reasons: string[];
  } | null;
  strategy: {
    angle: string;
    hook: { label: string; value: string; source: string } | null;
    rationale: string[];
  } | null;
  dossier: {
    facts: { label: string; value: string; source: string; confidence: number }[];
    hypotheses: { statement: string }[];
    observedNeeds: string[];
  } | null;
  quality: { approved: boolean; overall: number; scores: QualityScores; issues: { message: string; severity: string }[] } | null;
  error_message: string | null;
  rejected_reason: string | null;
  sent_at: string | null;
  leads: {
    id: string;
    business_name: string;
    phone: string;
    niche: string | null;
    location: string | null;
    website: string | null;
    stage: string;
    rating: number | null;
    reviews_count: number | null;
  } | null;
}

/** Chamada única ao orquestrador, com erro já legível para a tela. */
async function orchestrate<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('sales-orchestrator', {
    body: { action, ...payload },
  });

  if (error) {
    // O corpo da resposta traz a mensagem em português; o erro do transporte
    // traz só "non-2xx status code", que não ajuda ninguém.
    let detail = error.message;
    try {
      const parsed = await (error as { context?: Response }).context?.json();
      if (parsed?.error) detail = parsed.error;
    } catch {
      /* mantém a mensagem original */
    }
    throw new Error(detail);
  }

  if (data?.error) throw new Error(data.error);
  return data as T;
}

// ------------------------------------------------------------
// LISTA
// ------------------------------------------------------------

export function useMissions() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['missions', user?.id],
    queryFn: () => orchestrate<{ missions: Mission[] }>('list_missions'),
    enabled: !!user?.id,
  });

  const createMission = useMutation({
    mutationFn: (input: Record<string, unknown>) =>
      orchestrate<{ mission: Mission }>('create_mission', input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      toast({ title: 'Missão criada', description: 'Revise os limites e inicie quando quiser.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Não foi possível criar a missão', description: e.message, variant: 'destructive' }),
  });

  const startMission = useMutation({
    mutationFn: (missionId: string) => orchestrate('start_mission', { mission_id: missionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      toast({
        title: 'Missão iniciada',
        description: 'A busca roda em segundo plano. Acompanhe pelo feed.',
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Não foi possível iniciar', description: e.message, variant: 'destructive' }),
  });

  const pauseMission = useMutation({
    mutationFn: (missionId: string) => orchestrate('pause_mission', { mission_id: missionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      toast({ title: 'Missão pausada' });
    },
  });

  const resumeMission = useMutation({
    mutationFn: (missionId: string) => orchestrate('resume_mission', { mission_id: missionId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      toast({ title: 'Missão retomada' });
    },
  });

  return {
    missions: data?.missions ?? [],
    isLoading,
    error: error as Error | null,
    refetch,
    createMission,
    startMission,
    pauseMission,
    resumeMission,
  };
}

// ------------------------------------------------------------
// DETALHE
// ------------------------------------------------------------

export function useMission(missionId: string | undefined) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const query = useQuery({
    queryKey: ['mission', missionId],
    queryFn: () =>
      orchestrate<{
        mission: Mission;
        leads: MissionLead[];
        events: AgentEvent[];
        send_block_reason: string | null;
      }>('get_mission', { mission_id: missionId }),
    enabled: !!missionId,
    // Enquanto a missão trabalha, a tela precisa acompanhar. Parado, não
    // faz sentido consultar o servidor de dez em dez segundos.
    refetchInterval: (q) =>
      q.state.data?.mission?.status === 'running' ? 8_000 : false,
  });

  const runBatch = useMutation({
    mutationFn: () =>
      orchestrate<{ processed: number; sent: number; remaining: number; done: boolean }>(
        'run_batch',
        { mission_id: missionId },
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['mission', missionId] });
      queryClient.invalidateQueries({ queryKey: ['missions'] });
      toast({
        title: result.processed > 0 ? `${result.processed} lead(s) processado(s)` : 'Nada pendente',
        description: result.processed > 0
          ? `${result.sent} enviado(s) · ${result.remaining} na fila.`
          : 'Todos os leads desta missão já passaram pela esteira.',
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Falha ao processar o lote', description: e.message, variant: 'destructive' }),
  });

  const approveDraft = useMutation({
    mutationFn: (params: { id: string; message?: string }) =>
      orchestrate('approve_draft', { mission_lead_id: params.id, message: params.message }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission', missionId] });
      toast({ title: 'Mensagem enviada' });
    },
    onError: (e: Error) =>
      toast({ title: 'Não foi possível enviar', description: e.message, variant: 'destructive' }),
  });

  const rejectDraft = useMutation({
    mutationFn: (params: { id: string; reason?: string }) =>
      orchestrate('reject_draft', { mission_lead_id: params.id, reason: params.reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission', missionId] });
      toast({ title: 'Rascunho recusado' });
    },
  });

  /**
   * Recoloca na fila um lead que esgotou as tentativas de envio.
   *
   * O rascunho continua gravado e aprovado; o que faltava era o caminho de
   * volta pela interface.
   */
  const retryLead = useMutation({
    mutationFn: (missionLeadId: string) =>
      orchestrate('retry_lead', { mission_lead_id: missionLeadId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mission', missionId] });
      toast({
        title: 'De volta à fila',
        description: 'Sai no próximo lote, respeitando horário e limite diário.',
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Não foi possível recolocar na fila', description: e.message, variant: 'destructive' }),
  });

  return {
    mission: query.data?.mission,
    leads: query.data?.leads ?? [],
    events: query.data?.events ?? [],
    sendBlockReason: query.data?.send_block_reason ?? null,
    isLoading: query.isLoading,
    error: query.error as Error | null,
    runBatch,
    approveDraft,
    rejectDraft,
    retryLead,
  };
}

// ------------------------------------------------------------
// PAINEL OPERACIONAL E FREIO GLOBAL
// ------------------------------------------------------------

export interface CommandCenterMetrics {
  found_today: number;
  qualified_today: number;
  contacted_today: number;
  replied_today: number;
  meetings_today: number;
  awaiting_approval: number;
  awaiting_reply: number;
  overdue_followups: number;
  hot_leads: number;
  handoffs_pending: number;
  paused_missions: number;
  automation_errors: number;
  outbound_paused: boolean;
  ai_cost_today: number;
}

export function useCommandCenter() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['command-center', user?.id],
    queryFn: () => orchestrate<{ metrics: CommandCenterMetrics }>('command_center'),
    enabled: !!user?.id,
    refetchInterval: 60_000,
  });

  const emergencyStop = useMutation({
    mutationFn: (reason?: string) => orchestrate('emergency_stop', { reason }),
    onSuccess: (result: { paused_missions?: number }) => {
      queryClient.invalidateQueries();
      toast({
        title: 'Prospecção parada',
        description: `${result.paused_missions ?? 0} missão(ões) pausada(s). Nenhum envio sai até você retomar.`,
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Falha ao parar', description: e.message, variant: 'destructive' }),
  });

  const resumeOutbound = useMutation({
    mutationFn: () => orchestrate('resume_outbound'),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast({ title: 'Envios retomados', description: 'Retome cada missão individualmente.' });
    },
  });

  return { metrics: data?.metrics, isLoading, emergencyStop, resumeOutbound };
}

/** Feed global — todas as missões. */
export function useActivityFeed(limit = 50) {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['activity-feed', user?.id, limit],
    queryFn: () => orchestrate<{ events: AgentEvent[] }>('activity_feed', { limit }),
    enabled: !!user?.id,
    refetchInterval: 15_000,
  });

  return { events: data?.events ?? [], isLoading };
}

/** Catálogo de ofertas — alimenta o seletor de produtos da missão. */
export function useOffers() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['offers', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_intelligence')
        .select('id, service_name, description, target_niches, pricing_info')
        .eq('user_id', user!.id)
        .order('service_name');

      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  return { offers: data ?? [], isLoading };
}

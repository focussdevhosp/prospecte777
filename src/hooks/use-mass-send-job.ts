import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

export interface MassSendLead {
  id: string;
  business_name: string;
  phone: string;
  niche?: string;
  location?: string;
  rating?: number;
  reviews_count?: number;
  suggestedMessage?: string;
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'skipped';
  error_message?: string;
}

export interface MassSendJob {
  id: string;
  user_id: string;
  job_type: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  payload: {
    leads: MassSendLead[];
    message_template?: string;
    use_ai_personalization?: boolean;
    direct_ai_mode?: boolean;
    agent_settings?: Record<string, any>;
    prospecting_type?: string;
    service_to_offer?: string;
  };
  total_items: number;
  processed_items: number;
  /** Sairam de verdade. `processed_items` conta tentativa, inclusive a barrada. */
  sent_items?: number;
  /** O portao de qualidade recusou. Nao e falha. */
  skipped_items?: number;
  failed_items: number;
  current_index: number;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

// Format phone number for WhatsApp Brazil
export function formatPhoneForWhatsApp(phone: string): string {
  // Remove all non-digits
  let cleaned = phone.replace(/\D/g, '');
  
  // If empty, return as is
  if (!cleaned) return phone;
  
  // If starts with +, remove it (already handled by replace above)
  
  // Brazilian numbers should be: 55 + DDD (2 digits) + 9 + number (8 digits) = 13 digits
  // Or for landlines: 55 + DDD (2 digits) + number (8 digits) = 12 digits
  
  // If already has country code 55 and correct length
  if (cleaned.startsWith('55') && (cleaned.length === 12 || cleaned.length === 13)) {
    // Ensure mobile numbers have the 9
    if (cleaned.length === 12) {
      // Check if it's a mobile number that needs the 9
      const ddd = cleaned.substring(2, 4);
      const number = cleaned.substring(4);
      // Mobile numbers in Brazil now all have 9 digits (starting with 9)
      if (!number.startsWith('9') && number.length === 8) {
        // Add the 9 for mobile
        cleaned = `55${ddd}9${number}`;
      }
    }
    return cleaned;
  }
  
  // If has 11 digits (DDD + 9 + 8 digits) - add country code
  if (cleaned.length === 11) {
    return `55${cleaned}`;
  }
  
  // If has 10 digits (DDD + 8 digits) - add country code and maybe the 9
  if (cleaned.length === 10) {
    const ddd = cleaned.substring(0, 2);
    const number = cleaned.substring(2);
    // Add 9 for mobile numbers
    if (!number.startsWith('9')) {
      return `55${ddd}9${number}`;
    }
    return `55${cleaned}`;
  }
  
  // If has 9 digits (9 + 8 digits, missing DDD)
  if (cleaned.length === 9 && cleaned.startsWith('9')) {
    // Can't determine DDD, return as is
    return cleaned;
  }
  
  // If has 8 digits (just the number)
  if (cleaned.length === 8) {
    // Can't determine DDD, return as is
    return cleaned;
  }
  
  // Return cleaned number
  return cleaned;
}

export function useMassSendJob() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Countdown state
  const [countdown, setCountdown] = useState<number>(0);
  const [currentLead, setCurrentLead] = useState<MassSendLead | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const skipRequestedRef = useRef(false);

  // Fetch active job for current user
  const { data: activeJob, isLoading, refetch } = useQuery({
    queryKey: ['mass-send-job', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from('background_jobs')
        .select('*')
        .eq('user_id', user.id)
        .eq('job_type', 'mass_send')
        .in('status', ['pending', 'running', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;
      
      // Parse payload safely
      return {
        ...data,
        payload: data.payload as unknown as MassSendJob['payload'],
      } as MassSendJob;
    },
    enabled: !!user?.id,

    // O intervalo depende do que esta acontecendo.
    //
    // Antes era 3000 fixo: a tela batia no banco a cada tres segundos PARA
    // SEMPRE, mesmo sem job nenhum rodando. Numa aba aberta o dia inteiro
    // isso da 1.200 consultas por hora para receber `null` 1.200 vezes.
    //
    // Com job ativo, tres segundos e o certo — a barra precisa andar. Sem
    // job, meio minuto basta: a unica coisa que a consulta descobriria e que
    // um disparo comecou, e disparo comeca por acao do proprio usuario nesta
    // mesma tela.
    refetchInterval: (query) => {
      const job = query.state.data as MassSendJob | null;
      return job && (job.status === 'running' || job.status === 'pending') ? 3000 : 30_000;
    },
  });

  // Create a new mass send job
  const createJob = useMutation({
    mutationFn: async ({
      leads,
      messageTemplate,
      useAIPersonalization,
      directAIMode,
      agentSettings,
      prospectingType,
      serviceToOffer,
      autoServiceMode,
      captureFilter,
    }: {
      leads: MassSendLead[];
      messageTemplate?: string;
      useAIPersonalization?: boolean;
      directAIMode?: boolean;
      agentSettings?: Record<string, any>;
      prospectingType?: string;
      serviceToOffer?: string;
      autoServiceMode?: boolean;
      captureFilter?: string;
    }) => {
      if (!user?.id) throw new Error('Usuário não autenticado');

      // Format all phone numbers
      const formattedLeads = leads.map(lead => ({
        ...lead,
        phone: formatPhoneForWhatsApp(lead.phone),
        status: 'pending' as const,
      }));

      const { data, error } = await supabase
        .from('background_jobs')
        .insert({
          user_id: user.id,
          job_type: 'mass_send',
          status: 'pending',
          payload: {
            leads: formattedLeads,
            message_template: messageTemplate,
            use_ai_personalization: useAIPersonalization,
            direct_ai_mode: directAIMode,
            agent_settings: agentSettings,
            prospecting_type: prospectingType,
            service_to_offer: serviceToOffer,
            auto_service_mode: autoServiceMode,
            capture_filter: captureFilter,
          },
          total_items: formattedLeads.length,
          processed_items: 0,
          failed_items: 0,
          current_index: 0,
        })
        .select()
        .single();

      if (error) throw error;

      // Start the job in background
      await supabase.functions.invoke('job-processor', {
        body: {
          action: 'start',
          job_id: data.id,
        },
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mass-send-job', user?.id] });
      toast({
        title: '🚀 Disparo iniciado',
        description: 'O envio continuará mesmo se você fechar a página.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao iniciar disparo',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Pause job
  const pauseJob = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from('background_jobs')
        .update({ status: 'paused' })
        .eq('id', jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mass-send-job', user?.id] });
      toast({
        title: '⏸️ Disparo pausado',
        description: 'Você pode retomar a qualquer momento.',
      });
    },
  });

  // Resume job
  const resumeJob = useMutation({
    mutationFn: async (jobId: string) => {
      await supabase.functions.invoke('job-processor', {
        body: {
          action: 'resume',
          job_id: jobId,
        },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mass-send-job', user?.id] });
      toast({
        title: '▶️ Disparo retomado',
        description: 'Continuando de onde parou.',
      });
    },
  });

  // Cancel job
  const cancelJob = useMutation({
    mutationFn: async (jobId: string) => {
      const { error } = await supabase
        .from('background_jobs')
        .update({ 
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        })
        .eq('id', jobId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mass-send-job', user?.id] });
      setCountdown(0);
      setCurrentLead(null);
      toast({
        title: '❌ Disparo cancelado',
      });
    },
  });

  // Skip to next lead (advance timer)
  const skipToNext = useMutation({
    mutationFn: async (jobId: string) => {
      skipRequestedRef.current = true;
      
      // Signal the edge function to skip
      await supabase.functions.invoke('job-processor', {
        body: {
          action: 'skip',
          job_id: jobId,
        },
      });
    },
    onSuccess: () => {
      setCountdown(0);
      queryClient.invalidateQueries({ queryKey: ['mass-send-job', user?.id] });
      toast({
        title: '⏩ Pulando para o próximo',
      });
    },
  });

  // Update countdown based on job state
  useEffect(() => {
    if (!activeJob || activeJob.status !== 'running') {
      setCountdown(0);
      setCurrentLead(null);
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
      return;
    }

    const payload = activeJob.payload as MassSendJob['payload'];
    const leads = payload.leads || [];
    const currentIndex = activeJob.current_index || 0;

    if (currentIndex < leads.length) {
      setCurrentLead(leads[currentIndex]);
    }

    // Estimate next send time based on settings (default 60-180 seconds)
    const estimatedInterval = 120; // 2 minutes average
    
    // Start countdown
    setCountdown(estimatedInterval);
    
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
    }

    countdownIntervalRef.current = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  // Depende dos CAMPOS, não do objeto. `activeJob` ganha identidade nova a
  // cada refetch, e depender dele reiniciaria a contagem regressiva a cada
  // atualização — o número na tela nunca chegaria a zero.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeJob?.id, activeJob?.status, activeJob?.current_index]);

  // Get leads from active job
  const getJobLeads = useCallback((): MassSendLead[] => {
    if (!activeJob) return [];
    const payload = activeJob.payload as MassSendJob['payload'];
    return payload.leads || [];
  }, [activeJob]);

  // Get progress percentage
  const getProgress = useCallback((): number => {
    if (!activeJob || activeJob.total_items === 0) return 0;
    return Math.round((activeJob.processed_items / activeJob.total_items) * 100);
  }, [activeJob]);

  // Format countdown for display
  const formatCountdown = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  return {
    activeJob,
    isLoading,
    refetch,
    createJob: createJob.mutate,
    pauseJob: pauseJob.mutate,
    resumeJob: resumeJob.mutate,
    cancelJob: cancelJob.mutate,
    skipToNext: skipToNext.mutate,
    isCreating: createJob.isPending,
    isPausing: pauseJob.isPending,
    isResuming: resumeJob.isPending,
    isCancelling: cancelJob.isPending,
    isSkipping: skipToNext.isPending,
    countdown,
    currentLead,
    getJobLeads,
    getProgress,
    formatCountdown,
    formatPhoneForWhatsApp,
  };
}

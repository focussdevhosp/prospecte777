import { useState, useRef, useEffect, useCallback } from 'react';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useMassSendJob, formatPhoneForWhatsApp } from '@/hooks/use-mass-send-job';
import {
  LeadCaptureForm,
  LeadResultsTable,
  LeadSendQueue,
  LeadSendProgress,
  AVAILABLE_SERVICES,
} from './capture-send';
import type { CapturedLead, ProcessStatus, ProgressInfo } from './capture-send';

export function CaptureAndSendTab() {
  const { settings } = useUserSettings();
  const { user } = useAuth();
  const { toast } = useToast();
  const { createJob, isCreating, activeJob } = useMassSendJob();

  const [selectedNiches, setSelectedNiches] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [capturedLeads, setCapturedLeads] = useState<CapturedLead[]>([]);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [processStatus, setProcessStatus] = useState<ProcessStatus>('idle');
  const [progress, setProgress] = useState<ProgressInfo>({ current: 0, total: 0, phase: '' });
  const [autoSave] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [selectedService, setSelectedService] = useState<string>('auto');
  const [captureFilter, setCaptureFilter] = useState<string>('all');
  const [leadQuantity, setLeadQuantity] = useState(500);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [foundCount, setFoundCount] = useState(0);

  const isStoppedRef = useRef(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Timer for elapsed time
  useEffect(() => {
    if (processStatus === 'capturing') {
      setElapsedTime(0);
      timerRef.current = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [processStatus]);

  // Stats
  const totalResults = capturedLeads.length;
  const newCount = capturedLeads.filter(l => !l.isDuplicate && l.status === 'pending').length;
  const duplicateCount = capturedLeads.filter(l => l.isDuplicate).length;

  const calculateQualityScore = (lead: any): number => {
    let score = 50;
    if (lead.rating >= 4.5) score += 20;
    else if (lead.rating >= 4.0) score += 15;
    else if (lead.rating >= 3.5) score += 10;
    if (lead.reviews_count >= 100) score += 15;
    else if (lead.reviews_count >= 50) score += 10;
    else if (lead.reviews_count >= 20) score += 5;
    if (!lead.website) score += 10;
    if (lead.address) score += 5;
    return Math.min(100, score);
  };

  // Valida telefone brasileiro (10-11 dígitos, DDD válido 11-99)
  const isValidBrazilianPhone = (raw: string): boolean => {
    const digits = raw.replace(/\D/g, '').replace(/^55/, '');
    if (digits.length < 10 || digits.length > 11) return false;
    const ddd = parseInt(digits.slice(0, 2), 10);
    if (ddd < 11 || ddd > 99) return false;
    // rejeita sequências óbvias (0000000000, 1111111111)
    if (/^(\d)\1+$/.test(digits)) return false;
    return true;
  };

  const normalizePhone = (raw: string): string => raw.replace(/\D/g, '').replace(/^55/, '');

  const checkDuplicatesInDatabase = async (leads: CapturedLead[]): Promise<CapturedLead[]> => {
    if (!user?.id || leads.length === 0) return leads;
    try {
      const { data: existingLeads } = await supabase
        .from('leads')
        .select('phone')
        .eq('user_id', user.id);
      if (!existingLeads) return leads;
      const existingPhones = new Set(existingLeads.map(l => normalizePhone(l.phone)));
      return leads.map(lead => ({
        ...lead,
        isDuplicate: existingPhones.has(normalizePhone(lead.phone)),
      }));
    } catch {
      return leads;
    }
  };


  const qualifyLeadsWithAI = async (leads: CapturedLead[]): Promise<CapturedLead[]> => {
    if (leads.length === 0) return leads;
    try {
      const response = await supabase.functions.invoke('ai-prospecting', {
        body: {
          action: 'qualify_leads_by_group',
          data: {
            leads: leads.map(l => ({
              id: l.id,
              business_name: l.business_name,
              website: l.website,
              rating: l.rating,
              reviews_count: l.reviews_count,
              niche: l.niche,
            })),
          },
        },
      });
      if (response.data?.qualified_leads) {
        const qualifiedMap = new Map(
          response.data.qualified_leads.map((q: any) => [q.id, q])
        );
        return leads.map(lead => {
          const qualification = qualifiedMap.get(lead.id) as any;
          if (qualification) {
            return {
              ...lead,
              lead_group: qualification.lead_group,
              service_opportunities: qualification.service_opportunities,
            };
          }
          return lead;
        });
      }
      return leads;
    } catch {
      return leads.map(lead => {
        let group = 'Novo';
        const opportunities: string[] = [];
        if (!lead.website) {
          group = 'Sem Site';
          opportunities.push('Criação de Site');
        } else if (lead.rating && lead.rating < 3.5) {
          group = 'Avaliação Baixa';
          opportunities.push('Marketing Digital');
        } else if (lead.reviews_count && lead.reviews_count > 50 && lead.rating && lead.rating >= 4.5) {
          group = 'Premium';
          opportunities.push('Fidelização');
        } else if (lead.reviews_count && lead.reviews_count > 50) {
          group = 'Estabelecido';
          opportunities.push('Automação');
        } else if (!lead.reviews_count || lead.reviews_count < 20) {
          group = 'Pequeno Porte';
          opportunities.push('Chatbot');
        }
        return { ...lead, lead_group: group, service_opportunities: opportunities };
      });
    }
  };

  const saveLeadsToDatabase = async (leads: CapturedLead[]) => {
    if (!user?.id) return;
    const leadsToSave = leads.map(lead => ({
      user_id: user.id,
      business_name: lead.business_name,
      phone: lead.phone,
      address: lead.address || null,
      niche: lead.niche,
      location: lead.location,
      rating: lead.rating || null,
      reviews_count: lead.reviews_count || null,
      website: lead.website || null,
      google_maps_url: lead.google_maps_url || null,
      photo_url: lead.photo_url || null,
      lead_group: lead.lead_group || null,
      service_opportunities: lead.service_opportunities || [],
      stage: 'Novo',
      temperature: 'frio',
      source: 'lead_finder',
      quality_score: lead.qualityScore || null,
    }));
    await supabase.from('leads').insert(leadsToSave);
  };

  const handleStop = useCallback(() => {
    isStoppedRef.current = true;
    toast({ title: '⏹️ Busca interrompida', description: 'Os leads já capturados foram mantidos.' });
  }, [toast]);

  const handleSearch = async () => {
    if (selectedNiches.length === 0 || selectedLocations.length === 0) {
      toast({ title: '⚠️ Preencha os campos', description: 'Selecione pelo menos um nicho e uma localização.', variant: 'destructive' });
      return;
    }
    setProcessStatus('capturing');
    isStoppedRef.current = false;
    setCapturedLeads([]);
    setSelectedLeadIds([]);
    setFoundCount(0);

    try {
      setProgress({ current: 0, total: selectedNiches.length * selectedLocations.length, phase: 'Buscando...' });
      const allLeads: CapturedLead[] = [];

      for (let ni = 0; ni < selectedNiches.length; ni++) {
        for (let li = 0; li < selectedLocations.length; li++) {
          if (isStoppedRef.current) break;
          const currentNiche = selectedNiches[ni];
          const currentLocation = selectedLocations[li];
          setProgress({
            current: ni * selectedLocations.length + li + 1,
            total: selectedNiches.length * selectedLocations.length,
            phase: `${currentNiche} em ${currentLocation}`,
          });

          const response = await supabase.functions.invoke('web-search', {
            body: {
              query: currentNiche,
              location: currentLocation,
              num_results: leadQuantity,
              search_type: 'places',
              expand_search: true,
            },
          });

          if (response.data?.results) {
            const leads = response.data.results
              .filter((result: any) => result.phone)
              .map((result: any) => ({
                id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                business_name: result.title,
                phone: result.phone,
                address: result.snippet || result.address,
                rating: result.rating,
                reviews_count: result.reviews_count,
                website: result.website || result.link,
                niche: currentNiche,
                location: currentLocation,
                google_maps_url: result.google_maps_url || (result.link?.includes('maps.google') ? result.link : undefined),
                photo_url: result.photo_url || result.thumbnail,
                status: 'pending' as const,
                qualityScore: calculateQualityScore({
                  title: result.title,
                  phone: result.phone,
                  website: result.website || result.link,
                  address: result.snippet || result.address,
                  rating: result.rating,
                  reviews_count: result.reviews_count,
                }),
              }));
            allLeads.push(...leads);
            setFoundCount(allLeads.length);
          }
        }
        if (isStoppedRef.current) break;
      }

      const uniqueLeads = allLeads.filter((lead, index, self) => {
        const normalizedPhone = lead.phone.replace(/\D/g, '');
        return index === self.findIndex(l => l.phone.replace(/\D/g, '') === normalizedPhone);
      });

      const checkedLeads = await checkDuplicatesInDatabase(uniqueLeads);
      setProgress({ current: 0, total: 1, phase: 'Qualificando leads com IA...' });
      const qualifiedLeads = await qualifyLeadsWithAI(checkedLeads);

      const sortedLeads = qualifiedLeads.sort((a, b) => {
        if (a.isDuplicate && !b.isDuplicate) return 1;
        if (!a.isDuplicate && b.isDuplicate) return -1;
        return (b.qualityScore || 0) - (a.qualityScore || 0);
      });

      setCapturedLeads(sortedLeads);

      const newLeads = sortedLeads.filter(l => !l.isDuplicate);
      if (autoSave && newLeads.length > 0 && user?.id) {
        await saveLeadsToDatabase(newLeads);
      }

      setProcessStatus('completed');

      const groups = newLeads.reduce((acc, l) => {
        const g = l.lead_group || 'Outros';
        acc[g] = (acc[g] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const groupSummary = Object.entries(groups).map(([g, c]) => `${c} ${g}`).slice(0, 3).join(', ');

      toast({ title: '✅ Busca concluída!', description: `${newLeads.length} leads novos: ${groupSummary}` });
    } catch (error: any) {
      toast({ title: '❌ Erro na busca', description: error.message, variant: 'destructive' });
      setProcessStatus('idle');
    }
    setProgress({ current: 0, total: 0, phase: '' });
  };

  const toggleLeadSelection = (id: string) => {
    setSelectedLeadIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const selectAllNew = () => {
    const newIds = capturedLeads.filter(l => !l.isDuplicate && l.status !== 'sent').map(l => l.id);
    setSelectedLeadIds(newIds);
  };

  const handleSendMessages = () => {
    if (!settings?.whatsapp_connected) {
      toast({ title: '⚠️ WhatsApp não conectado', description: 'Conecte seu WhatsApp nas configurações.', variant: 'destructive' });
      return;
    }
    const leadsToSend = capturedLeads.filter(l => selectedLeadIds.includes(l.id) && !l.isDuplicate && l.status !== 'sent');
    if (leadsToSend.length === 0) {
      toast({ title: '⚠️ Nenhum lead selecionado', description: 'Selecione leads para enviar mensagens.', variant: 'destructive' });
      return;
    }

    const isAutoMode = selectedService === 'auto';
    const serviceToOffer = (selectedService !== 'all' && selectedService !== 'auto')
      ? AVAILABLE_SERVICES.find(s => s.id === selectedService)?.label
      : null;

    createJob({
      leads: leadsToSend.map(l => ({
        id: l.id,
        business_name: l.business_name,
        phone: formatPhoneForWhatsApp(l.phone),
        niche: l.niche,
        location: l.location,
        rating: l.rating,
        reviews_count: l.reviews_count,
        website: l.website,
        has_website: !!l.website,
        status: 'pending' as const,
      })),
      directAIMode: true,
      useAIPersonalization: true,
      autoServiceMode: isAutoMode,
      captureFilter,
      agentSettings: {
        agent_name: settings?.agent_name,
        agent_persona: settings?.agent_persona,
        communication_style: settings?.communication_style,
        emoji_usage: settings?.emoji_usage,
        services_offered: serviceToOffer ? [serviceToOffer] : settings?.services_offered,
        knowledge_base: settings?.knowledge_base,
        specific_service: isAutoMode ? null : serviceToOffer,
        auto_detect_service: isAutoMode,
      },
      prospectingType: 'consultivo',
    });
    setSelectedLeadIds([]);
  };

  const handleSaveLeads = async () => {
    const newLeads = capturedLeads.filter(l => !l.isDuplicate && l.status === 'pending');
    if (newLeads.length === 0) return;
    await saveLeadsToDatabase(newLeads);
    toast({ title: '✅ Leads salvos!', description: `${newLeads.length} leads salvos no banco de dados.` });
  };
  const isSearching = processStatus === 'capturing';

  const formatElapsed = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s.toString().padStart(2, '0')}s` : `${s}s`;
  };

  return (
    <div className="space-y-6">
      <LeadSendProgress />

      {/* Sending banner */}
      {processStatus === 'capturing' && foundCount > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-primary/10 border border-primary/20 text-sm animate-fade-in">
          <span className="font-medium">✅ {foundCount} leads encontrados</span>
          <span className="text-muted-foreground">⏱️ {formatElapsed(elapsedTime)}</span>
          <span className="text-muted-foreground">🔄 Buscando mais...</span>
        </div>
      )}

      <LeadCaptureForm
        selectedNiches={selectedNiches}
        setSelectedNiches={setSelectedNiches}
        selectedLocations={selectedLocations}
        setSelectedLocations={setSelectedLocations}
        showFilters={showFilters}
        setShowFilters={setShowFilters}
        selectedService={selectedService}
        setSelectedService={setSelectedService}
        captureFilter={captureFilter}
        setCaptureFilter={setCaptureFilter}
        isSearching={isSearching}
        progress={progress}
        onSearch={handleSearch}
        onStop={handleStop}
        leadQuantity={leadQuantity}
        setLeadQuantity={setLeadQuantity}
        elapsedTime={elapsedTime}
        foundCount={foundCount}
      />

      <LeadResultsTable
        capturedLeads={capturedLeads}
        selectedLeadIds={selectedLeadIds}
        toggleLeadSelection={toggleLeadSelection}
        selectAllNew={selectAllNew}
        onSaveLeads={handleSaveLeads}
        onSendMessages={handleSendMessages}
        newCount={newCount}
        totalResults={totalResults}
        duplicateCount={duplicateCount}
        isCreating={isCreating}
        hasActiveJob={!!activeJob}
        activeJobPayload={activeJob?.payload}
        activeJobCurrentIndex={activeJob?.current_index}
        activeJobStatus={activeJob?.status}
        processStatus={processStatus}
      />

      
    </div>
  );
}

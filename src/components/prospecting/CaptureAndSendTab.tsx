import { useState, useRef, useEffect, useCallback } from 'react';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useMassSendJob, formatPhoneForWhatsApp } from '@/hooks/use-mass-send-job';
import type { MinhaLocalizacao } from '@/hooks/use-minha-localizacao';
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
  // Busca por raio em volta do usuario. Nulo = busca por cidade.
  const [centro, setCentro] = useState<(MinhaLocalizacao & { raioKm: number }) | null>(null);

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
      // Pergunta só pelos telefones desta captura, em vez de baixar a
      // carteira inteira. A leitura antiga não tinha limite e o PostgREST
      // corta em 1000: numa carteira com 1.500 leads, os 500 últimos ficavam
      // invisíveis e a duplicata passava batido — a mesma empresa abordada
      // duas vezes.
      const { data: repetidos, error } = await supabase.rpc('leads_ja_existentes', {
        p_user_id: user.id,
        p_phones: leads.map(l => l.phone),
      });

      if (error) throw error;

      const existingPhones = new Set(
        (repetidos ?? []).map((r: { phone_consultado: string }) => normalizePhone(r.phone_consultado)),
      );

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
      // 'Contato', não 'Novo'.
      //
      // O CHECK da tabela aceita seis estágios e "Novo" não é um deles, então
      // o Postgres recusava o INSERT INTEIRO — esta tela nunca conseguiu
      // salvar um lead sequer. E como o erro não era conferido, ela dizia que
      // tinha salvado.
      stage: 'Contato',
      temperature: 'frio',
      source: 'lead_finder',
      quality_score: lead.qualityScore || null,
    }));

    // `.select()` para RECEBER OS IDS DE VERDADE.
    //
    // Sem isto, a tela continuava com o id temporário que ela inventa ao
    // capturar (`Date.now()-aleatório`), e mandava ESSE id no disparo. A
    // esteira usa o id para carregar o dossiê do banco — auditoria do site,
    // memória, histórico. Com um id que não existe, ela não achava nada e
    // escrevia às cegas.
    //
    // O resultado foi medido: 25 de 27 mensagens barradas no portão de
    // qualidade por "não cita o nome da empresa" e "havia contexto e a
    // mensagem não usou nada dele", com personalização entre 13 e 37. O
    // portão estava certo; a entrada é que chegava vazia.
    const { data: salvos, error } = await supabase
      .from('leads')
      .insert(leadsToSave)
      .select('id, phone');

    // Falha aqui precisa aparecer. Buscar leads custa tempo e chamada paga;
    // deixar a pessoa acreditar que guardou o resultado é o pior desfecho —
    // ela fecha a tela e perde tudo.
    if (error) {
      toast({
        title: 'Os leads não foram salvos',
        description: error.message,
        variant: 'destructive',
      });
      throw error;
    }

    // Troca o id temporário pelo do banco, casando por telefone canônico —
    // o mesmo critério que a dedup usa. A partir daqui o disparo carrega um
    // id que a esteira consegue resolver.
    const porTelefone = new Map(
      (salvos ?? []).map((r) => [normalizePhone(r.phone), r.id]),
    );

    setCapturedLeads((atuais) =>
      atuais.map((l) => {
        const real = porTelefone.get(normalizePhone(l.phone));
        return real ? { ...l, id: real } : l;
      }),
    );

    return porTelefone;
  };

  /** O id é do banco, e não o temporário que a captura inventa. */
  const ehIdDoBanco = (id: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  const handleStop = useCallback(() => {
    isStoppedRef.current = true;
    toast({ title: '⏹️ Busca interrompida', description: 'Os leads já capturados foram mantidos.' });
  }, [toast]);

  const handleSearch = async () => {
    // Com "perto de mim" ativo, a area vem das coordenadas — exigir cidade
    // ali seria pedir duas vezes a mesma informacao, e com o campo desabilitado
    // por cima disso o botao nunca liberaria.
    if (selectedNiches.length === 0 || (selectedLocations.length === 0 && !centro)) {
      toast({
        title: '⚠️ Preencha os campos',
        description: centro
          ? 'Selecione pelo menos um nicho.'
          : 'Selecione pelo menos um nicho e uma localização.',
        variant: 'destructive',
      });
      return;
    }
    setProcessStatus('capturing');
    isStoppedRef.current = false;
    setCapturedLeads([]);
    setSelectedLeadIds([]);
    setFoundCount(0);

    try {

      // Com raio ativo ha UMA area — a sua. Sem ele, uma por cidade escolhida.
      // O nome legivel continua sendo o que vai gravado no lead: coordenada em
      // campo de endereco nao diz nada a quem abrir o CRM depois.
      const nomeDoCentro = centro?.nome ?? 'Perto de você';
      const combos: Array<{ niche: string; location: string }> = [];

      if (centro) {
        for (const n of selectedNiches) combos.push({ niche: n, location: nomeDoCentro });
      } else {
        for (const n of selectedNiches) for (const l of selectedLocations) combos.push({ niche: n, location: l });
      }

      setProgress({ current: 0, total: combos.length, phase: 'Buscando em paralelo...' });
      const streamed: CapturedLead[] = [];
      const seenPhones = new Set<string>();
      let done = 0;

      const CONCURRENCY = 3;

      const searchOne = async ({ niche, location }: { niche: string; location: string }) => {
        if (isStoppedRef.current) return;
        try {
          const response = await supabase.functions.invoke('web-search', {
            body: {
              query: niche,
              location,
              num_results: leadQuantity,
              search_type: 'places',
              expand_search: true,
              // So o cadastro de estabelecimentos sabe fazer raio. As fontes
              // de texto seguem com o nome do lugar, que vai junto acima.
              center: centro
                ? { lat: centro.lat, lng: centro.lng, raioKm: centro.raioKm }
                : undefined,
            },
          });
          const results: any[] = response.data?.results ?? [];
          const batch: CapturedLead[] = [];
          for (const result of results) {
            if (!result.phone || !isValidBrazilianPhone(result.phone)) continue;
            const norm = normalizePhone(result.phone);
            if (seenPhones.has(norm)) continue;
            seenPhones.add(norm);
            batch.push({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
              business_name: result.title,
              phone: result.phone,
              address: result.snippet || result.address,
              rating: result.rating,
              reviews_count: result.reviews_count,
              website: result.website || result.link,
              niche,
              location,
              google_maps_url: result.google_maps_url || (result.link?.includes('maps.google') ? result.link : undefined),
              photo_url: result.photo_url || result.thumbnail,
              status: 'pending' as const,
              // O servidor agora pontua com a mesma régua para todas as
              // fontes; o cálculo local vira só reserva.
              qualityScore: result.quality_score ?? calculateQualityScore({
                title: result.title,
                phone: result.phone,
                website: result.website || result.link,
                address: result.snippet || result.address,
                rating: result.rating,
                reviews_count: result.reviews_count,
              }),
            });
          }
          if (batch.length > 0) {
            streamed.push(...batch);
            // stream para UI (ordenado por qualidade)
            setCapturedLeads([...streamed].sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0)));
            setFoundCount(streamed.length);
          }
        } catch (e) {
          console.error('search combo failed', niche, location, e);
        } finally {
          done++;
          setProgress({ current: done, total: combos.length, phase: `${niche} em ${location}` });
        }
      };

      // Pool com concorrência limitada
      const queue = [...combos];
      const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
        while (queue.length > 0 && !isStoppedRef.current) {
          const next = queue.shift();
          if (!next) break;
          await searchOne(next);
        }
      });
      await Promise.all(workers);

      // Pós-processamento
      setProgress({ current: 0, total: 1, phase: 'Verificando duplicados...' });
      const checkedLeads = await checkDuplicatesInDatabase(streamed);

      setProgress({ current: 0, total: 1, phase: 'Qualificando com IA...' });
      const qualifiedLeads = await qualifyLeadsWithAI(checkedLeads);

      const sortedLeads = qualifiedLeads.sort((a, b) => {
        if (a.isDuplicate && !b.isDuplicate) return 1;
        if (!a.isDuplicate && b.isDuplicate) return -1;
        return (b.qualityScore || 0) - (a.qualityScore || 0);
      });

      setCapturedLeads(sortedLeads);

      const newLeads = sortedLeads.filter(l => !l.isDuplicate);
      if (autoSave && newLeads.length > 0 && user?.id) {
        const porTelefone = await saveLeadsToDatabase(newLeads);

        // Enriquecimento em background, com os ids DO BANCO.
        //
        // `newLeads` é o retrato de antes de salvar: os ids ali são os
        // temporários que a captura inventa. Mandá-los para o enriquecimento
        // fazia a function procurar leads que não existem e não enriquecer
        // ninguém — em silêncio, porque o `.catch` só olha erro de rede.
        //
        // É o mesmo defeito que estragava o disparo, num segundo lugar. O
        // mapa que `saveLeadsToDatabase` devolve resolve os dois.
        const toEnrich = newLeads
          .filter(l => l.website)
          .slice(0, 30)
          .map(l => porTelefone?.get(normalizePhone(l.phone)))
          .filter((id): id is string => !!id);
        if (toEnrich.length > 0) {
          supabase.functions.invoke('lead-enrichment', {
            body: { action: 'batch_enrich', lead_ids: toEnrich },
          }).catch(err => console.warn('enrichment skipped', err));
        }
      }

      setProcessStatus('completed');

      const groups = newLeads.reduce((acc, l) => {
        const g = l.lead_group || 'Outros';
        acc[g] = (acc[g] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      const groupSummary = Object.entries(groups).map(([g, c]) => `${c} ${g}`).slice(0, 3).join(', ');

      toast({
        title: '✅ Busca concluída!',
        description: `${newLeads.length} leads novos${groupSummary ? `: ${groupSummary}` : ''}`,
      });
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

  const handleSendMessages = async () => {
    if (!settings?.whatsapp_connected) {
      toast({ title: '⚠️ WhatsApp não conectado', description: 'Conecte seu WhatsApp nas configurações.', variant: 'destructive' });
      return;
    }
    let leadsToSend = capturedLeads.filter(l => selectedLeadIds.includes(l.id) && !l.isDuplicate && l.status !== 'sent');
    if (leadsToSend.length === 0) {
      toast({ title: '⚠️ Nenhum lead selecionado', description: 'Selecione leads para enviar mensagens.', variant: 'destructive' });
      return;
    }

    // GRAVA ANTES DE DISPARAR.
    //
    // Dava para disparar sem ter salvado, e o lead ia com o id temporário da
    // captura. A esteira usa o id para carregar o dossiê — auditoria do site,
    // memória, histórico — e com um id inexistente ela escrevia sem contexto
    // nenhum. O portão de qualidade barrava quase tudo, corretamente, e o
    // usuário via "enviando 20" e recebia uma mensagem só.
    const naoSalvos = leadsToSend.filter(l => !ehIdDoBanco(l.id));

    if (naoSalvos.length > 0) {
      try {
        const porTelefone = await saveLeadsToDatabase(naoSalvos);
        leadsToSend = leadsToSend.map(l =>
          ehIdDoBanco(l.id) ? l : { ...l, id: porTelefone?.get(normalizePhone(l.phone)) ?? l.id },
        );
      } catch {
        // `saveLeadsToDatabase` já avisou na tela. Não dispara sem contexto:
        // mensagem sem dossiê é mensagem genérica, e genérica é o que faz o
        // lead bloquear o número.
        return;
      }
    }

    const semId = leadsToSend.filter(l => !ehIdDoBanco(l.id));
    if (semId.length > 0) {
      toast({
        title: 'Alguns leads não puderam ser preparados',
        description: `${semId.length} lead(s) ficaram sem registro no banco e foram deixados de fora — sem isso a IA escreveria sem contexto.`,
        variant: 'destructive',
      });
      leadsToSend = leadsToSend.filter(l => ehIdDoBanco(l.id));
      if (leadsToSend.length === 0) return;
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
        centro={centro}
        setCentro={setCentro}
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

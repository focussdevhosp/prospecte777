import { useState, useMemo, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';

import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useBackgroundJobs } from '@/hooks/use-background-jobs';
import { fetchWhatsAppGroups, fetchGroupParticipants, WhatsAppGroup } from '@/lib/whatsapp';
import {
  MessageCircle,
  Users,
  Loader2,
  Upload,
  AlertCircle,
  Send,
  Save,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Briefcase,
  Search,
  CheckCircle2,
  UserPlus,
  Phone,
  Filter,
  Download,
  X,
  RefreshCw,
  Shield,
  Clock,
  Zap,
} from 'lucide-react';

const DEFAULT_SERVICES = [
  { id: 'trafego_pago', label: 'Tráfego Pago' },
  { id: 'automacao', label: 'Automação' },
  { id: 'social_media', label: 'Social Media' },
  { id: 'websites', label: 'Sites e Landing Pages' },
  { id: 'seo', label: 'SEO' },
  { id: 'design', label: 'Design Gráfico' },
  { id: 'consultoria', label: 'Consultoria' },
  { id: 'chatbot', label: 'Chatbot / IA' },
  { id: 'email_marketing', label: 'Email Marketing' },
];

interface ImportedContact {
  phone: string;
  name: string;
  groupId: string;
  groupName: string;
  selected: boolean;
  isDuplicate?: boolean;
}

interface WhatsAppGroupImportProps {
  onLeadsImported?: (count: number) => void;
  disabled?: boolean;
}

export function WhatsAppGroupImport({ onLeadsImported, disabled }: WhatsAppGroupImportProps) {
  const { toast } = useToast();
  const { settings } = useUserSettings();
  const { createJob, isCreating } = useBackgroundJobs();

  const [showModal, setShowModal] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importPhase, setImportPhase] = useState('');
  const [currentGroupIndex, setCurrentGroupIndex] = useState(0);

  const [importedContacts, setImportedContacts] = useState<ImportedContact[]>([]);
  const [selectedService, setSelectedService] = useState<string>('');
  const [customService, setCustomService] = useState('');
  const [showCustomServiceInput, setShowCustomServiceInput] = useState(false);
  const [customServices, setCustomServices] = useState<string[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  // Search/filter state
  const [groupSearchTerm, setGroupSearchTerm] = useState('');
  const [contactSearchTerm, setContactSearchTerm] = useState('');
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateCount, setDuplicateCount] = useState(0);

  const isWhatsAppConnected = settings?.whatsapp_connected && settings?.whatsapp_instance_id;

  const allServices = useMemo(() => [
    ...DEFAULT_SERVICES,
    ...customServices.map(s => ({ id: s, label: s })),
  ], [customServices]);

  // Filter groups by search
  const filteredGroups = useMemo(() => {
    if (!groupSearchTerm) return groups;
    const term = groupSearchTerm.toLowerCase();
    return groups.filter(g =>
      g.name.toLowerCase().includes(term) ||
      g.description?.toLowerCase().includes(term)
    );
  }, [groups, groupSearchTerm]);

  // Group contacts by group name with filtering
  const contactsByGroup = useMemo(() => {
    let contacts = importedContacts;
    
    if (contactSearchTerm) {
      const term = contactSearchTerm.toLowerCase();
      contacts = contacts.filter(c =>
        c.name.toLowerCase().includes(term) ||
        c.phone.includes(term) ||
        c.groupName.toLowerCase().includes(term)
      );
    }

    if (!showDuplicates) {
      contacts = contacts.filter(c => !c.isDuplicate);
    }

    const grouped: Record<string, ImportedContact[]> = {};
    contacts.forEach(c => {
      if (!grouped[c.groupName]) grouped[c.groupName] = [];
      grouped[c.groupName].push(c);
    });
    return grouped;
  }, [importedContacts, contactSearchTerm, showDuplicates]);

  const selectedContacts = importedContacts.filter(c => c.selected && !c.isDuplicate);
  const totalNew = importedContacts.filter(c => !c.isDuplicate).length;

  // Format phone for display
  const formatPhone = (phone: string) => {
    if (phone.length === 13) return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}`;
    if (phone.length === 12) return `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 8)}-${phone.slice(8)}`;
    return phone;
  };

  const handleOpenModal = async () => {
    if (!isWhatsAppConnected) {
      toast({
        title: 'WhatsApp não conectado',
        description: 'Conecte seu WhatsApp nas configurações para importar contatos de grupos.',
        variant: 'destructive',
      });
      return;
    }

    setShowModal(true);
    setIsLoadingGroups(true);
    setGroups([]);
    setSelectedGroups([]);
    setGroupSearchTerm('');

    try {
      const fetchedGroups = await fetchWhatsAppGroups(settings!.whatsapp_instance_id!);
      // Sort by member count descending
      fetchedGroups.sort((a, b) => b.memberCount - a.memberCount);
      setGroups(fetchedGroups);
    } catch (error: any) {
      toast({
        title: 'Erro ao buscar grupos',
        description: error.message || 'Não foi possível listar os grupos do WhatsApp',
        variant: 'destructive',
      });
      setShowModal(false);
    } finally {
      setIsLoadingGroups(false);
    }
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    );
  };

  const selectAllGroups = () => {
    const allIds = filteredGroups.map(g => g.id);
    const allSelected = allIds.every(id => selectedGroups.includes(id));
    setSelectedGroups(allSelected ? selectedGroups.filter(id => !allIds.includes(id)) : [...new Set([...selectedGroups, ...allIds])]);
  };

  const getTotalSelectedMembers = () => {
    return groups
      .filter(g => selectedGroups.includes(g.id))
      .reduce((sum, g) => sum + g.memberCount, 0);
  };

  const handleImportContacts = async () => {
    if (selectedGroups.length === 0) {
      toast({ title: 'Nenhum grupo selecionado', variant: 'destructive' });
      return;
    }

    setIsImporting(true);
    setImportProgress(0);
    setImportPhase('Preparando...');
    setCurrentGroupIndex(0);

    try {
      const selectedGroupNames = groups.filter(g => selectedGroups.includes(g.id));
      
      // Progress: 10% prep, 70% fetch, 20% dedup
      setImportProgress(10);
      setImportPhase(`Buscando contatos de ${selectedGroups.length} grupo(s)...`);

      const participants = await fetchGroupParticipants(
        settings!.whatsapp_instance_id!,
        selectedGroups
      );

      if (participants.length === 0) {
        toast({
          title: 'Nenhum contato encontrado',
          description: 'Os grupos selecionados não contêm participantes válidos.',
          variant: 'destructive',
        });
        setIsImporting(false);
        return;
      }

      setImportProgress(80);
      setImportPhase('Verificando duplicatas...');

      // Check duplicates
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const { data: existingLeads } = await supabase
        .from('leads')
        .select('phone')
        .eq('user_id', user.id);

      const existingPhones = new Set(
        existingLeads?.map(l => l.phone.replace(/\D/g, '')) || []
      );

      const contacts: ImportedContact[] = participants.map(p => {
        const normalizedPhone = p.phone.replace(/\D/g, '');
        return {
          phone: p.phone,
          name: p.name,
          groupId: p.groupId,
          groupName: p.groupName,
          selected: !existingPhones.has(normalizedPhone),
          isDuplicate: existingPhones.has(normalizedPhone),
        };
      });

      const dupes = contacts.filter(c => c.isDuplicate).length;
      setDuplicateCount(dupes);

      setImportProgress(100);
      setImportPhase('Concluído!');

      // Sort: new first, then duplicates
      contacts.sort((a, b) => {
        if (a.isDuplicate && !b.isDuplicate) return 1;
        if (!a.isDuplicate && b.isDuplicate) return -1;
        return a.groupName.localeCompare(b.groupName);
      });

      setImportedContacts(contacts);
      
      // Expand all groups by default
      const allGroupNames = new Set(contacts.map(c => c.groupName));
      setExpandedGroups(allGroupNames);

      const newCount = contacts.length - dupes;
      toast({
        title: '✅ Contatos importados!',
        description: `${newCount} novos contatos encontrados (${dupes} já existentes).`,
      });

      setShowModal(false);
    } catch (error: any) {
      toast({
        title: 'Erro ao buscar contatos',
        description: error.message || 'Erro ao importar contatos do WhatsApp',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      setImportProgress(0);
      setImportPhase('');
    }
  };

  const toggleContactSelection = (phone: string) => {
    setImportedContacts(prev =>
      prev.map(c => c.phone === phone && !c.isDuplicate ? { ...c, selected: !c.selected } : c)
    );
  };

  const toggleGroupContactsSelection = (groupName: string, select: boolean) => {
    setImportedContacts(prev =>
      prev.map(c => c.groupName === groupName && !c.isDuplicate ? { ...c, selected: select } : c)
    );
  };

  const selectAllContacts = (select: boolean) => {
    setImportedContacts(prev =>
      prev.map(c => c.isDuplicate ? c : { ...c, selected: select })
    );
  };

  const toggleGroupExpand = (groupName: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupName)) next.delete(groupName);
      else next.add(groupName);
      return next;
    });
  };

  const handleAddCustomService = () => {
    if (customService.trim() && !customServices.includes(customService.trim())) {
      const newService = customService.trim();
      setCustomServices(prev => [...prev, newService]);
      setSelectedService(newService);
      setCustomService('');
      setShowCustomServiceInput(false);
    }
  };

  const handleExportCSV = useCallback(() => {
    const contacts = importedContacts.filter(c => !c.isDuplicate);
    const headers = ['Nome', 'Telefone', 'Grupo'];
    const rows = contacts.map(c => [c.name, c.phone, c.groupName]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `contatos_whatsapp_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [importedContacts]);

  const handleSaveLeads = async () => {
    if (selectedContacts.length === 0) {
      toast({ title: 'Nenhum contato selecionado', variant: 'destructive' });
      return;
    }

    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const serviceLabel = allServices.find(s => s.id === selectedService)?.label || selectedService;

      const leadsToInsert = selectedContacts.map(c => ({
        user_id: user.id,
        business_name: c.name,
        phone: c.phone,
        niche: serviceLabel || c.groupName,
        stage: 'Contato' as const,
        temperature: 'frio' as const,
        source: 'whatsapp_group',
        tags: [c.groupName, serviceLabel].filter(Boolean),
        lead_group: c.groupName,
      }));

      // Insert in batches of 100
      for (let i = 0; i < leadsToInsert.length; i += 100) {
        const batch = leadsToInsert.slice(i, i + 100);
        const { error } = await supabase.from('leads').insert(batch);
        if (error) throw error;
      }

      toast({
        title: '✅ Leads salvos!',
        description: `${leadsToInsert.length} contatos salvos na base de leads.`,
      });

      onLeadsImported?.(leadsToInsert.length);
      
      // Mark saved contacts as duplicates
      setImportedContacts(prev =>
        prev.map(c => selectedContacts.some(sc => sc.phone === c.phone) 
          ? { ...c, isDuplicate: true, selected: false }
          : c
        )
      );
      setDuplicateCount(prev => prev + selectedContacts.length);
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendMessages = async () => {
    if (selectedContacts.length === 0 || !settings?.whatsapp_connected) {
      toast({ title: '⚠️ Verifique os requisitos', variant: 'destructive' });
      return;
    }

    const serviceLabel = allServices.find(s => s.id === selectedService)?.label || selectedService;

    createJob({
      job_type: 'mass_send',
      total_items: selectedContacts.length,
      priority: 7,
      payload: {
        leads: selectedContacts.map(c => ({
          id: null,
          phone: c.phone,
          business_name: c.name,
          niche: serviceLabel || c.groupName,
          location: null,
          from_whatsapp_group: true,
        })),
        message_template: null,
        use_ai_personalization: true,
        direct_ai_mode: true,
        agent_settings: {
          agent_name: settings?.agent_name,
          agent_persona: settings?.agent_persona,
          communication_style: settings?.communication_style,
          emoji_usage: settings?.emoji_usage,
          services_offered: serviceLabel ? [serviceLabel] : settings?.services_offered,
          knowledge_base: settings?.knowledge_base,
          specific_service: serviceLabel,
        },
      },
    });

    toast({
      title: '🚀 Disparo iniciado!',
      description: `Enviando mensagens para ${selectedContacts.length} contatos.`,
    });

    setImportedContacts([]);
    setSelectedService('');
  };

  const handleClearContacts = () => {
    setImportedContacts([]);
    setSelectedService('');
    setContactSearchTerm('');
    setDuplicateCount(0);
  };

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card className="border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="px-6 pt-6 pb-4 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-success/10 ring-2 ring-success/20">
                <MessageCircle className="h-5 w-5 text-success" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Extrair de Grupos WhatsApp</h3>
                <p className="text-xs text-muted-foreground">Importe contatos diretamente dos seus grupos — 100% gratuito</p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className="text-xs gap-1">
                    <Shield className="h-3 w-3" /> Sem custo de API
                  </Badge>
                  <Badge variant="outline" className="text-xs gap-1">
                    <Zap className="h-3 w-3" /> Importação instantânea
                  </Badge>
                  <Badge variant="outline" className="text-xs gap-1">
                    <UserPlus className="h-3 w-3" /> Dedup automático
                  </Badge>
                </div>
              </div>
              {isWhatsAppConnected ? (
                <Button
                  onClick={handleOpenModal}
                  disabled={disabled}
                  className="shrink-0 gap-2"
                >
                  <Users className="h-4 w-4" />
                  Selecionar Grupos
                </Button>
              ) : (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  <span>Conecte o WhatsApp primeiro</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Imported Contacts Section */}
      {importedContacts.length > 0 && (
        <Card className="border border-border/50 animate-fade-in">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-primary" />
                Contatos Extraídos
              </CardTitle>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5 h-8">
                  <Download className="h-3.5 w-3.5" />
                  CSV
                </Button>
                <Button variant="ghost" size="sm" onClick={handleClearContacts} className="h-8 text-destructive hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats Bar */}
            <div className="flex flex-wrap items-center gap-4 p-3 rounded-xl bg-muted/50 border">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span className="text-lg font-bold">{importedContacts.length}</span>
                <span className="text-xs text-muted-foreground">total</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-success" />
                <span className="font-medium text-sm">{totalNew}</span>
                <span className="text-xs text-muted-foreground">novos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-warning" />
                <span className="font-medium text-sm">{duplicateCount}</span>
                <span className="text-xs text-muted-foreground">existentes</span>
              </div>
              <div className="h-4 w-px bg-border" />
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-sm">{selectedContacts.length}</span>
                <span className="text-xs text-muted-foreground">selecionados</span>
              </div>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={contactSearchTerm}
                  onChange={(e) => setContactSearchTerm(e.target.value)}
                  placeholder="Buscar contatos..."
                  className="pl-9 h-9"
                />
                {contactSearchTerm && (
                  <button
                    onClick={() => setContactSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <Button
                variant={showDuplicates ? 'secondary' : 'outline'}
                size="sm"
                className="h-9 text-xs gap-1.5"
                onClick={() => setShowDuplicates(!showDuplicates)}
              >
                <Filter className="h-3.5 w-3.5" />
                {showDuplicates ? 'Ocultar duplicados' : 'Mostrar duplicados'}
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="h-9 text-xs"
                onClick={() => selectAllContacts(selectedContacts.length < totalNew)}
              >
                {selectedContacts.length >= totalNew ? 'Desmarcar todos' : 'Selecionar todos'}
              </Button>
            </div>

            {/* Service Selection */}
            <div className="p-4 rounded-xl border bg-muted/20 space-y-3">
              <div className="flex items-center gap-2">
                <Briefcase className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">Serviço a Oferecer</span>
                {!selectedService && selectedContacts.length > 0 && (
                  <Badge variant="outline" className="text-[10px] text-warning border-warning">Obrigatório para disparo</Badge>
                )}
              </div>

              <div className="flex gap-2">
                <Select value={selectedService} onValueChange={setSelectedService}>
                  <SelectTrigger className="flex-1 h-10">
                    <SelectValue placeholder="Selecione um serviço..." />
                  </SelectTrigger>
                  <SelectContent>
                    {allServices.map(service => (
                      <SelectItem key={service.id} value={service.id}>
                        {service.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {!showCustomServiceInput ? (
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-10 w-10"
                    onClick={() => setShowCustomServiceInput(true)}
                    title="Adicionar serviço personalizado"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Input
                      placeholder="Novo serviço..."
                      value={customService}
                      onChange={(e) => setCustomService(e.target.value)}
                      className="w-40 h-10"
                      onKeyDown={(e) => e.key === 'Enter' && handleAddCustomService()}
                      autoFocus
                    />
                    <Button size="sm" className="h-10" onClick={handleAddCustomService}>OK</Button>
                    <Button size="sm" variant="ghost" className="h-10" onClick={() => { setShowCustomServiceInput(false); setCustomService(''); }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Contacts List by Group */}
            <ScrollArea className="max-h-[400px]">
              <div className="space-y-2">
                {Object.entries(contactsByGroup).map(([groupName, contacts]) => {
                  const selectableInGroup = contacts.filter(c => !c.isDuplicate);
                  const selectedInGroup = selectableInGroup.filter(c => c.selected).length;
                  const isExpanded = expandedGroups.has(groupName);

                  return (
                    <div key={groupName} className="border rounded-xl overflow-hidden">
                      <div
                        className="flex items-center gap-3 p-3 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => toggleGroupExpand(groupName)}
                      >
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        )}
                        <Checkbox
                          checked={selectableInGroup.length > 0 && selectedInGroup === selectableInGroup.length}
                          onCheckedChange={(checked) => {
                            toggleGroupContactsSelection(groupName, !!checked);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          disabled={selectableInGroup.length === 0}
                        />
                        <MessageCircle className="h-4 w-4 text-success shrink-0" />
                        <span className="font-medium flex-1 truncate text-sm">{groupName}</span>
                        <div className="flex items-center gap-1.5">
                          {contacts.some(c => c.isDuplicate) && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-warning text-warning dark:bg-warning/30 dark:text-warning">
                              {contacts.filter(c => c.isDuplicate).length} dup
                            </Badge>
                          )}
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                            {selectedInGroup}/{selectableInGroup.length}
                          </Badge>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="divide-y divide-border/50">
                          {contacts.map(contact => (
                            <div
                              key={contact.phone}
                              className={`flex items-center gap-3 p-2.5 pl-12 hover:bg-muted/20 cursor-pointer transition-colors ${
                                contact.isDuplicate ? 'opacity-40' : ''
                              }`}
                              onClick={() => toggleContactSelection(contact.phone)}
                            >
                              <Checkbox
                                checked={contact.selected}
                                disabled={contact.isDuplicate}
                                onCheckedChange={() => toggleContactSelection(contact.phone)}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm truncate font-medium">{contact.name}</p>
                                <p className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {formatPhone(contact.phone)}
                                </p>
                              </div>
                              {contact.isDuplicate && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-warning text-warning dark:bg-warning/30 dark:text-warning">
                                  Existente
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {Object.keys(contactsByGroup).length === 0 && contactSearchTerm && (
                  <div className="text-center py-6 text-muted-foreground">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">Nenhum contato encontrado para "{contactSearchTerm}"</p>
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                className="flex-1 h-11"
                onClick={handleSaveLeads}
                disabled={selectedContacts.length === 0 || isSaving}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Salvar {selectedContacts.length} Leads
              </Button>

              <Button
                className="flex-1 h-11 gradient-primary"
                onClick={handleSendMessages}
                disabled={selectedContacts.length === 0 || isCreating || !selectedService}
              >
                {isCreating ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Disparar com IA ({selectedContacts.length})
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* WhatsApp Groups Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5 text-success" />
              Selecionar Grupos do WhatsApp
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col py-2 space-y-3">
            {isLoadingGroups ? (
              <div className="flex flex-col items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Buscando grupos...</p>
                <p className="text-xs text-muted-foreground mt-1">Isso pode levar alguns segundos</p>
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium">Nenhum grupo encontrado</p>
                <p className="text-xs mt-1">Verifique se seu WhatsApp está conectado e participa de grupos</p>
              </div>
            ) : (
              <>
                {/* Search Groups */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={groupSearchTerm}
                    onChange={(e) => setGroupSearchTerm(e.target.value)}
                    placeholder="Buscar grupos..."
                    className="pl-9 h-9"
                  />
                </div>

                {/* Select All */}
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">
                    {filteredGroups.length} grupo(s) encontrado(s)
                  </p>
                  <Button variant="ghost" size="sm" onClick={selectAllGroups} className="text-xs h-7">
                    {filteredGroups.every(g => selectedGroups.includes(g.id)) ? 'Desmarcar todos' : 'Selecionar todos'}
                  </Button>
                </div>

                {/* Groups List */}
                <ScrollArea className="flex-1 -mx-1 px-1">
                  <div className="space-y-1.5">
                    {filteredGroups.map((group) => (
                      <div
                        key={group.id}
                        className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200 ${
                          selectedGroups.includes(group.id)
                            ? 'border-primary bg-primary/5 shadow-sm'
                            : 'hover:bg-muted/50 border-border/50'
                        }`}
                        onClick={() => toggleGroupSelection(group.id)}
                      >
                        <Checkbox
                          checked={selectedGroups.includes(group.id)}
                          onCheckedChange={() => toggleGroupSelection(group.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{group.name}</p>
                          {group.description && (
                            <p className="text-xs text-muted-foreground truncate mt-0.5">
                              {group.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Users className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium tabular-nums">{group.memberCount}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </>
            )}

            {isImporting && (
              <div className="space-y-2 p-3 rounded-xl bg-muted/30 border">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate mr-2">{importPhase}</span>
                  <span className="tabular-nums">{importProgress}%</span>
                </div>
                <Progress value={importProgress} className="h-2" />
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-muted-foreground">
                {selectedGroups.length > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    {selectedGroups.length} grupo(s) · ~{getTotalSelectedMembers()} contatos
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowModal(false)}
                  disabled={isImporting}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleImportContacts}
                  disabled={selectedGroups.length === 0 || isImporting}
                  className="gap-2"
                >
                  {isImporting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Extrair Contatos
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

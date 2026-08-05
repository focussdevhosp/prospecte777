import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useCampaigns, CampaignStatus, Campaign } from '@/hooks/use-campaigns';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useLeads } from '@/hooks/use-leads';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { NicheAutocomplete } from './NicheAutocomplete';
import { LocationAutocomplete } from './LocationAutocomplete';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket,
  Play,
  Pause,
  Trash2,
  Loader2,
  MapPin,
  Building2,
  Zap,
  Users,
  Plus,
  Sparkles,
  FileText,
  UserCheck,
  Target,
  TrendingUp,
  BarChart3,
  Clock,
  CheckCircle2,
  AlertTriangle,
  MoreVertical,
  Eye,
  Copy,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const statusConfig: Record<CampaignStatus, { label: string; color: string; icon: typeof Rocket; dotColor: string }> = {
  draft: { label: 'Rascunho', color: 'bg-muted text-muted-foreground', icon: FileText, dotColor: 'bg-muted-foreground' },
  scheduled: { label: 'Agendada', color: 'bg-info/10 text-info border-info/20', icon: Clock, dotColor: 'bg-info' },
  running: { label: 'Executando', color: 'bg-success/10 text-success border-success/20', icon: Play, dotColor: 'bg-success animate-pulse' },
  paused: { label: 'Pausada', color: 'bg-warning/10 text-warning border-warning/20', icon: Pause, dotColor: 'bg-warning' },
  completed: { label: 'Concluída', color: 'bg-primary/10 text-primary border-primary/20', icon: CheckCircle2, dotColor: 'bg-primary' },
  failed: { label: 'Falhou', color: 'bg-destructive/10 text-destructive border-destructive/20', icon: AlertTriangle, dotColor: 'bg-destructive' },
};

/* ─── KPI Card ─── */
function KPICard({ icon: Icon, label, value, sub, accent }: { icon: typeof Rocket; label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn('p-2.5 rounded-xl', accent || 'bg-primary/10')}>
          <Icon className={cn('h-5 w-5', accent ? 'text-white' : 'text-primary')} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold tracking-tight leading-none">{value}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
          {sub && <p className="text-[10px] text-muted-foreground/60">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── Campaign Card ─── */
function CampaignCard({
  campaign,
  onStart,
  onPause,
  onDuplicate,
  onDelete,
}: {
  campaign: Campaign;
  onStart: () => void;
  onPause: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const status = statusConfig[campaign.status];
  const StatusIcon = status.icon;
  const leadsFound = campaign.leads_found || 0;
  const leadsContacted = campaign.leads_contacted || 0;
  const leadsResponded = campaign.leads_responded || 0;
  const responseRate = leadsContacted > 0 ? Math.round((leadsResponded / leadsContacted) * 100) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      layout
    >
      <Card className="group border-border/50 hover:border-border transition-all hover:shadow-md">
        <CardContent className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-semibold text-base truncate">{campaign.name}</h3>
                <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0 h-5 shrink-0 border', status.color)}>
                  <span className={cn('h-1.5 w-1.5 rounded-full mr-1', status.dotColor)} />
                  {status.label}
                </Badge>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  {campaign.campaign_type === 'automatic' ? (
                    <><Zap className="h-3 w-3 text-warning" /> Automática</>
                  ) : (
                    <><Users className="h-3 w-3 text-info" /> Manual</>
                  )}
                </span>
                <span>•</span>
                <span>{formatDistanceToNow(new Date(campaign.created_at), { addSuffix: true, locale: ptBR })}</span>
              </div>
            </div>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {(campaign.status === 'draft' || campaign.status === 'paused') && (
                  <DropdownMenuItem onClick={onStart} className="gap-2">
                    <Play className="h-3.5 w-3.5" /> Iniciar
                  </DropdownMenuItem>
                )}
                {campaign.status === 'running' && (
                  <DropdownMenuItem onClick={onPause} className="gap-2">
                    <Pause className="h-3.5 w-3.5" /> Pausar
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={onDuplicate} className="gap-2">
                  <Copy className="h-3.5 w-3.5" /> Duplicar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="gap-2 text-destructive focus:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" /> Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          {/* Tags */}
          <div className="flex flex-wrap gap-1.5 mb-4">
            {campaign.niches?.slice(0, 2).map((n, i) => (
              <Badge key={i} variant="secondary" className="text-[11px] font-normal gap-1 px-2 py-0.5">
                <Building2 className="h-2.5 w-2.5" /> {n}
              </Badge>
            ))}
            {(campaign.niches?.length || 0) > 2 && (
              <Badge variant="secondary" className="text-[11px] font-normal px-2 py-0.5">
                +{campaign.niches!.length - 2}
              </Badge>
            )}
            {campaign.locations?.slice(0, 2).map((l, i) => (
              <Badge key={i} variant="outline" className="text-[11px] font-normal gap-1 px-2 py-0.5">
                <MapPin className="h-2.5 w-2.5" /> {l}
              </Badge>
            ))}
            {(campaign.locations?.length || 0) > 2 && (
              <Badge variant="outline" className="text-[11px] font-normal px-2 py-0.5">
                +{campaign.locations!.length - 2}
              </Badge>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-2.5 rounded-lg bg-muted/30">
              <p className="text-lg font-bold leading-none">{leadsFound}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Encontrados</p>
            </div>
            <div className="text-center p-2.5 rounded-lg bg-muted/30">
              <p className="text-lg font-bold leading-none">{leadsContacted}</p>
              <p className="text-[10px] text-muted-foreground mt-1">Contactados</p>
            </div>
            <div className="text-center p-2.5 rounded-lg bg-muted/30">
              <p className="text-lg font-bold leading-none text-primary">{responseRate}%</p>
              <p className="text-[10px] text-muted-foreground mt-1">Resposta</p>
            </div>
          </div>

          {/* Progress bar */}
          {campaign.status === 'running' && leadsFound > 0 && (
            <div className="mt-3">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${Math.min(100, (leadsContacted / leadsFound) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1 text-right">
                {leadsContacted}/{leadsFound} processados
              </p>
            </div>
          )}

          {/* Quick Action */}
          {(campaign.status === 'draft' || campaign.status === 'paused') && (
            <Button
              onClick={onStart}
              size="sm"
              className="w-full mt-3 gap-2"
            >
              <Play className="h-3.5 w-3.5" />
              {campaign.status === 'draft' ? 'Iniciar Campanha' : 'Retomar'}
            </Button>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

/* ─── Main ─── */
export function CampaignsTab() {
  const { campaigns, isLoading, createCampaign, isCreating, updateCampaign, deleteCampaign } = useCampaigns();
  const { settings } = useUserSettings();
  const { leads } = useLeads();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [campaignTab, setCampaignTab] = useState<'automatic' | 'manual'>('automatic');
  const [niches, setNiches] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [messageTemplate, setMessageTemplate] = useState('');
  const [useAIMessage, setUseAIMessage] = useState(true);
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [leadSearch, setLeadSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | CampaignStatus>('all');

  const savedLeads = leads?.filter(l => !l.message_sent) || [];
  const filteredLeads = savedLeads.filter(l =>
    l.business_name.toLowerCase().includes(leadSearch.toLowerCase()) ||
    (l.niche || '').toLowerCase().includes(leadSearch.toLowerCase())
  );

  const filteredCampaigns = useMemo(() => {
    if (statusFilter === 'all') return campaigns;
    return campaigns.filter(c => c.status === statusFilter);
  }, [campaigns, statusFilter]);

  // KPI totals
  const kpis = useMemo(() => {
    const total = campaigns.length;
    const active = campaigns.filter(c => c.status === 'running').length;
    const totalLeads = campaigns.reduce((acc, c) => acc + (c.leads_found || 0), 0);
    const totalContacted = campaigns.reduce((acc, c) => acc + (c.leads_contacted || 0), 0);
    return { total, active, totalLeads, totalContacted };
  }, [campaigns]);

  const resetForm = () => {
    setName('');
    setCampaignTab('automatic');
    setNiches([]);
    setLocations([]);
    setMessageTemplate('');
    setUseAIMessage(true);
    setSelectedLeadIds([]);
    setLeadSearch('');
  };

  const handleCreate = () => {
    if (!name.trim()) {
      toast({ title: 'Nome obrigatório', description: 'Dê um nome para sua campanha.', variant: 'destructive' });
      return;
    }
    if (campaignTab === 'automatic' && (niches.length === 0 || locations.length === 0)) {
      toast({ title: 'Campos obrigatórios', description: 'Selecione pelo menos um nicho e uma localização.', variant: 'destructive' });
      return;
    }
    if (campaignTab === 'manual' && selectedLeadIds.length === 0) {
      toast({ title: 'Selecione leads', description: 'Escolha pelo menos um lead para a campanha manual.', variant: 'destructive' });
      return;
    }
    createCampaign({
      name: name.trim(),
      campaign_type: campaignTab,
      niches: campaignTab === 'automatic' ? niches : [],
      locations: campaignTab === 'automatic' ? locations : [],
      message_template: useAIMessage ? null : (messageTemplate.trim() || null),
      status: 'draft',
      scheduled_at: null,
      started_at: null,
      completed_at: null,
    });
    resetForm();
    setOpen(false);
  };

  const handleStartCampaign = async (campaign: Campaign) => {
    if (!settings?.whatsapp_connected) {
      toast({ title: 'WhatsApp não conectado', description: 'Conecte seu WhatsApp em Configurações antes de iniciar.', variant: 'destructive' });
      return;
    }
    updateCampaign({ id: campaign.id, status: 'running', started_at: new Date().toISOString() });
    toast({ title: '🚀 Campanha iniciada', description: 'Prospecção e envio em andamento em segundo plano.' });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Usuário não autenticado');
      
      const response = await supabase.functions.invoke('campaign-executor', {
        body: { campaign_id: campaign.id, user_id: user.id },
      });
      if (response.error) throw response.error;
      const result = response.data;
      toast({ title: '✅ Campanha concluída', description: `${result.leads_found || 0} encontrados, ${result.leads_contacted || 0} contactados!` });
    } catch (error: any) {
      updateCampaign({ id: campaign.id, status: 'failed' });
      toast({ title: 'Erro na campanha', description: error.message || 'Erro ao executar campanha', variant: 'destructive' });
    }
  };

  const handlePauseCampaign = (campaign: Campaign) => {
    updateCampaign({ id: campaign.id, status: 'paused' });
  };

  const handleDuplicate = (campaign: Campaign) => {
    createCampaign({
      name: `${campaign.name} (cópia)`,
      campaign_type: campaign.campaign_type as 'automatic' | 'manual',
      niches: campaign.niches || [],
      locations: campaign.locations || [],
      message_template: campaign.message_template,
      status: 'draft',
      scheduled_at: null,
      started_at: null,
      completed_at: null,
    });
  };

  const toggleLeadSelection = (id: string) => {
    setSelectedLeadIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };
  const selectAllLeads = () => {
    setSelectedLeadIds(prev => prev.length === filteredLeads.length ? [] : filteredLeads.map(l => l.id));
  };

  const statusTabs: { value: 'all' | CampaignStatus; label: string; count: number }[] = [
    { value: 'all', label: 'Todas', count: campaigns.length },
    { value: 'running', label: 'Ativas', count: campaigns.filter(c => c.status === 'running').length },
    { value: 'draft', label: 'Rascunhos', count: campaigns.filter(c => c.status === 'draft').length },
    { value: 'completed', label: 'Concluídas', count: campaigns.filter(c => c.status === 'completed').length },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard icon={Target} label="Total de Campanhas" value={kpis.total} />
        <KPICard icon={Zap} label="Ativas Agora" value={kpis.active} accent={kpis.active > 0 ? 'bg-success' : undefined} />
        <KPICard icon={Users} label="Leads Capturados" value={kpis.totalLeads} />
        <KPICard icon={TrendingUp} label="Leads Contactados" value={kpis.totalContacted} />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/40">
          {statusTabs.map(tab => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                statusFilter === tab.value
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className={cn(
                  'ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full',
                  statusFilter === tab.value ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'
                )}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-sm">
              <Plus className="h-4 w-4" />
              Nova Campanha
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Rocket className="h-5 w-5 text-primary" />
                Nova Campanha
              </DialogTitle>
              <DialogDescription>Configure os detalhes da sua campanha de prospecção</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Nome da Campanha</Label>
                <Input
                  placeholder="Ex: Restaurantes São Paulo"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </div>

              <Tabs value={campaignTab} onValueChange={(v) => setCampaignTab(v as 'automatic' | 'manual')}>
                <TabsList className="w-full grid grid-cols-2">
                  <TabsTrigger value="automatic" className="gap-2">
                    <Zap className="h-3.5 w-3.5" />
                    Automática
                  </TabsTrigger>
                  <TabsTrigger value="manual" className="gap-2">
                    <Users className="h-3.5 w-3.5" />
                    Manual
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="automatic" className="space-y-4 mt-4">
                  <p className="text-xs text-muted-foreground">
                    A IA captura leads automaticamente com base nos nichos e localizações selecionados.
                  </p>
                  <div className="space-y-2">
                    <Label>Nichos</Label>
                    <NicheAutocomplete value={niches} onChange={setNiches} placeholder="Selecione os nichos..." maxSelections={10} />
                  </div>
                  <div className="space-y-2">
                    <Label>Localizações</Label>
                    <LocationAutocomplete value={locations} onChange={setLocations} placeholder="Selecione as localizações..." maxSelections={10} />
                  </div>
                </TabsContent>

                <TabsContent value="manual" className="space-y-4 mt-4">
                  <p className="text-xs text-muted-foreground">
                    Selecione leads salvos para disparar mensagens manualmente.
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Leads Salvos</Label>
                      <span className="text-xs text-muted-foreground">{selectedLeadIds.length} selecionado{selectedLeadIds.length !== 1 ? 's' : ''}</span>
                    </div>
                    <Input placeholder="Buscar lead..." value={leadSearch} onChange={e => setLeadSearch(e.target.value)} />
                    {filteredLeads.length > 0 && (
                      <div className="flex items-center gap-2 mb-1">
                        <Checkbox
                          checked={selectedLeadIds.length === filteredLeads.length && filteredLeads.length > 0}
                          onCheckedChange={selectAllLeads}
                          id="select-all"
                        />
                        <label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer">
                          Selecionar todos ({filteredLeads.length})
                        </label>
                      </div>
                    )}
                    <ScrollArea className="h-48 rounded-md border">
                      {filteredLeads.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
                          <UserCheck className="h-8 w-8 mb-2 opacity-30" />
                          <p className="text-sm">Nenhum lead pendente</p>
                        </div>
                      ) : (
                        <div className="p-2 space-y-1">
                          {filteredLeads.map(lead => (
                            <label key={lead.id} className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-muted/50 cursor-pointer transition-colors">
                              <Checkbox checked={selectedLeadIds.includes(lead.id)} onCheckedChange={() => toggleLeadSelection(lead.id)} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{lead.business_name}</p>
                                <p className="text-xs text-muted-foreground truncate">{lead.niche || 'Sem nicho'} • {lead.location || 'Sem local'}</p>
                              </div>
                            </label>
                          ))}
                        </div>
                      )}
                    </ScrollArea>
                  </div>
                </TabsContent>
              </Tabs>

              {/* Message Template */}
              <div className="space-y-3 rounded-lg border border-border/50 p-3">
                <div className="flex items-center justify-between">
                  <Label className="flex items-center gap-2">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    Mensagem
                  </Label>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-medium">IA</span>
                    <Switch checked={useAIMessage} onCheckedChange={setUseAIMessage} />
                  </div>
                </div>
                {useAIMessage ? (
                  <div className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/10 px-3 py-2.5">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <p className="text-xs text-muted-foreground">
                      A IA gerará mensagens personalizadas para cada lead automaticamente.
                    </p>
                  </div>
                ) : (
                  <Textarea placeholder="Olá {nome}, vi que você atua em {nicho}..." value={messageTemplate} onChange={e => setMessageTemplate(e.target.value)} rows={3} />
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={isCreating} className="gap-2">
                {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                Criar Campanha
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Campaign Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="border-border/50">
              <CardContent className="p-5 space-y-4">
                <div className="flex justify-between">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <div className="flex gap-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <Skeleton className="h-14 rounded-lg" />
                  <Skeleton className="h-14 rounded-lg" />
                  <Skeleton className="h-14 rounded-lg" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredCampaigns.length === 0 ? (
        <Card className="border-dashed border-border/50">
          <CardContent className="py-16 text-center">
            <div className="p-4 rounded-2xl bg-primary/5 w-fit mx-auto mb-4">
              <Rocket className="h-10 w-10 text-primary/40" />
            </div>
            <h3 className="font-semibold text-lg mb-1">
              {statusFilter === 'all' ? 'Nenhuma campanha criada' : `Nenhuma campanha ${statusTabs.find(t => t.value === statusFilter)?.label.toLowerCase()}`}
            </h3>
            <p className="text-sm text-muted-foreground mb-5 max-w-sm mx-auto">
              Crie campanhas para automatizar sua prospecção e alcançar mais clientes.
            </p>
            <Button onClick={() => setOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Criar Campanha
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence mode="popLayout">
            {filteredCampaigns.map(campaign => (
              <CampaignCard
                key={campaign.id}
                campaign={campaign}
                onStart={() => handleStartCampaign(campaign)}
                onPause={() => handlePauseCampaign(campaign)}
                onDuplicate={() => handleDuplicate(campaign)}
                onDelete={() => deleteCampaign(campaign.id)}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

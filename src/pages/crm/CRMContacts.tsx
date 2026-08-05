import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger } from '@/components/ui/dropdown-menu';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useLeads } from '@/hooks/use-leads';
import { LeadStage, LeadTemperature } from '@/types/database';
import { allStages, allTemperatures, stageColors } from '@/constants/lead-icons';
import { enrichmentApi } from '@/lib/api/enrichment';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useToast } from '@/hooks/use-toast';
import {
  Search, Loader2, LayoutGrid, TableIcon, Download,
  MessageCircle, Eye, Flame, ThermometerSun, Snowflake, Trash2,
  Tag, MoreHorizontal, Move, Thermometer, Plus, X,
  ChevronDown, Users, DollarSign, TrendingUp, Filter,
  Globe, Mail, Building2, Zap, MapPin, Calendar,
} from 'lucide-react';

function hashColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 55%, 50%)`;
}

function ScoreBadge({ score }: { score: number }) {
  const cls = score <= 30 ? 'bg-destructive/10 text-destructive' : score <= 60 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success';
  return <Badge variant="outline" className={`text-xs ${cls}`}>{score}</Badge>;
}

const tempIcons: Record<LeadTemperature, React.ReactNode> = {
  quente: <Flame className="h-3 w-3 text-destructive" />,
  morno: <ThermometerSun className="h-3 w-3 text-warning" />,
  frio: <Snowflake className="h-3 w-3 text-info" />,
};

const commonTags = ['VIP', 'Urgente', 'Retorno', 'Sem Site', 'Interessado', 'Indicação', 'Recontato', 'Alto Valor'];

export default function CRMContactsPage() {
  const { leads, isLoading, deleteLeads, updateLead } = useLeads();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [tempFilter, setTempFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [scoreFilter, setScoreFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [nicheFilter, setNicheFilter] = useState<string>('all');
  const [locationFilter, setLocationFilter] = useState<string>('all');
  const [hasWebsite, setHasWebsite] = useState<string>('all');
  const [hasEmail, setHasEmail] = useState<string>('all');
  const [messageSentFilter, setMessageSentFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newTagInput, setNewTagInput] = useState('');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  // Get all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set<string>();
    leads.forEach(l => l.tags?.forEach(t => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [leads]);

  // Unique sources, niches, locations
  const allSources = useMemo(() => {
    const s = new Set<string>();
    leads.forEach(l => l.source && s.add(l.source));
    return Array.from(s).sort();
  }, [leads]);

  const allNiches = useMemo(() => {
    const s = new Set<string>();
    leads.forEach(l => l.niche && s.add(l.niche));
    return Array.from(s).sort();
  }, [leads]);

  const allLocations = useMemo(() => {
    const s = new Set<string>();
    leads.forEach(l => l.location && s.add(l.location));
    return Array.from(s).sort();
  }, [leads]);

  const activeFilterCount = [stageFilter, tempFilter, tagFilter, scoreFilter, sourceFilter, nicheFilter, locationFilter, hasWebsite, hasEmail, messageSentFilter, dateRange].filter(f => f !== 'all').length;

  const filtered = useMemo(() => {
    let result = leads;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(l => l.business_name.toLowerCase().includes(s) || l.phone.includes(s) || l.niche?.toLowerCase().includes(s) || l.email?.toLowerCase().includes(s) || l.location?.toLowerCase().includes(s));
    }
    if (stageFilter !== 'all') result = result.filter(l => l.stage === stageFilter);
    if (tempFilter !== 'all') result = result.filter(l => l.temperature === tempFilter);
    if (tagFilter !== 'all') result = result.filter(l => l.tags?.includes(tagFilter));
    if (scoreFilter !== 'all') {
      if (scoreFilter === 'high') result = result.filter(l => (l.lead_score ?? 0) >= 60);
      else if (scoreFilter === 'medium') result = result.filter(l => (l.lead_score ?? 0) >= 30 && (l.lead_score ?? 0) < 60);
      else if (scoreFilter === 'low') result = result.filter(l => (l.lead_score ?? 0) < 30);
    }
    if (sourceFilter !== 'all') result = result.filter(l => l.source === sourceFilter);
    if (nicheFilter !== 'all') result = result.filter(l => l.niche === nicheFilter);
    if (locationFilter !== 'all') result = result.filter(l => l.location === locationFilter);
    if (hasWebsite === 'yes') result = result.filter(l => !!l.website);
    else if (hasWebsite === 'no') result = result.filter(l => !l.website);
    if (hasEmail === 'yes') result = result.filter(l => !!l.email);
    else if (hasEmail === 'no') result = result.filter(l => !l.email);
    if (messageSentFilter === 'yes') result = result.filter(l => l.message_sent);
    else if (messageSentFilter === 'no') result = result.filter(l => !l.message_sent);
    if (dateRange !== 'all') {
      const now = new Date();
      let cutoff: Date;
      if (dateRange === 'today') cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (dateRange === '7d') cutoff = new Date(now.getTime() - 7 * 86400000);
      else if (dateRange === '30d') cutoff = new Date(now.getTime() - 30 * 86400000);
      else cutoff = new Date(now.getTime() - 90 * 86400000);
      result = result.filter(l => new Date(l.created_at) >= cutoff);
    }
    return result;
  }, [leads, search, stageFilter, tempFilter, tagFilter, scoreFilter, sourceFilter, nicheFilter, locationFilter, hasWebsite, hasEmail, messageSentFilter, dateRange]);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    setSelected(selected.size === filtered.length ? new Set() : new Set(filtered.map(l => l.id)));
  };

  const handleBulkDelete = () => {
    if (selected.size > 0) {
      deleteLeads(Array.from(selected));
      toast({ title: `${selected.size} lead(s) excluídos com sucesso` });
      setSelected(new Set());
    }
  };

  const handleBulkStageChange = (stage: LeadStage) => {
    selected.forEach(id => updateLead({ id, stage }));
    toast({ title: `${selected.size} leads movidos para ${stage}` });
    setSelected(new Set());
  };

  const handleBulkTempChange = (temperature: LeadTemperature) => {
    selected.forEach(id => updateLead({ id, temperature }));
    toast({ title: `Temperatura atualizada para ${selected.size} leads` });
    setSelected(new Set());
  };

  const handleBulkAddTag = (tag: string) => {
    selected.forEach(id => {
      const lead = leads.find(l => l.id === id);
      if (lead) {
        const currentTags = lead.tags || [];
        if (!currentTags.includes(tag)) {
          updateLead({ id, tags: [...currentTags, tag] });
        }
      }
    });
    toast({ title: `Tag "${tag}" adicionada a ${selected.size} leads` });
    setSelected(new Set());
  };

  const handleBulkRemoveTag = (tag: string) => {
    selected.forEach(id => {
      const lead = leads.find(l => l.id === id);
      if (lead && lead.tags?.includes(tag)) {
        updateLead({ id, tags: lead.tags.filter(t => t !== tag) });
      }
    });
    toast({ title: `Tag "${tag}" removida de ${selected.size} leads` });
    setSelected(new Set());
  };

  const handleAddTagToLead = (leadId: string, tag: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      const currentTags = lead.tags || [];
      if (!currentTags.includes(tag)) {
        updateLead({ id: leadId, tags: [...currentTags, tag] });
      }
    }
  };

  const handleRemoveTagFromLead = (leadId: string, tag: string) => {
    const lead = leads.find(l => l.id === leadId);
    if (lead) {
      updateLead({ id: leadId, tags: (lead.tags || []).filter(t => t !== tag) });
    }
  };

  const exportCSV = () => {
    const headers = ['Nome', 'Telefone', 'Email', 'Nicho', 'Estágio', 'Temperatura', 'Score', 'Tags'];
    const rows = filtered.map(l => [l.business_name, l.phone, l.email || '', l.niche || '', l.stage, l.temperature, l.lead_score, (l.tags || []).join(';')]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'contatos.csv'; a.click();
  };

  // Stats
  const totalValue = leads.reduce((s, l) => s + (l.deal_value || 0), 0);
  const hotCount = leads.filter(l => l.temperature === 'quente').length;

  return (
    <div className="p-4 sm:p-6">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/30 border border-border/30">
          <Users className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-bold">{leads.length}</p>
            <p className="text-[10px] text-muted-foreground">Total</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/30 border border-border/30">
          <Flame className="h-4 w-4 text-destructive" />
          <div>
            <p className="text-sm font-bold">{hotCount}</p>
            <p className="text-[10px] text-muted-foreground">Quentes</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/30 border border-border/30">
          <DollarSign className="h-4 w-4 text-success" />
          <div>
            <p className="text-sm font-bold">{new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' }).format(totalValue)}</p>
            <p className="text-[10px] text-muted-foreground">Pipeline</p>
          </div>
        </div>
        <div className="flex items-center gap-2 p-2.5 rounded-xl bg-muted/30 border border-border/30">
          <Tag className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-bold">{allTags.length}</p>
            <p className="text-[10px] text-muted-foreground">Tags</p>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar nome, telefone, nicho..." className="pl-9 rounded-xl h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={stageFilter} onValueChange={setStageFilter}>
          <SelectTrigger className="w-[130px] h-9 text-xs rounded-xl"><SelectValue placeholder="Estágio" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {allStages.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={tempFilter} onValueChange={setTempFilter}>
          <SelectTrigger className="w-[120px] h-9 text-xs rounded-xl"><SelectValue placeholder="Temp." /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {allTemperatures.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        {allTags.length > 0 && (
          <Select value={tagFilter} onValueChange={setTagFilter}>
            <SelectTrigger className="w-[120px] h-9 text-xs rounded-xl"><SelectValue placeholder="Tag" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {allTags.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1 border rounded-xl p-0.5">
          <Button variant={viewMode === 'table' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7 rounded-lg" onClick={() => setViewMode('table')}><TableIcon className="h-3.5 w-3.5" /></Button>
          <Button variant={viewMode === 'grid' ? 'secondary' : 'ghost'} size="icon" className="h-7 w-7 rounded-lg" onClick={() => setViewMode('grid')}><LayoutGrid className="h-3.5 w-3.5" /></Button>
        </div>
        <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs" onClick={exportCSV}><Download className="h-3.5 w-3.5 mr-1" />Exportar</Button>
        <Button
          variant={showAdvancedFilters ? 'secondary' : 'outline'}
          size="sm"
          className="h-9 rounded-xl text-xs gap-1"
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
        >
          <Filter className="h-3.5 w-3.5" />
          Filtros
          {activeFilterCount > 0 && (
            <Badge className="h-4 w-4 p-0 text-[9px] flex items-center justify-center rounded-full bg-primary text-primary-foreground">{activeFilterCount}</Badge>
          )}
        </Button>
      </div>

      {/* Advanced filters */}
      {showAdvancedFilters && (
        <div className="mb-4 p-4 rounded-xl bg-muted/20 border border-border/30 animate-fade-in space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Filtros Avançados</p>
            {activeFilterCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive"
                onClick={() => {
                  setStageFilter('all'); setTempFilter('all'); setTagFilter('all');
                  setScoreFilter('all'); setSourceFilter('all'); setNicheFilter('all');
                  setLocationFilter('all'); setHasWebsite('all'); setHasEmail('all');
                  setMessageSentFilter('all'); setDateRange('all');
                }}
              >
                <X className="h-3 w-3" /> Limpar tudo ({activeFilterCount})
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
            <Select value={scoreFilter} onValueChange={setScoreFilter}>
              <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Score" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos scores</SelectItem>
                <SelectItem value="high">🟢 Alto (60+)</SelectItem>
                <SelectItem value="medium">🟡 Médio (30-59)</SelectItem>
                <SelectItem value="low">🔴 Baixo (&lt;30)</SelectItem>
              </SelectContent>
            </Select>
            {allSources.length > 0 && (
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Fonte" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas fontes</SelectItem>
                  {allSources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {allNiches.length > 0 && (
              <Select value={nicheFilter} onValueChange={setNicheFilter}>
                <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Nicho" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos nichos</SelectItem>
                  {allNiches.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {allLocations.length > 0 && (
              <Select value={locationFilter} onValueChange={setLocationFilter}>
                <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Localização" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas localizações</SelectItem>
                  {allLocations.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Select value={hasWebsite} onValueChange={setHasWebsite}>
              <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Website" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Website: Todos</SelectItem>
                <SelectItem value="yes">✅ Com site</SelectItem>
                <SelectItem value="no">❌ Sem site</SelectItem>
              </SelectContent>
            </Select>
            <Select value={hasEmail} onValueChange={setHasEmail}>
              <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Email" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Email: Todos</SelectItem>
                <SelectItem value="yes">✅ Com email</SelectItem>
                <SelectItem value="no">❌ Sem email</SelectItem>
              </SelectContent>
            </Select>
            <Select value={messageSentFilter} onValueChange={setMessageSentFilter}>
              <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Mensagem" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Mensagem: Todos</SelectItem>
                <SelectItem value="yes">📤 Enviada</SelectItem>
                <SelectItem value="no">📭 Não enviada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dateRange} onValueChange={setDateRange}>
              <SelectTrigger className="h-8 text-xs rounded-lg"><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo período</SelectItem>
                <SelectItem value="today">Hoje</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="90d">Últimos 90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {scoreFilter !== 'all' && <Badge variant="secondary" className="gap-1 text-[10px] h-5">Score: {scoreFilter === 'high' ? 'Alto' : scoreFilter === 'medium' ? 'Médio' : 'Baixo'}<X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setScoreFilter('all')} /></Badge>}
              {sourceFilter !== 'all' && <Badge variant="secondary" className="gap-1 text-[10px] h-5">Fonte: {sourceFilter}<X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setSourceFilter('all')} /></Badge>}
              {nicheFilter !== 'all' && <Badge variant="secondary" className="gap-1 text-[10px] h-5">Nicho: {nicheFilter}<X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setNicheFilter('all')} /></Badge>}
              {locationFilter !== 'all' && <Badge variant="secondary" className="gap-1 text-[10px] h-5">Local: {locationFilter}<X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setLocationFilter('all')} /></Badge>}
              {hasWebsite !== 'all' && <Badge variant="secondary" className="gap-1 text-[10px] h-5">{hasWebsite === 'yes' ? 'Com site' : 'Sem site'}<X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setHasWebsite('all')} /></Badge>}
              {hasEmail !== 'all' && <Badge variant="secondary" className="gap-1 text-[10px] h-5">{hasEmail === 'yes' ? 'Com email' : 'Sem email'}<X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setHasEmail('all')} /></Badge>}
              {messageSentFilter !== 'all' && <Badge variant="secondary" className="gap-1 text-[10px] h-5">{messageSentFilter === 'yes' ? 'Msg enviada' : 'Msg não enviada'}<X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setMessageSentFilter('all')} /></Badge>}
              {dateRange !== 'all' && <Badge variant="secondary" className="gap-1 text-[10px] h-5">Período: {dateRange === 'today' ? 'Hoje' : dateRange === '7d' ? '7 dias' : dateRange === '30d' ? '30 dias' : '90 dias'}<X className="h-2.5 w-2.5 cursor-pointer" onClick={() => setDateRange('all')} /></Badge>}
            </div>
          )}
        </div>
      )}

      {/* Bulk actions bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 mb-3 p-3 rounded-xl bg-primary/5 border border-primary/20 animate-scale-in">
          <Badge className="bg-primary text-primary-foreground">{selected.size} selecionados</Badge>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 rounded-lg">
                <Move className="h-3 w-3" />Mover
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {allStages.map(s => (
                <DropdownMenuItem key={s} onClick={() => handleBulkStageChange(s)}>{s}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 rounded-lg">
                <Thermometer className="h-3 w-3" />Temperatura
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleBulkTempChange('quente')}>🔥 Quente</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleBulkTempChange('morno')}>🌡️ Morno</DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleBulkTempChange('frio')}>❄️ Frio</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1 rounded-lg">
                <Tag className="h-3 w-3" />Tags
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><Plus className="h-3 w-3 mr-2" />Adicionar tag</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {commonTags.map(t => (
                    <DropdownMenuItem key={t} onClick={() => handleBulkAddTag(t)}>{t}</DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {allTags.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger><X className="h-3 w-3 mr-2" />Remover tag</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {allTags.map(t => (
                      <DropdownMenuItem key={t} onClick={() => handleBulkRemoveTag(t)}>{t}</DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1" />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="destructive" size="sm" className="h-7 text-xs rounded-lg" disabled={selected.size === 0}>
                <Trash2 className="h-3 w-3 mr-1" />Excluir ({selected.size})
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Excluir {selected.size} lead(s)?</AlertDialogTitle>
                <AlertDialogDescription>
                  Esta ação não pode ser desfeita. Os leads serão removidos permanentemente da sua base.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkDelete} className="bg-destructive hover:bg-destructive/90">
                  Sim, excluir
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg" onClick={() => setSelected(new Set())}>
            Cancelar
          </Button>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-3 rounded-xl border border-border/30" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="h-9 w-9 rounded-full bg-muted animate-pulse" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-muted animate-pulse rounded-md w-40" />
                <div className="h-3 bg-muted animate-pulse rounded-md w-24 opacity-60" />
              </div>
              <div className="h-6 w-16 bg-muted animate-pulse rounded-full" />
              <div className="h-6 w-12 bg-muted animate-pulse rounded-full" />
            </div>
          ))}
        </div>
      ) : viewMode === 'table' ? (
        <Card className="border-border/50">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={selected.size === filtered.length && filtered.length > 0} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Telefone</TableHead>
                  <TableHead>Estágio</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Info</TableHead>
                  <TableHead>Temp.</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Último contato</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(lead => (
                  <TableRow key={lead.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/crm/contacts/${lead.id}`)}>
                    <TableCell onClick={e => e.stopPropagation()}><Checkbox checked={selected.has(lead.id)} onCheckedChange={() => toggleSelect(lead.id)} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ backgroundColor: hashColor(lead.business_name) }}>
                          {lead.business_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium text-sm">{lead.business_name}</p>
                          <p className="text-xs text-muted-foreground">{lead.niche || '—'}</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{lead.phone}</TableCell>
                    <TableCell><Badge className={`${stageColors[lead.stage]} text-white text-xs`}>{lead.stage}</Badge></TableCell>
                    <TableCell><ScoreBadge score={lead.lead_score} /></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {lead.website && (
                          <img
                            src={enrichmentApi.getLogoUrl(lead.website)}
                            alt=""
                            className="h-4 w-4 rounded-sm object-contain"
                            onError={(e) => { e.currentTarget.style.display = 'none'; }}
                          />
                        )}
                        {lead.website && <Globe className="h-3 w-3 text-success" />}
                        {lead.email && <Mail className="h-3 w-3 text-success" />}
                      </div>
                    </TableCell>
                    <TableCell><div className="flex items-center gap-1">{tempIcons[lead.temperature]}<span className="text-xs capitalize">{lead.temperature}</span></div></TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1 flex-wrap max-w-[200px]">
                        {(lead.tags || []).slice(0, 3).map(tag => (
                          <Badge key={tag} variant="outline" className="text-[9px] px-1.5 py-0 h-4 cursor-pointer hover:bg-destructive/10" onClick={() => handleRemoveTagFromLead(lead.id, tag)}>
                            {tag} <X className="h-2 w-2 ml-0.5" />
                          </Badge>
                        ))}
                        {(lead.tags || []).length > 3 && (
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">+{(lead.tags || []).length - 3}</Badge>
                        )}
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-5 w-5 rounded-sm"><Plus className="h-2.5 w-2.5" /></Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-48 p-2" align="start">
                            <div className="space-y-1">
                              <div className="flex gap-1">
                                <Input
                                  placeholder="Nova tag..."
                                  value={newTagInput}
                                  onChange={e => setNewTagInput(e.target.value)}
                                  className="h-7 text-xs"
                                  onKeyDown={e => {
                                    if (e.key === 'Enter' && newTagInput.trim()) {
                                      handleAddTagToLead(lead.id, newTagInput.trim());
                                      setNewTagInput('');
                                    }
                                  }}
                                />
                              </div>
                              <div className="flex flex-wrap gap-1 pt-1">
                                {commonTags.filter(t => !(lead.tags || []).includes(t)).slice(0, 6).map(t => (
                                  <Badge
                                    key={t}
                                    variant="outline"
                                    className="text-[9px] px-1.5 py-0 h-4 cursor-pointer hover:bg-primary/10"
                                    onClick={() => handleAddTagToLead(lead.id, t)}
                                  >
                                    + {t}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {lead.last_contact_at ? formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: true, locale: ptBR }) : '—'}
                    </TableCell>
                    <TableCell onClick={e => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                          <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank"><MessageCircle className="h-3.5 w-3.5 text-success" /></a>
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/crm/contacts/${lead.id}`)}><Eye className="h-3.5 w-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(lead => (
            <Card key={lead.id} className="cursor-pointer hover:shadow-md transition-shadow border-border/50" onClick={() => navigate(`/crm/contacts/${lead.id}`)}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: hashColor(lead.business_name) }}>
                    {lead.business_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{lead.business_name}</p>
                    <p className="text-xs text-muted-foreground">{lead.niche || lead.phone}</p>
                  </div>
                  <ScoreBadge score={lead.lead_score} />
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className={`${stageColors[lead.stage]} text-white text-xs`}>{lead.stage}</Badge>
                  <div className="flex items-center gap-1">{tempIcons[lead.temperature]}</div>
                  {(lead.tags || []).slice(0, 2).map(tag => (
                    <Badge key={tag} variant="outline" className="text-[9px] px-1 py-0 h-4">{tag}</Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';


import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useLeads } from '@/hooks/use-leads';
import { Lead, LeadStage, LeadTemperature } from '@/types/database';
import { allStages } from '@/constants/lead-icons';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Loader2, Plus, Flame, ThermometerSun, Snowflake,
  MapPin, DollarSign, MessageCircle, Search,
  TrendingUp, Users,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

const stageConfig: Record<LeadStage, { color: string; gradient: string; bg: string; emoji: string }> = {
  'Contato': { color: 'text-info', gradient: 'from-info to-info', bg: 'bg-info/10', emoji: '📞' },
  'Qualificado': { color: 'text-warning', gradient: 'from-warning to-warning', bg: 'bg-warning/10', emoji: '⭐' },
  'Proposta': { color: 'text-primary', gradient: 'from-primary to-primary', bg: 'bg-primary/10', emoji: '📋' },
  'Negociação': { color: 'text-brand', gradient: 'from-brand to-brand', bg: 'bg-brand/10', emoji: '🤝' },
  'Ganho': { color: 'text-success', gradient: 'from-success to-success', bg: 'bg-success/10', emoji: '🏆' },
  'Perdido': { color: 'text-destructive', gradient: 'from-destructive to-destructive', bg: 'bg-destructive/10', emoji: '❌' },
};

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 50%)`;
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
}

const tempConfig: Record<LeadTemperature, { icon: React.ReactNode; label: string; className: string }> = {
  quente: { icon: <Flame className="h-3 w-3" />, label: 'Quente', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  morno: { icon: <ThermometerSun className="h-3 w-3" />, label: 'Morno', className: 'bg-warning/10 text-warning border-warning/20' },
  frio: { icon: <Snowflake className="h-3 w-3" />, label: 'Frio', className: 'bg-info/10 text-info border-info/20' },
};

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
const fmtCompact = (v: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact', compactDisplay: 'short', style: 'currency', currency: 'BRL' }).format(v);

function LeadCard({ lead, onDragStart, isDragging, onClick }: {
  lead: Lead; onDragStart: (e: React.DragEvent) => void; isDragging: boolean; onClick: () => void;
}) {
  const bg = hashColor(lead.business_name);
  const temp = tempConfig[lead.temperature];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      whileHover={{ y: -2, boxShadow: '0 8px 25px -8px rgba(0,0,0,0.12)' }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      draggable
      onDragStart={onDragStart as any}
      onClick={onClick}
      className={`p-3.5 rounded-xl border border-border/60 bg-card shadow-sm cursor-grab active:cursor-grabbing hover:border-primary/30 transition-colors duration-200 group ${isDragging ? 'opacity-40 scale-95 rotate-2' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div className="h-9 w-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ring-2 ring-background shadow-sm" style={{ backgroundColor: bg }}>
          {getInitials(lead.business_name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate group-hover:text-primary transition-colors">{lead.business_name}</p>
          {lead.niche && (
            <p className="text-[11px] text-muted-foreground truncate mt-0.5">{lead.niche}</p>
          )}
        </div>
        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-5 border shrink-0 ${temp.className}`}>
          {temp.icon}
        </Badge>
      </div>

      {(lead.location || lead.deal_value) && (
        <>
          <Separator className="my-2.5 opacity-50" />
          <div className="flex items-center justify-between">
            {lead.location && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 shrink-0" />{lead.location}
              </p>
            )}
            {lead.deal_value ? (
              <span className="text-[11px] font-semibold text-success flex items-center gap-0.5 shrink-0 ml-auto">
                {fmtCompact(lead.deal_value)}
              </span>
            ) : null}
          </div>
        </>
      )}

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-1.5">
          {lead.phone && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="h-6 w-6 rounded-md bg-success/10 flex items-center justify-center hover:bg-success/20 transition-colors">
                  <MessageCircle className="h-3 w-3 text-success" />
                </a>
              </TooltipTrigger>
              <TooltipContent>WhatsApp</TooltipContent>
            </Tooltip>
          )}
          {lead.lead_score > 0 && (
            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-5 ${lead.lead_score > 60 ? 'text-success border-success/20' : lead.lead_score > 30 ? 'text-warning border-warning/20' : 'text-destructive border-destructive/20'}`}>
              {lead.lead_score}pts
            </Badge>
          )}
        </div>
        {lead.last_contact_at && (
          <p className="text-[10px] text-muted-foreground/60">
            {formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: true, locale: ptBR })}
          </p>
        )}
      </div>
    </motion.div>
  );
}

function QuickAddDrawer({ stage, onClose }: { stage: LeadStage; onClose: () => void }) {
  const { createLead, isCreating } = useLeads();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [temp, setTemp] = useState<LeadTemperature>('morno');
  const [deal, setDeal] = useState('');

  const formatPhone = (v: string) => {
    const d = v.replace(/\D/g, '').slice(0, 11);
    if (d.length <= 2) return `(${d}`;
    if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  };

  const handleCreate = () => {
    if (!name || !phone) return;
    createLead({
      business_name: name,
      phone: phone.replace(/\D/g, ''),
      stage,
      temperature: temp,
      deal_value: deal ? parseFloat(deal) : null,
      source: 'manual',
      message_sent: false,
      follow_up_count: 0,
      lead_score: 0,
      score_factors: {},
      analyzed_needs: {},
      quality_score: 0,
      reviews_count: 0,
      tags: [],
    } as any);
    onClose();
  };

  const config = stageConfig[stage];

  return (
    <div className="space-y-4 pt-4">
      <div className={`flex items-center gap-2 p-3 rounded-xl ${config.bg}`}>
        <span className="text-lg">{config.emoji}</span>
        <div>
          <p className="text-sm font-semibold">Novo lead em {stage}</p>
          <p className="text-[11px] text-muted-foreground">Preencha os dados abaixo</p>
        </div>
      </div>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Nome da empresa *</label>
          <Input placeholder="Ex: Empresa ABC" value={name} onChange={e => setName(e.target.value)} className="rounded-xl" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Telefone *</label>
          <Input placeholder="(11) 99999-9999" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} className="rounded-xl" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Valor do deal</label>
          <Input type="number" placeholder="R$ 0" value={deal} onChange={e => setDeal(e.target.value)} className="rounded-xl" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Temperatura</label>
          <Select value={temp} onValueChange={v => setTemp(v as LeadTemperature)}>
            <SelectTrigger className="rounded-xl"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="quente">🔥 Quente</SelectItem>
              <SelectItem value="morno">🌡️ Morno</SelectItem>
              <SelectItem value="frio">❄️ Frio</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button className="w-full rounded-xl h-11" onClick={handleCreate} disabled={isCreating || !name || !phone}>
        {isCreating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
        Criar Lead
      </Button>
    </div>
  );
}

export default function CRMPipelinePage() {
  const { leads, isLoading, updateLead } = useLeads();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [draggedLead, setDraggedLead] = useState<Lead | null>(null);
  const [dragOverStage, setDragOverStage] = useState<LeadStage | null>(null);
  const [addStage, setAddStage] = useState<LeadStage | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const filteredLeads = useMemo(() => {
    if (!searchTerm) return leads;
    const s = searchTerm.toLowerCase();
    return leads.filter(l => l.business_name.toLowerCase().includes(s) || l.phone.includes(s));
  }, [leads, searchTerm]);

  const handleDragStart = (e: React.DragEvent, lead: Lead) => {
    setDraggedLead(lead);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, stage: LeadStage) => {
    e.preventDefault();
    setDragOverStage(stage);
  };
  const handleDrop = (e: React.DragEvent, stage: LeadStage) => {
    e.preventDefault();
    if (draggedLead && draggedLead.stage !== stage) {
      updateLead({ id: draggedLead.id, stage });
      toast({ title: `Lead movido para ${stage} ✅` });
    }
    setDraggedLead(null);
    setDragOverStage(null);
  };

  const totalPipeline = leads.filter(l => !['Ganho', 'Perdido'].includes(l.stage)).reduce((s, l) => s + (l.deal_value || 0), 0);
  const wonCount = leads.filter(l => l.stage === 'Ganho').length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-4 sm:p-6 flex flex-col h-[calc(100vh-56px)] md:h-screen overflow-hidden"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-3 shrink-0">
        <PageHeader
          eyebrow="CRM"
          title="Pipeline"
          description="Gerencie seus deals e acompanhe o funil de vendas"
          className="mb-0"
        />
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 bg-success/10 text-success px-3 py-1.5 rounded-lg text-sm">
            <DollarSign className="h-3.5 w-3.5" />
            <span className="font-semibold">{fmt(totalPipeline)}</span>
          </div>
          <div className="flex items-center gap-1.5 bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-sm">
            <TrendingUp className="h-3.5 w-3.5" />
            <span className="font-semibold">{wonCount} ganhos</span>
          </div>
          <div className="flex items-center gap-1.5 bg-muted px-3 py-1.5 rounded-lg text-muted-foreground text-sm">
            <Users className="h-3.5 w-3.5" />
            <span className="font-semibold">{leads.length}</span>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="mb-3 shrink-0">
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar leads..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="pl-9 rounded-xl h-9 text-sm"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16 flex-1">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Carregando pipeline...</p>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto flex-1 min-h-0 pb-2 snap-x snap-mandatory">
          {allStages.map((stage) => {
            const stageLeads = filteredLeads.filter(l => l.stage === stage);
            const isDragOver = dragOverStage === stage;
            const stageValue = stageLeads.reduce((s, l) => s + (l.deal_value || 0), 0);
            const config = stageConfig[stage];

            return (
              <motion.div
                key={stage}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: allStages.indexOf(stage) * 0.06, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-col min-w-[270px] max-w-[310px] flex-1 snap-start"
                onDragOver={e => handleDragOver(e, stage)}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={e => handleDrop(e, stage)}
              >
                {/* Column header */}
                <div className={`rounded-t-xl p-3 border border-b-0 border-border/40 shrink-0 transition-all ${isDragOver ? 'ring-2 ring-primary shadow-lg' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{config.emoji}</span>
                      <span className="text-sm font-semibold">{stage}</span>
                      <Badge variant="secondary" className="h-5 min-w-5 rounded-full flex items-center justify-center p-0 px-1.5 text-[10px] font-bold">
                        {stageLeads.length}
                      </Badge>
                    </div>
                    <Sheet open={addStage === stage} onOpenChange={open => setAddStage(open ? stage : null)}>
                      <SheetTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg hover:bg-primary/10">
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                      </SheetTrigger>
                      <SheetContent className="sm:max-w-md">
                        <SheetHeader>
                          <SheetTitle className="flex items-center gap-2">
                            <span>{config.emoji}</span>
                            Novo Lead — {stage}
                          </SheetTitle>
                        </SheetHeader>
                        <QuickAddDrawer stage={stage} onClose={() => setAddStage(null)} />
                      </SheetContent>
                    </Sheet>
                  </div>
                  {stageValue > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />
                      {fmtCompact(stageValue)}
                    </p>
                  )}
                  <div className="h-1 rounded-full bg-muted mt-2 overflow-hidden">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${config.gradient} transition-all duration-500`}
                      style={{ width: `${leads.length > 0 ? (stageLeads.length / leads.length) * 100 : 0}%` }}
                    />
                  </div>
                </div>

                {/* Column body - fills remaining space */}
                <div className={`flex-1 min-h-0 border border-t-0 border-border/40 rounded-b-xl transition-all ${isDragOver ? 'bg-primary/5 ring-2 ring-primary' : 'bg-muted/20'}`}>
                  <ScrollArea className="h-full">
                    <div className="p-2 space-y-2">
                      {stageLeads.length === 0 ? (
                        <div className={`flex flex-col items-center justify-center h-32 border-2 border-dashed rounded-xl text-muted-foreground text-sm ${isDragOver ? 'border-primary bg-primary/5' : 'border-muted'}`}>
                          <span className="text-2xl mb-2">{config.emoji}</span>
                          <p className="text-xs">Arraste leads aqui</p>
                        </div>
                      ) : (
                        <AnimatePresence mode="popLayout">
                          {stageLeads.map(lead => (
                            <LeadCard
                              key={lead.id}
                              lead={lead}
                              onDragStart={e => handleDragStart(e, lead)}
                              isDragging={draggedLead?.id === lead.id}
                              onClick={() => navigate(`/crm/contacts/${lead.id}`)}
                            />
                          ))}
                        </AnimatePresence>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}

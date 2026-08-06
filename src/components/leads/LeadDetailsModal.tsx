import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Lead, LeadStage, LeadTemperature, LeadTask, LeadNote } from '@/types/database';
import { useLeads } from '@/hooks/use-leads';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { temperatureIcons, stageColors, allStages, allTemperatures } from '@/constants/lead-icons';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { supabase } from '@/integrations/supabase/client';
import { enrichmentApi } from '@/lib/api/enrichment';
import { useToast } from '@/hooks/use-toast';
import {
  Building2,
  Phone,
  Mail,
  Globe,
  MapPin,
  MessageSquare,
  Calendar,
  Tag,
  Star,
  ExternalLink,
  Save,
  Loader2,
  Bot,
  User,
  StickyNote,
  Trash2,
  Plus,
  CheckSquare,
  DollarSign,
  FileText,
  Copy,
  Search,
  Shield,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface LeadDetailsModalProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function parseNotes(notes: string | null | object): LeadNote[] {
  if (!notes) return [];
  // Already an array from DB JSON
  if (Array.isArray(notes)) return notes as LeadNote[];
  // Object but not array
  if (typeof notes === 'object') {
    return [{ text: JSON.stringify(notes), created_at: new Date().toISOString() }];
  }
  try {
    const parsed = JSON.parse(notes);
    if (Array.isArray(parsed)) return parsed;
    return [{ text: String(notes), created_at: new Date().toISOString() }];
  } catch {
    if (notes.trim()) return [{ text: notes, created_at: new Date().toISOString() }];
    return [];
  }
}

function parseTasks(tasks: any[] | null): LeadTask[] {
  if (!tasks || !Array.isArray(tasks)) return [];
  return tasks as LeadTask[];
}

function formatCurrency(value: number | null): string {
  if (!value) return '';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function LeadDetailsModal({ lead, open, onOpenChange }: LeadDetailsModalProps) {
  const { updateLead, isUpdating } = useLeads();
  const { messages, isLoading: messagesLoading } = useChatMessages(lead?.id || null);
  const { toast } = useToast();
  
  const [editMode, setEditMode] = useState(false);
  const [isGeneratingProposal, setIsGeneratingProposal] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [enrichmentData, setEnrichmentData] = useState<Record<string, any> | null>(null);
  const [proposalText, setProposalText] = useState('');
  const [proposalOpen, setProposalOpen] = useState(false);
  const [formData, setFormData] = useState({
    business_name: '',
    phone: '',
    email: '',
    website: '',
    address: '',
    niche: '',
    location: '',
    stage: 'Contato' as LeadStage,
    temperature: 'morno' as LeadTemperature,
    deal_value: null as number | null,
  });

  // Notes state
  const [notesList, setNotesList] = useState<LeadNote[]>([]);
  const [newNote, setNewNote] = useState('');

  // Tasks state
  const [tasksList, setTasksList] = useState<LeadTask[]>([]);
  const [newTaskText, setNewTaskText] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'alta' | 'media' | 'baixa'>('media');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');

  useEffect(() => {
    if (lead) {
      setFormData({
        business_name: lead.business_name || '',
        phone: lead.phone || '',
        email: lead.email || '',
        website: lead.website || '',
        address: lead.address || '',
        niche: lead.niche || '',
        location: lead.location || '',
        stage: lead.stage,
        temperature: lead.temperature,
        deal_value: (lead as any).deal_value || null,
      });
      setNotesList(parseNotes(lead.notes));
      setTasksList(parseTasks((lead as any).tasks));
      setEditMode(false);
      setNewNote('');
      setNewTaskText('');
    }
  }, [lead]);

  const handleSave = () => {
    if (!lead) return;
    updateLead({
      id: lead.id,
      ...formData,
    } as any);
    setEditMode(false);
  };

  const handleAddNote = () => {
    if (!lead || !newNote.trim()) return;
    const updated = [{ text: newNote.trim(), created_at: new Date().toISOString() }, ...notesList];
    setNotesList(updated);
    setNewNote('');
    updateLead({ id: lead.id, notes: JSON.stringify(updated) } as any);
  };

  const handleDeleteNote = (index: number) => {
    if (!lead) return;
    const updated = notesList.filter((_, i) => i !== index);
    setNotesList(updated);
    updateLead({ id: lead.id, notes: JSON.stringify(updated) } as any);
  };

  const handleAddTask = () => {
    if (!lead || !newTaskText.trim()) return;
    const task: LeadTask = {
      id: crypto.randomUUID(),
      text: newTaskText.trim(),
      priority: newTaskPriority,
      due_date: newTaskDueDate || null,
      done: false,
      created_at: new Date().toISOString(),
    };
    const updated = [task, ...tasksList];
    setTasksList(updated);
    setNewTaskText('');
    setNewTaskDueDate('');
    updateLead({ id: lead.id, tasks: updated } as any);
  };

  const handleToggleTask = (taskId: string) => {
    if (!lead) return;
    const updated = tasksList.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
    // Sort: incomplete first
    updated.sort((a, b) => (a.done === b.done ? 0 : a.done ? 1 : -1));
    setTasksList(updated);
    updateLead({ id: lead.id, tasks: updated } as any);
  };

  const handleDeleteTask = (taskId: string) => {
    if (!lead) return;
    const updated = tasksList.filter(t => t.id !== taskId);
    setTasksList(updated);
    updateLead({ id: lead.id, tasks: updated } as any);
  };

  const handleGenerateProposal = async () => {
    if (!lead) return;
    setIsGeneratingProposal(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-proposal', {
        body: {
          lead_id: lead.id,
          business_name: lead.business_name,
          niche: lead.niche || '',
          location: lead.location || '',
          phone: lead.phone,
        },
      });
      if (error) throw error;
      setProposalText(data?.proposal || data?.content || JSON.stringify(data));
      setProposalOpen(true);
    } catch (err) {
      toast({ title: 'Erro ao gerar proposta', description: 'Tente novamente', variant: 'destructive' });
    } finally {
      setIsGeneratingProposal(false);
    }
  };

  const handleEnrichLead = async () => {
    if (!lead) return;
    setIsEnriching(true);
    try {
      const data = await enrichmentApi.enrichLead({
        phone: lead.phone,
        website: lead.website || undefined,
        address: lead.address || undefined,
      });
      setEnrichmentData(data);
      toast({ title: 'Enriquecimento concluído', description: 'Dados adicionais carregados com sucesso' });
    } catch (err) {
      toast({ title: 'Erro no enriquecimento', description: String(err), variant: 'destructive' });
    } finally {
      setIsEnriching(false);
    }
  };

  const logoUrl = lead?.website ? enrichmentApi.getLogoUrl(lead.website) : null;


  const priorityColors: Record<string, string> = {
    alta: 'bg-destructive/10 text-destructive border-destructive/20',
    media: 'bg-warning/10 text-warning border-warning/20',
    baixa: 'bg-muted text-muted-foreground border-muted',
  };

  if (!lead) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                {logoUrl && <AvatarImage src={logoUrl} alt={lead.business_name} />}
                <AvatarFallback className="bg-primary/10 text-primary text-lg">
                  {lead.business_name[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <DialogTitle className="text-xl">{lead.business_name}</DialogTitle>
                <DialogDescription className="flex items-center gap-2 mt-1">
                  {temperatureIcons[lead.temperature]}
                  <Badge className={`${stageColors[lead.stage]} text-white`}>
                    {lead.stage}
                  </Badge>
                  {lead.niche && <Badge variant="secondary">{lead.niche}</Badge>}
                  {(lead as any).deal_value && (
                    <Badge variant="outline" className="text-primary border-primary/30">
                      <DollarSign className="h-3 w-3 mr-0.5" />
                      {formatCurrency((lead as any).deal_value)}
                    </Badge>
                  )}
                </DialogDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {editMode ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditMode(false)}>
                    Cancelar
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={isUpdating}>
                    {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Salvar
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                  Editar
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <Tabs defaultValue="details" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="details">Detalhes</TabsTrigger>
            <TabsTrigger value="conversation">Conversa ({messages.length})</TabsTrigger>
            <TabsTrigger value="notes">Notas ({notesList.length})</TabsTrigger>
            <TabsTrigger value="tasks">Tarefas ({tasksList.length})</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="flex-1 overflow-auto">
            <div className="grid gap-4 py-4">
              {editMode ? (
                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="business_name">Nome da Empresa</Label>
                      <Input id="business_name" value={formData.business_name} onChange={(e) => setFormData({ ...formData, business_name: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Telefone</Label>
                      <Input id="phone" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">E-mail</Label>
                      <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="website">Website</Label>
                      <Input id="website" value={formData.website} onChange={(e) => setFormData({ ...formData, website: e.target.value })} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="niche">Nicho</Label>
                      <Input id="niche" value={formData.niche} onChange={(e) => setFormData({ ...formData, niche: e.target.value })} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="location">Localização</Label>
                      <Input id="location" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Endereço Completo</Label>
                    <Input id="address" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label>Estágio</Label>
                      <Select value={formData.stage} onValueChange={(v) => setFormData({ ...formData, stage: v as LeadStage })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {allStages.map((stage) => (<SelectItem key={stage} value={stage}>{stage}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Temperatura</Label>
                      <Select value={formData.temperature} onValueChange={(v) => setFormData({ ...formData, temperature: v as LeadTemperature })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {allTemperatures.map((temp) => (<SelectItem key={temp} value={temp} className="capitalize">{temp}</SelectItem>))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Valor do Deal (R$)</Label>
                      <Input
                        type="number"
                        placeholder="0,00"
                        value={formData.deal_value || ''}
                        onChange={(e) => setFormData({ ...formData, deal_value: e.target.value ? parseFloat(e.target.value) : null })}
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Phone className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Telefone</p>
                        <p className="font-medium">{lead.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">E-mail</p>
                        <p className="font-medium">{lead.email || '-'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Globe className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Website</p>
                        {lead.website ? (
                          <a href={lead.website} target="_blank" rel="noopener noreferrer" className="font-medium text-primary hover:underline flex items-center gap-1">
                            {lead.website.replace(/https?:\/\//, '')}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (<p className="font-medium">-</p>)}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <MapPin className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Localização</p>
                        <p className="font-medium">{lead.location || lead.address || '-'}</p>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <Tag className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Nicho</p>
                        <p className="font-medium">{lead.niche || '-'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                      <DollarSign className="h-5 w-5 text-muted-foreground" />
                      <div>
                        <p className="text-sm text-muted-foreground">Valor do Deal</p>
                        <p className="font-medium">{formatCurrency((lead as any).deal_value) || '-'}</p>
                      </div>
                    </div>
                  </div>
                  {lead.conversation_summary && (
                    <div className="p-4 rounded-lg border bg-card">
                      <p className="text-sm font-medium mb-2 flex items-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        Resumo da Conversa
                      </p>
                      <p className="text-sm text-muted-foreground">{lead.conversation_summary}</p>
                    </div>
                  )}
                  {lead.google_maps_url && (
                    <a href={lead.google_maps_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-primary hover:underline">
                      <MapPin className="h-4 w-4" />
                      Ver no Google Maps
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  <Button
                    variant="outline"
                    onClick={handleGenerateProposal}
                    disabled={isGeneratingProposal}
                    className="w-full gap-2 mt-4"
                  >
                    {isGeneratingProposal
                      ? <><Loader2 className="h-4 w-4 animate-spin" />Gerando proposta...</>
                      : <><FileText className="h-4 w-4" />Gerar Proposta com IA</>
                    }
                   </Button>
                   <Button
                     variant="outline"
                     onClick={handleEnrichLead}
                     disabled={isEnriching}
                     className="w-full gap-2"
                   >
                     {isEnriching
                       ? <><Loader2 className="h-4 w-4 animate-spin" />Enriquecendo...</>
                       : <><Search className="h-4 w-4" />Enriquecer Lead (CEP, WHOIS, DDD)</>
                     }
                   </Button>

                   {enrichmentData && (
                     <div className="space-y-3 mt-4 p-4 rounded-lg border bg-card">
                       <p className="text-sm font-medium flex items-center gap-2">
                         <Shield className="h-4 w-4 text-primary" />
                         Dados Enriquecidos
                       </p>
                       {enrichmentData.ddd_info && !enrichmentData.ddd_info.error && (
                         <div className="text-sm">
                           <span className="text-muted-foreground">DDD {enrichmentData.ddd_info.state}: </span>
                           <span>{(enrichmentData.ddd_info.cities || []).slice(0, 5).join(', ')}</span>
                         </div>
                       )}
                       {enrichmentData.whois && !enrichmentData.whois.error && (
                         <div className="text-sm space-y-1">
                           <p><span className="text-muted-foreground">Domínio: </span>{enrichmentData.whois.domain}</p>
                           {enrichmentData.whois.registered_at && (
                             <p><span className="text-muted-foreground">Registrado em: </span>{new Date(enrichmentData.whois.registered_at).toLocaleDateString('pt-BR')}</p>
                           )}
                           {enrichmentData.whois.expires_at && (
                             <p><span className="text-muted-foreground">Expira em: </span>{new Date(enrichmentData.whois.expires_at).toLocaleDateString('pt-BR')}</p>
                           )}
                           {enrichmentData.whois.registrant_name && (
                             <p><span className="text-muted-foreground">Proprietário: </span>{enrichmentData.whois.registrant_name}</p>
                           )}
                           {enrichmentData.whois.registrant_email && (
                             <p><span className="text-muted-foreground">Email registrante: </span>{enrichmentData.whois.registrant_email}</p>
                           )}
                         </div>
                       )}
                       {enrichmentData.logo && (
                         <div className="flex items-center gap-2 text-sm">
                           <span className="text-muted-foreground">Logo: </span>
                           <img src={enrichmentData.logo.logo_url} alt="Logo" className="h-6 w-6 rounded" loading="lazy" width={24} height={24} onError={(e) => (e.currentTarget.style.display = 'none')} />
                         </div>
                       )}
                     </div>
                   )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="conversation" className="flex-1 overflow-hidden">
            <ScrollArea className="h-[400px] p-4">
              {messagesLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-20" />
                  <p>Nenhuma mensagem ainda</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message) => (
                    <div key={message.id} className={`flex items-start gap-2 ${message.sender_type === 'lead' ? '' : 'flex-row-reverse'}`}>
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className={
                          message.sender_type === 'agent' ? 'bg-primary text-primary-foreground'
                            : message.sender_type === 'user' ? 'bg-secondary text-secondary-foreground' : 'bg-muted'
                        }>
                          {message.sender_type === 'agent' ? <Bot className="h-4 w-4" /> : message.sender_type === 'user' ? <User className="h-4 w-4" /> : lead.business_name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div className={`max-w-[70%] p-3 rounded-lg ${message.sender_type === 'lead' ? 'bg-muted' : 'bg-primary text-primary-foreground'}`}>
                        <p className="text-sm">{message.content}</p>
                        <p className={`text-xs mt-1 ${message.sender_type === 'lead' ? 'text-muted-foreground' : 'text-primary-foreground/70'}`}>
                          {formatDistanceToNow(new Date(message.sent_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          {/* Notes Tab */}
          <TabsContent value="notes" className="flex-1 overflow-hidden">
            <div className="p-4 space-y-4">
              <div className="flex gap-2">
                <Textarea
                  placeholder="Adicione uma observação sobre este lead..."
                  value={newNote}
                  onChange={e => setNewNote(e.target.value)}
                  rows={2}
                  className="flex-1"
                />
                <Button onClick={handleAddNote} disabled={!newNote.trim()} className="self-end">
                  <Plus className="h-4 w-4 mr-1" />
                  Salvar
                </Button>
              </div>

              <ScrollArea className="h-[320px]">
                {notesList.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <StickyNote className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Nenhuma nota adicionada</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {notesList.map((note, i) => (
                      <div key={i} className="p-3 rounded-lg border bg-card group">
                        <div className="flex items-start justify-between">
                          <p className="text-sm flex-1">{note.text}</p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 text-destructive"
                            onClick={() => handleDeleteNote(i)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(note.created_at), "d 'de' MMM 'às' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          {/* Tasks Tab */}
          <TabsContent value="tasks" className="flex-1 overflow-hidden">
            <div className="p-4 space-y-4">
              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Input
                    placeholder="Descrição da tarefa..."
                    value={newTaskText}
                    onChange={e => setNewTaskText(e.target.value)}
                  />
                </div>
                <Select value={newTaskPriority} onValueChange={(v: any) => setNewTaskPriority(v)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alta">Alta</SelectItem>
                    <SelectItem value="media">Média</SelectItem>
                    <SelectItem value="baixa">Baixa</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  className="w-36"
                  value={newTaskDueDate}
                  onChange={e => setNewTaskDueDate(e.target.value)}
                />
                <Button onClick={handleAddTask} disabled={!newTaskText.trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              <ScrollArea className="h-[320px]">
                {tasksList.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">Nenhuma tarefa adicionada</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {tasksList.map(task => (
                      <div key={task.id} className={`flex items-center gap-3 p-3 rounded-lg border group ${task.done ? 'opacity-60' : ''}`}>
                        <Checkbox
                          checked={task.done}
                          onCheckedChange={() => handleToggleTask(task.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm ${task.done ? 'line-through text-muted-foreground' : ''}`}>
                            {task.text}
                          </p>
                          {task.due_date && (
                            <p className="text-xs text-muted-foreground mt-0.5">
                              Prazo: {format(new Date(task.due_date + 'T00:00:00'), "d 'de' MMM", { locale: ptBR })}
                            </p>
                          )}
                        </div>
                        <Badge variant="outline" className={`text-xs ${priorityColors[task.priority]}`}>
                          {task.priority === 'alta' ? 'Alta' : task.priority === 'media' ? 'Média' : 'Baixa'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 text-destructive"
                          onClick={() => handleDeleteTask(task.id)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </TabsContent>

          <TabsContent value="history" className="flex-1 overflow-auto">
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Calendar className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Criado em</p>
                  <p className="font-medium">
                    {format(new Date(lead.created_at), "d 'de' MMMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                  </p>
                </div>
              </div>
              {lead.last_contact_at && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <MessageSquare className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm text-muted-foreground">Último Contato</p>
                    <p className="font-medium">
                      {formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                </div>
              )}
              {lead.last_response_at && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Última Resposta</p>
                    <p className="font-medium">
                      {formatDistanceToNow(new Date(lead.last_response_at), { addSuffix: true, locale: ptBR })}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <MessageSquare className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-sm text-muted-foreground">Follow-ups Enviados</p>
                  <p className="font-medium">{lead.follow_up_count || 0}</p>
                </div>
              </div>
              {lead.next_follow_up_at && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-primary/10">
                  <Calendar className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm text-muted-foreground">Próximo Follow-up</p>
                    <p className="font-medium text-primary">
                      {format(new Date(lead.next_follow_up_at), "d 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Proposal Sheet */}
        <Sheet open={proposalOpen} onOpenChange={setProposalOpen}>
          <SheetContent className="w-[500px] sm:max-w-[500px]">
            <SheetHeader>
              <SheetTitle>Proposta para {lead?.business_name}</SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(100vh-180px)] mt-4">
              <div className="prose prose-sm max-w-none whitespace-pre-wrap text-sm leading-relaxed">
                {proposalText}
              </div>
            </ScrollArea>
            <div className="flex gap-2 mt-4 pt-4 border-t">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => navigator.clipboard.writeText(proposalText).then(() =>
                  toast({ title: 'Proposta copiada!' })
                )}
              >
                <Copy className="h-4 w-4 mr-2" />Copiar
              </Button>
              <Button
                className="flex-1"
                onClick={() => {
                  if (!lead) return;
                  const updated = [{ text: `Proposta gerada:\n${proposalText}`, created_at: new Date().toISOString() }, ...notesList];
                  setNotesList(updated);
                  updateLead({ id: lead.id, notes: JSON.stringify(updated) } as any);
                  setProposalOpen(false);
                  toast({ title: 'Proposta salva nas notas!' });
                }}
              >
                <Save className="h-4 w-4 mr-2" />Salvar como nota
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </DialogContent>
    </Dialog>
  );
}
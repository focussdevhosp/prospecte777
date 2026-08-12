import { useState, useMemo, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useLead, useLeads } from '@/hooks/use-leads';
import { useChatMessages } from '@/hooks/use-chat-messages';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useMeetings } from '@/hooks/use-meetings';
import { useActivityLog } from '@/hooks/use-activity-log';
import { Lead, LeadTask, LeadNote } from '@/types/database';
import { stageColors } from '@/constants/lead-icons';
import { AgentControlCard } from '@/components/crm/AgentControlCard';
import { SiteAuditCard } from '@/components/crm/SiteAuditCard';
import type { AgentStatus } from '@/hooks/use-agent-control';
import type { SiteAudit } from '@/hooks/use-opportunity-radar';
import { enrichmentApi } from '@/lib/api/enrichment';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Loader2, ArrowLeft, Flame, ThermometerSun, Snowflake, Phone, Mail, Globe,
  Instagram, Facebook, Linkedin, Twitter, MapPin, Star, Send, Plus, Trash2,
  MessageCircle, Calendar, FileText, CheckSquare, Target, Clock, ExternalLink,
  Building2, Users, CalendarDays, Bot,
} from 'lucide-react';
import { QuickReplies } from '@/components/chat/QuickReplies';
import { AIReplyButton } from '@/components/chat/AIReplyButton';

function hashColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${Math.abs(h) % 360}, 55%, 50%)`;
}

function parseNotes(notes: string | null | object): LeadNote[] {
  if (!notes) return [];
  // If it's already an array (parsed JSON from DB)
  if (Array.isArray(notes)) return notes as LeadNote[];
  // If it's an object but not array
  if (typeof notes === 'object') return [{ text: JSON.stringify(notes), created_at: new Date().toISOString() }];
  // String case
  try {
    const parsed = JSON.parse(notes);
    return Array.isArray(parsed) ? parsed : [{ text: String(notes), created_at: new Date().toISOString() }];
  } catch {
    return notes ? [{ text: String(notes), created_at: new Date().toISOString() }] : [];
  }
}

function parseTasks(tasks: any[] | null): LeadTask[] {
  if (!tasks || !Array.isArray(tasks)) return [];
  return tasks as LeadTask[];
}

export default function CRMContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: lead, isLoading } = useLead(id || null);
  const { updateLead } = useLeads();
  const { messages, sendMessage, isSending } = useChatMessages(id || null);
  const { settings } = useUserSettings();
  const { meetings } = useMeetings();
  const { activities } = useActivityLog(50);

  const [msgInput, setMsgInput] = useState('');
  const [noteInput, setNoteInput] = useState('');
  const [taskInput, setTaskInput] = useState('');
  const [taskPriority, setTaskPriority] = useState<'alta' | 'media' | 'baixa'>('media');

  // BANT state
  const [bant, setBant] = useState({ budget: 'unknown', authority: 'unknown', need: 'unknown', timeline: 'unknown', budgetDetails: '', authorityDetails: '', needDetails: '', timelineDetails: '' });

  useEffect(() => {
    if (lead?.analyzed_needs?.bant) {
      setBant(lead.analyzed_needs.bant);
    }
  }, [lead?.analyzed_needs]);

  // Auto-enrich location from DDD
  useEffect(() => {
    if (!lead || lead.location || !lead.phone) return;
    const digits = lead.phone.replace(/\D/g, '');
    const ddd = digits.startsWith('55') ? digits.slice(2, 4) : digits.slice(0, 2);
    if (ddd.length < 2) return;
    enrichmentApi.lookupDdd(ddd).then((res: any) => {
      if (res?.state) {
        updateLead({ id: lead.id, location: res.state });
      }
    }).catch(() => {});
  // Só o id. O efeito GRAVA em `lead` (preenche a localização), e depender
  // do objeto inteiro faria ele reagir à própria escrita. A guarda no topo
  // já cobre o caso de a localização existir.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.id]);

  const leadMeetings = useMemo(() => meetings.filter(m => m.lead_id === id), [meetings, id]);
  const leadActivities = useMemo(() => activities.filter(a => a.lead_id === id), [activities, id]);

  const notes = useMemo(() => parseNotes(lead?.notes || null), [lead?.notes]);
  const tasks = useMemo(() => parseTasks(lead?.tasks || null), [lead?.tasks]);

  const handleSendMsg = () => {
    if (!msgInput.trim()) return;
    sendMessage({ content: msgInput, senderType: 'user' });
    setMsgInput('');
  };

  const handleAddNote = () => {
    if (!noteInput.trim() || !lead) return;
    const newNotes = [...notes, { text: noteInput, created_at: new Date().toISOString() }];
    updateLead({ id: lead.id, notes: JSON.stringify(newNotes) });
    setNoteInput('');
  };

  const handleDeleteNote = (index: number) => {
    if (!lead) return;
    const newNotes = notes.filter((_, i) => i !== index);
    updateLead({ id: lead.id, notes: JSON.stringify(newNotes) });
  };

  const handleAddTask = () => {
    if (!taskInput.trim() || !lead) return;
    const newTask: LeadTask = { id: crypto.randomUUID(), text: taskInput, priority: taskPriority, due_date: null, done: false, created_at: new Date().toISOString() };
    const newTasks = [...tasks, newTask];
    updateLead({ id: lead.id, tasks: newTasks as any });
    setTaskInput('');
  };

  const handleToggleTask = (taskId: string) => {
    if (!lead) return;
    const newTasks = tasks.map(t => t.id === taskId ? { ...t, done: !t.done } : t);
    updateLead({ id: lead.id, tasks: newTasks as any });
  };

  const handleDeleteTask = (taskId: string) => {
    if (!lead) return;
    updateLead({ id: lead.id, tasks: tasks.filter(t => t.id !== taskId) as any });
  };

  const saveBant = () => {
    if (!lead) return;
    const statusScores: Record<string, number> = { confirmed: 100, suspected: 60, unknown: 20, na: 0 };
    const score = Math.round((
      (statusScores[bant.budget] || 0) + (statusScores[bant.authority] || 0) +
      (statusScores[bant.need] || 0) + (statusScores[bant.timeline] || 0)
    ) / 4);
    updateLead({ id: lead.id, analyzed_needs: { ...lead.analyzed_needs, bant, bantScore: score } });
  };

  if (isLoading || !lead) {
    return <div className="p-6"><div className="flex items-center justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div></div>;
  }

  const bantScore = lead.analyzed_needs?.bantScore || 0;
  const sortedTasks = [...tasks].sort((a, b) => Number(a.done) - Number(b.done));

  return (
    <div className="p-6"><div className="flex items-center justify-between mb-4">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Button></div>

      <div className="flex gap-6 flex-col lg:flex-row">
        {/* Col 1 — Profile */}
        <div className="w-full lg:w-[280px] shrink-0 space-y-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="mx-auto h-20 w-20 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3 relative" style={{ backgroundColor: hashColor(lead.business_name) }}>
                {lead.business_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                {lead.website && (
                  <img
                    src={enrichmentApi.getLogoUrl(lead.website)}
                    alt=""
                    className="absolute -bottom-1 -right-1 h-7 w-7 rounded-md object-contain bg-background p-0.5 border border-border/30 shadow-sm"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
              </div>
              <h2 className="font-bold text-lg">{lead.business_name}</h2>
              <p className="text-sm text-muted-foreground">{lead.niche || 'Sem nicho'}</p>
              <div className="flex items-center justify-center gap-2 mt-3">
                <Badge className={`${stageColors[lead.stage]} text-white`}>{lead.stage}</Badge>
                {lead.temperature === 'quente' && <Badge variant="outline" className="text-destructive border-destructive/30"><Flame className="h-3 w-3 mr-1" />Quente</Badge>}
                {lead.temperature === 'morno' && <Badge variant="outline" className="text-warning border-warning/30"><ThermometerSun className="h-3 w-3 mr-1" />Morno</Badge>}
                {lead.temperature === 'frio' && <Badge variant="outline" className="text-info border-info/30"><Snowflake className="h-3 w-3 mr-1" />Frio</Badge>}
                <Badge variant="outline">{lead.lead_score} pts</Badge>
              </div>
              <Separator className="my-4" />
              <div className="space-y-2 text-left text-sm">
                <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" className="flex items-center gap-2 text-success hover:underline"><Phone className="h-4 w-4" />{lead.phone}</a>
                {lead.email && <a href={`mailto:${lead.email}`} className="flex items-center gap-2 hover:underline"><Mail className="h-4 w-4" />{lead.email}</a>}
                {lead.website && <a href={lead.website} target="_blank" className="flex items-center gap-2 hover:underline"><Globe className="h-4 w-4" />{lead.website}</a>}
                {lead.location && <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{lead.location}</p>}
              </div>
              <div className="flex items-center justify-center gap-2 mt-3">
                {lead.instagram_url && <a href={lead.instagram_url} target="_blank"><Instagram className="h-5 w-5 text-brand" /></a>}
                {lead.facebook_url && <a href={lead.facebook_url} target="_blank"><Facebook className="h-5 w-5 text-info" /></a>}
                {lead.linkedin_url && <a href={lead.linkedin_url} target="_blank"><Linkedin className="h-5 w-5 text-info" /></a>}
                {lead.twitter_url && <a href={lead.twitter_url} target="_blank"><Twitter className="h-5 w-5 text-info" /></a>}
              </div>
              {lead.rating && (
                <div className="flex items-center justify-center gap-1 mt-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={`h-4 w-4 ${i < Math.round(lead.rating!) ? 'text-warning fill-warning' : 'text-muted'}`} />
                  ))}
                  <span className="text-xs text-muted-foreground ml-1">({lead.reviews_count})</span>
                </div>
              )}
              <Separator className="my-4" />
              {/* Estado da IA nesta conversa. Sem isto, o handoff acontecia
                  e quem abrisse o contato não fazia ideia de que o agente
                  tinha saído — nem de como trazê-lo de volta. */}
              <div className="space-y-3 text-left">
                <AgentControlCard
                  leadId={lead.id}
                  status={(lead.agent_status as AgentStatus) ?? 'active'}
                  reason={lead.agent_paused_reason}
                  pausedAt={lead.agent_paused_at}
                  repliesToday={lead.agent_replies_today ?? 0}
                />

                {/* O argumento de venda fica onde a mensagem é escrita.
                    Antes o vendedor abria o site do lead em outra aba e
                    escrevia a abordagem no achismo. */}
                <SiteAuditCard
                  leadId={lead.id}
                  businessName={lead.business_name}
                  website={lead.website}
                  audit={(lead.site_audit as SiteAudit | null) ?? null}
                />
              </div>

              <Separator className="my-4" />
              <div className="text-xs text-muted-foreground space-y-1 text-left">
                <p>Fonte: <Badge variant="outline" className="text-xs">{lead.source}</Badge></p>
                <p>Criado: {format(new Date(lead.created_at), 'dd/MM/yyyy', { locale: ptBR })}</p>
                {lead.last_contact_at && <p>Último contato: {formatDistanceToNow(new Date(lead.last_contact_at), { addSuffix: true, locale: ptBR })}</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Col 2 — Tabs */}
        <div className="flex-1 min-w-0">
          <Tabs defaultValue="timeline">
            <TabsList className="mb-4">
              <TabsTrigger value="timeline"><Clock className="h-4 w-4 mr-1" />Timeline</TabsTrigger>
              <TabsTrigger value="notes"><FileText className="h-4 w-4 mr-1" />Notas</TabsTrigger>
              <TabsTrigger value="tasks"><CheckSquare className="h-4 w-4 mr-1" />Tarefas</TabsTrigger>
              <TabsTrigger value="chat"><MessageCircle className="h-4 w-4 mr-1" />WhatsApp</TabsTrigger>
              <TabsTrigger value="bant"><Target className="h-4 w-4 mr-1" />BANT</TabsTrigger>
            </TabsList>

            {/* Timeline */}
            <TabsContent value="timeline">
              <Card>
                <CardContent className="pt-6 space-y-4 max-h-[600px] overflow-y-auto">
                  {[
                    ...messages.map(m => ({ type: 'message' as const, date: m.sent_at, data: m })),
                    ...leadMeetings.map(m => ({ type: 'meeting' as const, date: m.scheduled_at, data: m })),
                    ...leadActivities.map(a => ({ type: 'activity' as const, date: a.created_at, data: a })),
                  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((item, i) => (
                    <div key={i} className="flex items-start gap-3 pb-3 border-b last:border-0">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        item.type === 'message' ? 'bg-success/10' : item.type === 'meeting' ? 'bg-info/10' : 'bg-muted'
                      }`}>
                        {item.type === 'message' && <MessageCircle className="h-4 w-4 text-success" />}
                        {item.type === 'meeting' && <Calendar className="h-4 w-4 text-info" />}
                        {item.type === 'activity' && <FileText className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        {item.type === 'message' && (
                          <>
                            <p className="text-sm"><span className="font-medium">{item.data.sender_type === 'lead' ? 'Lead' : 'Você'}:</span> {item.data.content.slice(0, 100)}{item.data.content.length > 100 ? '...' : ''}</p>
                          </>
                        )}
                        {item.type === 'meeting' && <p className="text-sm font-medium">📅 {item.data.title} — {item.data.status}</p>}
                        {item.type === 'activity' && <p className="text-sm">{item.data.description}</p>}
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDistanceToNow(new Date(item.date), { addSuffix: true, locale: ptBR })}</p>
                      </div>
                    </div>
                  ))}
                  {messages.length === 0 && leadMeetings.length === 0 && leadActivities.length === 0 && (
                    <p className="text-sm text-muted-foreground text-center py-8">Nenhuma atividade registrada</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Notes */}
            <TabsContent value="notes">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex gap-2">
                    <Textarea placeholder="Adicionar nota..." value={noteInput} onChange={e => setNoteInput(e.target.value)} className="min-h-[80px]" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">{noteInput.length} caracteres</span>
                    <Button size="sm" onClick={handleAddNote} disabled={!noteInput.trim()}>Salvar nota</Button>
                  </div>
                  <Separator />
                  {notes.map((note, i) => (
                    <div key={i} className="flex items-start gap-2 p-3 rounded-lg border">
                      <div className="flex-1">
                        <p className="text-sm whitespace-pre-wrap">{note.text}</p>
                        <p className="text-xs text-muted-foreground mt-1">{formatDistanceToNow(new Date(note.created_at), { addSuffix: true, locale: ptBR })}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleDeleteNote(i)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tasks */}
            <TabsContent value="tasks">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex gap-2">
                    <Input placeholder="Descrição da tarefa" value={taskInput} onChange={e => setTaskInput(e.target.value)} className="flex-1" />
                    <Select value={taskPriority} onValueChange={v => setTaskPriority(v as any)}>
                      <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alta">🔴 Alta</SelectItem>
                        <SelectItem value="media">🟡 Média</SelectItem>
                        <SelectItem value="baixa">🟢 Baixa</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button onClick={handleAddTask} disabled={!taskInput.trim()}><Plus className="h-4 w-4" /></Button>
                  </div>
                  <Separator />
                  {sortedTasks.map(task => (
                    <div key={task.id} className={`flex items-center gap-3 p-3 rounded-lg border ${task.done ? 'opacity-50' : ''}`}>
                      <Checkbox checked={task.done} onCheckedChange={() => handleToggleTask(task.id)} />
                      <span className={`flex-1 text-sm ${task.done ? 'line-through' : ''}`}>{task.text}</span>
                      <Badge variant="outline" className="text-xs">
                        {task.priority === 'alta' ? '🔴' : task.priority === 'media' ? '🟡' : '🟢'} {task.priority}
                      </Badge>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDeleteTask(task.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Chat */}
            <TabsContent value="chat">
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-3 max-h-[400px] overflow-y-auto mb-4">
                    {messages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.sender_type === 'lead' ? 'justify-start' : 'justify-end'}`}>
                        <div className={`max-w-[75%] p-3 rounded-2xl text-sm ${
                          msg.sender_type === 'lead'
                            ? 'bg-muted rounded-bl-sm'
                            : msg.sender_type === 'agent'
                            ? 'bg-primary text-white rounded-br-sm'
                            : 'bg-success text-white rounded-br-sm'
                        }`}>
                          {msg.sender_type === 'agent' && (
                            <div className="flex items-center gap-1 mb-1 opacity-70">
                              <Bot className="h-3 w-3" />
                              <span className="text-[10px]">IA</span>
                            </div>
                          )}
                          {msg.content}
                          <p className={`text-[10px] mt-1 ${msg.sender_type === 'lead' ? 'text-muted-foreground' : 'text-white/70'}`}>
                            {format(new Date(msg.sent_at), 'HH:mm')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <QuickReplies
                    onSelectReply={(msg) => setMsgInput(msg)}
                    leadName={lead.business_name}
                  />
                  <div className="flex gap-2 mt-2">
                    <AIReplyButton
                      leadId={lead.id}
                      lastMessage={[...messages].reverse().find(m => m.sender_type === 'lead')?.content}
                      onUseReply={(msg) => setMsgInput(msg)}
                    />
                    <Input placeholder="Digite uma mensagem..." value={msgInput} onChange={e => setMsgInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSendMsg()} className="flex-1" />
                    <Button onClick={handleSendMsg} disabled={isSending || !msgInput.trim()}><Send className="h-4 w-4" /></Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* BANT */}
            <TabsContent value="bant">
              <div className="space-y-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center gap-4 mb-4">
                      <div className="flex-1">
                        <p className="text-sm font-medium mb-1">Score BANT: {bantScore}%</p>
                        <Progress value={bantScore} className="h-3" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {[
                    { key: 'budget', label: '💰 Budget (Orçamento)', detailKey: 'budgetDetails' },
                    { key: 'authority', label: '👤 Authority (Decisor)', detailKey: 'authorityDetails' },
                    { key: 'need', label: '🎯 Need (Necessidade)', detailKey: 'needDetails' },
                    { key: 'timeline', label: '⏰ Timeline (Prazo)', detailKey: 'timelineDetails' },
                  ].map(item => (
                    <Card key={item.key}>
                      <CardHeader className="pb-2"><CardTitle className="text-sm">{item.label}</CardTitle></CardHeader>
                      <CardContent className="space-y-2">
                        <Select value={(bant as any)[item.key]} onValueChange={v => setBant({ ...bant, [item.key]: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="confirmed">✅ Confirmado</SelectItem>
                            <SelectItem value="suspected">🟡 Suspeito</SelectItem>
                            <SelectItem value="unknown">❓ Desconhecido</SelectItem>
                            <SelectItem value="na">➖ N/A</SelectItem>
                          </SelectContent>
                        </Select>
                        <Textarea placeholder="Detalhes..." value={(bant as any)[item.detailKey] || ''} onChange={e => setBant({ ...bant, [item.detailKey]: e.target.value })} className="min-h-[60px]" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
                <Button onClick={saveBant} className="w-full">Salvar Qualificação</Button>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Col 3 — Sidebar */}
        <div className="w-full lg:w-[240px] shrink-0 space-y-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Próximas Ações</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {leadMeetings.filter(m => m.status === 'scheduled').slice(0, 3).map(m => (
                <div key={m.id} className="text-xs p-2 border rounded-lg">
                  <p className="font-medium">{m.title}</p>
                  <p className="text-muted-foreground">{format(new Date(m.scheduled_at), 'dd/MM HH:mm')}</p>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-full" asChild>
                <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank">
                  <MessageCircle className="h-4 w-4 mr-1" />Enviar WA
                </a>
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Empresa</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              {lead.niche && <p><span className="text-muted-foreground">Setor:</span> {lead.niche}</p>}
              {lead.employee_count && <p><span className="text-muted-foreground">Funcionários:</span> {lead.employee_count}</p>}
              {lead.founded_year && <p><span className="text-muted-foreground">Fundação:</span> {lead.founded_year}</p>}
              {lead.company_description && <p className="text-muted-foreground">{lead.company_description}</p>}
              {lead.pain_points && lead.pain_points.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1">Dores:</p>
                  <div className="flex flex-wrap gap-1">{lead.pain_points.map((p, i) => <Badge key={i} variant="outline" className="text-[10px]">{p}</Badge>)}</div>
                </div>
              )}
              {lead.service_opportunities && lead.service_opportunities.length > 0 && (
                <div>
                  <p className="text-muted-foreground mb-1">Oportunidades:</p>
                  <div className="flex flex-wrap gap-1">{lead.service_opportunities.map((s, i) => <Badge key={i} variant="secondary" className="text-[10px]">{s}</Badge>)}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Atividade</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between"><span className="text-muted-foreground">Mensagens</span><span className="font-medium">{lead.total_messages_exchanged || messages.length}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Follow-ups</span><span className="font-medium">{lead.follow_up_count}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Score</span><span className="font-medium">{lead.lead_score} pts</span></div>
              <Progress value={lead.lead_score} className="h-2 mt-2" />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

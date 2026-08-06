import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useConversations } from '@/hooks/use-conversations';
import { useActivityLog } from '@/hooks/use-activity-log';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import {
  Bot, Power, MessageSquare, Users, Calendar, Clock, Save, Loader2, Zap, ArrowRight,
  TrendingUp, AlertTriangle, ShieldAlert, Timer, Target, CheckCircle2, XCircle,
} from 'lucide-react';

const DIAS_SEMANA = [
  { value: 1, label: 'Seg' }, { value: 2, label: 'Ter' }, { value: 3, label: 'Qua' },
  { value: 4, label: 'Qui' }, { value: 5, label: 'Sex' }, { value: 6, label: 'Sáb' }, { value: 0, label: 'Dom' },
];

interface Escalation {
  id: string;
  lead_id: string;
  escalation_reason: string;
  priority: string;
  context: string | null;
  recommended_action: string | null;
  created_at: string;
  lead?: { business_name: string | null };
}

export function SDRAgentDashboard() {
  const { user } = useAuth();
  const { settings, updateSettings, isUpdating, isLoading } = useUserSettings();
  const { conversations } = useConversations();
  const { activities } = useActivityLog(20);
  const { toast } = useToast();
  const navigate = useNavigate();

  const [agentEnabled, setAgentEnabled] = useState(false);
  const [objective, setObjective] = useState('qualify_meeting');
  const [tone, setTone] = useState('consultivo');
  const [sdrScript, setSdrScript] = useState('');
  const [calendlyLink, setCalendlyLink] = useState('');
  const [transferOnObjection, setTransferOnObjection] = useState(true);
  const [autoSchedule, setAutoSchedule] = useState(false);
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [startHour, setStartHour] = useState('09:00');
  const [endHour, setEndHour] = useState('18:00');
  const [saving, setSaving] = useState(false);

  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [topObjections, setTopObjections] = useState<{ category: string; count: number }[]>([]);
  const [kpis, setKpis] = useState({
    conversations7d: 0,
    replyRatePct: 0,
    meetingsBooked7d: 0,
    avgFirstResponseMin: 0,
    escalationsOpen: 0,
    qualifiedRate: 0,
  });

  useEffect(() => {
    if (settings) {
      const s = settings as any;
      setAgentEnabled(s.sdr_agent_enabled || false);
      setObjective(s.sdr_objective || 'qualify_meeting');
      setTone(s.communication_style || 'consultivo');
      setSdrScript(s.sdr_script || '');
      setCalendlyLink(s.calendly_link || s.google_meet_link || '');
      setTransferOnObjection(s.sdr_transfer_objection !== false);
      setAutoSchedule(s.sdr_auto_schedule || false);
      setStartHour(String(s.auto_start_hour || 9).padStart(2, '0') + ':00');
      setEndHour(String(s.auto_end_hour || 18).padStart(2, '0') + ':00');
    }
  }, [settings]);

  // Load KPIs, escalations, top objections
  useEffect(() => {
    if (!user?.id) return;
    let cancel = false;

    (async () => {
      const since = new Date(Date.now() - 7 * 864e5).toISOString();

      const [{ data: msgs }, { data: meets }, { data: esc }, { data: objs }] = await Promise.all([
        supabase.from('chat_messages')
          .select('lead_id, sender_type, sent_at, leads!inner(user_id, stage)')
          .eq('leads.user_id', user.id)
          .gte('sent_at', since)
          .limit(2000),
        supabase.from('meetings')
          .select('id, status, created_at')
          .eq('user_id', user.id)
          .gte('created_at', since),
        supabase.from('agent_escalations')
          .select('id, lead_id, escalation_reason, priority, context, recommended_action, created_at, leads(business_name)')
          .eq('user_id', user.id)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(10),
        supabase.from('buying_signals')
          .select('signal_type')
          .eq('user_id', user.id)
          .gte('created_at', since),
      ]);

      if (cancel) return;

      // KPIs
      const byLead: Record<string, { agent: any[]; lead: any[]; stage: string }> = {};
      for (const m of (msgs as any[]) || []) {
        const lid = m.lead_id;
        if (!byLead[lid]) byLead[lid] = { agent: [], lead: [], stage: m.leads?.stage || '' };
        if (m.sender_type === 'lead') byLead[lid].lead.push(m);
        else byLead[lid].agent.push(m);
      }
      const totalLeads = Object.keys(byLead).length;
      const replied = Object.values(byLead).filter(v => v.lead.length > 0).length;
      const qualified = Object.values(byLead).filter(v =>
        ['Qualificado', 'Proposta', 'Negociação', 'Ganho'].includes(v.stage)
      ).length;

      // Avg first response time (min): agent msg after first lead msg
      let sumMin = 0, count = 0;
      for (const v of Object.values(byLead)) {
        if (!v.lead.length) continue;
        v.lead.sort((a, b) => +new Date(a.sent_at) - +new Date(b.sent_at));
        v.agent.sort((a, b) => +new Date(a.sent_at) - +new Date(b.sent_at));
        const firstLead = new Date(v.lead[0].sent_at).getTime();
        const nextAgent = v.agent.find(a => new Date(a.sent_at).getTime() > firstLead);
        if (nextAgent) {
          sumMin += (new Date(nextAgent.sent_at).getTime() - firstLead) / 60000;
          count++;
        }
      }

      setKpis({
        conversations7d: totalLeads,
        replyRatePct: totalLeads ? Math.round((replied / totalLeads) * 100) : 0,
        meetingsBooked7d: (meets as any[])?.length || 0,
        avgFirstResponseMin: count ? Math.round(sumMin / count) : 0,
        escalationsOpen: (esc as any[])?.length || 0,
        qualifiedRate: totalLeads ? Math.round((qualified / totalLeads) * 100) : 0,
      });

      setEscalations((esc as any[]) || []);

      const counter: Record<string, number> = {};
      for (const o of (objs as any[]) || []) counter[o.signal_type] = (counter[o.signal_type] || 0) + 1;
      setTopObjections(
        Object.entries(counter).map(([category, count]) => ({ category, count }))
          .sort((a, b) => b.count - a.count).slice(0, 5)
      );
    })();

    return () => { cancel = true; };
  }, [user?.id]);

  const handleToggleAgent = (enabled: boolean) => {
    setAgentEnabled(enabled);
    updateSettings({ auto_prospecting_enabled: enabled, sdr_agent_enabled: enabled } as any);
    toast({ title: enabled ? '🟢 Agente SDR ativado' : '⏸️ Agente SDR pausado' });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      updateSettings({
        sdr_agent_enabled: agentEnabled,
        communication_style: tone as any,
        google_meet_link: calendlyLink,
        auto_start_hour: parseInt(startHour),
        auto_end_hour: parseInt(endHour),
        work_days_only: !workDays.includes(0) && !workDays.includes(6),
        operate_all_day: startHour === '00:00' && endHour === '23:59',
      } as any);
      toast({ title: '✅ Configurações salvas' });
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) =>
    setWorkDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);

  const resolveEscalation = async (id: string) => {
    await supabase.from('agent_escalations')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', id);
    setEscalations(prev => prev.filter(e => e.id !== id));
    setKpis(k => ({ ...k, escalationsOpen: Math.max(0, k.escalationsOpen - 1) }));
    toast({ title: 'Escalação resolvida' });
  };

  const recentConversations = conversations.slice(0, 8);
  const sdrActivities = useMemo(() =>
    activities.filter(a => a.activity_type?.match(/sdr|ai_reply|message|escalation|meeting/)).slice(0, 12),
  [activities]);

  if (isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const kpiCards = [
    { label: 'Conversas (7d)', value: kpis.conversations7d, icon: MessageSquare, color: 'text-info' },
    { label: 'Taxa de resposta', value: `${kpis.replyRatePct}%`, icon: TrendingUp, color: 'text-success' },
    { label: 'Reuniões marcadas', value: kpis.meetingsBooked7d, icon: Calendar, color: 'text-primary' },
    { label: '1ª resposta (méd.)', value: `${kpis.avgFirstResponseMin}min`, icon: Timer, color: 'text-warning' },
    { label: 'Qualificação', value: `${kpis.qualifiedRate}%`, icon: Target, color: 'text-info' },
    { label: 'Escalações abertas', value: kpis.escalationsOpen, icon: ShieldAlert, color: kpis.escalationsOpen ? 'text-destructive' : 'text-muted-foreground' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpiCards.map(k => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="border-white/10">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-1">
                  <Icon className={`h-4 w-4 ${k.color}`} />
                </div>
                <p className="text-2xl font-bold tracking-tight">{k.value}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">{k.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* STATUS + ESCALATIONS */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="border-2 border-primary/20 lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`h-4 w-4 rounded-full ${agentEnabled ? 'bg-success animate-pulse' : 'bg-muted-foreground/30'}`} />
                <span className="font-medium">{agentEnabled ? 'Agente Ativo' : 'Agente Pausado'}</span>
              </div>
              <Switch checked={agentEnabled} onCheckedChange={handleToggleAgent} />
            </div>
            <Separator />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Quando ativo, o SDR responde leads automaticamente dentro do horário configurado,
              qualifica (BANT), detecta sinais de compra e agenda reuniões.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 ${escalations.length ? 'text-destructive' : 'text-muted-foreground'}`} />
                Escalações pendentes
              </CardTitle>
              <CardDescription>Casos que o agente sinalizou para você intervir</CardDescription>
            </div>
            <Badge variant={escalations.length ? 'destructive' : 'secondary'}>{escalations.length}</Badge>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[220px]">
              {escalations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Nada pendente. O agente está dando conta.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {escalations.map(e => (
                    <div key={e.id} className="flex items-start gap-3 p-3 rounded-lg border border-white/10 bg-muted/20">
                      <Badge variant={e.priority === 'urgent' || e.priority === 'high' ? 'destructive' : 'secondary'} className="text-[10px] mt-0.5 shrink-0">
                        {e.priority}
                      </Badge>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{e.lead?.business_name || 'Lead'}</p>
                        <p className="text-xs text-muted-foreground">{e.escalation_reason}</p>
                        {e.context && <p className="text-xs mt-1 line-clamp-2">{e.context}</p>}
                        {e.recommended_action && (
                          <p className="text-[11px] mt-1 text-primary/80">→ {e.recommended_action}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button size="sm" variant="outline" onClick={() => navigate(`/crm/inbox?lead=${e.lead_id}`)}>Abrir</Button>
                        <Button size="sm" variant="ghost" onClick={() => resolveEscalation(e.id)}>
                          <XCircle className="h-3 w-3 mr-1" /> Resolver
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* BEHAVIOR + SCHEDULE */}
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-warning" /> Comportamento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Objetivo</Label>
                <Select value={objective} onValueChange={setObjective}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="qualify_meeting">Qualificar e agendar</SelectItem>
                    <SelectItem value="present_service">Apresentar serviço</SelectItem>
                    <SelectItem value="answer_convert">Responder e converter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tom de voz</Label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="consultivo">Consultivo</SelectItem>
                    <SelectItem value="direto">Direto</SelectItem>
                    <SelectItem value="amigavel">Amigável</SelectItem>
                    <SelectItem value="formal">Formal</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Script base do SDR</Label>
              <Textarea rows={3} placeholder="Contexto do seu negócio e instruções específicas..." value={sdrScript} onChange={e => setSdrScript(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Link de agendamento</Label>
              <Input placeholder="https://calendly.com/..." value={calendlyLink} onChange={e => setCalendlyLink(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <label className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                Transferir em objeção forte
                <Switch checked={transferOnObjection} onCheckedChange={setTransferOnObjection} />
              </label>
              <label className="flex items-center justify-between text-sm p-2 rounded-md bg-muted/30">
                Agendar reunião auto
                <Switch checked={autoSchedule} onCheckedChange={setAutoSchedule} />
              </label>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-muted-foreground" /> Horário de operação</CardTitle>
            <CardDescription>O SDR só responde e envia follow-ups dentro desta janela</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {DIAS_SEMANA.map(d => (
                <label key={d.value} className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border cursor-pointer transition ${workDays.includes(d.value) ? 'bg-primary/10 border-primary/40' : 'border-white/10'}`}>
                  <Checkbox checked={workDays.includes(d.value)} onCheckedChange={() => toggleDay(d.value)} />
                  <span className="text-sm">{d.label}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Início</Label>
                <Input type="time" value={startHour} onChange={e => setStartHour(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Fim</Label>
                <Input type="time" value={endHour} onChange={e => setEndHour(e.target.value)} />
              </div>
            </div>
            <Button onClick={handleSave} className="w-full" disabled={isUpdating || saving}>
              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar configurações
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* CONVERSATIONS + OBJECTIONS + ACTIVITY */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><MessageSquare className="h-5 w-5 text-primary" /> Conversas em andamento</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[320px]">
              {recentConversations.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-20" />
                  <p className="text-sm">Nenhuma conversa ativa</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {recentConversations.map(conv => (
                    <div key={conv.lead.id}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => navigate('/crm/inbox')}>
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">
                          {conv.lead.business_name?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{conv.lead.business_name}</p>
                          {conv.lead.stage === 'Qualificado' && <Badge className="text-[10px] px-1.5 py-0">Qualificado</Badge>}
                          {agentEnabled && conv.hasMessages && <Badge variant="secondary" className="text-[10px] px-1.5 py-0">SDR</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{conv.lastMessage?.content || 'Sem mensagens'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-[10px] text-muted-foreground">
                          {conv.lastMessage?.sent_at ? formatDistanceToNow(new Date(conv.lastMessage.sent_at), { addSuffix: true, locale: ptBR }) : '—'}
                        </p>
                        {conv.unreadCount > 0 && <Badge className="mt-1 text-[10px] px-1.5">{conv.unreadCount}</Badge>}
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp className="h-5 w-5 text-success" /> Top sinais (7d)</CardTitle>
            <CardDescription>Padrões que estão aparecendo mais nas conversas</CardDescription>
          </CardHeader>
          <CardContent>
            {topObjections.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">Sem dados ainda</p>
            ) : (
              <div className="space-y-2">
                {topObjections.map(o => (
                  <div key={o.category} className="flex items-center justify-between p-2 rounded-md bg-muted/30">
                    <span className="text-sm capitalize">{o.category.replace(/_/g, ' ')}</span>
                    <Badge variant="secondary">{o.count}</Badge>
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" className="w-full mt-4" onClick={() => navigate('/objections')}>
              Biblioteca de objeções
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ACTIVITY LOG */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-warning" /> Log de ações do SDR</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[240px]">
            {sdrActivities.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Bot className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Nenhuma ação registrada ainda</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sdrActivities.map(a => (
                  <div key={a.id} className="flex items-start gap-3 p-2 rounded-lg bg-muted/30">
                    <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">{a.description}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(a.created_at), { addSuffix: true, locale: ptBR })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useMemo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';

import { ScrollArea } from '@/components/ui/scroll-area';
import { useMeetings } from '@/hooks/use-meetings';
import { useLeads } from '@/hooks/use-leads';
import { format, isSameDay, isToday, isBefore, isTomorrow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  Calendar as CalendarIcon, Video, CheckCircle, XCircle, Clock,
  MessageCircle, Loader2, AlertCircle, TrendingUp, Users, Flame,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

const statusConfig: Record<string, { label: string; className: string; icon: React.ReactNode }> = {
  scheduled: { label: 'Agendada', className: 'bg-info/10 text-info border-info/20', icon: <CalendarIcon className="h-3 w-3" /> },
  completed: { label: 'Concluída', className: 'bg-success/10 text-success border-success/20', icon: <CheckCircle className="h-3 w-3" /> },
  cancelled: { label: 'Cancelada', className: 'bg-destructive/10 text-destructive border-destructive/20', icon: <XCircle className="h-3 w-3" /> },
  no_show: { label: 'No Show', className: 'bg-warning/10 text-warning border-warning/20', icon: <AlertCircle className="h-3 w-3" /> },
};

export default function CRMActivitiesPage() {
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const { meetings, isLoading: meetingsLoading, updateMeeting } = useMeetings();
  const { leads } = useLeads();

  const meetingDates = useMemo(() => {
    const dates = new Set<string>();
    meetings.forEach(m => dates.add(format(new Date(m.scheduled_at), 'yyyy-MM-dd')));
    return dates;
  }, [meetings]);

  const dayMeetings = useMemo(() =>
    meetings.filter(m => isSameDay(new Date(m.scheduled_at), selectedDate))
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime()),
    [meetings, selectedDate]
  );

  const pendingFollowUps = useMemo(() =>
    leads.filter(l => l.next_follow_up_at && isBefore(new Date(l.next_follow_up_at), new Date()) && !['Ganho', 'Perdido'].includes(l.stage))
      .sort((a, b) => new Date(a.next_follow_up_at!).getTime() - new Date(b.next_follow_up_at!).getTime()),
    [leads]
  );

  const hotLeads = useMemo(() =>
    leads.filter(l => l.temperature === 'quente' && !['Ganho', 'Perdido'].includes(l.stage))
      .slice(0, 5),
    [leads]
  );

  const todayMeetings = useMemo(() => meetings.filter(m => isToday(new Date(m.scheduled_at))), [meetings]);
  const tomorrowMeetings = useMemo(() => meetings.filter(m => isTomorrow(new Date(m.scheduled_at))), [meetings]);
  const completedThisMonth = useMemo(() => {
    const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    return meetings.filter(m => m.status === 'completed' && new Date(m.scheduled_at) >= monthStart).length;
  }, [meetings]);

  const dateLabel = isToday(selectedDate)
    ? 'Hoje'
    : isTomorrow(selectedDate)
    ? 'Amanhã'
    : format(selectedDate, "EEEE, dd 'de' MMMM", { locale: ptBR });

  return (
    <div className="p-4 sm:p-6 page-enter">
      <PageHeader
        eyebrow="CRM"
        title="Atividades"
        description="Reuniões, follow-ups e tarefas do dia"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-info/10 flex items-center justify-center">
              <CalendarIcon className="h-4 w-4 text-info" />
            </div>
            <div>
              <p className="text-lg font-bold">{todayMeetings.length}</p>
              <p className="text-[11px] text-muted-foreground">Hoje</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Clock className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{tomorrowMeetings.length}</p>
              <p className="text-[11px] text-muted-foreground">Amanhã</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-warning/10 flex items-center justify-center">
              <AlertCircle className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className="text-lg font-bold">{pendingFollowUps.length}</p>
              <p className="text-[11px] text-muted-foreground">Follow-ups</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-success/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-lg font-bold">{completedThisMonth}</p>
              <p className="text-[11px] text-muted-foreground">Concluídas</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Calendar */}
        <div className="shrink-0">
          <Card className="border-border/50">
            <CardContent className="pt-4">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={d => d && setSelectedDate(d)}
                locale={ptBR}
                modifiers={{ hasMeeting: (date) => meetingDates.has(format(date, 'yyyy-MM-dd')) }}
                modifiersStyles={{ hasMeeting: { fontWeight: 'bold', color: 'hsl(var(--primary))' } }}
                className="rounded-xl"
              />
            </CardContent>
          </Card>

          {/* Hot leads quick view */}
          <Card className="border-border/50 mt-4">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Flame className="h-4 w-4 text-destructive" />
                Leads Quentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {hotLeads.length === 0 && <p className="text-xs text-muted-foreground">Nenhum lead quente</p>}
              {hotLeads.map(lead => (
                <div key={lead.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="h-7 w-7 rounded-full bg-destructive/10 flex items-center justify-center text-[10px] font-bold text-destructive">
                    {lead.business_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">{lead.business_name}</p>
                    <p className="text-[10px] text-muted-foreground">{lead.stage}</p>
                  </div>
                  <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="h-6 w-6 rounded-md bg-success/10 flex items-center justify-center hover:bg-success/20 transition-colors shrink-0">
                    <MessageCircle className="h-3 w-3 text-success" />
                  </a>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Day details */}
        <div className="flex-1 space-y-4">
          <h3 className="font-semibold text-base capitalize">{dateLabel}</h3>

          {/* Meetings */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <CalendarIcon className="h-4 w-4 text-primary" />
                Reuniões
                <Badge variant="secondary" className="ml-auto text-[10px]">{dayMeetings.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[350px]">
                <div className="space-y-2">
                  {meetingsLoading && <div className="flex items-center justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}
                  {dayMeetings.length === 0 && !meetingsLoading && (
                    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                      <CalendarIcon className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">Nenhuma reunião neste dia</p>
                    </div>
                  )}
                  {dayMeetings.map(m => {
                    const status = statusConfig[m.status] || statusConfig.scheduled;
                    return (
                      <div key={m.id} className="flex items-center gap-3 p-3 border border-border/50 rounded-xl hover:bg-muted/30 transition-colors">
                        <div className="text-center shrink-0 bg-primary/5 rounded-lg px-2.5 py-1.5">
                          <p className="text-sm font-bold text-primary">{format(new Date(m.scheduled_at), 'HH:mm')}</p>
                          <p className="text-[9px] text-muted-foreground">{m.duration_minutes}min</p>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{m.title}</p>
                          <p className="text-[11px] text-muted-foreground truncate">{m.description || 'Sem descrição'}</p>
                        </div>
                        <Badge variant="outline" className={`text-[10px] px-1.5 ${status.className} shrink-0`}>
                          {status.icon}
                          <span className="ml-1">{status.label}</span>
                        </Badge>
                        <div className="flex items-center gap-1 shrink-0">
                          {m.meeting_link && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" asChild>
                              <a href={m.meeting_link} target="_blank"><Video className="h-3.5 w-3.5 text-info" /></a>
                            </Button>
                          )}
                          {m.status === 'scheduled' && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => updateMeeting({ id: m.id, status: 'completed' })}>
                                <CheckCircle className="h-3.5 w-3.5 text-success" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => updateMeeting({ id: m.id, status: 'no_show' })}>
                                <XCircle className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* Follow-ups */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Clock className="h-4 w-4 text-warning" />
                Follow-ups Pendentes
                {pendingFollowUps.length > 0 && (
                  <Badge variant="outline" className="ml-auto text-[10px] bg-warning/10 text-warning border-warning/20">
                    {pendingFollowUps.length} pendentes
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="max-h-[300px]">
                <div className="space-y-2">
                  {pendingFollowUps.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-6 text-muted-foreground">
                      <CheckCircle className="h-8 w-8 mb-2 opacity-30" />
                      <p className="text-sm">Nenhum follow-up pendente 🎉</p>
                    </div>
                  )}
                  {pendingFollowUps.slice(0, 10).map(lead => (
                    <div key={lead.id} className="flex items-center gap-3 p-2.5 border border-border/50 rounded-xl hover:bg-muted/30 transition-colors">
                      <div className="h-8 w-8 rounded-full bg-warning/10 flex items-center justify-center text-[10px] font-bold text-warning">
                        {lead.business_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{lead.business_name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          Atrasado {lead.next_follow_up_at && format(new Date(lead.next_follow_up_at), 'dd/MM HH:mm')}
                        </p>
                      </div>
                      <Button variant="outline" size="sm" className="h-7 rounded-lg text-xs shrink-0" asChild>
                        <a href={`https://wa.me/${lead.phone.replace(/\D/g, '')}`} target="_blank">
                          <MessageCircle className="h-3 w-3 mr-1 text-success" />WA
                        </a>
                      </Button>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { useScheduledProspecting } from '@/hooks/use-scheduled-prospecting';
import {
  Calendar,
  Clock,
  Plus,
  Trash2,
  MapPin,
  Building2,
  Target,
  Loader2,
  Zap,
  TrendingUp,
  CalendarClock,
  Settings2,
  Users,
  BarChart3,
  ChevronRight,
  Repeat,
  AlertCircle,
} from 'lucide-react';

const DAYS_OF_WEEK = [
  { value: 0, label: 'Dom', full: 'Domingo' },
  { value: 1, label: 'Seg', full: 'Segunda' },
  { value: 2, label: 'Ter', full: 'Terça' },
  { value: 3, label: 'Qua', full: 'Quarta' },
  { value: 4, label: 'Qui', full: 'Quinta' },
  { value: 5, label: 'Sex', full: 'Sexta' },
  { value: 6, label: 'Sáb', full: 'Sábado' },
];

const NICHES = [
  'Restaurantes', 'Salões de Beleza', 'Academias', 'Clínicas',
  'Imobiliárias', 'Pet Shops', 'Oficinas', 'Lojas', 'Cafeterias',
  'Dentistas', 'Escritórios', 'Farmácias',
];

const LOCATIONS = [
  'São Paulo, SP', 'Rio de Janeiro, RJ', 'Belo Horizonte, MG',
  'Curitiba, PR', 'Porto Alegre, RS', 'Salvador, BA',
  'Brasília, DF', 'Fortaleza, CE',
];

export function ScheduledProspectingTab() {
  const { schedules, isLoading, createSchedule, toggleSchedule, deleteSchedule } = useScheduledProspecting();
  const [isCreating, setIsCreating] = useState(false);
  const [newSchedule, setNewSchedule] = useState({
    name: '',
    niches: [] as string[],
    locations: [] as string[],
    prospecting_type: 'consultivo',
    schedule_days: [1, 2, 3, 4, 5] as number[],
    schedule_hour: 9,
    max_leads_per_run: 20,
  });

  const handleCreate = async () => {
    if (!newSchedule.name || newSchedule.niches.length === 0 || newSchedule.locations.length === 0) return;
    await createSchedule.mutateAsync(newSchedule);
    setNewSchedule({
      name: '',
      niches: [],
      locations: [],
      prospecting_type: 'consultivo',
      schedule_days: [1, 2, 3, 4, 5],
      schedule_hour: 9,
      max_leads_per_run: 20,
    });
    setIsCreating(false);
  };

  const toggleDay = (day: number) => {
    setNewSchedule(prev => ({
      ...prev,
      schedule_days: prev.schedule_days.includes(day)
        ? prev.schedule_days.filter(d => d !== day)
        : [...prev.schedule_days, day].sort(),
    }));
  };

  const toggleNiche = (niche: string) => {
    setNewSchedule(prev => ({
      ...prev,
      niches: prev.niches.includes(niche)
        ? prev.niches.filter(n => n !== niche)
        : [...prev.niches, niche],
    }));
  };

  const toggleLocation = (location: string) => {
    setNewSchedule(prev => ({
      ...prev,
      locations: prev.locations.includes(location)
        ? prev.locations.filter(l => l !== location)
        : [...prev.locations, location],
    }));
  };

  const formatNextRun = (date: string | null) => {
    if (!date) return 'Não agendado';
    return new Date(date).toLocaleString('pt-BR', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeCount = schedules?.filter(s => s.is_active).length || 0;
  const totalLeads = schedules?.reduce((sum, s) => sum + (s.total_leads_captured || 0), 0) || 0;
  const nextRunDate = schedules?.filter(s => s.is_active && s.next_run_at)
    .sort((a, b) => new Date(a.next_run_at!).getTime() - new Date(b.next_run_at!).getTime())[0]?.next_run_at || null;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="relative">
          <div className="h-12 w-12 rounded-full border-2 border-primary/20" />
          <Loader2 className="h-12 w-12 animate-spin text-primary absolute inset-0" />
        </div>
        <p className="text-sm text-muted-foreground">Carregando agendamentos...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header com ação */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10">
            <CalendarClock className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-foreground">Prospecção Agendada</h3>
            <p className="text-sm text-muted-foreground">
              Automatize a captura de leads em horários específicos
            </p>
          </div>
        </div>

        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button className="gap-2 shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4" />
              Novo Agendamento
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Settings2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <DialogTitle>Criar Prospecção Agendada</DialogTitle>
                  <DialogDescription>
                    Configure a captura automática de leads
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6 mt-2">
              {/* Nome */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Nome do Agendamento</Label>
                <Input
                  placeholder="Ex: Restaurantes SP - Manhã"
                  value={newSchedule.name}
                  onChange={e => setNewSchedule(prev => ({ ...prev, name: e.target.value }))}
                  className="h-11"
                />
              </div>

              {/* Dias da Semana */}
              <div className="space-y-3">
                <Label className="text-sm font-medium">Dias da Semana</Label>
                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS_OF_WEEK.map(day => (
                    <button
                      key={day.value}
                      onClick={() => toggleDay(day.value)}
                      className={`
                        flex flex-col items-center gap-0.5 rounded-xl py-2.5 px-1 text-xs font-medium transition-all
                        ${newSchedule.schedule_days.includes(day.value)
                          ? 'bg-primary text-primary-foreground shadow-md shadow-primary/30'
                          : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                        }
                      `}
                    >
                      <span className="text-[10px] opacity-70">{day.full.slice(0, 3)}</span>
                      <span>{day.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Horário e Leads */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    Horário
                  </Label>
                  <Select
                    value={String(newSchedule.schedule_hour)}
                    onValueChange={v => setNewSchedule(prev => ({ ...prev, schedule_hour: parseInt(v) }))}
                  >
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 14 }, (_, i) => i + 6).map(hour => (
                        <SelectItem key={hour} value={String(hour)}>
                          {hour.toString().padStart(2, '0')}:00
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                    Máx. Leads: {newSchedule.max_leads_per_run}
                  </Label>
                  <div className="pt-3 px-1">
                    <Slider
                      value={[newSchedule.max_leads_per_run]}
                      onValueChange={([v]) => setNewSchedule(prev => ({ ...prev, max_leads_per_run: v }))}
                      min={5}
                      max={100}
                      step={5}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-muted-foreground px-1">
                    <span>5</span>
                    <span>100</span>
                  </div>
                </div>
              </div>

              {/* Tipo de Prospecção */}
              <div className="space-y-2">
                <Label className="text-sm font-medium">Tipo de Prospecção</Label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: 'consultivo', label: 'Consultivo', icon: TrendingUp, desc: 'Abordagem personalizada' },
                    { value: 'massivo', label: 'Massivo', icon: Zap, desc: 'Alto volume de leads' },
                  ].map(type => (
                    <button
                      key={type.value}
                      onClick={() => setNewSchedule(prev => ({ ...prev, prospecting_type: type.value }))}
                      className={`
                        flex items-center gap-3 rounded-xl p-3 border transition-all text-left
                        ${newSchedule.prospecting_type === type.value
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'border-border hover:border-primary/30'
                        }
                      `}
                    >
                      <div className={`p-2 rounded-lg ${newSchedule.prospecting_type === type.value ? 'bg-primary/15' : 'bg-muted'}`}>
                        <type.icon className={`h-4 w-4 ${newSchedule.prospecting_type === type.value ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{type.label}</p>
                        <p className="text-[11px] text-muted-foreground">{type.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Nichos */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                  Nichos
                  {newSchedule.niches.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-[10px] h-5">
                      {newSchedule.niches.length} selecionados
                    </Badge>
                  )}
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {NICHES.map(niche => (
                    <button
                      key={niche}
                      onClick={() => toggleNiche(niche)}
                      className={`
                        rounded-lg px-3 py-1.5 text-xs font-medium transition-all border
                        ${newSchedule.niches.includes(niche)
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/60'
                        }
                      `}
                    >
                      {niche}
                    </button>
                  ))}
                </div>
              </div>

              {/* Locais */}
              <div className="space-y-3">
                <Label className="text-sm font-medium flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  Locais
                  {newSchedule.locations.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-[10px] h-5">
                      {newSchedule.locations.length} selecionados
                    </Badge>
                  )}
                </Label>
                <div className="flex flex-wrap gap-1.5">
                  {LOCATIONS.map(location => (
                    <button
                      key={location}
                      onClick={() => toggleLocation(location)}
                      className={`
                        rounded-lg px-3 py-1.5 text-xs font-medium transition-all border
                        ${newSchedule.locations.includes(location)
                          ? 'bg-primary/10 border-primary/30 text-primary'
                          : 'bg-muted/30 border-transparent text-muted-foreground hover:bg-muted/60'
                        }
                      `}
                    >
                      {location}
                    </button>
                  ))}
                </div>
              </div>

              {/* Validação visual */}
              {(!newSchedule.name || newSchedule.niches.length === 0 || newSchedule.locations.length === 0) && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/10">
                  <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                  <div className="text-xs text-destructive/80">
                    {!newSchedule.name && <p>• Defina um nome para o agendamento</p>}
                    {newSchedule.niches.length === 0 && <p>• Selecione ao menos um nicho</p>}
                    {newSchedule.locations.length === 0 && <p>• Selecione ao menos um local</p>}
                  </div>
                </div>
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setIsCreating(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleCreate}
                disabled={!newSchedule.name || newSchedule.niches.length === 0 || newSchedule.locations.length === 0 || createSchedule.isPending}
                className="gap-2"
              >
                {createSchedule.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Zap className="h-4 w-4" />
                    Criar Agendamento
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: 'Agendamentos Ativos',
            value: activeCount,
            icon: Calendar,
            color: 'text-primary',
            bg: 'from-primary/15 to-primary/5',
            border: 'border-primary/10',
          },
          {
            label: 'Leads Capturados',
            value: totalLeads,
            icon: Target,
            color: 'text-success',
            bg: 'from-success/15 to-success/5',
            border: 'border-success/10',
          },
          {
            label: 'Próxima Execução',
            value: formatNextRun(nextRunDate),
            icon: Clock,
            color: 'text-info',
            bg: 'from-info/15 to-info/5',
            border: 'border-info/10',
            isText: true,
          },
        ].map((kpi) => (
          <Card key={kpi.label} className={`border ${kpi.border} overflow-hidden`}>
            <CardContent className="p-5 relative">
              <div className={`absolute inset-0 bg-gradient-to-br ${kpi.bg} opacity-40`} />
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">{kpi.label}</p>
                  {kpi.isText ? (
                    <p className={`text-sm font-semibold ${kpi.color}`}>{kpi.value}</p>
                  ) : (
                    <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                  )}
                </div>
                <div className={`p-2.5 rounded-xl bg-gradient-to-br ${kpi.bg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Lista de Agendamentos */}
      {!schedules || schedules.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center">
            <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center">
              <CalendarClock className="h-8 w-8 text-muted-foreground/50" />
            </div>
            <h3 className="font-semibold text-foreground mb-1">Nenhum agendamento configurado</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
              Automatize sua prospecção criando agendamentos para capturar leads nos horários ideais
            </p>
            <Button onClick={() => setIsCreating(true)} className="gap-2 shadow-lg shadow-primary/20">
              <Plus className="h-4 w-4" />
              Criar Primeiro Agendamento
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedules.map(schedule => (
            <Card
              key={schedule.id}
              className={`transition-all hover:shadow-md ${
                schedule.is_active
                  ? 'border-primary/15 shadow-sm'
                  : 'opacity-70 border-border'
              }`}
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between gap-4">
                  {/* Info */}
                  <div className="flex-1 space-y-3">
                    {/* Título + Status */}
                    <div className="flex items-center gap-2.5">
                      <div className={`w-2 h-2 rounded-full ${schedule.is_active ? 'bg-success animate-pulse' : 'bg-muted-foreground/30'}`} />
                      <h4 className="font-semibold text-foreground">{schedule.name}</h4>
                      <Badge
                        variant={schedule.is_active ? 'default' : 'secondary'}
                        className="text-[10px] h-5"
                      >
                        {schedule.is_active ? 'Ativo' : 'Pausado'}
                      </Badge>
                    </div>

                    {/* Metadata row */}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {schedule.schedule_hour.toString().padStart(2, '0')}:00
                      </span>
                      <span className="flex items-center gap-1">
                        <Repeat className="h-3.5 w-3.5" />
                        {schedule.schedule_days.map(d => DAYS_OF_WEEK[d]?.label).join(', ')}
                      </span>
                      <span className="flex items-center gap-1">
                        <BarChart3 className="h-3.5 w-3.5" />
                        {schedule.total_leads_captured || 0} leads
                      </span>
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        Máx. {schedule.max_leads_per_run}/execução
                      </span>
                    </div>

                    {/* Tags: nichos + locais */}
                    <div className="flex flex-wrap gap-1.5">
                      {schedule.niches.slice(0, 3).map(niche => (
                        <span key={niche} className="inline-flex items-center gap-1 rounded-md bg-primary/5 border border-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                          <Building2 className="h-3 w-3" />
                          {niche}
                        </span>
                      ))}
                      {schedule.niches.length > 3 && (
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          +{schedule.niches.length - 3}
                        </span>
                      )}
                      {schedule.locations.slice(0, 2).map(location => (
                        <span key={location} className="inline-flex items-center gap-1 rounded-md bg-info/5 border border-info/10 px-2 py-0.5 text-[11px] font-medium text-info">
                          <MapPin className="h-3 w-3" />
                          {location}
                        </span>
                      ))}
                      {schedule.locations.length > 2 && (
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                          +{schedule.locations.length - 2}
                        </span>
                      )}
                    </div>

                    {/* Próxima execução */}
                    {schedule.next_run_at && schedule.is_active && (
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <ChevronRight className="h-3 w-3" />
                        Próxima execução: <span className="font-medium text-foreground/80">{formatNextRun(schedule.next_run_at)}</span>
                      </div>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex items-center gap-2 shrink-0">
                    <Switch
                      checked={schedule.is_active}
                      onCheckedChange={(checked) =>
                        toggleSchedule.mutate({ id: schedule.id, is_active: checked })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteSchedule.mutate(schedule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

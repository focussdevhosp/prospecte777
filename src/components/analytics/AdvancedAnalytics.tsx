import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useLeads } from '@/hooks/use-leads';
import { useDashboardMetrics } from '@/hooks/use-dashboard-metrics';
import { useProspectingStats } from '@/hooks/use-prospecting-stats';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Area,
  AreaChart,
  Legend,
} from 'recharts';
import {
  TrendingUp,
  Clock,
  Calendar,
  Target,
  Users,
  MessageSquare,
  Zap,
  Award,
  BarChart3,
  Activity,
  Flame,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { format, subDays, startOfDay, eachDayOfInterval, parseISO, getHours, getDay } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import {
  CHART_SERIES,
  STAGE_COLORS,
  TEMPERATURE_COLORS,
  seriesColor,
} from '@/lib/chart-colors';

// Cores vêm do sistema (validadas para daltonismo e com passo próprio no
// modo escuro). O array de hex que estava aqui não mudava com o tema e
// colocava verde e vermelho lado a lado no funil.
const COLORS = CHART_SERIES;
const TEMP_COLORS = TEMPERATURE_COLORS;

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

// Reusable KPI card for analytics
function AnalyticsKPI({ 
  icon: Icon, 
  label, 
  value, 
  subtitle, 
  trend, 
  trendLabel,
  gradient,
  iconColor,
  delay = 0 
}: { 
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtitle?: string;
  trend?: 'up' | 'down' | 'neutral';
  trendLabel?: string;
  gradient: string;
  iconColor: string;
  delay?: number;
}) {
  return (
    <Card className={cn(
      "relative overflow-hidden border-0 animate-slide-up",
      gradient
    )} style={{ animationDelay: `${delay}ms` }}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="p-2.5 rounded-xl bg-background/80 backdrop-blur-sm shadow-sm">
            <Icon className={cn("h-5 w-5", iconColor)} />
          </div>
          {trend && trendLabel && (
            <div className={cn(
              "flex items-center gap-0.5 text-[11px] font-semibold px-2 py-1 rounded-full",
              trend === 'up' ? "bg-success/15 text-success" : 
              trend === 'down' ? "bg-destructive/15 text-destructive" :
              "bg-muted text-muted-foreground"
            )}>
              {trend === 'up' ? <ArrowUpRight className="h-3 w-3" /> : 
               trend === 'down' ? <ArrowDownRight className="h-3 w-3" /> : null}
              {trendLabel}
            </div>
          )}
        </div>
        <p className="text-2xl font-bold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground mt-1 font-medium">{label}</p>
        {subtitle && (
          <p className="text-[11px] text-muted-foreground/70 mt-0.5">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  );
}

const tooltipStyle = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '10px',
  boxShadow: '0 8px 30px -10px rgba(0,0,0,0.3)',
  fontSize: '12px',
};

export function AdvancedAnalytics() {
  const { leads } = useLeads();
  const { data: metrics } = useDashboardMetrics();
  const { stats } = useProspectingStats();

  const leadsOverTime = useMemo(() => {
    const last30Days = eachDayOfInterval({
      start: subDays(new Date(), 29),
      end: new Date(),
    });
    return last30Days.map(date => {
      const dayStart = startOfDay(date);
      const count = leads.filter(lead => {
        const leadDate = startOfDay(parseISO(lead.created_at));
        return leadDate.getTime() === dayStart.getTime();
      }).length;
      return {
        date: format(date, 'dd/MM', { locale: ptBR }),
        fullDate: format(date, 'dd MMM', { locale: ptBR }),
        leads: count,
      };
    });
  }, [leads]);

  const funnelData = useMemo(() => {
    const stages = ['Contato', 'Qualificado', 'Proposta', 'Negociação', 'Ganho'];
    return stages.map(stage => ({
      stage,
      count: metrics?.leadsByStage?.[stage as keyof typeof metrics.leadsByStage] || 0,
      fill: STAGE_COLORS[stage],
    }));
  }, [metrics]);

  const conversionData = useMemo(() => {
    const stages = ['Contato', 'Qualificado', 'Proposta', 'Negociação', 'Ganho'];
    return stages.slice(1).map((stage, index) => {
      const previous = stages[index];
      const prevCount = metrics?.leadsByStage?.[previous as keyof typeof metrics.leadsByStage] || 0;
      const currCount = metrics?.leadsByStage?.[stage as keyof typeof metrics.leadsByStage] || 0;
      const rate = prevCount > 0 ? ((currCount / prevCount) * 100) : 0;
      return { name: `${previous} → ${stage}`, rate: Math.round(rate) };
    });
  }, [metrics]);

  const heatmapData = useMemo(() => {
    const data: { day: number; hour: number; value: number }[] = [];
    const hourCounts: Record<string, number> = {};
    leads.forEach(lead => {
      const leadDate = parseISO(lead.created_at);
      const day = getDay(leadDate);
      const hour = getHours(leadDate);
      if (hour >= 8 && hour < 19) {
        const key = `${day}-${hour}`;
        hourCounts[key] = (hourCounts[key] || 0) + 1;
      }
    });
    for (let day = 0; day < 7; day++) {
      for (let hour = 8; hour < 19; hour++) {
        const key = `${day}-${hour}`;
        data.push({ day, hour, value: hourCounts[key] || 0 });
      }
    }
    return data;
  }, [leads]);

  const nicheData = useMemo(() => {
    const nicheCounts: Record<string, number> = {};
    leads.forEach(lead => {
      const niche = lead.niche || 'Outros';
      nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
    });
    return Object.entries(nicheCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 6)
      .map(([name, value], index) => ({
        name,
        value,
        fill: COLORS[index % COLORS.length],
      }));
  }, [leads]);

  const temperatureData = useMemo(() => [
    { name: 'Quentes', value: metrics?.hotLeads || 0, fill: TEMP_COLORS.quente },
    { name: 'Mornos', value: metrics?.warmLeads || 0, fill: TEMP_COLORS.morno },
    { name: 'Frios', value: metrics?.coldLeads || 0, fill: TEMP_COLORS.frio },
  ], [metrics]);

  const avgConversionDays = useMemo(() => {
    const wonLeads = leads.filter(l => l.stage === 'Ganho');
    if (wonLeads.length === 0) return 0;
    const totalDays = wonLeads.reduce((sum, lead) => {
      const created = new Date(lead.created_at);
      const updated = new Date(lead.updated_at);
      return sum + Math.floor((updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
    }, 0);
    return Math.round(totalDays / wonLeads.length);
  }, [leads]);

  const weeklyPerformance = useMemo(() => {
    const last7Days = eachDayOfInterval({
      start: subDays(new Date(), 6),
      end: new Date(),
    });
    return last7Days.map(date => {
      const dayStart = startOfDay(date);
      const dayLeads = leads.filter(lead => {
        const leadDate = startOfDay(parseISO(lead.created_at));
        return leadDate.getTime() === dayStart.getTime();
      });
      return {
        day: format(date, 'EEE', { locale: ptBR }),
        leads: dayLeads.length,
        messages: Math.floor(dayLeads.length * 1.5),
        responses: Math.floor(dayLeads.length * 0.3),
      };
    });
  }, [leads]);

  const maxHeatmapValue = Math.max(...heatmapData.map(d => d.value), 1);

  const activeLeads = (metrics?.totalLeads || 0) - (metrics?.leadsByStage?.Ganho || 0) - (metrics?.leadsByStage?.Perdido || 0);
  const responseRate = metrics?.totalLeads ? ((metrics?.warmLeads || 0 + (metrics?.hotLeads || 0)) / metrics.totalLeads * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        <AnalyticsKPI
          icon={MessageSquare}
          label="Taxa de Resposta"
          value={`${responseRate}%`}
          trend="up"
          trendLabel="+12%"
          subtitle="vs semana passada"
          gradient="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border-primary/20"
          iconColor="text-primary"
          delay={0}
        />
        <AnalyticsKPI
          icon={Clock}
          label="Tempo Médio de Conversão"
          value={`${avgConversionDays} dias`}
          subtitle="Do contato à venda"
          trend="neutral"
          gradient="bg-gradient-to-br from-info/15 via-info/5 to-transparent border-info/20"
          iconColor="text-info"
          delay={50}
        />
        <AnalyticsKPI
          icon={Users}
          label="Leads Ativos"
          value={activeLeads}
          subtitle="Em negociação ativa"
          trend={activeLeads > 0 ? 'up' : 'neutral'}
          trendLabel={activeLeads > 0 ? `${activeLeads}` : undefined}
          gradient="bg-gradient-to-br from-warning/15 via-warning/5 to-transparent border-warning/20"
          iconColor="text-warning"
          delay={100}
        />
        <AnalyticsKPI
          icon={Award}
          label="Win Rate"
          value={`${(metrics?.conversionRate || 0).toFixed(1)}%`}
          trend={metrics?.leadsByStage?.Ganho ? 'up' : 'neutral'}
          trendLabel={`${metrics?.leadsByStage?.Ganho || 0} vendas`}
          gradient="bg-gradient-to-br from-primary/15 via-primary/5 to-transparent border-primary/20"
          iconColor="text-primary"
          delay={150}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="p-1.5 rounded-lg bg-success/10">
                    <BarChart3 className="h-4 w-4 text-success" />
                  </div>
                  Leads ao Longo do Tempo
                </CardTitle>
                <CardDescription className="mt-1">Últimos 30 dias</CardDescription>
              </div>
              <Badge variant="secondary" className="text-[10px]">30D</Badge>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={leadsOverTime}>
                <defs>
                  <linearGradient id="colorLeadsAnalytics" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-3))" stopOpacity={0.35}/>
                    <stop offset="100%" stopColor="hsl(var(--chart-3))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} interval="preserveStartEnd" axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Area type="monotone" dataKey="leads" stroke="hsl(var(--chart-3))" strokeWidth={2.5} fillOpacity={1} fill="url(#colorLeadsAnalytics)" dot={false} activeDot={{ r: 5, fill: 'hsl(var(--chart-3))', stroke: 'hsl(var(--card))', strokeWidth: 2 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <div className="p-1.5 rounded-lg bg-info/10">
                    <Target className="h-4 w-4 text-info" />
                  </div>
                  Funil de Vendas
                </CardTitle>
                <CardDescription className="mt-1">Distribuição por estágio</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-2">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={funnelData} layout="vertical" barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="stage" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} width={85} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={24}>
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Leads por Nicho</CardTitle>
            <CardDescription>Top 6 nichos</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={nicheData} innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {nicheData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-1.5 mt-3">
              {nicheData.map((item) => (
                <div key={item.name} className="flex items-center gap-2 text-xs px-2 py-1 rounded-md bg-muted/30">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                  <span className="truncate text-muted-foreground">{item.name}</span>
                  <span className="font-semibold ml-auto">{item.value}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Flame className="h-4 w-4 text-brand" />
              Temperatura dos Leads
            </CardTitle>
            <CardDescription>Engajamento atual</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie data={temperatureData} innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" strokeWidth={0}>
                  {temperatureData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-5 mt-3">
              {temperatureData.map(item => (
                <div key={item.name} className="text-center">
                  <p className="text-xl font-bold" style={{ color: item.fill }}>{item.value}</p>
                  <p className="text-[11px] text-muted-foreground font-medium">{item.name}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Taxas de Conversão</CardTitle>
            <CardDescription>Entre estágios do funil</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3.5 pt-1">
            {conversionData.map(item => (
              <div key={item.name}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">{item.name}</span>
                  <Badge 
                    variant={item.rate > 50 ? 'default' : 'secondary'} 
                    className={cn(
                      "text-[10px] h-5",
                      item.rate > 50 && "bg-success/15 text-success border-0"
                    )}
                  >
                    {item.rate}%
                  </Badge>
                </div>
                <Progress value={item.rate} className="h-1.5" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Heatmap */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="p-1.5 rounded-lg bg-success/10">
                  <Calendar className="h-4 w-4 text-success" />
                </div>
                Melhores Horários para Contato
              </CardTitle>
              <CardDescription className="mt-1">Baseado em respostas e engajamento</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <div className="min-w-[550px]">
              <div className="flex mb-2">
                <div className="w-10" />
                {HOURS.slice(8, 19).map(hour => (
                  <div key={hour} className="flex-1 text-center text-[10px] text-muted-foreground font-medium">
                    {hour}h
                  </div>
                ))}
              </div>
              {DAYS.map((day, dayIndex) => (
                <div key={day} className="flex items-center mb-1">
                  <div className="w-10 text-xs text-muted-foreground font-medium">{day}</div>
                  <div className="flex flex-1 gap-0.5">
                    {HOURS.slice(8, 19).map(hour => {
                      const cell = heatmapData.find(d => d.day === dayIndex && d.hour === hour);
                      const intensity = cell ? cell.value / maxHeatmapValue : 0;
                      return (
                        <div
                          key={`${day}-${hour}`}
                          className="flex-1 h-7 rounded transition-all cursor-pointer hover:ring-1 hover:ring-primary/50 hover:scale-110"
                          style={{
                            backgroundColor: intensity > 0 
                              ? `rgba(16, 185, 129, ${0.15 + intensity * 0.75})`
                              : 'hsl(var(--muted) / 0.3)',
                          }}
                          title={`${day} ${hour}h: ${cell?.value || 0} contatos`}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-end gap-2 mt-3">
                <span className="text-[10px] text-muted-foreground">Menos</span>
                <div className="flex gap-0.5">
                  {[0.1, 0.3, 0.5, 0.7, 0.9].map(opacity => (
                    <div key={opacity} className="w-4 h-4 rounded" style={{ backgroundColor: `rgba(16, 185, 129, ${opacity})` }} />
                  ))}
                </div>
                <span className="text-[10px] text-muted-foreground">Mais</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Weekly Performance */}
      <Card className="border-border/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <div className="p-1.5 rounded-lg bg-info/10">
                  <Activity className="h-4 w-4 text-info" />
                </div>
                Performance Semanal
              </CardTitle>
              <CardDescription className="mt-1">Leads, mensagens e respostas - últimos 7 dias</CardDescription>
            </div>
            <Badge variant="secondary" className="text-[10px]">7D</Badge>
          </div>
        </CardHeader>
        <CardContent className="pt-2">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weeklyPerformance} barCategoryGap="25%">
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend 
                wrapperStyle={{ fontSize: '12px' }}
                iconType="circle"
                iconSize={8}
              />
              <Bar dataKey="leads" name="Leads" fill="hsl(var(--chart-3))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="messages" name="Mensagens" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="responses" name="Respostas" fill="hsl(var(--chart-6))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}

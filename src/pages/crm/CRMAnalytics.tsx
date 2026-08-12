import { useMemo } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLeads } from '@/hooks/use-leads';
import { allStages } from '@/constants/lead-icons';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, RadialBarChart, RadialBar,
} from 'recharts';
import { DollarSign, TrendingUp, Target, Users, Loader2, ArrowUpRight, ArrowDownRight, Flame } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

const COLORS = ['hsl(var(--chart-4))', 'hsl(var(--chart-6))', 'hsl(var(--destructive))', 'hsl(var(--chart-3))', 'hsl(var(--chart-1))', 'hsl(var(--chart-5))', '#06b6d4', 'hsl(var(--chart-2))'];

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);

export default function CRMAnalyticsPage() {
  const { leads, isLoading } = useLeads();

  const metrics = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const active = leads.filter(l => !['Ganho', 'Perdido'].includes(l.stage));
    const wonThisMonth = leads.filter(l => l.stage === 'Ganho' && new Date(l.updated_at) >= monthStart);
    const wonLastMonth = leads.filter(l => l.stage === 'Ganho' && new Date(l.updated_at) >= lastMonthStart && new Date(l.updated_at) < monthStart);
    const totalPipeline = active.reduce((s, l) => s + (l.deal_value || 0), 0);
    const wonValues = leads.filter(l => l.stage === 'Ganho').map(l => l.deal_value || 0);
    const avgTicket = wonValues.length > 0 ? wonValues.reduce((a, b) => a + b, 0) / wonValues.length : 0;
    const totalLeads = leads.filter(l => l.stage !== 'Perdido').length;
    const wonTotal = leads.filter(l => l.stage === 'Ganho').length;
    const conversionRate = totalLeads > 0 ? (wonTotal / totalLeads) * 100 : 0;
    const hotLeads = leads.filter(l => l.temperature === 'quente' && !['Ganho', 'Perdido'].includes(l.stage)).length;

    return { totalPipeline, wonThisMonth: wonThisMonth.length, wonLastMonth: wonLastMonth.length, conversionRate, avgTicket, hotLeads, totalLeads: leads.length };
  }, [leads]);

  const funnelData = useMemo(() =>
    allStages.map((stage, i) => ({
      name: stage,
      count: leads.filter(l => l.stage === stage).length,
      fill: COLORS[i % COLORS.length],
    })),
    [leads]
  );

  const sourceData = useMemo(() => {
    const map = new Map<string, number>();
    leads.forEach(l => { const s = l.source || 'manual'; map.set(s, (map.get(s) || 0) + 1); });
    return Array.from(map.entries()).map(([name, value]) => ({
      name: name === 'google_maps' ? 'Google Maps' : name === 'manual' ? 'Manual' : name === 'instagram' ? 'Instagram' : name === 'facebook' ? 'Facebook' : name,
      value,
    }));
  }, [leads]);

  const tempData = useMemo(() => {
    const hot = leads.filter(l => l.temperature === 'quente').length;
    const warm = leads.filter(l => l.temperature === 'morno').length;
    const cold = leads.filter(l => l.temperature === 'frio').length;
    return [
      { name: 'Quente', value: hot, fill: 'hsl(var(--destructive))' },
      { name: 'Morno', value: warm, fill: 'hsl(var(--chart-6))' },
      { name: 'Frio', value: cold, fill: '#3b82f6' },
    ];
  }, [leads]);

  const nicheData = useMemo(() => {
    const map = new Map<string, { total: number; won: number; value: number }>();
    leads.forEach(l => {
      const n = l.niche || 'Outros';
      const existing = map.get(n) || { total: 0, won: 0, value: 0 };
      existing.total++;
      if (l.stage === 'Ganho') existing.won++;
      existing.value += l.deal_value || 0;
      map.set(n, existing);
    });
    return Array.from(map.entries())
      .map(([name, d]) => ({
        name: name.length > 15 ? name.slice(0, 15) + '…' : name,
        total: d.total,
        conversion: d.total > 0 ? Math.round((d.won / d.total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [leads]);

  if (isLoading) return (
    <div className="p-6">
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Carregando analytics...</p>
        </div>
      </div>
    </div>
  );

  const wonTrend = metrics.wonThisMonth - metrics.wonLastMonth;

  const kpis = [
    {
      label: 'Pipeline Total',
      value: fmt(metrics.totalPipeline),
      icon: DollarSign,
      color: 'text-success',
      bg: 'bg-success/10',
      trend: null,
    },
    {
      label: 'Convertidos no Mês',
      value: metrics.wonThisMonth.toString(),
      icon: TrendingUp,
      color: 'text-primary',
      bg: 'bg-primary/10',
      trend: wonTrend,
    },
    {
      label: 'Taxa de Conversão',
      value: `${metrics.conversionRate.toFixed(1)}%`,
      icon: Target,
      color: 'text-primary',
      bg: 'bg-primary/10',
      trend: null,
    },
    {
      label: 'Ticket Médio',
      value: fmt(metrics.avgTicket),
      icon: Users,
      color: 'text-warning',
      bg: 'bg-warning/10',
      trend: null,
    },
  ];

  return (
    <div className="p-4 sm:p-6 page-enter">
      <PageHeader
        eyebrow="CRM"
        title="Analytics"
        description="Métricas e insights do seu funil de vendas"
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map((kpi, i) => (
          <Card key={i} className="border-border/50 hover:shadow-md transition-shadow">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start justify-between">
                <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${kpi.bg}`}>
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                </div>
                {kpi.trend !== null && (
                  <Badge variant="outline" className={`text-[10px] ${kpi.trend >= 0 ? 'text-success border-success/20' : 'text-destructive border-destructive/20'}`}>
                    {kpi.trend >= 0 ? <ArrowUpRight className="h-3 w-3 mr-0.5" /> : <ArrowDownRight className="h-3 w-3 mr-0.5" />}
                    {Math.abs(kpi.trend)}
                  </Badge>
                )}
              </div>
              <p className="text-xl sm:text-2xl font-bold mt-3">{kpi.value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{kpi.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Extra metrics row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-destructive/10 flex items-center justify-center">
              <Flame className="h-4 w-4 text-destructive" />
            </div>
            <div>
              <p className="text-lg font-bold">{metrics.hotLeads}</p>
              <p className="text-[11px] text-muted-foreground">Leads quentes</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-lg font-bold">{metrics.totalLeads}</p>
              <p className="text-[11px] text-muted-foreground">Total de leads</p>
            </div>
          </CardContent>
        </Card>
        {tempData.slice(0, 2).map((t, i) => (
          <Card key={i} className="border-border/50">
            <CardContent className="pt-3 pb-3 flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${t.fill}15` }}>
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: t.fill }} />
              </div>
              <div>
                <p className="text-lg font-bold">{t.value}</p>
                <p className="text-[11px] text-muted-foreground">{t.name}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Funnel */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" />
              Funil de Conversão
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={funnelData} layout="vertical" barSize={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis type="number" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis dataKey="name" type="category" width={85} tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {funnelData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Sources pie */}
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-primary" />
              Leads por Fonte
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={sourceData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={90}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, value }) => `${name} (${value})`}
                  labelLine={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1 }}
                >
                  {sourceData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Niche analysis */}
        <Card className="lg:col-span-2 border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Performance por Nicho
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={nicheData} barGap={8}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.5} />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid hsl(var(--border))', background: 'hsl(var(--card))' }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="total" name="Total Leads" fill="hsl(var(--chart-4))" radius={[6, 6, 0, 0]} />
                <Bar dataKey="conversion" name="Conversão %" fill="hsl(var(--chart-3))" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

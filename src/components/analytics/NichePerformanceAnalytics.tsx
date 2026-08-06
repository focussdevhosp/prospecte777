import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

import { useLeads } from '@/hooks/use-leads';
import { useProspectingStats } from '@/hooks/use-prospecting-stats';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  ComposedChart,
  Line,
  Area,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  Target,
  MapPin,
  Briefcase,
  Award,
  Zap,
  BarChart3,
  Star,
  Users,
  MessageSquare,
  ThumbsUp,
  Percent,
} from 'lucide-react';
import { CHART_SERIES, CHART_TOOLTIP_STYLE } from '@/lib/chart-colors';

// Ordem categórica do sistema. O array anterior repetia a mesma cor em
// duas posições (verde no índice 0 e no 6), então dois nichos diferentes
// saíam idênticos assim que a lista passava de seis.
const COLORS = CHART_SERIES;

interface NicheMetrics {
  niche: string;
  totalLeads: number;
  hotLeads: number;
  warmLeads: number;
  coldLeads: number;
  wonLeads: number;
  conversionRate: number;
  avgRating: number;
  responseRate: number;
}

interface LocationMetrics {
  location: string;
  totalLeads: number;
  conversionRate: number;
  wonLeads: number;
  avgResponseTime: number;
}

export function NichePerformanceAnalytics() {
  const { leads } = useLeads();
  const { stats } = useProspectingStats();

  // Calculate metrics by niche
  const nicheMetrics = useMemo(() => {
    const nicheMap: Record<string, NicheMetrics> = {};
    
    leads.forEach(lead => {
      const niche = lead.niche || 'Outros';
      if (!nicheMap[niche]) {
        nicheMap[niche] = {
          niche,
          totalLeads: 0,
          hotLeads: 0,
          warmLeads: 0,
          coldLeads: 0,
          wonLeads: 0,
          conversionRate: 0,
          avgRating: 0,
          responseRate: 0,
        };
      }
      
      nicheMap[niche].totalLeads++;
      
      if (lead.temperature === 'quente') nicheMap[niche].hotLeads++;
      else if (lead.temperature === 'morno') nicheMap[niche].warmLeads++;
      else nicheMap[niche].coldLeads++;
      
      if (lead.stage === 'Ganho') nicheMap[niche].wonLeads++;
      if (lead.rating) nicheMap[niche].avgRating += Number(lead.rating) || 0;
    });

    // Calculate averages and rates
    Object.values(nicheMap).forEach(metrics => {
      metrics.conversionRate = metrics.totalLeads > 0 
        ? (metrics.wonLeads / metrics.totalLeads) * 100 
        : 0;
      metrics.avgRating = metrics.totalLeads > 0 
        ? metrics.avgRating / metrics.totalLeads 
        : 0;
      metrics.responseRate = metrics.totalLeads > 0 
        ? ((metrics.hotLeads + metrics.warmLeads) / metrics.totalLeads) * 100 
        : 0;
    });

    return Object.values(nicheMap)
      .sort((a, b) => b.totalLeads - a.totalLeads)
      .slice(0, 10);
  }, [leads]);

  // Calculate metrics by location
  const locationMetrics = useMemo(() => {
    const locationMap: Record<string, LocationMetrics> = {};
    
    leads.forEach(lead => {
      const location = lead.location || 'Desconhecido';
      if (!locationMap[location]) {
        locationMap[location] = {
          location,
          totalLeads: 0,
          conversionRate: 0,
          wonLeads: 0,
          avgResponseTime: 0,
        };
      }
      
      locationMap[location].totalLeads++;
      if (lead.stage === 'Ganho') locationMap[location].wonLeads++;
    });

    // Calculate conversion rates
    Object.values(locationMap).forEach(metrics => {
      metrics.conversionRate = metrics.totalLeads > 0 
        ? (metrics.wonLeads / metrics.totalLeads) * 100 
        : 0;
    });

    return Object.values(locationMap)
      .sort((a, b) => b.totalLeads - a.totalLeads)
      .slice(0, 10);
  }, [leads]);

  // Find best performing niche
  const bestNiche = useMemo(() => {
    if (nicheMetrics.length === 0) return null;
    return nicheMetrics.reduce((best, current) => 
      current.conversionRate > best.conversionRate ? current : best
    );
  }, [nicheMetrics]);

  // Find best performing location
  const bestLocation = useMemo(() => {
    if (locationMetrics.length === 0) return null;
    return locationMetrics.reduce((best, current) => 
      current.conversionRate > best.conversionRate ? current : best
    );
  }, [locationMetrics]);

  // Radar chart data for top 5 niches
  const radarData = useMemo(() => {
    const top5 = nicheMetrics.slice(0, 5);
    return [
      { metric: 'Volume', ...Object.fromEntries(top5.map(n => [n.niche, Math.min(n.totalLeads * 10, 100)])) },
      { metric: 'Conversão', ...Object.fromEntries(top5.map(n => [n.niche, n.conversionRate])) },
      { metric: 'Resposta', ...Object.fromEntries(top5.map(n => [n.niche, n.responseRate])) },
      { metric: 'Avaliação', ...Object.fromEntries(top5.map(n => [n.niche, n.avgRating * 20])) },
      { metric: 'Quentes', ...Object.fromEntries(top5.map(n => [n.niche, n.totalLeads > 0 ? (n.hotLeads / n.totalLeads) * 100 : 0])) },
    ];
  }, [nicheMetrics]);

  // Combined performance data
  const performanceData = useMemo(() => {
    return nicheMetrics.map((n, index) => ({
      name: n.niche.length > 15 ? n.niche.slice(0, 15) + '...' : n.niche,
      fullName: n.niche,
      leads: n.totalLeads,
      conversao: Math.round(n.conversionRate),
      resposta: Math.round(n.responseRate),
      fill: COLORS[index % COLORS.length],
    }));
  }, [nicheMetrics]);

  // Location bar data
  const locationData = useMemo(() => {
    return locationMetrics.map((l, index) => ({
      name: l.location.length > 12 ? l.location.slice(0, 12) + '...' : l.location,
      fullName: l.location,
      leads: l.totalLeads,
      ganhos: l.wonLeads,
      conversao: Math.round(l.conversionRate),
      fill: COLORS[index % COLORS.length],
    }));
  }, [locationMetrics]);

  if (leads.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">Nenhum dado disponível</p>
          <p className="text-sm text-muted-foreground">
            Capture leads para ver a análise de performance por nicho e localização.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Best Performers Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        {bestNiche && (
          <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Melhor Nicho</p>
                  <p className="text-2xl font-bold truncate">{bestNiche.niche}</p>
                </div>
                <div className="p-3 rounded-xl bg-primary/20">
                  <Briefcase className="h-6 w-6 text-primary" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-lg font-semibold">{bestNiche.totalLeads}</p>
                  <p className="text-xs text-muted-foreground">Leads</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-success">{bestNiche.conversionRate.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">Conversão</p>
                </div>
                <div>
                  <p className="text-lg font-semibold">{bestNiche.wonLeads}</p>
                  <p className="text-xs text-muted-foreground">Ganhos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {bestLocation && (
          <Card className="bg-gradient-to-br from-info/10 to-transparent border-info/20">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Melhor Localização</p>
                  <p className="text-2xl font-bold truncate">{bestLocation.location}</p>
                </div>
                <div className="p-3 rounded-xl bg-info/20">
                  <MapPin className="h-6 w-6 text-info" />
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-lg font-semibold">{bestLocation.totalLeads}</p>
                  <p className="text-xs text-muted-foreground">Leads</p>
                </div>
                <div>
                  <p className="text-lg font-semibold text-success">{bestLocation.conversionRate.toFixed(1)}%</p>
                  <p className="text-xs text-muted-foreground">Conversão</p>
                </div>
                <div>
                  <p className="text-lg font-semibold">{bestLocation.wonLeads}</p>
                  <p className="text-xs text-muted-foreground">Ganhos</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Performance Comparison */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Volume e conversão eram um gráfico só, com duas escalas de Y
            (contagem à esquerda, porcentagem à direita). Isso convida a
            comparar a altura da barra com a altura da linha, e elas não são
            comparáveis: dá para mover a linha só mudando a escala. Dois
            gráficos, cada um com sua escala, dizem a verdade. */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Volume por nicho
            </CardTitle>
            <CardDescription>Quantos leads cada nicho trouxe</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={performanceData} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number) => [value, 'Leads']}
                />
                <Bar dataKey="leads" fill="hsl(var(--chart-1))" name="Leads" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5" />
              Conversão por nicho
            </CardTitle>
            <CardDescription>Percentual que virou negócio fechado</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={performanceData} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fontSize: 12 }} unit="%" />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number) => [`${value}%`, 'Conversão']}
                />
                <Bar dataKey="conversao" fill="hsl(var(--chart-2))" name="Conversão" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Performance por Localização
            </CardTitle>
            <CardDescription>Leads e vendas por região</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={locationData} margin={{ left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 11 }} 
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Bar dataKey="leads" fill="hsl(var(--chart-4))" name="Total Leads" radius={[4, 4, 0, 0]} />
                <Bar dataKey="ganhos" fill="hsl(var(--chart-3))" name="Ganhos" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Niche Rankings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="h-5 w-5" />
            Ranking de Nichos
          </CardTitle>
          <CardDescription>Comparativo completo de performance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {nicheMetrics.slice(0, 8).map((niche, index) => (
              <div key={niche.niche} className="flex items-center gap-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-muted font-bold text-sm">
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium truncate">{niche.niche}</span>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <Users className="h-3 w-3 mr-1" />
                        {niche.totalLeads}
                      </Badge>
                      <Badge 
                        variant={niche.conversionRate >= 20 ? "default" : "secondary"} 
                        className="text-xs"
                      >
                        <TrendingUp className="h-3 w-3 mr-1" />
                        {niche.conversionRate.toFixed(1)}%
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 h-2">
                    <div 
                      className="bg-destructive rounded-l" 
                      style={{ width: `${niche.totalLeads > 0 ? (niche.hotLeads / niche.totalLeads) * 100 : 0}%` }}
                      title="Quentes"
                    />
                    <div 
                      className="bg-warning" 
                      style={{ width: `${niche.totalLeads > 0 ? (niche.warmLeads / niche.totalLeads) * 100 : 0}%` }}
                      title="Mornos"
                    />
                    <div 
                      className="bg-info rounded-r" 
                      style={{ width: `${niche.totalLeads > 0 ? (niche.coldLeads / niche.totalLeads) * 100 : 0}%` }}
                      title="Frios"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          <div className="flex items-center justify-center gap-6 mt-6 pt-4 border-t">
            <div className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 rounded bg-destructive" />
              <span className="text-muted-foreground">Quentes</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 rounded bg-warning" />
              <span className="text-muted-foreground">Mornos</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <div className="w-3 h-3 rounded bg-info" />
              <span className="text-muted-foreground">Frios</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insights and Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-warning" />
            Insights Automáticos
          </CardTitle>
          <CardDescription>Recomendações baseadas nos seus dados</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2">
            {bestNiche && bestNiche.conversionRate > 0 && (
              <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                <div className="flex items-start gap-3">
                  <ThumbsUp className="h-5 w-5 text-success mt-0.5" />
                  <div>
                    <p className="font-medium text-success dark:text-success">Nicho de Alta Performance</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      <strong>{bestNiche.niche}</strong> tem a melhor taxa de conversão ({bestNiche.conversionRate.toFixed(1)}%). 
                      Considere aumentar a prospecção neste nicho.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {bestLocation && bestLocation.conversionRate > 0 && (
              <div className="p-4 rounded-lg bg-info/10 border border-info/20">
                <div className="flex items-start gap-3">
                  <MapPin className="h-5 w-5 text-info mt-0.5" />
                  <div>
                    <p className="font-medium text-info dark:text-info">Região Promissora</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      <strong>{bestLocation.location}</strong> apresenta excelentes resultados. 
                      Foque sua prospecção nesta região para maximizar conversões.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {nicheMetrics.some(n => n.responseRate < 20 && n.totalLeads >= 5) && (
              <div className="p-4 rounded-lg bg-warning/10 border border-warning/20">
                <div className="flex items-start gap-3">
                  <MessageSquare className="h-5 w-5 text-warning mt-0.5" />
                  <div>
                    <p className="font-medium text-warning dark:text-warning">Baixa Taxa de Resposta</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Alguns nichos têm baixa taxa de resposta. Considere revisar suas mensagens 
                      ou testar diferentes abordagens com A/B testing.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {nicheMetrics.length >= 3 && (
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                <div className="flex items-start gap-3">
                  <Star className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium text-primary dark:text-primary">Diversificação</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Você está prospectando em {nicheMetrics.length} nichos diferentes. 
                      Continue diversificando para encontrar novas oportunidades.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

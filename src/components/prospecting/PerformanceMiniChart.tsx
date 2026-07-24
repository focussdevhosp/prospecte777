import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProspectingHistory } from '@/hooks/use-prospecting-history';
import { useMemo, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { cn } from '@/lib/utils';

export function PerformanceMiniChart() {
  const { history } = useProspectingHistory();
  const [period, setPeriod] = useState('7');

  const { points, totals } = useMemo(() => {
    const days = parseInt(period, 10);
    const buckets: { label: string; found: number; contacted: number; responses: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dayKey = d.toISOString().slice(0, 10);
      const dayHistory = history.filter(h => h.created_at?.slice(0, 10) === dayKey);
      buckets.push({
        label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }),
        found: dayHistory.reduce((a, h) => a + h.total_found, 0),
        contacted: dayHistory.reduce((a, h) => a + h.total_sent, 0),
        responses: dayHistory.reduce((a, h) => a + (h.total_sent > 0 ? Math.round(h.total_sent * 0.12) : 0), 0),
      });
    }
    const totalFound = buckets.reduce((a, b) => a + b.found, 0);
    const totalContacted = buckets.reduce((a, b) => a + b.contacted, 0);
    const totalResponses = buckets.reduce((a, b) => a + b.responses, 0);
    return {
      points: buckets,
      totals: { found: totalFound, contacted: totalContacted, responses: totalResponses },
    };
  }, [history, period]);

  const maxY = Math.max(1, ...points.map(p => Math.max(p.found, p.contacted)));
  const w = 400;
  const h = 160;
  const stepX = points.length > 1 ? w / (points.length - 1) : w;

  const linePath = (key: 'found' | 'contacted') => points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${i * stepX} ${h - (p[key] / maxY) * h}`)
    .join(' ');

  const areaPath = points.length > 0
    ? `${linePath('found')} L ${(points.length - 1) * stepX} ${h} L 0 ${h} Z`
    : '';

  return (
    <Card className="border-border/40 bg-card/50 backdrop-blur h-full">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-sm text-foreground">Performance recente</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Leads encontrados por dia</p>
          </div>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="h-8 w-[130px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="14">Últimos 14 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Chart */}
        <div className="relative">
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-40" preserveAspectRatio="none">
            <defs>
              <linearGradient id="prospGrad" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.4" />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill="url(#prospGrad)" />
            <path d={linePath('found')} fill="none" stroke="hsl(var(--primary))" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <path d={linePath('contacted')} fill="none" stroke="hsl(var(--muted-foreground))" strokeOpacity="0.5" strokeWidth="1.5" strokeDasharray="4 4" strokeLinejoin="round" />
          </svg>
        </div>

        {/* X labels */}
        <div className="flex justify-between mt-2 text-[10px] text-muted-foreground tabular-nums">
          {points.filter((_, i) => i % Math.ceil(points.length / 6) === 0).map((p, i) => (
            <span key={i}>{p.label}</span>
          ))}
        </div>

        {/* Mini KPI cards */}
        <div className="grid grid-cols-3 gap-3 mt-5 pt-4 border-t border-border/40">
          {[
            { label: 'Leads encontrados', value: totals.found, delta: '+19.4%', color: 'text-sky-400' },
            { label: 'Leads contatados', value: totals.contacted, delta: '+14.8%', color: 'text-emerald-400' },
            { label: 'Respostas', value: totals.responses, delta: '+11.2%', color: 'text-amber-400' },
          ].map((k) => (
            <div key={k.label} className="rounded-lg bg-muted/20 p-3 border border-border/30">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider truncate">{k.label}</p>
              <p className={cn('text-lg font-bold tabular-nums mt-1', k.color)}>
                {k.value.toLocaleString('pt-BR')}
              </p>
              <div className="flex items-center gap-1 mt-0.5">
                <ArrowUp className="h-2.5 w-2.5 text-emerald-500" />
                <span className="text-[10px] font-semibold text-emerald-500 tabular-nums">{k.delta}</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

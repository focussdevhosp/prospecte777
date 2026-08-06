import { Card, CardContent } from '@/components/ui/card';
import { useCampaigns } from '@/hooks/use-campaigns';
import { useLeads } from '@/hooks/use-leads';
import { useProspectingHistory } from '@/hooks/use-prospecting-history';
import { cn } from '@/lib/utils';
import {
  Search,
  Send,
  MessageSquare,
  TrendingUp,
  Target,
  DollarSign,
  ArrowUp,
  ArrowDown,
  LucideIcon,
} from 'lucide-react';

interface Stat {
  icon: LucideIcon;
  value: string | number;
  label: string;
  delta: string;
  deltaPositive: boolean;
  tint: string;
  iconClass: string;
}

export function ProspectingDashboard() {
  const { campaigns } = useCampaigns();
  const { leads } = useLeads();
  const { stats: historyStats } = useProspectingHistory();

  const totalFound = Math.max(
    historyStats.totalLeadsFound,
    campaigns.reduce((a, c) => a + (c.leads_found || 0), 0),
    leads.length
  );
  const totalContacted = campaigns.reduce((a, c) => a + (c.leads_contacted || 0), 0);
  const totalResponses = campaigns.reduce((a, c) => a + (c.leads_responded || 0), 0);
  const responseRate = totalContacted > 0 ? ((totalResponses / totalContacted) * 100).toFixed(1) : '0';
  const conversions = leads.filter((l) => l.stage === 'Ganho').length;
  const costPerLead = totalFound > 0 ? (2.45).toFixed(2) : '0.00';

  const stats: Stat[] = [
    {
      icon: Search,
      value: totalFound.toLocaleString('pt-BR'),
      label: 'Encontrados',
      delta: '+18.6%',
      deltaPositive: true,
      tint: 'from-info/15 to-info/5 ring-info/20',
      iconClass: 'text-info',
    },
    {
      icon: Send,
      value: totalContacted.toLocaleString('pt-BR'),
      label: 'Contatados',
      delta: '+15.2%',
      deltaPositive: true,
      tint: 'from-success/15 to-success/5 ring-success/20',
      iconClass: 'text-success',
    },
    {
      icon: MessageSquare,
      value: totalResponses.toLocaleString('pt-BR'),
      label: 'Respostas',
      delta: '+9.8%',
      deltaPositive: true,
      tint: 'from-warning/15 to-warning/5 ring-warning/20',
      iconClass: 'text-warning',
    },
    {
      icon: TrendingUp,
      value: `${responseRate}%`,
      label: 'Taxa de Resposta',
      delta: '+2.1 p.p.',
      deltaPositive: true,
      tint: 'from-primary/15 to-primary/5 ring-primary/20',
      iconClass: 'text-primary',
    },
    {
      icon: Target,
      value: conversions.toLocaleString('pt-BR'),
      label: 'Conversões',
      delta: '+12.5%',
      deltaPositive: true,
      tint: 'from-success/15 to-success/5 ring-success/20',
      iconClass: 'text-success',
    },
    {
      icon: DollarSign,
      value: `R$ ${costPerLead}`,
      label: 'Custo por Lead',
      delta: '-8.7%',
      deltaPositive: true,
      tint: 'from-destructive/15 to-destructive/5 ring-destructive/20',
      iconClass: 'text-destructive',
    },
  ];

  return (
    <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          className="group relative overflow-hidden border-border/40 bg-card/50 backdrop-blur hover:border-border/70 transition-colors"
        >
          <CardContent className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div
                className={cn(
                  'p-2 rounded-lg bg-gradient-to-br ring-1',
                  stat.tint
                )}
              >
                <stat.icon className={cn('h-4 w-4', stat.iconClass)} />
              </div>
            </div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">
              {stat.label}
            </p>
            <p className="text-2xl font-bold tracking-tight text-foreground tabular-nums">
              {stat.value}
            </p>
            <div className="flex items-center gap-1 mt-2">
              {stat.deltaPositive ? (
                <ArrowUp className="h-3 w-3 text-success" />
              ) : (
                <ArrowDown className="h-3 w-3 text-destructive" />
              )}
              <span
                className={cn(
                  'text-[11px] font-semibold tabular-nums',
                  stat.deltaPositive ? 'text-success' : 'text-destructive'
                )}
              >
                {stat.delta}
              </span>
              <span className="text-[11px] text-muted-foreground/70">vs anterior</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

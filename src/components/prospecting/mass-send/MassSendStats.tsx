import { Badge } from '@/components/ui/badge';
import { Send, Clock, CheckCircle, Users, Zap } from 'lucide-react';

interface MassSendStatsProps {
  totalLeads: number;
  pendingLeads: number;
  sentLeads: number;
  selectedCount: number;
  hasActiveJob: boolean;
}

export function MassSendStats({ totalLeads, pendingLeads, sentLeads, selectedCount, hasActiveJob }: MassSendStatsProps) {
  const stats = [
    { label: 'Total', value: totalLeads, icon: Users, colorClass: 'text-foreground' },
    { label: 'Pendentes', value: pendingLeads, icon: Clock, colorClass: 'text-warning' },
    { label: 'Enviados', value: sentLeads, icon: CheckCircle, colorClass: 'text-success' },
    { label: 'Selecionados', value: selectedCount, icon: Send, colorClass: 'text-primary' },
  ];

  return (
    <div className="flex items-center gap-4 flex-wrap">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex items-center gap-2.5 min-w-0"
        >
          <div className={`flex items-center justify-center h-8 w-8 rounded-lg bg-muted/60 ${stat.colorClass} shrink-0`}>
            <stat.icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className={`text-lg font-bold tracking-tight leading-none ${stat.colorClass}`}>{stat.value}</p>
            <p className="text-[10px] text-muted-foreground">{stat.label}</p>
          </div>
          {stat.label === 'Selecionados' && hasActiveJob && (
            <Badge className="animate-pulse bg-primary text-primary-foreground text-[10px] px-1.5 py-0 shrink-0">
              <Zap className="h-3 w-3 mr-0.5" />
              Ativo
            </Badge>
          )}
        </div>
      ))}
    </div>
  );
}

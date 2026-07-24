import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { BarChart3, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

const stageConfig: Record<string, { color: string; bgColor: string; label: string }> = {
  'Contato': { color: 'bg-info', bgColor: 'bg-info/10', label: 'Contato' },
  'Qualificado': { color: 'bg-primary', bgColor: 'bg-primary/10', label: 'Qualificado' },
  'Proposta': { color: 'bg-chart-4', bgColor: 'bg-chart-4/10', label: 'Proposta' },
  'Negociação': { color: 'bg-warning', bgColor: 'bg-warning/10', label: 'Negociação' },
  'Ganho': { color: 'bg-success', bgColor: 'bg-success/10', label: 'Ganho' },
  'Perdido': { color: 'bg-destructive/60', bgColor: 'bg-destructive/5', label: 'Perdido' },
};

interface ConversionFunnelChartProps {
  stages: [string, number][];
  totalLeads: number;
}

export function ConversionFunnelChart({ stages, totalLeads }: ConversionFunnelChartProps) {
  return (
    <Card className="border-border/50 hover:border-border/70 transition-colors duration-300 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-chart-4/[0.02] to-transparent pointer-events-none" />
      
      <CardHeader className="pb-1 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-chart-4/10">
              <BarChart3 className="h-4 w-4 text-chart-4" />
            </div>
            <CardTitle className="text-sm font-bold">Funil de Conversão</CardTitle>
          </div>
          <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground text-xs h-7 gap-1 rounded-lg">
            <Link to="/crm/pipeline">Ver funil <ArrowRight className="h-3 w-3" /></Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-3 relative">
        {stages.length > 0 ? (
          <div className="space-y-4">
            {stages.map(([stage, count]) => {
              const percentage = totalLeads > 0 ? (count / totalLeads) * 100 : 0;
              const config = stageConfig[stage] || { color: 'bg-muted-foreground', bgColor: 'bg-muted/10', label: stage };
              return (
                <div key={stage} className="group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2.5">
                      <div className={cn("w-2 h-2 rounded-full", config.color)} />
                      <span className="text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors">{config.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold tabular-nums">{count}</span>
                      <span className={cn("text-[10px] font-semibold tabular-nums w-8 text-right px-1.5 py-0.5 rounded-md", config.bgColor)}>
                        {percentage.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <div className="h-2 rounded-full bg-muted/50 overflow-hidden">
                    <div className={cn("h-full rounded-full", config.color)} style={{ width: `${Math.max(percentage, 2)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <BarChart3 className="h-10 w-10 mx-auto mb-3 opacity-15" />
            <p className="text-xs font-semibold">Sem dados no funil</p>
            <p className="text-[10px] mt-1 text-muted-foreground">Capture leads para ver o funil</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

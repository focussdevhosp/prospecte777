import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useProspectingHistory } from '@/hooks/use-prospecting-history';
import { ArrowRight, MapPin, Building2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

const statusStyles: Record<string, string> = {
  completed: 'bg-success/15 text-success border-success/20',
  running: 'bg-info/15 text-info border-info/20',
  failed: 'bg-destructive/15 text-destructive border-destructive/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

const statusLabels: Record<string, string> = {
  completed: 'Concluído',
  running: 'Em Andamento',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

export function RecentSearchesPanel() {
  const { history } = useProspectingHistory();
  const recent = history.slice(0, 5);

  return (
    <Card className="border-border/40 bg-card/50 backdrop-blur h-full">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-sm text-foreground">Resultados recentes</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">Suas últimas buscas</p>
          </div>
          <Button variant="ghost" size="sm" asChild className="h-8 text-xs gap-1">
            <Link to="/prospecting-history">
              Ver todos
              <ArrowRight className="h-3 w-3" />
            </Link>
          </Button>
        </div>

        {recent.length === 0 ? (
          <div className="py-10 text-center text-xs text-muted-foreground">
            Nenhuma busca ainda. Configure e execute sua primeira captura.
          </div>
        ) : (
          <div className="space-y-2">
            {recent.map((h) => (
              <div
                key={h.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/20 border border-border/30 hover:border-border/60 transition-colors"
              >
                <div className="h-9 w-9 rounded-lg bg-primary/15 ring-1 ring-primary/20 flex items-center justify-center shrink-0">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {h.niche || 'Sem nicho'}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                    <MapPin className="h-2.5 w-2.5" />
                    {h.location || 'Brasil'}
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold tabular-nums text-foreground">
                    {h.total_found.toLocaleString('pt-BR')}
                  </p>
                  <p className="text-[10px] text-muted-foreground">leads</p>
                </div>
                <Badge
                  variant="outline"
                  className={cn('text-[10px] shrink-0', statusStyles[h.status] ?? statusStyles.cancelled)}
                >
                  {statusLabels[h.status] ?? h.status}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

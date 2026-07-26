import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import type { Lead } from '@/types/database';

interface Props {
  leads: Lead[];
}

const stageStyles: Record<string, string> = {
  Novo: 'bg-info/10 text-info border-info/20',
  Contato: 'bg-primary/10 text-primary border-primary/20',
  Quente: 'bg-destructive/10 text-destructive border-destructive/20',
  Qualificado: 'bg-warning/10 text-warning border-warning/20',
  Proposta: 'bg-warning/10 text-warning border-warning/20',
  Negociação: 'bg-warning/10 text-warning border-warning/20',
  Ganho: 'bg-success/10 text-success border-success/20',
  Perdido: 'bg-muted/50 text-muted-foreground border-border/40',
};

export function RecentLeadsTable({ leads }: Props) {
  const recent = [...(leads || [])]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5);

  return (
    <Card className="border-border/30 hover:border-border/50 transition-colors duration-300 overflow-hidden relative">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent pointer-events-none" />
      <CardHeader className="pb-2 relative flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-primary/10">
            <Users className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-sm font-bold">Leads recentes</CardTitle>
        </div>
        <Link to="/crm/contacts" className="text-[11px] text-primary font-semibold flex items-center gap-1 hover:underline">
          Ver todos <ArrowRight className="h-3 w-3" />
        </Link>
      </CardHeader>
      <CardContent className="pt-2 relative">
        {recent.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <p className="text-xs font-semibold">Nenhum lead ainda</p>
            <p className="text-[10px] mt-1">Comece a prospectar</p>
          </div>
        ) : (
          <div className="overflow-hidden">
            <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-3 gap-y-0 text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 pb-2 border-b border-border/30">
              <span>Nome</span>
              <span className="hidden sm:block">Empresa</span>
              <span>Status</span>
              <span className="text-right">Adicionado</span>
            </div>
            <div className="divide-y divide-border/20">
              {recent.map((l) => (
                <div key={l.id} className="grid grid-cols-[1fr_1fr_auto_auto] gap-x-3 items-center px-2 py-2.5 hover:bg-accent/20 rounded-md transition-colors">
                  <span className="text-xs font-semibold truncate">{l.business_name || 'Sem nome'}</span>
                  <span className="text-xs text-muted-foreground truncate hidden sm:block">{l.niche || l.location || '—'}</span>
                  <Badge variant="outline" className={cn('text-[10px] font-semibold px-1.5 py-0 h-5', stageStyles[l.stage || 'Novo'] || stageStyles.Novo)}>
                    {l.stage || 'Novo'}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground text-right tabular-nums whitespace-nowrap">
                    {format(new Date(l.created_at), "dd MMM, HH:mm", { locale: ptBR })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

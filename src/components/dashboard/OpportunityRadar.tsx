import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Radar, Flame, Clock, ArrowRight, MessageCircle,
  TrendingUp, Zap, Star,
} from 'lucide-react';
import { Lead } from '@/types/database';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface OpportunityRadarProps {
  leads: Lead[];
}

function scoreOpportunity(lead: Lead): number {
  let score = 0;
  if (lead.temperature === 'quente') score += 40;
  else if (lead.temperature === 'morno') score += 20;
  if (lead.lead_score > 60) score += 30;
  else if (lead.lead_score > 30) score += 15;
  if (lead.deal_value && lead.deal_value > 0) score += 10;
  if (lead.last_response_at) {
    const daysSinceResponse = (Date.now() - new Date(lead.last_response_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceResponse < 1) score += 20;
    else if (daysSinceResponse < 3) score += 10;
  }
  if (lead.stage === 'Negociação') score += 25;
  else if (lead.stage === 'Proposta') score += 15;
  else if (lead.stage === 'Qualificado') score += 10;
  return Math.min(score, 100);
}

function hashColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 55%, 50%)`;
}

export function OpportunityRadar({ leads }: OpportunityRadarProps) {
  const topOpportunities = useMemo(() => {
    return leads
      .filter(l => l.stage !== 'Ganho' && l.stage !== 'Perdido')
      .map(l => ({ ...l, opportunityScore: scoreOpportunity(l) }))
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 5);
  }, [leads]);

  if (topOpportunities.length === 0) {
    return (
      <Card className="border-border/30 hover:border-border/50 transition-colors duration-300 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent pointer-events-none" />
        <CardHeader className="pb-1 relative">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Radar className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-bold">Radar de Oportunidades</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-2 relative">
          <div className="text-center py-10 text-muted-foreground">
            <div className="inline-flex p-4 rounded-2xl bg-muted/30 mb-4">
              <Zap className="h-8 w-8 opacity-25" />
            </div>
            <p className="text-xs font-semibold">Sem oportunidades ainda</p>
            <p className="text-[10px] mt-1.5 text-muted-foreground">Leads quentes aparecerão aqui</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/30 hover:border-border/50 transition-colors duration-300 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.02] to-transparent pointer-events-none" />
      <CardHeader className="pb-1 relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-primary/10">
              <Radar className="h-4 w-4 text-primary" />
            </div>
            <CardTitle className="text-sm font-bold">Radar de Oportunidades</CardTitle>
          </div>
          <Badge variant="outline" className="text-[9px] h-5 px-2 font-bold text-primary border-primary/20 rounded-lg">
            <Zap className="h-2.5 w-2.5 mr-0.5" />
            {topOpportunities.length} quentes
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-2 relative">
        <div className="space-y-1">
            {topOpportunities.map((lead) => {
              const bg = hashColor(lead.business_name);
              const initials = lead.business_name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
              const urgency = lead.opportunityScore >= 60 ? 'high' : lead.opportunityScore >= 35 ? 'medium' : 'low';
              
              return (
                <div key={lead.id}>
                  <Link
                    to={`/crm/contacts/${lead.id}`}
                    className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-accent/50 transition-all duration-200 group"
                  >
                    <div
                      className="h-8 w-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0 ring-2 ring-background"
                      style={{ backgroundColor: bg }}
                    >
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold truncate group-hover:text-primary transition-colors">
                        {lead.business_name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {lead.temperature === 'quente' && <Flame className="h-2.5 w-2.5 text-destructive" />}
                        <span className="text-[10px] text-muted-foreground truncate">
                          {lead.stage}
                          {lead.deal_value ? ` · ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact' }).format(lead.deal_value)}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className={cn(
                        "h-5 px-1.5 rounded-md flex items-center gap-0.5 text-[9px] font-bold",
                        urgency === 'high' && "bg-destructive/10 text-destructive",
                        urgency === 'medium' && "bg-warning/10 text-warning",
                        urgency === 'low' && "bg-muted text-muted-foreground",
                      )}>
                        <Star className="h-2.5 w-2.5" />
                        {lead.opportunityScore}
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        <Button variant="ghost" size="sm" asChild className="w-full mt-2 text-xs h-8 text-muted-foreground hover:text-foreground gap-1">
          <Link to="/crm/pipeline">
            Ver pipeline completo <ArrowRight className="h-3 w-3" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

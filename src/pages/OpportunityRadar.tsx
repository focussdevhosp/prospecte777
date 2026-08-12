import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Radar, Loader2, ScanSearch, Globe, Star, MessageCircle,
  AlertTriangle, ArrowRight, Sparkles,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  useOpportunityRadar,
  useSiteAudit,
  type OpportunityLead,
} from '@/hooks/use-opportunity-radar';
import { cn } from '@/lib/utils';

/**
 * Radar de Oportunidades.
 *
 * O app tinha sete formas de capturar lead e nenhuma de responder "por qual
 * eu começo?". Quem captura 800 empresas fica com 800 linhas iguais na
 * tela e liga na ordem em que apareceram.
 *
 * Aqui a ordem é por necessidade: sem site, site quebrado, avaliação baixa,
 * quase sem avaliações. Quanto pior a presença digital do lead, mais alto
 * ele aparece — porque é exatamente onde há o que vender.
 */
export default function OpportunityRadarPage() {
  const [limit, setLimit] = useState(50);
  const { leads, isLoading } = useOpportunityRadar(limit);
  const { auditBatch, isAuditingBatch } = useSiteAudit();
  const navigate = useNavigate();

  const pending = leads.filter((l) => l.site_score < 0 && l.website).length;

  return (
    <DashboardLayout
      eyebrow="Analisar"
      title="Radar de Oportunidades"
      description="Sua carteira em ordem de necessidade. Quem está pior no digital aparece primeiro — é onde a sua proposta faz mais diferença."
    >
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
        <Button
          onClick={() => auditBatch(undefined)}
          disabled={isAuditingBatch}
          className="shrink-0"
        >
          {isAuditingBatch ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Analisando sites...</>
          ) : (
            <><ScanSearch className="mr-2 h-4 w-4" />Analisar sites{pending > 0 && ` (${pending})`}</>
          )}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : leads.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Radar className="mb-4 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Nenhum lead para priorizar ainda</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Capture leads na tela de Prospecção. Assim que houver carteira, o radar
              mostra por onde começar.
            </p>
            <Button className="mt-4" onClick={() => navigate('/prospecting')}>
              Capturar leads <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-2">
            {leads.map((lead) => (
              <OpportunityRow key={lead.id} lead={lead} onOpen={() => navigate(`/crm/contacts/${lead.id}`)} />
            ))}
          </div>

          {leads.length >= limit && (
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() => setLimit((l) => l + 50)}
            >
              Mostrar mais
            </Button>
          )}
        </>
      )}
    </DashboardLayout>
  );
}

function OpportunityRow({ lead, onOpen }: { lead: OpportunityLead; onOpen: () => void }) {
  const { auditLead, isAuditing } = useSiteAudit();

  // Faixas nomeadas em vez de gradiente contínuo: o vendedor precisa
  // decidir, não admirar a escala.
  const tier = lead.opportunity_score >= 60
    ? { label: 'Alta', tone: 'text-brand', bar: 'bg-brand' }
    : lead.opportunity_score >= 30
      ? { label: 'Média', tone: 'text-warning', bar: 'bg-warning' }
      : { label: 'Baixa', tone: 'text-muted-foreground', bar: 'bg-muted-foreground' };

  return (
    <Card className="card-interactive">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        {/* Prioridade */}
        <div className="flex w-full items-center gap-3 sm:w-32 sm:shrink-0 sm:flex-col sm:items-start">
          <div className="flex items-baseline gap-1.5">
            <span className={cn('text-2xl font-bold tabular-nums', tier.tone)}>
              {lead.opportunity_score}
            </span>
            <span className="text-xs text-muted-foreground">{tier.label}</span>
          </div>
          <Progress
            value={Math.min(lead.opportunity_score, 100)}
            className="h-1 flex-1 sm:w-full"
            indicatorClassName={tier.bar}
          />
        </div>

        {/* Identificação */}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{lead.business_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {lead.niche || 'Sem nicho'} · {lead.phone}
          </p>

          <div className="mt-2 flex flex-wrap gap-1.5">
            {lead.reasons.map((reason) => (
              <Badge key={reason} variant="secondary" className="text-[11px] font-normal">
                {reason}
              </Badge>
            ))}
          </div>
        </div>

        {/* Sinais rápidos */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground sm:shrink-0">
          <span className="flex items-center gap-1" title="Site">
            <Globe className={cn('h-3.5 w-3.5', !lead.website && 'text-destructive')} />
            {lead.site_score >= 0 ? `${lead.site_score}/100` : lead.website ? '—' : 'sem site'}
          </span>
          {lead.rating != null && (
            <span className="flex items-center gap-1" title="Avaliação no Google">
              <Star className={cn('h-3.5 w-3.5', lead.rating < 3.5 && 'text-destructive')} />
              {Number(lead.rating).toFixed(1)}
            </span>
          )}
          {lead.reviews_count != null && (
            <span className="flex items-center gap-1" title="Avaliações">
              <MessageCircle className="h-3.5 w-3.5" />
              {lead.reviews_count}
            </span>
          )}
        </div>

        {/* Ações */}
        <div className="flex shrink-0 gap-2">
          {lead.website && lead.site_score < 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={isAuditing}
              onClick={() => auditLead(lead.id)}
            >
              {isAuditing
                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                : <><ScanSearch className="mr-1.5 h-3.5 w-3.5" />Analisar</>}
            </Button>
          )}
          <Button size="sm" onClick={onOpen}>
            Abrir <ArrowRight className="ml-1 h-3.5 w-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

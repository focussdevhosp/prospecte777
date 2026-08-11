import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, CheckCircle2, OctagonX, Clock, Flame, Inbox } from 'lucide-react';
import { nextActions, idleMessage, type CommandMetrics, type NextAction } from '@/lib/next-actions';

const ESTILO: Record<
  NextAction['urgency'],
  { label: string; classe: string; Icone: React.ComponentType<{ className?: string }> }
> = {
  bloqueio: { label: 'bloqueio', classe: 'border-destructive/40 bg-destructive/5', Icone: OctagonX },
  agora: { label: 'agora', classe: 'border-warning/40 bg-warning/5', Icone: Inbox },
  hoje: { label: 'hoje', classe: 'border-border', Icone: Flame },
  quando_der: { label: 'quando der', classe: 'border-border', Icone: Clock },
};

/**
 * A fila de trabalho do dia, no lugar de treze números iguais.
 *
 * O painel mostrava encontrados, qualificados, abordados, respondidos,
 * reuniões, aguardando aprovação, aguardando resposta, follow-ups vencidos,
 * quentes, escalações, pausadas, erros e custo — todos com o mesmo peso
 * visual. Quem abre a tela de manhã não quer saber quantos leads existem,
 * quer saber por onde começar.
 *
 * Os números continuam logo abaixo. O que muda é que deixaram de ser a
 * primeira coisa.
 */
export function NextActions({ metrics }: { metrics?: CommandMetrics }) {
  const navigate = useNavigate();

  if (!metrics) return null;

  const acoes = nextActions(metrics);

  if (acoes.length === 0) {
    return (
      <Card className="mb-6">
        <CardContent className="flex items-start gap-3 p-5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
          <div>
            <p className="text-sm font-medium">Nada esperando por você</p>
            <p className="mt-1 text-sm text-muted-foreground">{idleMessage(metrics)}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mb-6 space-y-2">
      <h2 className="text-sm font-medium text-muted-foreground">Por onde começar</h2>

      {acoes.map((acao) => {
        const { label, classe, Icone } = ESTILO[acao.urgency];
        return (
          <Card key={acao.id} className={classe}>
            <CardContent className="flex flex-wrap items-center gap-4 p-4">
              <Icone className="h-5 w-5 shrink-0 text-muted-foreground" />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium">{acao.title}</p>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
                    {label}
                  </Badge>
                </div>
                {/* O "por quê" é o que separa isto de uma lista de números:
                    explica a posição na fila, não só o que está pendente. */}
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{acao.why}</p>
              </div>

              <Button size="sm" variant="outline" onClick={() => navigate(acao.href)}>
                {acao.cta}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

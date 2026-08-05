import { useNavigate } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Hand, ArrowRight, MessageSquare } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useHandoffQueue, useAgentControl } from '@/hooks/use-agent-control';

/**
 * Fila de leads em que a IA saiu de cena de propósito — pedido de
 * atendimento humano, sinal de fechamento, cliente irritado ou risco
 * jurídico.
 *
 * Antes esses casos não existiam: o agente respondia igual em todos, e um
 * "quero fechar" recebia a mesma abordagem de um "quanto custa".
 */
export function HandoffQueue() {
  const { leads, isLoading } = useHandoffQueue();
  const { takeOver, isUpdating } = useAgentControl();
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (leads.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Hand className="h-4 w-4 text-muted-foreground" />
            Esperando você
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nenhum lead na fila. A IA está dando conta sozinha.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-amber-500/40">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-base">
          <span className="flex items-center gap-2">
            <Hand className="h-4 w-4 text-amber-500" />
            Esperando você
          </span>
          <Badge variant="secondary">{leads.length}</Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-2">
        {leads.slice(0, 6).map((lead) => (
          <div
            key={lead.id}
            className="flex items-center justify-between gap-3 rounded-lg border bg-card/50 p-3"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{lead.business_name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {lead.agent_paused_reason}
                {lead.agent_paused_at && (
                  <> · {formatDistanceToNow(new Date(lead.agent_paused_at), {
                    addSuffix: true, locale: ptBR,
                  })}</>
                )}
              </p>
            </div>

            <Button
              size="sm"
              variant="secondary"
              disabled={isUpdating}
              onClick={() => {
                takeOver(lead.id);
                navigate(`/crm/contacts/${lead.id}`);
              }}
            >
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              Assumir
            </Button>
          </div>
        ))}

        {leads.length > 6 && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => navigate('/crm/inbox')}
          >
            Ver todos os {leads.length}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

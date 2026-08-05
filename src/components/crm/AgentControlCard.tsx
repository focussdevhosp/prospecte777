import { Bot, BotOff, Hand, BellOff, Play, Pause } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAgentControl, type AgentStatus } from '@/hooks/use-agent-control';
import { cn } from '@/lib/utils';

/**
 * Estado da IA nesta conversa, na tela do contato.
 *
 * O agente já sabia sair sozinho (pedido de humano, sinal de fechamento,
 * cliente irritado), mas isso só aparecia numa fila no Dashboard. Quem
 * abrisse o contato não via se a IA ainda estava respondendo nem tinha como
 * desligá-la ali — a única saída era desconectar o WhatsApp inteiro.
 */
interface AgentControlCardProps {
  leadId: string;
  status: AgentStatus;
  reason?: string | null;
  pausedAt?: string | null;
  repliesToday?: number;
}

const PRESENTATION: Record<AgentStatus, {
  icon: typeof Bot;
  label: string;
  help: string;
  tone: string;
}> = {
  active: {
    icon: Bot,
    label: 'IA respondendo',
    help: 'O agente responde automaticamente as mensagens deste lead.',
    tone: 'text-success',
  },
  paused: {
    icon: Pause,
    label: 'IA pausada',
    help: 'Você assumiu esta conversa. O agente não responde até você reativar.',
    tone: 'text-muted-foreground',
  },
  handoff: {
    icon: Hand,
    label: 'Esperando você',
    help: 'O agente saiu de cena de propósito e passou a conversa para você.',
    tone: 'text-warning',
  },
  opted_out: {
    icon: BellOff,
    label: 'Pediu para parar',
    help: 'Este contato pediu para não receber mensagens. Não envie mais nada.',
    tone: 'text-destructive',
  },
};

export function AgentControlCard({
  leadId,
  status,
  reason,
  pausedAt,
  repliesToday = 0,
}: AgentControlCardProps) {
  const { pauseAgent, resumeAgent, isUpdating } = useAgentControl();
  const view = PRESENTATION[status] ?? PRESENTATION.active;
  const Icon = view.icon;

  // Opt-out não é reversível por aqui de propósito: reativar a IA para quem
  // pediu para parar é justamente o que gera denúncia e queima o chip. Para
  // desfazer, o contato tem que sair da blacklist explicitamente.
  const canToggle = status !== 'opted_out';

  return (
    <Card className={cn(
      status === 'handoff' && 'border-warning/40',
      status === 'opted_out' && 'border-destructive/40',
    )}>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn('mt-0.5 shrink-0', view.tone)}>
            <Icon className="h-4 w-4" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">{view.label}</p>
              {status === 'active' && repliesToday > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  {repliesToday} hoje
                </Badge>
              )}
            </div>

            <p className="mt-0.5 text-xs text-muted-foreground">{view.help}</p>

            {reason && status !== 'active' && (
              <p className="mt-1 text-xs text-muted-foreground/80">
                Motivo: {reason}
                {pausedAt && (
                  <> · {formatDistanceToNow(new Date(pausedAt), { addSuffix: true, locale: ptBR })}</>
                )}
              </p>
            )}
          </div>

          {canToggle && (
            <Button
              size="sm"
              variant={status === 'active' ? 'outline' : 'default'}
              disabled={isUpdating}
              onClick={() => (status === 'active' ? pauseAgent(leadId) : resumeAgent(leadId))}
              className="shrink-0"
            >
              {status === 'active' ? (
                <><BotOff className="mr-1.5 h-3.5 w-3.5" />Assumir</>
              ) : (
                <><Play className="mr-1.5 h-3.5 w-3.5" />Reativar IA</>
              )}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

import {
  Search, Target, Package, Route, PenLine, ShieldCheck, Send,
  MessageSquare, Calendar, AlertCircle, Activity, Pause,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { AgentEvent } from '@/hooks/use-missions';

/**
 * Feed de atividade.
 *
 * A IA decidindo sozinha só é aceitável se for possível ver o que ela
 * decidiu e por quê. Cada linha aqui corresponde a uma decisão real gravada
 * em `agent_events` — não é log bonito de tela, é a auditoria.
 */

const AGENT_META: Record<string, { icon: typeof Search; label: string; color: string }> = {
  research: { icon: Search, label: 'Pesquisador', color: 'text-blue-500' },
  qualification: { icon: Target, label: 'Qualificador', color: 'text-violet-500' },
  offer_matcher: { icon: Package, label: 'Ofertas', color: 'text-amber-500' },
  strategy: { icon: Route, label: 'Estrategista', color: 'text-cyan-500' },
  copy: { icon: PenLine, label: 'Copywriter', color: 'text-pink-500' },
  quality: { icon: ShieldCheck, label: 'Quality Gate', color: 'text-emerald-500' },
  outreach: { icon: Send, label: 'Abordagem', color: 'text-indigo-500' },
  conversation: { icon: MessageSquare, label: 'Conversa', color: 'text-teal-500' },
  scheduling: { icon: Calendar, label: 'Agendamento', color: 'text-green-500' },
  supervisor: { icon: Pause, label: 'Supervisor', color: 'text-orange-500' },
  orchestrator: { icon: Activity, label: 'Orquestrador', color: 'text-primary' },
};

const LEVEL_STYLES = {
  info: 'border-border',
  success: 'border-emerald-500/40 bg-emerald-500/5',
  warning: 'border-amber-500/40 bg-amber-500/5',
  error: 'border-destructive/40 bg-destructive/5',
} as const;

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function ActivityFeed({
  events,
  isLoading,
  emptyHint,
}: {
  events: AgentEvent[];
  isLoading?: boolean;
  emptyHint?: string;
}) {
  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <Activity className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">Nenhuma atividade ainda</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {emptyHint ?? 'Quando a esteira rodar, cada decisão da IA aparece aqui.'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {events.map((event) => {
        const meta = AGENT_META[event.agent] ?? AGENT_META.orchestrator;
        const Icon = meta.icon;

        return (
          <div
            key={event.id}
            className={cn(
              'flex gap-3 rounded-lg border p-3 transition-colors',
              LEVEL_STYLES[event.level],
            )}
          >
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', meta.color)} />

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="text-[10px]">{meta.label}</Badge>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {formatTime(event.created_at)}
                </span>
              </div>
              <p className="mt-1 break-words text-sm">{event.summary}</p>

              {/* A mensagem gerada aparece inteira: é o que vai para o cliente. */}
              {typeof event.detail?.message === 'string' && (
                <p className="mt-2 rounded border-l-2 border-primary/40 bg-muted/50 px-3 py-2 text-xs italic">
                  {event.detail.message as string}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

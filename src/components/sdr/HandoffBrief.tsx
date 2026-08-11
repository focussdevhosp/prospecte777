import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Ban, CalendarClock, MessageSquare, Target, ArrowRight } from 'lucide-react';

// ============================================================
// O RESUMO DE QUEM ASSUME A CONVERSA
// ============================================================
// A tela de escalações mostrava o nome da empresa, o motivo e duas linhas de
// contexto. Quem clicava em "Abrir" caía no inbox e lia a conversa do começo
// para descobrir o que estava acontecendo.
//
// É a parte do handoff que faz handoff dar errado: a pessoa entra sem saber o
// que já foi prometido, o que o lead já respondeu e o que ele já recusou. A
// primeira mensagem dela ou repete o que a IA disse, ou contradiz — e as duas
// entregam que trocou de interlocutor no pior momento, aquele em que o caso
// era importante o bastante para escalar.

interface Brief {
  error?: string;
  lead: {
    business_name: string;
    phone: string | null;
    niche: string | null;
    location: string | null;
    website: string | null;
    stage: string;
    temperature: string | null;
    rating: number | null;
    reviews_count: number | null;
  };
  messages: Array<{ sender_type: string; content: string; sent_at: string }>;
  memory: Array<{ type: string; key: string; value: string; confidence: number }>;
  mission: {
    name: string;
    goal: string;
    offer: { name?: string } | null;
    strategy: { angle?: string; hook?: { value?: string } } | null;
    score: number | null;
    temperature: string | null;
    sent_at: string | null;
  } | null;
  escalation: {
    reason: string;
    priority: string;
    context: string | null;
    recommended_action: string | null;
  } | null;
  next_meeting: { scheduled_at: string; title: string } | null;
  opted_out: boolean;
}

const TIPO_MEMORIA: Record<string, string> = {
  need: 'dor',
  interest: 'interesse',
  objection: 'objeção',
  commitment: 'compromisso',
  preference: 'preferência',
  context: 'contexto',
  next_action: 'próximo passo',
};

const hora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function HandoffBrief({
  leadId,
  open,
  onOpenChange,
  onOpenConversation,
}: {
  leadId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onOpenConversation: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['handoff-brief', leadId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('lead_handoff_brief', { p_lead_id: leadId! });
      if (error) throw error;
      return data as unknown as Brief;
    },
    enabled: open && !!leadId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{data?.lead?.business_name ?? 'Assumir conversa'}</DialogTitle>
          <DialogDescription>
            O que a IA já sabe sobre este lead, para você não começar do zero
            nem repetir o que já foi dito.
          </DialogDescription>
        </DialogHeader>

        {isLoading && <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-20" />)}</div>}

        {data?.error && (
          <Alert variant="destructive">
            <AlertDescription>
              {data.error === 'acesso_negado'
                ? 'Este lead não é da sua conta.'
                : 'Lead não encontrado.'}
            </AlertDescription>
          </Alert>
        )}

        {data && !data.error && (
          <div className="space-y-5">
            {/* A bandeira vermelha vem primeiro: precisa ser vista ANTES de
                escrever, não depois de o envio ser recusado. */}
            {data.opted_out && (
              <Alert variant="destructive">
                <Ban className="h-4 w-4" />
                <AlertDescription>
                  <strong>Este número pediu para não receber mensagens.</strong> Nada
                  sai por automação, e um contato manual aqui é decisão sua —
                  com o peso que isso tem.
                </AlertDescription>
              </Alert>
            )}

            {/* ---- Por que você está aqui ---- */}
            {data.escalation && (
              <section>
                <h4 className="mb-2 text-sm font-medium">Por que a IA parou</h4>
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={data.escalation.priority === 'high' ? 'destructive' : 'secondary'}>
                      {data.escalation.priority}
                    </Badge>
                    <span className="text-sm">{data.escalation.reason.replace(/_/g, ' ')}</span>
                  </div>
                  {data.escalation.context && (
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {data.escalation.context}
                    </p>
                  )}
                  {data.escalation.recommended_action && (
                    <p className="text-sm text-primary/90">→ {data.escalation.recommended_action}</p>
                  )}
                </div>
              </section>
            )}

            {/* ---- O que está em jogo ---- */}
            {data.mission && (
              <section>
                <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                  <Target className="h-3.5 w-3.5" />
                  O que já foi colocado na mesa
                </h4>
                <div className="rounded-lg border p-3 text-sm space-y-1">
                  <p>
                    <span className="text-muted-foreground">Oferta:</span>{' '}
                    {data.mission.offer?.name ?? 'nenhuma — abordagem consultiva'}
                  </p>
                  {data.mission.strategy?.hook?.value && (
                    <p>
                      <span className="text-muted-foreground">Gancho usado:</span>{' '}
                      {data.mission.strategy.hook.value}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Missão "{data.mission.name}" · nota {data.mission.score ?? '—'} ·{' '}
                    {data.mission.sent_at ? `abordado em ${hora(data.mission.sent_at)}` : 'ainda não abordado'}
                  </p>
                </div>
              </section>
            )}

            {data.next_meeting && (
              <Alert>
                <CalendarClock className="h-4 w-4" />
                <AlertDescription>
                  Reunião marcada para {hora(data.next_meeting.scheduled_at)} — {data.next_meeting.title}
                </AlertDescription>
              </Alert>
            )}

            {/* ---- O que ele já disse ---- */}
            <section>
              <h4 className="mb-2 text-sm font-medium">O que ele já disse antes</h4>
              {data.memory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nada registrado. O histórico abaixo é tudo que existe.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {data.memory.map((m, i) => (
                    <li key={i} className="text-sm">
                      <Badge variant="outline" className="mr-2 text-[10px]">
                        {TIPO_MEMORIA[m.type] ?? m.type}
                      </Badge>
                      {m.value}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ---- A conversa ---- */}
            <section>
              <h4 className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <MessageSquare className="h-3.5 w-3.5" />
                Últimas mensagens
              </h4>
              <ScrollArea className="h-[220px] rounded-lg border p-3">
                {data.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma mensagem trocada ainda.</p>
                ) : (
                  <div className="space-y-3">
                    {data.messages.map((m, i) => (
                      <div key={i} className={m.sender_type === 'lead' ? '' : 'pl-6'}>
                        <p className="text-[11px] text-muted-foreground">
                          {m.sender_type === 'lead' ? data.lead.business_name : 'Nós'} · {hora(m.sent_at)}
                        </p>
                        <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </section>

            <Button onClick={onOpenConversation} className="w-full">
              Abrir a conversa e responder
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

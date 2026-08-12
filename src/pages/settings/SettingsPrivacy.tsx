import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Copy, Loader2, ScrollText, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

// ============================================================
// LGPD: A PARTE QUE ALGUÉM PRECISA CONSEGUIR RESPONDER
// ============================================================
// A operação já parava de mandar para quem pediu. O que não existia era a
// resposta às três perguntas que uma autoridade faz quando aparece: com que
// base legal, como a pessoa sai sem depender de vocês, e o que foi feito
// quando ela pediu os dados dela.
//
// Prazo é a parte que estoura sozinha. Acesso tem 15 dias por lei, e o
// vencimento fica gravado na linha justamente para não depender de alguém
// lembrar da regra.

type Kind = 'acesso' | 'correcao' | 'exclusao' | 'portabilidade' | 'oposicao';
type Status = 'pendente' | 'em_andamento' | 'atendido' | 'recusado';

interface DataRequest {
  id: string;
  requester: string;
  kind: Kind;
  status: Status;
  note: string | null;
  created_at: string;
  due_at: string;
  resolved_at: string | null;
}

const TIPOS: Record<Kind, string> = {
  acesso: 'Acesso aos dados',
  correcao: 'Correção',
  exclusao: 'Exclusão',
  portabilidade: 'Portabilidade',
  oposicao: 'Oposição ao tratamento',
};

const STATUS: Record<Status, { rotulo: string; classe: string }> = {
  pendente: { rotulo: 'Pendente', classe: 'bg-warning/15 text-warning border-warning/30' },
  em_andamento: { rotulo: 'Em andamento', classe: 'bg-info/15 text-info border-info/30' },
  atendido: { rotulo: 'Atendido', classe: 'bg-success/15 text-success border-success/30' },
  recusado: { rotulo: 'Recusado', classe: 'bg-muted text-muted-foreground border-border' },
};

function diasAte(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

export default function SettingsPrivacy() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [requester, setRequester] = useState('');
  const [kind, setKind] = useState<Kind>('acesso');
  const [note, setNote] = useState('');

  const { data: pedidos, isLoading } = useQuery({
    queryKey: ['data-requests', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('data_requests')
        .select('id, requester, kind, status, note, created_at, due_at, resolved_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as DataRequest[];
    },
    enabled: !!user?.id,
  });

  const criar = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error('Sessão expirada.');
      const { error } = await supabase.from('data_requests').insert({
        user_id: user.id,
        requester: requester.trim(),
        kind,
        note: note.trim() || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['data-requests'] });
      setRequester(''); setNote('');
      toast({ title: 'Pedido registrado', description: 'O prazo de 15 dias começa a contar hoje.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Não foi possível registrar', description: e.message, variant: 'destructive' }),
  });

  const mudarStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: Status }) => {
      const { error } = await supabase
        .from('data_requests')
        .update({
          status,
          resolved_at: status === 'atendido' || status === 'recusado' ? new Date().toISOString() : null,
        } as never)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-requests'] }),
  });

  const linkPublico = `${window.location.origin}/descadastro`;

  return (
    <div className="page-enter mx-auto max-w-4xl space-y-8 p-6 sm:p-8">
      <PageHeader
        eyebrow="Ajustes"
        title="Privacidade e LGPD"
        description="Pedidos de titular, prazos e o link de descadastro que não depende de você responder."
        icon={<ScrollText className="h-5 w-5" />}
        className="mb-0"
      />

      <Alert>
        <ShieldCheck className="h-4 w-4" />
        <AlertDescription className="space-y-2 text-sm leading-relaxed">
          <p>
            A base legal padrão dos contatos capturados é <strong>legítimo interesse</strong>, que é
            o caso do outbound B2B sobre dado publicamente disponível. Cada lead guarda de onde
            veio — é a resposta a "de onde vocês tiraram meu telefone", a pergunta que abre toda
            reclamação.
          </p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground">Link público de descadastro:</span>
            <code className="rounded bg-muted px-2 py-1 text-xs">{linkPublico}</code>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              onClick={() => {
                navigator.clipboard.writeText(linkPublico);
                toast({ title: 'Link copiado' });
              }}
            >
              <Copy className="mr-1 h-3 w-3" /> copiar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Ele funciona sem login, de propósito: exigir conta para sair prenderia quem quer sair ao
            interesse de quem não quer perdê-lo. Coloque no rodapé dos seus e-mails.
          </p>
        </AlertDescription>
      </Alert>

      {/* ---- Registrar um pedido ---- */}
      <Card>
        <CardContent className="space-y-4 p-5">
          <h3 className="font-semibold">Registrar pedido de titular</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="requester" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Quem pediu
              </Label>
              <Input
                id="requester"
                value={requester}
                onChange={(e) => setRequester(e.target.value)}
                placeholder="Nome, e-mail ou telefone"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                O que pediu
              </Label>
              <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TIPOS).map(([k, rotulo]) => (
                    <SelectItem key={k} value={k}>{rotulo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="note" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Observação
            </Label>
            <Textarea
              id="note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Como o pedido chegou, o que foi combinado..."
            />
          </div>
          <Button onClick={() => criar.mutate()} disabled={!requester.trim() || criar.isPending}>
            {criar.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Registrar
          </Button>
        </CardContent>
      </Card>

      {/* ---- Fila ---- */}
      <div className="space-y-3">
        <h3 className="font-semibold">Pedidos</h3>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}

        {!isLoading && !pedidos?.length && (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum pedido registrado. Quando alguém pedir os dados, o acesso, a correção ou a
                exclusão, registre aqui — é o que prova depois que foi atendido no prazo.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="stagger space-y-3">
          {pedidos?.map((p) => {
            const dias = diasAte(p.due_at);
            const aberto = p.status === 'pendente' || p.status === 'em_andamento';
            const vencendo = aberto && dias <= 3;

            return (
              <Card key={p.id} className={cn('hover-lift', vencendo && 'border-destructive/40')}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.requester}</span>
                      <Badge variant="outline" className="text-xs">{TIPOS[p.kind]}</Badge>
                      <Badge variant="outline" className={cn('text-xs', STATUS[p.status].classe)}>
                        {STATUS[p.status].rotulo}
                      </Badge>
                    </div>
                    <p className={cn('mt-1 text-xs', vencendo ? 'font-semibold text-destructive' : 'text-muted-foreground')}>
                      {aberto
                        ? dias >= 0
                          ? `Prazo em ${dias} dia${dias === 1 ? '' : 's'}.`
                          : `Prazo vencido há ${Math.abs(dias)} dia${Math.abs(dias) === 1 ? '' : 's'}.`
                        : `Encerrado em ${new Date(p.resolved_at ?? p.created_at).toLocaleDateString('pt-BR')}.`}
                      {p.note ? ` ${p.note}` : ''}
                    </p>
                  </div>

                  {aberto && (
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => mudarStatus.mutate({ id: p.id, status: 'atendido' })}>
                        Atendido
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => mudarStatus.mutate({ id: p.id, status: 'recusado' })}>
                        Recusar
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

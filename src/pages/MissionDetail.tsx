import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Play, Check, X, AlertTriangle, ShieldCheck,
  Package, Route, Search, Ban, ChevronDown, ChevronRight,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ActivityFeed } from '@/components/missions/ActivityFeed';
import {
  useMission, AUTONOMY_LABELS, GOAL_LABELS,
  type MissionLead, type QualityScores,
} from '@/hooks/use-missions';
import { cn } from '@/lib/utils';

const BLOCK_REASONS: Record<string, string> = {
  missao_pausada: 'A missão está pausada.',
  missao_nao_esta_ativa: 'A missão ainda não foi iniciada.',
  parada_de_emergencia_ativa: 'A parada de emergência está ativa.',
  whatsapp_desconectado: 'O WhatsApp não está conectado.',
  fora_de_dia_util: 'Hoje não é dia útil e a missão está configurada para dias úteis.',
  fora_do_horario_permitido: 'Fora do horário permitido para esta missão.',
  limite_diario_da_missao_atingido: 'O limite diário de envios desta missão já foi atingido.',
};

/**
 * Detalhe da missão.
 *
 * A aba que importa é "Aguardando você": é onde o humano vê a mensagem que a
 * IA escreveu, o motivo de cada decisão, e decide. Sem essa tela, autonomia
 * assistida não existiria de verdade.
 */
export default function MissionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    mission, leads, events, sendBlockReason,
    isLoading, error, runBatch, approveDraft, rejectDraft,
  } = useMission(id);

  if (isLoading) {
    return (
      <DashboardLayout title="Missão">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="mt-4 h-64 w-full" />
      </DashboardLayout>
    );
  }

  if (error || !mission) {
    return (
      <DashboardLayout title="Missão">
        <Alert className="border-destructive/40">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <AlertDescription>
            {error?.message ?? 'Missão não encontrada.'}
          </AlertDescription>
        </Alert>
        <Button variant="outline" className="mt-4" onClick={() => navigate('/missions')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
        </Button>
      </DashboardLayout>
    );
  }

  const pending = leads.filter((l) => l.status === 'awaiting_approval');
  const queued = leads.filter((l) => l.status === 'found');
  const sent = leads.filter((l) => ['sent', 'replied', 'meeting_booked', 'handed_off'].includes(l.status));
  const blocked = leads.filter((l) => ['blocked', 'disqualified', 'failed', 'rejected', 'opted_out'].includes(l.status));

  const processed = leads.length - queued.length;
  const progress = leads.length > 0 ? Math.round((processed / leads.length) * 100) : 0;

  return (
    <DashboardLayout title={mission.name}>
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => navigate('/missions')}>
        <ArrowLeft className="mr-2 h-4 w-4" /> Missões
      </Button>

      {/* ---- CABEÇALHO ---- */}
      <Card className="mb-6">
        <CardContent className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{AUTONOMY_LABELS[mission.autonomy_level].label}</Badge>
                <Badge variant="secondary">{GOAL_LABELS[mission.goal]}</Badge>
                <span className="text-sm text-muted-foreground">
                  limite {mission.daily_limit}/dia · {mission.start_hour}h às {mission.end_hour}h
                  {mission.work_days_only ? ' · dias úteis' : ''}
                </span>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {AUTONOMY_LABELS[mission.autonomy_level].description}
              </p>
            </div>

            {queued.length > 0 && (
              <Button onClick={() => runBatch.mutate()} disabled={runBatch.isPending}>
                {runBatch.isPending
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Play className="mr-2 h-4 w-4" />}
                Processar {Math.min(queued.length, 8)} de {queued.length}
              </Button>
            )}
          </div>

          {leads.length > 0 && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>{processed} de {leads.length} passaram pela esteira</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {sendBlockReason && (
            <Alert className="mt-4 border-amber-500/40 bg-amber-500/5">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <AlertDescription className="text-sm">
                <strong>Envios retidos:</strong>{' '}
                {BLOCK_REASONS[sendBlockReason] ?? sendBlockReason.replace(/_/g, ' ')}
                {' '}Os rascunhos continuam sendo preparados e ficam aguardando.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Tabs defaultValue="pending">
          <TabsList>
            <TabsTrigger value="pending">
              Aguardando você
              {pending.length > 0 && (
                <Badge variant="secondary" className="ml-2">{pending.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="sent">Enviados ({sent.length})</TabsTrigger>
            <TabsTrigger value="blocked">Descartados ({blocked.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="pending" className="mt-4 space-y-4">
            {pending.length === 0 ? (
              <EmptyState
                title="Nada aguardando aprovação"
                hint={
                  queued.length > 0
                    ? `${queued.length} lead(s) ainda na fila. Clique em "Processar" para a IA preparar as abordagens.`
                    : 'Todos os leads desta missão já foram tratados.'
                }
              />
            ) : (
              pending.map((lead) => (
                <DraftCard
                  key={lead.id}
                  item={lead}
                  onApprove={(message) => approveDraft.mutate({ id: lead.id, message })}
                  onReject={(reason) => rejectDraft.mutate({ id: lead.id, reason })}
                  isBusy={approveDraft.isPending || rejectDraft.isPending}
                />
              ))
            )}
          </TabsContent>

          <TabsContent value="sent" className="mt-4 space-y-3">
            {sent.length === 0
              ? <EmptyState title="Nenhuma mensagem enviada" hint="As abordagens aprovadas aparecem aqui." />
              : sent.map((lead) => <SentCard key={lead.id} item={lead} />)}
          </TabsContent>

          <TabsContent value="blocked" className="mt-4 space-y-3">
            {blocked.length === 0
              ? <EmptyState title="Nenhum descarte" hint="Leads desqualificados ou bloqueados pelo Quality Gate aparecem aqui." />
              : blocked.map((lead) => <BlockedCard key={lead.id} item={lead} />)}
          </TabsContent>
        </Tabs>

        <div>
          <h2 className="mb-3 text-sm font-semibold">Feed da missão</h2>
          <ActivityFeed events={events} />
        </div>
      </div>
    </DashboardLayout>
  );
}

// ------------------------------------------------------------

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="rounded-lg border border-dashed p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

/**
 * O cartão de aprovação. Mostra a mensagem E o raciocínio: qual fato foi
 * usado, por que aquela oferta, quanto tirou em cada nota. Aprovar às cegas
 * seria o mesmo que não ter revisão.
 */
function DraftCard({
  item, onApprove, onReject, isBusy,
}: {
  item: MissionLead;
  onApprove: (message?: string) => void;
  onReject: (reason?: string) => void;
  isBusy: boolean;
}) {
  const [message, setMessage] = useState(item.draft_message ?? '');
  const [showReasoning, setShowReasoning] = useState(false);

  const lead = item.leads;
  const edited = message !== (item.draft_message ?? '');

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{lead?.business_name ?? 'Lead'}</h3>
            <p className="text-sm text-muted-foreground">
              {[lead?.niche, lead?.location].filter(Boolean).join(' · ')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {item.score != null && <ScoreBadge score={item.score} />}
            {item.temperature && (
              <Badge variant="outline" className="text-[10px] capitalize">
                {item.temperature.replace('_', ' ')}
              </Badge>
            )}
          </div>
        </div>

        {/* Oferta escolhida + motivo */}
        {item.offer_match?.offer && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 p-3">
            <Package className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <div className="text-xs">
              <span className="font-medium">{item.offer_match.offer.name}</span>
              <span className="text-muted-foreground"> · {item.offer_match.confidence}% de confiança</span>
              {item.offer_match.reasons[0] && (
                <p className="mt-0.5 text-muted-foreground">{item.offer_match.reasons[0]}</p>
              )}
            </div>
          </div>
        )}

        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          className="mt-3 text-sm"
        />
        <p className="mt-1 text-xs text-muted-foreground">
          {message.trim().split(/\s+/).filter(Boolean).length} palavras
          {edited && ' · editado por você'}
          {item.rewrite_count > 0 && ` · a IA reescreveu ${item.rewrite_count}x até passar na revisão`}
        </p>

        {item.quality && <QualityBar scores={item.quality.scores} overall={item.quality.overall} />}

        <button
          onClick={() => setShowReasoning((v) => !v)}
          className="mt-3 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {showReasoning ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          Por que a IA escreveu isso
        </button>

        {showReasoning && <Reasoning item={item} />}

        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => onApprove(edited ? message : undefined)} disabled={isBusy || !message.trim()}>
            {isBusy ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : <Check className="mr-2 h-3 w-3" />}
            Aprovar e enviar
          </Button>
          <Button size="sm" variant="outline" onClick={() => onReject('recusado na revisão')} disabled={isBusy}>
            <X className="mr-2 h-3 w-3" /> Recusar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** Fatos usados, hipóteses levantadas e como a nota foi formada. */
function Reasoning({ item }: { item: MissionLead }) {
  return (
    <div className="mt-3 space-y-3 rounded-lg border bg-muted/30 p-3 text-xs">
      {item.strategy?.hook && (
        <div>
          <p className="flex items-center gap-1 font-medium">
            <Route className="h-3 w-3" /> Gancho ({item.strategy.angle})
          </p>
          <p className="mt-1 text-muted-foreground">
            {item.strategy.hook.value}
            <span className="italic"> — fonte: {item.strategy.hook.source}</span>
          </p>
        </div>
      )}

      {item.dossier?.facts && item.dossier.facts.length > 0 && (
        <div>
          <p className="flex items-center gap-1 font-medium">
            <Search className="h-3 w-3" /> Fatos observados
          </p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {item.dossier.facts.slice(0, 6).map((f, i) => (
              <li key={i}>• {f.label}: {f.value} <span className="italic">({f.source})</span></li>
            ))}
          </ul>
        </div>
      )}

      {item.dossier?.hypotheses && item.dossier.hypotheses.length > 0 && (
        <div>
          <p className="font-medium">Hipóteses (não afirmadas ao lead)</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {item.dossier.hypotheses.slice(0, 3).map((h, i) => <li key={i}>• {h.statement}</li>)}
          </ul>
        </div>
      )}

      {item.qualification?.reasons && item.qualification.reasons.length > 0 && (
        <div>
          <p className="font-medium">Como o score foi formado</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {item.qualification.reasons.map((r, i) => (
              <li key={i}>
                <span className={cn('font-medium tabular-nums', r.points > 0 ? 'text-emerald-600' : 'text-destructive')}>
                  {r.points > 0 ? '+' : ''}{r.points}
                </span>{' '}
                {r.label} — {r.evidence}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function QualityBar({ scores, overall }: { scores: QualityScores; overall: number }) {
  const items: { label: string; value: number; invert?: boolean }[] = [
    { label: 'Factualidade', value: scores.factuality },
    { label: 'Personalização', value: scores.personalization },
    { label: 'Relevância', value: scores.relevance },
    { label: 'Naturalidade', value: scores.naturalness },
    { label: 'Oferta', value: scores.offerAdherence },
    { label: 'Risco de spam', value: scores.spamRisk, invert: true },
  ];

  return (
    <div className="mt-3 rounded-lg border p-3">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <span className="text-xs font-medium">Quality Gate aprovado</span>
        <span className="ml-auto text-xs tabular-nums text-muted-foreground">{overall}/100</span>
      </div>
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {items.map((item) => {
          const good = item.invert ? item.value <= 40 : item.value >= 60;
          return (
            <div key={item.label} className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{item.label}</span>
              <span className={cn('tabular-nums font-medium', good ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400')}>
                {item.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 75 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
    : score >= 50 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
    : 'bg-muted text-muted-foreground';

  return <Badge variant="secondary" className={cn('tabular-nums', tone)}>score {score}</Badge>;
}

function SentCard({ item }: { item: MissionLead }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{item.leads?.business_name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{item.draft_message}</p>
          </div>
          <div className="shrink-0 text-right">
            {item.score != null && <ScoreBadge score={item.score} />}
            {item.sent_at && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                {new Date(item.sent_at).toLocaleString('pt-BR', {
                  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                })}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function BlockedCard({ item }: { item: MissionLead }) {
  const reason =
    item.qualification?.disqualifiedReason ??
    item.rejected_reason ??
    item.quality?.issues?.find((i) => i.severity === 'block')?.message ??
    item.error_message ??
    'Sem motivo registrado';

  return (
    <Card className="border-dashed">
      <CardContent className="flex items-start gap-3 p-4">
        <Ban className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-sm font-medium">{item.leads?.business_name}</p>
          <p className="text-xs text-muted-foreground">{reason}</p>
          {item.draft_message && (
            <p className="mt-2 rounded border-l-2 border-muted px-2 py-1 text-xs italic text-muted-foreground">
              {item.draft_message}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Rocket, Plus, Play, Pause, Loader2, AlertTriangle, OctagonX,
  Users, CheckCircle2, Send, MessageSquare, ArrowRight,
} from 'lucide-react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { NewMissionDialog } from '@/components/missions/NewMissionDialog';
import { NextActions } from '@/components/missions/NextActions';
import { ActivityFeed } from '@/components/missions/ActivityFeed';
import {
  useMissions, useCommandCenter, useActivityFeed,
  AUTONOMY_LABELS, GOAL_LABELS, type Mission,
} from '@/hooks/use-missions';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<Mission['status'], { label: string; className: string }> = {
  draft: { label: 'Rascunho', className: 'bg-muted text-muted-foreground' },
  running: { label: 'Rodando', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
  paused: { label: 'Pausada', className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  completed: { label: 'Concluída', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
  failed: { label: 'Falhou', className: 'bg-destructive/15 text-destructive' },
};

/**
 * Missões de prospecção.
 *
 * A tela responde a duas perguntas do operador: o que está rodando agora, e
 * o que precisa de mim. O resto é detalhe da missão.
 */
export default function MissionsPage() {
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { missions, isLoading, error, startMission, pauseMission, resumeMission } = useMissions();
  const { metrics, emergencyStop, resumeOutbound } = useCommandCenter();
  const { events, isLoading: loadingFeed } = useActivityFeed(30);

  const running = missions.filter((m) => m.status === 'running');
  const paused = missions.filter((m) => m.status === 'paused');

  return (
    <DashboardLayout title="Missões">
      {/* ---- FREIO GLOBAL ---- */}
      {metrics?.outbound_paused && (
        <Alert className="mb-6 border-destructive/40 bg-destructive/5">
          <OctagonX className="h-4 w-4 text-destructive" />
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm">
              <strong>Prospecção parada.</strong> Nenhum envio sai por nenhum caminho enquanto
              este freio estiver ativo.
            </span>
            <Button
              size="sm" variant="outline"
              onClick={() => resumeOutbound.mutate()}
              disabled={resumeOutbound.isPending}
            >
              {resumeOutbound.isPending && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
              Retomar envios
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            Diga quem prospectar e o que você vende. A IA pesquisa, qualifica, escolhe a
            oferta certa para cada empresa e prepara a abordagem.
          </p>
        </div>

        <div className="flex shrink-0 gap-2">
          {!metrics?.outbound_paused && (running.length > 0 || paused.length > 0) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-destructive">
                  <OctagonX className="mr-2 h-4 w-4" />
                  Parar tudo
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Parar toda a prospecção?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Todas as missões ativas são pausadas e nenhum envio sai até você retomar —
                    inclusive os agendados e os disparados por automação. Conversas já em
                    andamento continuam sendo respondidas.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => emergencyStop.mutate('parada manual pelo painel')}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Parar agora
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Nova missão
          </Button>
        </div>
      </div>

      {/* ---- POR ONDE COMEÇAR ---- */}
      {/* Vem antes dos números de propósito: quem abre a tela de manhã não
          quer saber quantos leads existem, quer saber o que fazer primeiro.
          Os números continuam logo abaixo, só deixaram de ser a primeira
          coisa. */}
      <NextActions metrics={metrics} />

      {/* ---- NÚMEROS DO DIA ---- */}
      {metrics && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <MetricTile icon={Users} label="Encontrados hoje" value={metrics.found_today} />
          <MetricTile icon={CheckCircle2} label="Qualificados" value={metrics.qualified_today} />
          <MetricTile icon={Send} label="Abordados" value={metrics.contacted_today} />
          <MetricTile icon={MessageSquare} label="Responderam" value={metrics.replied_today} />
          <MetricTile
            icon={AlertTriangle}
            label="Aguardando você"
            value={metrics.awaiting_approval}
            highlight={metrics.awaiting_approval > 0}
          />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {/* ---- LISTA ---- */}
        <div className="space-y-3">
          {isLoading ? (
            <>
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </>
          ) : error ? (
            <Alert className="border-destructive/40">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <AlertDescription>
                Não foi possível carregar as missões: {error.message}
              </AlertDescription>
            </Alert>
          ) : missions.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center py-12 text-center">
                <Rocket className="h-10 w-10 text-muted-foreground/40" />
                <h3 className="mt-4 font-semibold">Nenhuma missão ainda</h3>
                <p className="mt-2 max-w-md text-sm text-muted-foreground">
                  Uma missão é a instrução completa para a IA trabalhar: quem prospectar,
                  o que pode ser oferecido, qual o objetivo e até onde ela pode ir sozinha.
                </p>
                <Button className="mt-5" onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar a primeira missão
                </Button>
              </CardContent>
            </Card>
          ) : (
            missions.map((mission) => (
              <MissionCard
                key={mission.id}
                mission={mission}
                onOpen={() => navigate(`/missions/${mission.id}`)}
                onStart={() => startMission.mutate(mission.id)}
                onPause={() => pauseMission.mutate(mission.id)}
                onResume={() => resumeMission.mutate(mission.id)}
                isBusy={startMission.isPending || pauseMission.isPending || resumeMission.isPending}
              />
            ))
          )}
        </div>

        {/* ---- FEED ---- */}
        <div>
          <h2 className="mb-3 text-sm font-semibold">O que a IA está fazendo</h2>
          <ActivityFeed
            events={events}
            isLoading={loadingFeed}
            emptyHint="Inicie uma missão para ver cada decisão da IA em tempo real."
          />
        </div>
      </div>

      <NewMissionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={(id) => navigate(`/missions/${id}`)}
      />
    </DashboardLayout>
  );
}

function MetricTile({
  icon: Icon, label, value, highlight,
}: {
  icon: typeof Users; label: string; value: number; highlight?: boolean;
}) {
  return (
    <Card className={cn(highlight && 'border-amber-500/50 bg-amber-500/5')}>
      <CardContent className="p-4">
        <Icon className={cn('h-4 w-4', highlight ? 'text-amber-500' : 'text-muted-foreground')} />
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function MissionCard({
  mission, onOpen, onStart, onPause, onResume, isBusy,
}: {
  mission: Mission;
  onOpen: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  isBusy: boolean;
}) {
  const status = STATUS_STYLES[mission.status];
  const location = [mission.city, mission.state].filter(Boolean).join('/') || mission.region;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{mission.name}</h3>
              <Badge className={status.className} variant="secondary">{status.label}</Badge>
              <Badge variant="outline" className="text-[10px]">
                {AUTONOMY_LABELS[mission.autonomy_level].label}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {mission.niche}{location ? ` · ${location}` : ''} · {GOAL_LABELS[mission.goal]}
            </p>
            {mission.paused_reason && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Pausada: {mission.paused_reason}
              </p>
            )}
          </div>

          <div className="flex shrink-0 gap-2">
            {mission.status === 'draft' && (
              <Button size="sm" onClick={onStart} disabled={isBusy}>
                <Play className="mr-2 h-3 w-3" /> Iniciar
              </Button>
            )}
            {mission.status === 'running' && (
              <Button size="sm" variant="outline" onClick={onPause} disabled={isBusy}>
                <Pause className="mr-2 h-3 w-3" /> Pausar
              </Button>
            )}
            {mission.status === 'paused' && (
              <Button size="sm" variant="outline" onClick={onResume} disabled={isBusy}>
                <Play className="mr-2 h-3 w-3" /> Retomar
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={onOpen}>
              Abrir <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>

        {/* Funil da missão: os números só existem depois que a esteira roda. */}
        <div className="mt-4 grid grid-cols-3 gap-3 border-t pt-4 sm:grid-cols-5">
          <FunnelStat label="Encontrados" value={mission.leads_found} />
          <FunnelStat label="Qualificados" value={mission.leads_qualified} />
          <FunnelStat label="Prontos" value={mission.leads_drafted} />
          <FunnelStat label="Abordados" value={mission.leads_contacted} />
          <FunnelStat label="Responderam" value={mission.leads_replied} />
        </div>
      </CardContent>
    </Card>
  );
}

function FunnelStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

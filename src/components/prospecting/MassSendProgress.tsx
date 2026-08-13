import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Pause, 
  Play, 
  Square, 
  SkipForward, 
  Clock,
  Send,
  CheckCircle2,
  XCircle,
  Loader2,
  Phone,
  Building2,
  RefreshCw,
} from 'lucide-react';
import { useMassSendJob, MassSendLead } from '@/hooks/use-mass-send-job';
import { cn } from '@/lib/utils';

export function MassSendProgress() {
  const {
    activeJob,
    isLoading,
    pauseJob,
    resumeJob,
    cancelJob,
    skipToNext,
    isPausing,
    isResuming,
    isCancelling,
    isSkipping,
    countdown,
    currentLead,
    getJobLeads,
    getProgress,
    formatCountdown,
    refetch,
  } = useMassSendJob();

  const [showAllLeads, setShowAllLeads] = useState(false);

  // O TIMER QUE ESTAVA AQUI ERA DUPLICADO.
  //
  // `useMassSendJob` ja busca o job por conta propria enquanto ele roda.
  // Este `setInterval(refetch, 2000)` era um SEGUNDO relogio sobre o mesmo
  // dado: dois timers independentes, um de 3s e outro de 2s, buscando a
  // mesma linha. Cerca de duas vezes e meia o numero de requisicoes, sem
  // nenhuma informacao a mais.
  //
  // E o do hook tem uma vantagem que este nao tinha: sendo `refetchInterval`
  // do TanStack, ele pausa sozinho quando a aba perde o foco. Um disparo de
  // quatro horas com a aba em segundo plano fazia 7.200 requisicoes por este
  // caminho para atualizar uma tela que ninguem estava olhando.

  if (isLoading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="py-6 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </CardContent>
      </Card>
    );
  }

  if (!activeJob) {
    return null;
  }

  const leads = getJobLeads();
  const progress = getProgress();
  const currentIndex = activeJob.current_index || 0;
  const isRunning = activeJob.status === 'running';
  const isPaused = activeJob.status === 'paused';

  const getLeadStatusIcon = (lead: MassSendLead, index: number) => {
    if (index === currentIndex && isRunning) {
      return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
    }
    switch (lead.status) {
      case 'sent':
        return <CheckCircle2 className="h-4 w-4 text-success" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'sending':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'skipped':
        return <SkipForward className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getLeadStatusBadge = (lead: MassSendLead, index: number) => {
    if (index === currentIndex && isRunning) {
      return <Badge variant="outline" className="animate-pulse">Enviando...</Badge>;
    }
    switch (lead.status) {
      case 'sent':
        return <Badge className="bg-success/10 text-success border-success/20">Enviado</Badge>;
      case 'failed':
        return <Badge variant="destructive">Falhou</Badge>;
      case 'sending':
        return <Badge variant="outline" className="animate-pulse">Enviando...</Badge>;
      case 'skipped':
        return <Badge variant="secondary">Pulado</Badge>;
      default:
        return <Badge variant="outline">Aguardando</Badge>;
    }
  };

  return (
    <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Send className="h-5 w-5 text-primary" />
            Disparo em Andamento
          </CardTitle>
          <div className="flex items-center gap-2">
            {isRunning && (
              <Badge className="animate-pulse bg-success text-success-foreground">● Executando</Badge>
            )}
            {isPaused && (
              <Badge variant="secondary">⏸ Pausado</Badge>
            )}
            <Button variant="ghost" size="icon" onClick={() => refetch()} className="h-8 w-8">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Visual progress */}
        <div className="space-y-3">
          <div className="relative">
            <Progress value={progress} className="h-4" />
            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold">
              {progress}%
            </span>
          </div>
          
          {/* "Enviados" era `processed_items - failed_items`, e
              `processed_items` soma os PULADOS. Num lote real isso mostrou
              "20 enviados" quando uma única mensagem tinha saído — as outras
              foram barradas no portão de qualidade.

              Agora são quatro números, e "bloqueados" tem lugar próprio:
              não é falha, é o portão recusando uma mensagem ruim. Junto vem
              a explicação, porque um número sem causa vira desconfiança. */}
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            <div className="p-2 rounded-lg bg-success/10">
              <p className="text-2xl font-bold text-success">{activeJob.sent_items ?? 0}</p>
              <p className="text-xs text-muted-foreground">Enviados</p>
            </div>
            <div className="p-2 rounded-lg bg-warning/10">
              <p className="text-2xl font-bold text-warning">{activeJob.skipped_items ?? 0}</p>
              <p className="text-xs text-muted-foreground">Bloqueados</p>
            </div>
            <div className="p-2 rounded-lg bg-destructive/10">
              <p className="text-2xl font-bold text-destructive">{activeJob.failed_items || 0}</p>
              <p className="text-xs text-muted-foreground">Falharam</p>
            </div>
            <div className="p-2 rounded-lg bg-muted">
              <p className="text-2xl font-bold text-muted-foreground">{activeJob.total_items - activeJob.processed_items}</p>
              <p className="text-xs text-muted-foreground">Restantes</p>
            </div>
          </div>

          {(activeJob.skipped_items ?? 0) > 0 && (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              <strong>{activeJob.skipped_items} mensagem(ns) não saíram de propósito.</strong>{' '}
              A revisão de qualidade reprovou o texto — genérico demais, sem citar a empresa ou
              sem fato para sustentar a abordagem. Não enviar é melhor que queimar o número com
              mensagem que parece robô.
            </p>
          )}
        </div>

        {/* Current lead and countdown */}
        {currentLead && isRunning && (
          <div className="bg-background rounded-lg p-4 border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Enviando para:</span>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span className="font-mono text-lg font-bold text-primary">
                  {formatCountdown(countdown)}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{currentLead.business_name}</p>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />
                  {currentLead.phone}
                </p>
              </div>
            </div>

            {/* Skip button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => skipToNext(activeJob.id)}
              disabled={isSkipping}
            >
              {isSkipping ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <SkipForward className="h-4 w-4 mr-2" />
              )}
              Adiantar Próximo Envio
            </Button>
          </div>
        )}

        {/* Control buttons */}
        <div className="flex gap-2">
          {isRunning ? (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => pauseJob(activeJob.id)}
              disabled={isPausing}
            >
              {isPausing ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Pause className="h-4 w-4 mr-2" />
              )}
              Pausar
            </Button>
          ) : isPaused ? (
            <Button
              variant="default"
              className="flex-1"
              onClick={() => resumeJob(activeJob.id)}
              disabled={isResuming}
            >
              {isResuming ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Play className="h-4 w-4 mr-2" />
              )}
              Retomar
            </Button>
          ) : null}

          <Button
            variant="destructive"
            onClick={() => cancelJob(activeJob.id)}
            disabled={isCancelling}
          >
            {isCancelling ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Square className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Leads list */}
        <div className="space-y-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full"
            onClick={() => setShowAllLeads(!showAllLeads)}
          >
            {showAllLeads ? 'Ocultar lista de leads' : 'Ver lista de leads'}
          </Button>

          {showAllLeads && (
            <ScrollArea className="h-[300px] border rounded-lg">
              <div className="p-2 space-y-1">
                {leads.map((lead, index) => {
                  const isCurrentlySending = index === currentIndex && isRunning;
                  return (
                    <div
                      key={lead.id}
                      className={cn(
                        "flex items-center gap-3 p-2 rounded-lg transition-colors",
                        isCurrentlySending && "bg-primary/10 border border-primary/30 animate-pulse",
                        lead.status === 'sent' && "bg-success/5",
                        lead.status === 'failed' && "bg-destructive/5"
                      )}
                    >
                      <span className="text-xs text-muted-foreground w-6">
                        #{index + 1}
                      </span>
                      {getLeadStatusIcon(lead, index)}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{lead.business_name}</p>
                        <p className="text-xs text-muted-foreground">{lead.phone}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {isCurrentlySending && (
                          <Badge className="bg-primary text-primary-foreground animate-bounce text-xs">
                            AGORA
                          </Badge>
                        )}
                        {getLeadStatusBadge(lead, index)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </div>

        {/* Info about persistence */}
        <p className="text-xs text-muted-foreground text-center">
          💡 O disparo continua mesmo se você fechar ou recarregar a página
        </p>
      </CardContent>
    </Card>
  );
}

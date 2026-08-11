import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { FlaskConical, Search, ShieldCheck, ShieldAlert, Quote } from 'lucide-react';
import { useLeads } from '@/hooks/use-leads';
import { usePreviewLead, type LeadPreview } from '@/hooks/use-ai-center';
import { DEFAULT_THRESHOLDS } from '../../../supabase/functions/_shared/agents/types';

const NOTA_LABEL: Record<string, string> = {
  personalization: 'Personalização',
  relevance: 'Relevância',
  naturalness: 'Naturalidade',
  factuality: 'Factualidade',
  spamRisk: 'Risco de spam',
  offerAdherence: 'Aderência à oferta',
};

/**
 * Diz se a nota passa no limite que o gate realmente aplica.
 *
 * Os números vêm de `DEFAULT_THRESHOLDS`, o mesmo objeto que o Quality Gate
 * usa — e não de uma cópia escrita aqui. Uma cópia acabaria discordando no
 * dia em que alguém ajustasse o limite, e a tela mostraria verde numa
 * mensagem que o sistema recusou. Errar no sentido de parecer aprovado é o
 * pior erro que esta tela pode cometer.
 */
export function notaOk(chave: string, valor: number): boolean {
  if (chave === 'spamRisk') return valor <= DEFAULT_THRESHOLDS.maxSpamRisk;
  const limite = (DEFAULT_THRESHOLDS as unknown as Record<string, number>)[chave];
  return limite == null ? true : valor >= limite;
}

export function AiPlayground() {
  const { leads, isLoading: carregandoLeads } = useLeads();
  const { runPreview, preview, isRunning, error } = usePreviewLead();
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState<string | null>(null);

  const filtrados = (leads ?? [])
    .filter(l =>
      !busca ||
      l.business_name?.toLowerCase().includes(busca.toLowerCase()) ||
      l.niche?.toLowerCase().includes(busca.toLowerCase()),
    )
    .slice(0, 40);

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      {/* ---- Escolha do lead ---- */}
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Escolha um lead
          </CardTitle>
          <CardDescription>
            Nada é enviado e nada é gravado. É a esteira inteira rodando em seco.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="busca-lead" className="sr-only">Buscar lead</Label>
            <Input
              id="busca-lead"
              placeholder="Nome ou nicho..."
              value={busca}
              onChange={e => setBusca(e.target.value)}
            />
          </div>

          {carregandoLeads ? (
            <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12" />)}</div>
          ) : filtrados.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nenhum lead encontrado. Capture leads em Prospecção primeiro.
            </p>
          ) : (
            <div className="space-y-1 max-h-[480px] overflow-y-auto pr-1">
              {filtrados.map(lead => (
                <button
                  key={lead.id}
                  onClick={() => {
                    setSelecionado(lead.id);
                    runPreview({ leadId: lead.id });
                  }}
                  className={`w-full text-left p-2.5 rounded-md border transition-colors ${
                    selecionado === lead.id
                      ? 'border-primary bg-primary/5'
                      : 'border-transparent hover:bg-muted/60'
                  }`}
                >
                  <p className="text-sm font-medium truncate">{lead.business_name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {[lead.niche, lead.location].filter(Boolean).join(' · ') || 'sem nicho'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- Resultado ---- */}
      <div className="space-y-4">
        {isRunning && (
          <Card>
            <CardContent className="py-10 text-center space-y-2">
              <FlaskConical className="h-6 w-6 mx-auto text-muted-foreground animate-pulse" />
              <p className="text-sm text-muted-foreground">
                Montando dossiê, qualificando, escolhendo oferta e escrevendo...
              </p>
            </CardContent>
          </Card>
        )}

        {error && !isRunning && (
          <Alert variant="destructive">
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        )}

        {!isRunning && !preview && !error && (
          <Card>
            <CardContent className="py-16 text-center">
              <FlaskConical className="h-8 w-8 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                Selecione um lead ao lado. Você vai ver cada fato com a origem,
                cada ponto do score com a evidência, a oferta escolhida com o
                motivo, e as seis notas da revisão — antes de qualquer mensagem
                sair.
              </p>
            </CardContent>
          </Card>
        )}

        {!isRunning && preview && <PreviewResultado preview={preview} />}
      </div>
    </div>
  );
}

function PreviewResultado({ preview }: { preview: LeadPreview }) {
  const q = preview.quality;
  const notas = Object.entries(q?.scores ?? {});
  const bloqueios = (q?.issues ?? []).filter(i => i.severity === 'block');
  const avisos = (q?.issues ?? []).filter(i => i.severity !== 'block');

  return (
    <div className="space-y-4">
      {/* ---- A mensagem ---- */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between gap-4">
            <CardTitle className="text-base flex items-center gap-2">
              <Quote className="h-4 w-4" />
              A mensagem
            </CardTitle>
            {q && (
              <Badge variant={q.approved ? 'default' : 'destructive'} className="shrink-0">
                {q.approved ? `aprovada · nota ${q.overall}` : 'reprovada na revisão'}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {preview.message ? (
            <div className="p-4 rounded-lg bg-muted/60 whitespace-pre-wrap text-sm leading-relaxed">
              {preview.message}
            </div>
          ) : (
            // Sem mensagem não é bug: é a decisão de não afirmar o que não dá
            // para sustentar. A tela precisa dizer isso, senão parece falha.
            <Alert>
              <ShieldAlert className="h-4 w-4" />
              <AlertDescription>
                Nenhuma mensagem foi escrita para este lead.{' '}
                {preview.outcome?.reason || 'A esteira parou antes da redação.'}
              </AlertDescription>
            </Alert>
          )}

          {preview.rewrites > 0 && (
            <p className="text-xs text-muted-foreground">
              Reescrita {preview.rewrites}× até passar na revisão.
            </p>
          )}

          {bloqueios.length > 0 && (
            <div className="space-y-2">
              {bloqueios.map((issue, i) => (
                <Alert key={i} variant="destructive">
                  <AlertDescription className="text-sm">
                    {issue.message}
                    {issue.excerpt && (
                      <span className="block mt-1 font-mono text-xs opacity-80">"{issue.excerpt}"</span>
                    )}
                  </AlertDescription>
                </Alert>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---- As seis notas ---- */}
      {notas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" />
              Revisão de qualidade
            </CardTitle>
            <CardDescription>
              Factualidade é a única que não se negocia: precisa de 90. As demais
              pedem 60, e risco de spam precisa ficar abaixo de 40.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            {notas.map(([chave, valor]) => {
              const ok = notaOk(chave, Number(valor));
              return (
                <div key={chave}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span>{NOTA_LABEL[chave] ?? chave}</span>
                    <span className={ok ? 'text-muted-foreground' : 'text-destructive font-medium'}>
                      {Number(valor)}
                    </span>
                  </div>
                  <Progress value={Number(valor)} className="h-1.5" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {avisos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Observações que não bloqueiam</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-sm text-muted-foreground">
              {avisos.map((a, i) => <li key={i}>• {a.message}</li>)}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* ---- Fatos e hipóteses ---- */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Fatos observados</CardTitle>
            <CardDescription>Só isto pode ser afirmado ao lead.</CardDescription>
          </CardHeader>
          <CardContent>
            {(preview.dossier?.facts ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada observado sobre este lead ainda.</p>
            ) : (
              <ul className="space-y-3">
                {preview.dossier!.facts.map((f, i) => (
                  <li key={i} className="text-sm">
                    <span className="font-medium">{f.label}:</span> {f.value}
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      fonte: {f.source}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Hipóteses</CardTitle>
            <CardDescription>
              Deduções. Só podem virar pergunta, nunca afirmação.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(preview.dossier?.hypotheses ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma.</p>
            ) : (
              <ul className="space-y-3">
                {preview.dossier!.hypotheses.map((h, i) => (
                  <li key={i} className="text-sm">
                    {h.statement}
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      deduzido de: {h.basedOn}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ---- Score ---- */}
      {preview.qualification && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-4">
              <CardTitle className="text-base">Qualificação</CardTitle>
              <div className="flex items-center gap-2">
                <Badge variant="outline">{preview.qualification.temperature}</Badge>
                <Badge>{preview.qualification.score} pts</Badge>
              </div>
            </div>
            <CardDescription>
              Cálculo sem IA — mesma entrada, mesma nota, sempre. É o que permite
              auditar e comparar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {preview.qualification.disqualified ? (
              <Alert variant="destructive">
                <AlertDescription>
                  Desqualificado: {preview.qualification.disqualifiedReason}
                </AlertDescription>
              </Alert>
            ) : (
              <ul className="space-y-2">
                {preview.qualification.reasons.map((r, i) => (
                  <li key={i} className="flex items-start justify-between gap-4 text-sm">
                    <div>
                      <span>{r.label}</span>
                      <span className="block text-xs text-muted-foreground">{r.evidence}</span>
                    </div>
                    <span
                      className={`shrink-0 font-mono ${r.points >= 0 ? 'text-success' : 'text-destructive'}`}
                    >
                      {r.points >= 0 ? '+' : ''}{r.points}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ---- Oferta e estratégia ---- */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Oferta escolhida</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {preview.offer_match?.offer ? (
              <>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{preview.offer_match.offer.name}</span>
                  <Badge variant="secondary">{preview.offer_match.confidence}% de confiança</Badge>
                </div>
                <ul className="text-sm text-muted-foreground space-y-1">
                  {preview.offer_match.reasons.map((r, i) => <li key={i}>• {r}</li>)}
                </ul>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Nenhuma oferta do catálogo se encaixou.{' '}
                {preview.offer_match?.reasons?.[0] ?? 'A abordagem fica consultiva.'}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Estratégia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {preview.strategy ? (
              <>
                <p>
                  <span className="text-muted-foreground">Ângulo:</span>{' '}
                  {preview.strategy.angle}
                </p>
                <p>
                  <span className="text-muted-foreground">Gancho:</span>{' '}
                  {preview.strategy.hook
                    ? `${preview.strategy.hook.value} (${preview.strategy.hook.source})`
                    : 'nenhum — nada forte o bastante para abrir'}
                </p>
                <p>
                  <span className="text-muted-foreground">Pedido:</span> {preview.strategy.cta}
                </p>
                <p className="text-xs text-muted-foreground">
                  Limite de {preview.strategy.maxWords} palavras para esta abordagem.
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">Não chegou a montar estratégia.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

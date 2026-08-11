import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, DollarSign, Gauge, Timer } from 'lucide-react';
import { useAiCost, useAiBudget } from '@/hooks/use-ai-center';
import { useBestHours } from '@/hooks/use-prospecting-stats';

const AGENTE_LABEL: Record<string, string> = {
  research: 'Pesquisa',
  enrichment: 'Enriquecimento',
  copywriter: 'Redação',
  conversation: 'Conversa',
  follow_up: 'Follow-up',
  reactivation: 'Reativação',
  orchestrator: 'Orquestrador',
  outros: 'Outros',
};

const usd = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

export function AiCostPanel() {
  const { cost, isLoading } = useAiCost();
  const { updateBudget, isSaving } = useAiBudget();
  const horarios = useBestHours();

  const [daily, setDaily] = useState('');
  const [monthly, setMonthly] = useState('');

  // Os campos partem do que está gravado. Sem isto, abrir a tela e salvar
  // zeraria o teto de quem nunca mexeu nele.
  useEffect(() => {
    if (cost?.daily_cap != null) setDaily(String(cost.daily_cap));
    if (cost?.monthly_cap != null) setMonthly(String(cost.monthly_cap));
  }, [cost?.daily_cap, cost?.monthly_cap]);

  if (isLoading || !cost) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map(i => <Skeleton key={i} className="h-32" />)}
      </div>
    );
  }

  const capDiario = Number(cost.daily_cap ?? 0);
  const capMensal = Number(cost.monthly_cap ?? 0);
  const usoDiario = capDiario > 0 ? Math.min(100, (cost.today / capDiario) * 100) : 0;
  const usoMensal = capMensal > 0 ? Math.min(100, (cost.month / capMensal) * 100) : 0;

  const estourouDia = capDiario > 0 && cost.today >= capDiario;
  const estourouMes = capMensal > 0 && cost.month >= capMensal;

  const porAgente = Object.entries(cost.by_agent ?? {})
    .map(([agente, valor]) => ({ agente, valor: Number(valor) }))
    .sort((a, b) => b.valor - a.valor);

  const totalMes = porAgente.reduce((s, a) => s + a.valor, 0);

  const salvar = () => {
    const d = Number(daily.replace(',', '.'));
    const m = Number(monthly.replace(',', '.'));
    if (!Number.isFinite(d) || !Number.isFinite(m) || d <= 0 || m <= 0) return;
    updateBudget({ daily: d, monthly: m });
  };

  return (
    <div className="space-y-6">
      {/* O aviso vem primeiro porque é acionável: enquanto ele existir, as
          missões não processam lote nenhum. */}
      {(estourouDia || estourouMes) && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {estourouDia
              ? `O teto diário de ${usd(capDiario)} foi atingido. `
              : `O teto mensal de ${usd(capMensal)} foi atingido. `}
            Nenhum lote de missão será processado até o teto subir ou o período virar.
            É o freio funcionando — mas se for cedo demais, aumente abaixo.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{usd(cost.today)}</div>
            {capDiario > 0 && (
              <>
                <Progress value={usoDiario} className="h-2 mt-3" />
                <p className="text-xs text-muted-foreground mt-1">
                  {Math.round(usoDiario)}% do teto de {usd(capDiario)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Gauge className="h-4 w-4 text-muted-foreground" />
              Este mês
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{usd(cost.month)}</div>
            {capMensal > 0 && (
              <>
                <Progress value={usoMensal} className="h-2 mt-3" />
                <p className="text-xs text-muted-foreground mt-1">
                  {Math.round(usoMensal)}% do teto de {usd(capMensal)}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              Latência média hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">
              {cost.avg_latency_ms > 0 ? `${(cost.avg_latency_ms / 1000).toFixed(1)}s` : '—'}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Tempo que o modelo leva para responder. Acima de 10s, o lote arrasta.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Onde o dinheiro foi este mês</CardTitle>
            <CardDescription>
              Por etapa da esteira. A conversa costuma ser a mais cara: manda o
              histórico inteiro no contexto, a cada mensagem.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {porAgente.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nenhum consumo registrado ainda neste mês.
              </p>
            ) : (
              <div className="space-y-3">
                {porAgente.map(({ agente, valor }) => (
                  <div key={agente}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span>{AGENTE_LABEL[agente] ?? agente}</span>
                      <span className="text-muted-foreground">{usd(valor)}</span>
                    </div>
                    <Progress
                      value={totalMes > 0 ? (valor / totalMes) * 100 : 0}
                      className="h-1.5"
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Teto de gasto</CardTitle>
            <CardDescription>
              Checado antes de cada lote. Um lote de 8 leads pode custar 24
              chamadas de modelo com as reescritas — descobrir o estouro depois
              de gastar não serve de nada.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="teto-diario">Teto diário (US$)</Label>
                <Input
                  id="teto-diario"
                  inputMode="decimal"
                  value={daily}
                  onChange={e => setDaily(e.target.value)}
                  placeholder="5.00"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="teto-mensal">Teto mensal (US$)</Label>
                <Input
                  id="teto-mensal"
                  inputMode="decimal"
                  value={monthly}
                  onChange={e => setMonthly(e.target.value)}
                  placeholder="100.00"
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Vence sempre o mais restritivo entre o teto da conta e o da missão.
              A checagem falha aberta de propósito: se o cálculo do orçamento
              quebrar, parar de vender custa mais que o estouro.
            </p>

            <Button onClick={salvar} disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar teto'}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Melhor horário para abordar</CardTitle>
          <CardDescription>
            Calculado sobre envio e resposta reais da sua conta nos últimos 90
            dias — não sobre média de mercado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {horarios.isLoading ? (
            <Skeleton className="h-16" />
          ) : (
            <div className="space-y-3">
              {horarios.fromData ? (
                <div className="flex flex-wrap gap-2">
                  {horarios.hours.map((h, i) => (
                    <Badge key={h} variant={i === 0 ? 'default' : 'secondary'} className="text-sm">
                      {String(h).padStart(2, '0')}h
                    </Badge>
                  ))}
                </div>
              ) : (
                // Sem evidência, aparece o motivo — não um horário chutado com
                // cara de conclusão. Foi exatamente esse o defeito anterior.
                <Badge variant="outline" className="border-warning text-warning">
                  ainda sem base para recomendar
                </Badge>
              )}
              <p className="text-sm text-muted-foreground leading-relaxed">{horarios.reason}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

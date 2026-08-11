import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Lightbulb, Package } from 'lucide-react';
import { learnFromOutreach, type AngleStat } from '../../../supabase/functions/_shared/agents/learning';

const ANGULO_LABEL: Record<string, string> = {
  diagnostico: 'Diagnóstico — aponta um problema verificado',
  oportunidade: 'Oportunidade — mostra espaço para crescer',
  consultiva: 'Consultiva — pergunta antes de propor',
  curta: 'Curta — uma linha, sem contexto forte',
  prova: 'Prova — cita um case cadastrado',
  reativacao: 'Reativação — já houve contato antes',
  follow_up: 'Follow-up — insistência após silêncio',
  'sem ângulo': 'Sem ângulo registrado',
};

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

/**
 * O que a operação já ensinou.
 *
 * `mission_leads` guarda a estratégia usada e o desfecho de cada abordagem
 * desde o primeiro dia — milhares de experimentos que nenhuma consulta lia. A
 * pergunta "que tipo de abordagem funciona no meu nicho?" tinha resposta no
 * banco e não tinha tela.
 */
export function LearningPanel() {
  const { user } = useAuth();

  const { data: angulos, isLoading } = useQuery({
    queryKey: ['outreach-by-angle', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('outreach_by_angle', {
        p_user_id: user!.id,
        p_days: 180,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ angle: string; sent: number; replied: number; meetings: number }>;
    },
    enabled: !!user?.id,
  });

  const { data: ofertas } = useQuery({
    queryKey: ['outreach-by-offer', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('outreach_by_offer', {
        p_user_id: user!.id,
        p_days: 180,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ offer: string; sent: number; replied: number; meetings: number }>;
    },
    enabled: !!user?.id,
  });

  if (isLoading) {
    return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-40" />)}</div>;
  }

  const stats: AngleStat[] = (angulos ?? []).map(a => ({
    angle: a.angle,
    sent: Number(a.sent),
    replied: Number(a.replied),
    meetings: Number(a.meetings),
  }));

  const report = learnFromOutreach(stats);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            Que tipo de abordagem funciona aqui
          </CardTitle>
          <CardDescription>
            Calculado sobre as suas abordagens dos últimos 180 dias. Ordenado
            por reunião marcada antes de resposta — o ângulo que provoca
            curiosidade ganha em resposta e some na hora de marcar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* O resumo vem antes da tabela: é a conclusão, e é onde mora o
              aviso de quando ainda NÃO dá para concluir. */}
          <p className="text-sm leading-relaxed">{report.summary}</p>

          {report.ranking.length > 0 && (
            <div className="space-y-3">
              {report.ranking.map(r => (
                <div key={r.angle}>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2">
                      {ANGULO_LABEL[r.angle] ?? r.angle}
                      {report.preferred.includes(r.angle) && (
                        <Badge variant="default" className="text-[10px]">a esteira prefere</Badge>
                      )}
                      {report.avoid.includes(r.angle) && (
                        <Badge variant="outline" className="border-warning text-warning text-[10px]">
                          vem abaixo da média
                        </Badge>
                      )}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {pct(r.replyRate)} resposta · {pct(r.meetingRate)} reunião · {r.sent} envios
                    </span>
                  </div>
                  <Progress value={r.replyRate * 100} className="mt-1 h-1.5" />
                </div>
              ))}
            </div>
          )}

          {report.ranking.length === 0 && stats.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {stats.reduce((s, a) => s + a.sent, 0)} abordagem(ns) registrada(s) até
              agora, espalhadas entre os ângulos.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Qual oferta abre porta
          </CardTitle>
          <CardDescription>
            Oferta sem resposta não é necessariamente ruim — pode estar sendo
            oferecida para quem não precisa. Mas é o primeiro lugar para olhar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!ofertas || ofertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma abordagem enviada ainda.
            </p>
          ) : (
            <div className="space-y-3">
              {ofertas.map(o => {
                const enviados = Number(o.sent);
                const taxa = enviados > 0 ? Number(o.replied) / enviados : 0;
                return (
                  <div key={o.offer}>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span>{o.offer}</span>
                      <span className="text-muted-foreground text-xs">
                        {enviados < 30
                          // Sem amostra, o número existe mas não quer dizer
                          // nada — e mostrá-lo sozinho convida a concluir.
                          ? `${enviados} envios — poucos para concluir`
                          : `${pct(taxa)} de resposta em ${enviados} envios`}
                      </span>
                    </div>
                    <Progress value={enviados >= 30 ? taxa * 100 : 0} className="mt-1 h-1.5" />
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

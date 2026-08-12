import { useQuery } from '@tanstack/react-query';
import {
  Database, CheckCircle2, AlertTriangle, XCircle, MinusCircle,
  Loader2, Clock, Layers,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

// ============================================================
// DATA SOURCES — SUPER ADMIN
// ============================================================
// Infraestrutura interna. O cliente final nunca vê esta tela: para ele
// existe apenas "a busca". Mostrar quais fontes existem seria expor a
// engenharia do produto sem nenhum ganho para quem usa.
//
// Aqui a pergunta que importa não é "quantas empresas a fonte achou", e sim
// "quantas empresas ÚNICAS ela agregou". Uma fonte que devolve 500 empresas
// que as outras já tinham custa tempo e não entrega nada.

interface ProviderRow {
  id: string;
  enabled: boolean;
  health: 'healthy' | 'degraded' | 'offline' | 'not_configured';
  priority: number;
  total_runs: number;
  total_found: number;
  total_unique: number;
  unique_rate: number;
  avg_latency_ms: number;
  consecutive_failures: number;
  circuit_open_until: string | null;
  last_run_at: string | null;
  last_error: string | null;
}

interface Overview {
  providers: ProviderRow[];
  cache_entries: number;
  cache_hits: number;
}

const HEALTH_META = {
  healthy: { label: 'Ativa', icon: CheckCircle2, className: 'text-success' },
  degraded: { label: 'Instável', icon: AlertTriangle, className: 'text-warning' },
  offline: { label: 'Fora do ar', icon: XCircle, className: 'text-destructive' },
  not_configured: { label: 'Não configurada', icon: MinusCircle, className: 'text-muted-foreground' },
} as const;

/** Rótulos internos. Não aparecem para o cliente final. */
const PROVIDER_LABELS: Record<string, string> = {
  openstreetmap: 'OpenStreetMap / Overpass',
  maps_worker: 'Worker externo de mapas',
  serper: 'Serper (Google Places)',
  serpapi: 'SerpApi (Google Maps)',
  duckduckgo: 'Busca aberta na web',
};

export function AdminDataSourcesTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['admin', 'data-sources'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('data_sources_overview');
      if (error) throw error;
      return data as unknown as Overview;
    },
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="border-destructive/40">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <AlertDescription>
          Não foi possível carregar as fontes: {(error as Error).message}
        </AlertDescription>
      </Alert>
    );
  }

  const providers = data?.providers ?? [];

  if (providers.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center">
        <Database className="mx-auto h-8 w-8 text-muted-foreground/50" />
        <p className="mt-3 text-sm font-medium">Nenhuma fonte registrada ainda</p>
        <p className="mt-1 text-xs text-muted-foreground">
          O estado das fontes é gravado na primeira busca executada.
        </p>
      </div>
    );
  }

  const active = providers.filter((p) => p.health === 'healthy').length;
  const totalUnique = providers.reduce((sum, p) => sum + p.total_unique, 0);
  const totalFound = providers.reduce((sum, p) => sum + p.total_found, 0);
  const duplicatesRemoved = Math.max(0, totalFound - totalUnique);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard icon={CheckCircle2} label="Fontes ativas" value={`${active}/${providers.length}`} />
        <StatCard icon={Layers} label="Empresas únicas" value={totalUnique.toLocaleString('pt-BR')} />
        <StatCard icon={Database} label="Duplicatas removidas" value={duplicatesRemoved.toLocaleString('pt-BR')} />
        <StatCard icon={Clock} label="Buscas em cache" value={String(data?.cache_entries ?? 0)} />
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Ordem</TableHead>
                  <TableHead className="text-right">Execuções</TableHead>
                  <TableHead className="text-right">Encontradas</TableHead>
                  <TableHead className="text-right">Únicas</TableHead>
                  <TableHead className="text-right">Aproveitamento</TableHead>
                  <TableHead className="text-right">Latência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providers.map((provider) => {
                  const meta = HEALTH_META[provider.health];
                  const Icon = meta.icon;
                  const rate = Math.round((provider.unique_rate ?? 0) * 100);

                  return (
                    <TableRow key={provider.id}>
                      <TableCell>
                        <p className="font-medium">
                          {PROVIDER_LABELS[provider.id] ?? provider.id}
                        </p>
                        {provider.last_error && (
                          <p className="mt-0.5 max-w-xs truncate text-xs text-destructive">
                            {provider.last_error}
                          </p>
                        )}
                      </TableCell>

                      <TableCell>
                        <span className={cn('flex items-center gap-1.5 text-sm', meta.className)}>
                          <Icon className="h-3.5 w-3.5" />
                          {meta.label}
                        </span>
                        {provider.circuit_open_until &&
                          new Date(provider.circuit_open_until) > new Date() && (
                          <p className="mt-0.5 text-[11px] text-muted-foreground">
                            desligada até{' '}
                            {new Date(provider.circuit_open_until).toLocaleTimeString('pt-BR', {
                              hour: '2-digit', minute: '2-digit',
                            })}
                          </p>
                        )}
                      </TableCell>

                      <TableCell className="text-right tabular-nums">{provider.priority}</TableCell>
                      <TableCell className="text-right tabular-nums">{provider.total_runs}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {provider.total_found.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {provider.total_unique.toLocaleString('pt-BR')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge
                          variant="secondary"
                          className={cn(
                            'tabular-nums',
                            rate >= 60 ? 'bg-success/15 text-success'
                            : rate >= 30 ? 'bg-warning/15 text-warning'
                            : 'bg-muted text-muted-foreground',
                          )}
                        >
                          {rate}%
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {provider.avg_latency_ms > 0
                          ? `${(provider.avg_latency_ms / 1000).toFixed(1)}s`
                          : '—'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        <strong>Aproveitamento</strong> é a proporção de empresas únicas que a fonte agregou
        sobre tudo que ela devolveu. Fonte com aproveitamento baixo está encontrando o que as
        outras já encontraram — custa tempo e não acrescenta carteira. Fonte que falha 3 vezes
        seguidas é desligada por 10 minutos automaticamente.
      </p>
    </div>
  );
}

function StatCard({
  icon: Icon, label, value,
}: {
  icon: typeof Database; label: string; value: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="mt-2 text-xl font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

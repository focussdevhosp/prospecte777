import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  CRM_LABELS,
  useCrmIntegrations,
  type CrmProvider,
} from '@/hooks/use-crm-integrations';
import { ArrowUpRight, Check, Info, Loader2, Trash2, Share2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const ORDEM: CrmProvider[] = ['rd_station', 'pipedrive', 'hubspot', 'webhook'];

function quando(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function DestinoCard({ provider }: { provider: CrmProvider }) {
  const { integrations, overview, salvar, alternar, remover, isSaving } = useCrmIntegrations();
  const meta = CRM_LABELS[provider];

  const integracao = integrations.find((i) => i.provider === provider);
  const numeros = overview.find((o) => o.provider === provider);
  const configurado = !!integracao;

  const [credencial, setCredencial] = useState('');
  const [editando, setEditando] = useState(false);

  const enviar = () => {
    if (!credencial.trim()) return;
    salvar({ provider, credential: credencial });
    setCredencial('');
    setEditando(false);
  };

  return (
    <Card className={cn('hover-lift overflow-hidden', configurado && integracao?.active && 'border-primary/30')}>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{meta.nome}</h3>
              {configurado ? (
                integracao?.active ? (
                  <Badge className="bg-success/15 text-success border-success/30" variant="outline">
                    <Check className="mr-1 h-3 w-3" /> ativo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">pausado</Badge>
                )
              ) : (
                <Badge variant="outline" className="text-muted-foreground">não configurado</Badge>
              )}
            </div>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">{meta.ajuda}</p>
          </div>

          {configurado && (
            <div className="flex items-center gap-2">
              <Switch
                checked={!!integracao?.active}
                onCheckedChange={(v) => alternar({ provider, active: v })}
                aria-label={`Ativar ${meta.nome}`}
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => remover(provider)}
                aria-label={`Remover ${meta.nome}`}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Números vindos do log real de envio, não de contador mantido à mão. */}
        {numeros && (numeros.enviados > 0 || numeros.ja_existiam > 0 || numeros.falhas > 0) && (
          <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl bg-muted/40 p-3">
            <div>
              <p className="text-lg font-bold tabular-nums">{numeros.enviados}</p>
              <p className="text-[11px] text-muted-foreground">criados lá</p>
            </div>
            <div>
              <p className="text-lg font-bold tabular-nums">{numeros.ja_existiam}</p>
              <p className="text-[11px] text-muted-foreground">já existiam</p>
            </div>
            <div>
              <p className={cn('text-lg font-bold tabular-nums', numeros.falhas > 0 && 'text-destructive')}>
                {numeros.falhas}
              </p>
              <p className="text-[11px] text-muted-foreground">falharam</p>
            </div>
          </div>
        )}

        {integracao?.last_error && (
          <Alert variant="destructive" className="mt-3">
            <AlertDescription className="text-xs">
              Última falha em {quando(integracao.last_error_at)}: {integracao.last_error}
            </AlertDescription>
          </Alert>
        )}

        {(!configurado || editando) ? (
          <div className="mt-4 space-y-2">
            <Label htmlFor={`cred-${provider}`} className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {meta.campo}
            </Label>
            <div className="flex gap-2">
              <Input
                id={`cred-${provider}`}
                type={provider === 'webhook' ? 'url' : 'password'}
                value={credencial}
                onChange={(e) => setCredencial(e.target.value)}
                placeholder={provider === 'webhook' ? 'https://...' : 'Cole aqui'}
                autoComplete="off"
                onKeyDown={(e) => e.key === 'Enter' && enviar()}
              />
              <Button onClick={enviar} disabled={!credencial.trim() || isSaving}>
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
              {editando && (
                <Button variant="ghost" onClick={() => { setEditando(false); setCredencial(''); }}>
                  Cancelar
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {integracao?.last_ok_at
                ? `Último envio bem-sucedido em ${quando(integracao.last_ok_at)}.`
                : 'Ainda não houve envio por este destino.'}
            </p>
            <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
              Trocar credencial
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsCrm() {
  return (
    <div className="page-enter mx-auto max-w-4xl space-y-8 p-6 sm:p-8">
      <PageHeader
        eyebrow="Ajustes"
        title="CRM externo"
        description="Leva o lead qualificado para o CRM que a empresa já usa."
        icon={<Share2 className="h-5 w-5" />}
        className="mb-0"
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-sm leading-relaxed">
          <strong>Só empurra, não puxa.</strong> O funil de lá continua sendo a verdade sobre o
          negócio; aqui é a verdade sobre a prospecção. Contato que já existe no seu CRM não é
          sobrescrito — a integração acrescenta a atividade e para. E se o CRM estiver fora do ar,
          a prospecção continua: o envio para lá é registro, não caminho crítico.
        </AlertDescription>
      </Alert>

      <div className="stagger space-y-4">
        {ORDEM.map((p) => (
          <DestinoCard key={p} provider={p} />
        ))}
      </div>

      <p className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
        <ArrowUpRight className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        A credencial fica guardada com acesso restrito e nunca volta para esta tela — nem
        mascarada. Por isso trocar exige digitar de novo: é o preço de o token não passar pelo
        navegador.
      </p>
    </div>
  );
}

import { ScanSearch, Loader2, AlertTriangle, CheckCircle2, Copy } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useSiteAudit, type SiteAudit, type SiteFinding } from '@/hooks/use-opportunity-radar';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

/**
 * Auditoria do site do lead, na tela do contato.
 *
 * É aqui que o vendedor escreve a mensagem, então é aqui que o argumento
 * precisa estar. Antes ele abria o site do lead em outra aba, olhava, e
 * escrevia no achismo — cada um com uma abordagem diferente para o mesmo
 * tipo de problema.
 *
 * Cada achado é uma verificação objetiva no HTML: ou existe a tag de
 * viewport ou não existe. Nada aqui é opinião.
 */
const SEVERITY: Record<SiteFinding['severity'], { label: string; className: string }> = {
  critical: { label: 'Crítico', className: 'bg-destructive/10 text-destructive border-destructive/20' },
  high: { label: 'Alto', className: 'bg-brand/10 text-brand border-brand/20' },
  medium: { label: 'Médio', className: 'bg-warning/10 text-warning border-warning/20' },
  low: { label: 'Baixo', className: 'bg-muted text-muted-foreground border-border' },
};

interface SiteAuditCardProps {
  leadId: string;
  businessName: string;
  website: string | null;
  audit: SiteAudit | null;
}

export function SiteAuditCard({ leadId, businessName, website, audit }: SiteAuditCardProps) {
  const { auditLead, isAuditing } = useSiteAudit();
  const { toast } = useToast();

  const copyPitch = () => {
    if (!audit || audit.findings.length === 0) return;

    // Texto pronto para colar na conversa, escrito na linguagem do cliente
    // e não em jargão técnico.
    const lines = [
      `Olá! Dei uma olhada no site da ${businessName} e encontrei alguns pontos:`,
      '',
      ...audit.findings.slice(0, 3).map((f) => `• ${f.title} — ${f.impact}`),
      '',
      'Posso te mostrar como resolver isso?',
    ];

    navigator.clipboard.writeText(lines.join('\n'));
    toast({ title: 'Abordagem copiada', description: 'Cole na conversa com o lead.' });
  };

  if (!audit) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Análise do site</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {website
                  ? 'Descubra o que está faltando no site dele e use como argumento.'
                  : 'Este lead não tem site cadastrado — já é uma oportunidade.'}
              </p>
            </div>
            <Button size="sm" disabled={isAuditing} onClick={() => auditLead(leadId)} className="shrink-0">
              {isAuditing
                ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Analisando</>
                : <><ScanSearch className="mr-1.5 h-3.5 w-3.5" />Analisar</>}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const clean = audit.findings.length === 0;

  return (
    <Card className={cn(!clean && 'border-brand/30')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">Análise do site</p>
              <Badge variant="secondary" className="tabular-nums">{audit.score}/100</Badge>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {clean
                ? 'Nada relevante encontrado. O argumento com este lead terá que ser outro.'
                : `${audit.findings.length} ponto${audit.findings.length === 1 ? '' : 's'} para usar na abordagem.`}
            </p>
          </div>

          <div className="flex shrink-0 gap-1.5">
            {!clean && (
              <Button size="sm" variant="outline" onClick={copyPitch}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />Copiar
              </Button>
            )}
            <Button size="sm" variant="ghost" disabled={isAuditing} onClick={() => auditLead(leadId)}>
              {isAuditing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ScanSearch className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {clean ? (
          <div className="mt-3 flex items-center gap-2 text-xs text-success">
            <CheckCircle2 className="h-4 w-4" />
            Site bem cuidado
          </div>
        ) : (
          <ul className="mt-3 space-y-2.5">
            {audit.findings.map((f) => (
              <li key={f.id} className="rounded-lg border bg-card/50 p-2.5">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-medium">{f.title}</p>
                      <Badge variant="outline" className={cn('text-[10px]', SEVERITY[f.severity].className)}>
                        {SEVERITY[f.severity].label}
                      </Badge>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{f.impact}</p>
                    <p className="mt-1 text-[11px] font-medium text-primary">→ {f.opportunity}</p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

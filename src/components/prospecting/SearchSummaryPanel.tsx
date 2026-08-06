import { Card, CardContent } from '@/components/ui/card';
import { Search, MessageCircle, Globe, Mail, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchSummaryPanelProps {
  estimatedCoverage: number;
  whatsappCount: number;
  websiteCount: number;
  emailCount: number;
  qualityScore: number;
  niches: string[];
  locations: string[];
}

export function SearchSummaryPanel({
  estimatedCoverage,
  whatsappCount,
  websiteCount,
  emailCount,
  qualityScore,
  niches,
  locations,
}: SearchSummaryPanelProps) {
  const isReady = niches.length > 0 && locations.length > 0;

  const rows = [
    {
      icon: Search,
      color: 'text-info bg-info/15 ring-info/20',
      title: 'Cobertura estimada',
      subtitle: 'Empresas na área de busca',
      value: estimatedCoverage.toLocaleString('pt-BR'),
      percent: null,
    },
    {
      icon: MessageCircle,
      color: 'text-success bg-success/15 ring-success/20',
      title: 'WhatsApp encontrado',
      subtitle: 'Empresas com WhatsApp',
      value: whatsappCount.toLocaleString('pt-BR'),
      percent: estimatedCoverage > 0 ? Math.round((whatsappCount / estimatedCoverage) * 100) : 0,
    },
    {
      icon: Globe,
      color: 'text-primary bg-primary/15 ring-primary/20',
      title: 'Sites válidos',
      subtitle: 'Empresas com site',
      value: websiteCount.toLocaleString('pt-BR'),
      percent: estimatedCoverage > 0 ? Math.round((websiteCount / estimatedCoverage) * 100) : 0,
    },
    {
      icon: Mail,
      color: 'text-warning bg-warning/15 ring-warning/20',
      title: 'Emails corporativos',
      subtitle: 'Estimativa disponível',
      value: emailCount.toLocaleString('pt-BR'),
      percent: estimatedCoverage > 0 ? Math.round((emailCount / estimatedCoverage) * 100) : 0,
    },
  ];

  return (
    <Card className="border-border/40 bg-card/50 backdrop-blur h-full">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-semibold text-sm text-foreground">Resumo da Busca</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {isReady ? 'Estimativa em tempo real' : 'Selecione nicho e localização'}
            </p>
          </div>
          <div className={cn(
            'h-2 w-2 rounded-full',
            isReady ? 'bg-success animate-pulse' : 'bg-muted-foreground/30'
          )} />
        </div>

        <div className="space-y-4">
          {rows.map((row) => (
            <div key={row.title} className="flex items-start gap-3">
              <div className={cn('p-2 rounded-lg ring-1 shrink-0', row.color)}>
                <row.icon className="h-3.5 w-3.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-foreground truncate">{row.title}</p>
                <p className="text-[11px] text-muted-foreground truncate">{row.subtitle}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-bold tabular-nums text-foreground">{row.value}</p>
                {row.percent !== null && (
                  <p className="text-[10px] text-muted-foreground tabular-nums">{row.percent}%</p>
                )}
              </div>
            </div>
          ))}

          {/* Quality score ring */}
          <div className="flex items-center gap-3 pt-3 border-t border-border/40">
            <div className="p-2 rounded-lg bg-primary/15 ring-1 ring-primary/20 shrink-0">
              <Star className="h-3.5 w-3.5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-foreground truncate">Score médio</p>
              <p className="text-[11px] text-muted-foreground truncate">Qualidade estimada</p>
            </div>
            <div className="relative h-12 w-12 shrink-0">
              <svg viewBox="0 0 36 36" className="h-12 w-12 -rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" className="stroke-muted/40" strokeWidth="3" />
                <circle
                  cx="18"
                  cy="18"
                  r="15.5"
                  fill="none"
                  className="stroke-primary transition-all"
                  strokeWidth="3"
                  strokeDasharray={`${(qualityScore / 100) * 97.4} 97.4`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[11px] font-bold tabular-nums text-foreground">{qualityScore}</span>
              </div>
            </div>
          </div>
        </div>

        <p className="text-[10px] text-muted-foreground/60 mt-4 leading-relaxed">
          Números são estimativas baseadas em dados públicos e podem variar.
        </p>
      </CardContent>
    </Card>
  );
}

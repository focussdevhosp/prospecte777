/**
 * Cores de gráfico do sistema.
 *
 * Antes cada tela declarava seu próprio array de hex da paleta genérica do
 * Tailwind. Três problemas com isso:
 *
 *  1. O mesmo "leads" saía verde numa tela e azul em outra.
 *  2. Nenhuma delas mudava no modo escuro — verde #10b981 sobre fundo
 *     escuro fica vibrante demais e cansa.
 *  3. A paleta nunca foi checada para daltonismo. O par verde/vermelho que
 *     aparecia lado a lado é justamente o que ~8% dos homens não separa.
 *
 * Aqui tudo aponta para os tokens `--chart-*`, que foram escolhidos por
 * validação (faixa de luminosidade, croma, separação sob daltonismo,
 * contraste com a superfície) e têm passo próprio para cada tema.
 *
 * Usar `hsl(var(--token))` direto no Recharts funciona: a string vai para o
 * atributo SVG e o CSS resolve a variável, inclusive quando o tema troca.
 */

/** Ordem categórica fixa. Nunca cicle nem gere um sétimo tom. */
export const CHART_SERIES = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
  'hsl(var(--chart-6))',
] as const;

/**
 * Cor por posição na ordem categórica.
 * Acima de 6 séries, agrupe o excedente em "Outros" em vez de inventar tom:
 * a partir daí nenhuma paleta continua distinguível.
 */
export function seriesColor(index: number): string {
  return CHART_SERIES[index % CHART_SERIES.length];
}

/** Estados do funil — a cor segue a etapa, não a posição no ranking. */
export const STAGE_COLORS: Record<string, string> = {
  Novo: 'hsl(var(--stage-new))',
  Contato: 'hsl(var(--stage-contact))',
  Qualificado: 'hsl(var(--stage-contact))',
  Proposta: 'hsl(var(--stage-proposal))',
  'Negociação': 'hsl(var(--stage-negotiation))',
  Ganho: 'hsl(var(--stage-won))',
  Perdido: 'hsl(var(--stage-lost))',
};

/** Temperatura do lead. */
export const TEMPERATURE_COLORS: Record<string, string> = {
  quente: 'hsl(var(--temp-hot))',
  morno: 'hsl(var(--temp-warm))',
  frio: 'hsl(var(--temp-cold))',
};

/**
 * Cores de estado são reservadas: nunca viram "série 4". Sempre acompanhadas
 * de rótulo ou ícone, porque cor sozinha não comunica estado.
 */
export const STATUS_COLORS = {
  good: 'hsl(var(--success))',
  warning: 'hsl(var(--warning))',
  critical: 'hsl(var(--destructive))',
  info: 'hsl(var(--info))',
} as const;

/** Eixos e grade ficam recessivos — o dado é que tem que aparecer. */
export const CHART_AXIS = {
  stroke: 'hsl(var(--muted-foreground))',
  grid: 'hsl(var(--border))',
  fontSize: 12,
} as const;

/** Tooltip herda as superfícies do tema em vez de branco fixo. */
export const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)',
  color: 'hsl(var(--popover-foreground))',
  boxShadow: 'var(--shadow-lg)',
  fontSize: 12,
} as const;

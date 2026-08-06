import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

/**
 * Número de destaque do Dashboard.
 *
 * Duas coisas mudaram além do visual:
 *
 * 1. `change` virou opcional de verdade. Antes o Dashboard passava
 *    `change={125}` e `change={12}` fixos no código para dois cartões — o
 *    usuário via "+125%" como se fosse crescimento medido. Sem número real,
 *    agora não aparece badge nenhum.
 * 2. O tom é semântico (`tone`), não uma string de classe CSS. O componente
 *    antigo recebia `iconBg="bg-primary/8"` e procurava esse texto exato num
 *    mapa para achar o gradiente: renomear a classe quebrava o visual em
 *    silêncio.
 */
export type KPITone = 'primary' | 'brand' | 'success' | 'info' | 'warning';

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  /** Variação percentual. Omita quando não houver medição real. */
  change?: number;
  changeLabel?: string;
  tone?: KPITone;
  delay?: number;
}

const TONE: Record<KPITone, { icon: string; wash: string; rule: string }> = {
  primary: { icon: 'bg-primary/10 text-primary', wash: 'from-primary/[0.07]', rule: 'bg-primary/50' },
  brand: { icon: 'bg-brand/10 text-brand', wash: 'from-brand/[0.07]', rule: 'bg-brand/50' },
  success: { icon: 'bg-success/10 text-success', wash: 'from-success/[0.07]', rule: 'bg-success/50' },
  info: { icon: 'bg-info/10 text-info', wash: 'from-info/[0.07]', rule: 'bg-info/50' },
  warning: { icon: 'bg-warning/10 text-warning', wash: 'from-warning/[0.07]', rule: 'bg-warning/50' },
};

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mq) return;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/** Contagem crescente. Quem pediu menos movimento recebe o valor final direto. */
function useCountUp(target: number, duration = 900, delay = 0, enabled = true) {
  const [count, setCount] = useState(enabled ? 0 : target);
  const frame = useRef<number>();

  useEffect(() => {
    if (!enabled) {
      setCount(target);
      return;
    }

    const timeout = setTimeout(() => {
      const start = performance.now();
      const step = (now: number) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(Math.round(eased * target));
        if (progress < 1) frame.current = requestAnimationFrame(step);
      };
      frame.current = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(timeout);
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [target, duration, delay, enabled]);

  return count;
}

export function KPICard({
  icon,
  label,
  value,
  change,
  changeLabel,
  tone = 'primary',
  delay = 0,
}: KPICardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const isNumeric = typeof value === 'number';
  const animated = useCountUp(isNumeric ? value : 0, 900, delay + 150, isNumeric && !reducedMotion);
  const shown = isNumeric ? animated.toLocaleString('pt-BR') : value;

  const t = TONE[tone];
  const hasChange = typeof change === 'number' && Number.isFinite(change);
  const direction = !hasChange ? 'flat' : change > 0 ? 'up' : change < 0 ? 'down' : 'flat';

  return (
    <Card className="card-interactive group relative h-full overflow-hidden border-border/60">
      {/* Lavagem de cor sutil, só para separar os cartões entre si. */}
      <div
        className={cn('pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent', t.wash)}
      />
      {/* Fio de cor no topo, revelado no hover. */}
      <div
        className={cn(
          'absolute inset-x-4 top-0 h-px rounded-full opacity-0 transition-opacity duration-base group-hover:opacity-100',
          t.rule,
        )}
      />

      <CardContent className="relative p-5">
        <div className="mb-4 flex items-start justify-between">
          <div className={cn('rounded-xl p-2.5', t.icon)}>{icon}</div>

          {hasChange && (
            <span
              className={cn(
                'flex items-center gap-0.5 rounded-lg px-2 py-1 text-[11px] font-semibold tabular-nums',
                direction === 'up' && 'bg-success/10 text-success',
                direction === 'down' && 'bg-destructive/10 text-destructive',
                direction === 'flat' && 'bg-muted text-muted-foreground',
              )}
            >
              {direction === 'up' && <ArrowUpRight className="h-3 w-3" />}
              {direction === 'down' && <ArrowDownRight className="h-3 w-3" />}
              {direction === 'flat' && <Minus className="h-3 w-3" />}
              {Math.abs(change)}%
            </span>
          )}
        </div>

        {/* O número usa tinta de texto, não a cor do tom: a cor já está no
            ícone, e número colorido compete com o dado dos gráficos. */}
        <p className="text-[26px] font-bold leading-none tracking-tight tabular-nums">
          {shown}
        </p>
        <p className="mt-2 text-xs font-medium text-muted-foreground">{label}</p>
        {changeLabel && (
          <p className="mt-1 text-[11px] text-muted-foreground/70">{changeLabel}</p>
        )}
      </CardContent>
    </Card>
  );
}

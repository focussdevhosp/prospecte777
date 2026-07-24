import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

interface KPICardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  change?: number;
  changeLabel?: string;
  iconBg: string;
  delay?: number;
}

const gradientMap: Record<string, string> = {
  'bg-primary/8': 'from-primary/10 via-primary/5 to-transparent',
  'bg-info/8': 'from-info/10 via-info/5 to-transparent',
  'bg-success/8': 'from-success/10 via-success/5 to-transparent',
  'bg-warning/8': 'from-warning/10 via-warning/5 to-transparent',
};

function useCountUp(target: number, duration = 1200, delay = 0) {
  const [count, setCount] = useState(0);
  const ref = useRef<number>();

  useEffect(() => {
    const timeout = setTimeout(() => {
      const start = performance.now();
      const step = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        setCount(Math.round(eased * target));
        if (progress < 1) ref.current = requestAnimationFrame(step);
      };
      ref.current = requestAnimationFrame(step);
    }, delay);
    return () => {
      clearTimeout(timeout);
      if (ref.current) cancelAnimationFrame(ref.current);
    };
  }, [target, duration, delay]);

  return count;
}

export function KPICard({ icon, label, value, change, changeLabel, iconBg, delay = 0 }: KPICardProps) {
  const isPositive = (change || 0) >= 0;
  const isNumeric = typeof value === 'number';
  const animatedValue = useCountUp(isNumeric ? value : 0, 1200, delay + 200);
  const formattedValue = isNumeric ? animatedValue.toLocaleString('pt-BR') : value;

  const gradient = gradientMap[iconBg] || 'from-primary/10 via-primary/5 to-transparent';

  return (
    <div className="group relative">
    <Card className="border-border/50 hover:border-primary/40 transition-all duration-300 h-full overflow-hidden hover:shadow-xl hover:shadow-primary/[0.08]">
      {/* Colored gradient background */}
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-60 pointer-events-none", gradient)} />

      {/* Shimmer on hover */}
      {/* Accent line top */}
      <div className={cn("absolute top-0 left-4 right-4 h-[2px] rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500", iconBg.replace('/8', '/40'))} />

      <CardContent className="p-5 sm:p-6 relative">
        <div className="flex items-center justify-between mb-4">
          <div className={cn(
            "p-2.5 rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:rotate-6 group-hover:shadow-lg",
            iconBg
          )}>
            {icon}
          </div>
          {change !== undefined && (
            <span className={cn(
              "flex items-center gap-0.5 text-[11px] font-bold px-2.5 py-1 rounded-lg transition-all duration-300",
              isPositive ? "text-success bg-success/10" : "text-destructive bg-destructive/10"
            )}>
              {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(change)}%
            </span>
          )}
        </div>
        <p className="text-2xl sm:text-[28px] font-extrabold tracking-tight tabular-nums transition-colors duration-300 group-hover:text-primary">
          {formattedValue}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5 font-semibold">{label}</p>
        {changeLabel && (
          <p className="text-[10px] text-muted-foreground mt-2 font-medium">{changeLabel}</p>
        )}
      </CardContent>
    </Card>
    </div>
  );
}

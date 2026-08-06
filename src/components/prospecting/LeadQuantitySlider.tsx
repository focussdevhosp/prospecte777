import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Target, Zap, Rocket } from 'lucide-react';

interface LeadQuantitySliderProps {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function LeadQuantitySlider({ value, onChange, disabled }: LeadQuantitySliderProps) {
  const getIntensityLevel = (val: number) => {
    if (val <= 500) return { label: 'Básica', icon: Target, color: 'text-primary', bg: 'bg-primary/10 border-primary/20' };
    if (val <= 2000) return { label: 'Moderada', icon: Zap, color: 'text-warning', bg: 'bg-warning/10 border-warning/20' };
    return { label: 'MÁXIMA', icon: Rocket, color: 'text-destructive', bg: 'bg-destructive/10 border-destructive/20' };
  };

  const intensity = getIntensityLevel(value);
  const IntensityIcon = intensity.icon;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground">Quantidade de Leads</span>
        <div className="flex items-center gap-2.5">
          <Badge variant="outline" className={`${intensity.bg} ${intensity.color} border text-[11px] font-medium px-2 py-0.5`}>
            <IntensityIcon className="h-3 w-3 mr-1" />
            {intensity.label}
          </Badge>
          <span className="text-3xl font-bold tabular-nums tracking-tight text-foreground">{value.toLocaleString('pt-BR')}</span>
        </div>
      </div>
      
      <Slider
        value={[value]}
        onValueChange={([val]) => onChange(val)}
        min={100}
        max={5000}
        step={100}
        disabled={disabled}
        className="w-full"
      />
      
      <div className="flex justify-between text-[11px] text-muted-foreground/60 font-medium">
        <span>100</span>
        <span>1000</span>
        <span>2000</span>
        <span>3000</span>
        <span>5000</span>
      </div>

      <p className="text-xs text-muted-foreground">
        {value <= 500 && 'Busca rápida com resultados essenciais. Ideal para testes.'}
        {value > 500 && value <= 2000 && 'Busca abrangente cobrindo múltiplos bairros e variações.'}
        {value > 2000 && '🚀 Busca MÁXIMA! Cobre TODOS os bairros, variações e subnichos.'}
      </p>
    </div>
  );
}

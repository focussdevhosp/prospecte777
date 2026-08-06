import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useLeads } from '@/hooks/use-leads';
import { useMeetings } from '@/hooks/use-meetings';
import {
  Users,
  Send,
  MessageSquare,
  Calendar,
  ArrowDown,
  TrendingUp,
  Trophy,
} from 'lucide-react';

interface FunnelStep {
  id: string;
  label: string;
  icon: React.ElementType;
  count: number;
  color: string;
  bgColor: string;
}

export function ConversionFunnel() {
  const { leads } = useLeads();
  const { meetings } = useMeetings();

  const funnelData = useMemo(() => {
    const totalCaptured = leads.length;
    const totalSent = leads.filter(l => l.message_sent).length;
    const totalResponded = leads.filter(l => l.last_response_at).length;
    const totalMeetings = meetings?.length || 0;
    const totalWon = leads.filter(l => l.stage === 'Ganho').length;

    const steps: FunnelStep[] = [
      {
        id: 'captured',
        label: 'Capturados',
        icon: Users,
        count: totalCaptured,
        color: 'text-info',
        bgColor: 'bg-info/20',
      },
      {
        id: 'sent',
        label: 'Mensagens Enviadas',
        icon: Send,
        count: totalSent,
        color: 'text-primary',
        bgColor: 'bg-primary/20',
      },
      {
        id: 'responded',
        label: 'Responderam',
        icon: MessageSquare,
        count: totalResponded,
        color: 'text-brand',
        bgColor: 'bg-brand/20',
      },
      {
        id: 'meetings',
        label: 'Reuniões Agendadas',
        icon: Calendar,
        count: totalMeetings,
        color: 'text-info',
        bgColor: 'bg-info/20',
      },
      {
        id: 'won',
        label: 'Vendas Fechadas',
        icon: Trophy,
        count: totalWon,
        color: 'text-success',
        bgColor: 'bg-success/20',
      },
    ];

    return steps;
  }, [leads, meetings]);

  const conversionRates = useMemo(() => {
    const rates: { from: string; to: string; rate: number }[] = [];
    
    for (let i = 0; i < funnelData.length - 1; i++) {
      const current = funnelData[i];
      const next = funnelData[i + 1];
      const rate = current.count > 0 ? (next.count / current.count) * 100 : 0;
      
      rates.push({
        from: current.label,
        to: next.label,
        rate,
      });
    }
    
    return rates;
  }, [funnelData]);

  const overallConversion = useMemo(() => {
    const captured = funnelData[0].count;
    const won = funnelData[funnelData.length - 1].count;
    return captured > 0 ? (won / captured) * 100 : 0;
  }, [funnelData]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Funil de Conversão
            </CardTitle>
            <CardDescription>
              Acompanhe a jornada dos leads desde a captura até a venda
            </CardDescription>
          </div>
          <Badge variant="outline" className="text-lg px-3 py-1">
            {overallConversion.toFixed(1)}% conversão geral
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {funnelData.map((step, index) => {
            const Icon = step.icon;
            const widthPercent = funnelData[0].count > 0 
              ? Math.max(20, (step.count / funnelData[0].count) * 100) 
              : 100;
            const conversionRate = conversionRates[index];
            
            return (
              <div key={step.id} className="space-y-2">
                {/* Funnel Step */}
                <div 
                  className={`
                    relative flex items-center justify-between p-4 rounded-xl 
                    ${step.bgColor} border border-transparent
                    transition-all duration-300 hover:scale-[1.02] hover:shadow-lg
                  `}
                  style={{ 
                    width: `${widthPercent}%`,
                    marginLeft: `${(100 - widthPercent) / 2}%`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${step.bgColor}`}>
                      <Icon className={`h-5 w-5 ${step.color}`} />
                    </div>
                    <div>
                      <p className="font-medium">{step.label}</p>
                      <p className="text-sm text-muted-foreground">
                        {index > 0 && funnelData[index - 1].count > 0 && (
                          <span>
                            {((step.count / funnelData[index - 1].count) * 100).toFixed(1)}% do anterior
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-2xl font-bold ${step.color}`}>
                      {step.count}
                    </p>
                  </div>
                </div>

                {/* Arrow between steps */}
                {index < funnelData.length - 1 && (
                  <div className="flex justify-center">
                    <div className="flex flex-col items-center">
                      <ArrowDown className="h-5 w-5 text-muted-foreground" />
                      {conversionRate && conversionRate.rate > 0 && (
                        <Badge 
                          variant={conversionRate.rate >= 50 ? "default" : "secondary"}
                          className="text-xs mt-1"
                        >
                          {conversionRate.rate.toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Conversion Summary */}
        <div className="mt-6 p-4 rounded-xl bg-muted/50 border">
          <h4 className="font-medium mb-3">Taxas de Conversão por Etapa</h4>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {conversionRates.map((rate, index) => (
              <div key={index} className="text-center">
                <p className="text-xs text-muted-foreground mb-1 truncate">
                  {rate.from.split(' ')[0]} → {rate.to.split(' ')[0]}
                </p>
                <p className={`text-lg font-bold ${
                  rate.rate >= 50 ? 'text-success' : 
                  rate.rate >= 25 ? 'text-warning' : 
                  'text-destructive'
                }`}>
                  {rate.rate.toFixed(1)}%
                </p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

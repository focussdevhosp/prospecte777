import { useState, useEffect } from 'react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Progress } from '@/components/ui/progress';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useToast } from '@/hooks/use-toast';
import {
  Shield,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Shuffle,
  Timer,
  RefreshCw,
  Loader2,
} from 'lucide-react';

// Simple risk calculation
function calculateRiskLevel(dailyLimit: number, intervalMin: number): { 
  level: 'safe' | 'moderate' | 'risky'; 
  score: number; 
  message: string 
} {
  let score = 100;
  
  // Daily limit impact
  if (dailyLimit > 100) score -= 40;
  else if (dailyLimit > 50) score -= 25;
  else if (dailyLimit > 30) score -= 10;
  
  // Interval impact
  if (intervalMin < 30) score -= 40;
  else if (intervalMin < 60) score -= 25;
  else if (intervalMin < 90) score -= 10;
  
  if (score >= 70) return { level: 'safe', score, message: 'Configuração segura' };
  if (score >= 40) return { level: 'moderate', score, message: 'Risco moderado' };
  return { level: 'risky', score, message: 'Alto risco de bloqueio!' };
}

export function AntiBlockSettings() {
  const { settings, updateSettings, isUpdating } = useUserSettings();
  const { toast } = useToast();
  
  // Simple state - only essential settings
  const [dailyLimit, setDailyLimit] = useState(30);
  const [intervalMin, setIntervalMin] = useState(60);
  const [intervalMax, setIntervalMax] = useState(180);
  const [randomizeInterval, setRandomizeInterval] = useState(true);
  const [randomizeOrder, setRandomizeOrder] = useState(true);
  const [typingSimulation, setTypingSimulation] = useState(true);
  const [workDaysOnly, setWorkDaysOnly] = useState(true);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(18);
  
  const [hasChanges, setHasChanges] = useState(false);

  // Load settings
  useEffect(() => {
    if (settings) {
      setDailyLimit(settings.daily_message_limit ?? 30);
      setIntervalMin(settings.message_interval_seconds ?? 60);
      setIntervalMax(settings.message_interval_max ?? 180);
      setRandomizeInterval(settings.randomize_interval ?? true);
      setRandomizeOrder(settings.randomize_order ?? true);
      setTypingSimulation(settings.typing_simulation ?? true);
      setWorkDaysOnly(settings.work_days_only ?? true);
      setStartHour(settings.auto_start_hour ?? 9);
      setEndHour(settings.auto_end_hour ?? 18);
      setHasChanges(false);
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings({
      daily_message_limit: dailyLimit,
      message_interval_seconds: intervalMin,
      message_interval_max: intervalMax,
      randomize_interval: randomizeInterval,
      randomize_order: randomizeOrder,
      typing_simulation: typingSimulation,
      work_days_only: workDaysOnly,
      auto_start_hour: startHour,
      auto_end_hour: endHour,
    });
    setHasChanges(false);
    toast({
      title: '✓ Configurações salvas',
      description: 'Proteção anti-bloqueio atualizada.',
    });
  };

  const applyRecommended = () => {
    setDailyLimit(30);
    setIntervalMin(90);
    setIntervalMax(180);
    setRandomizeInterval(true);
    setRandomizeOrder(true);
    setTypingSimulation(true);
    setWorkDaysOnly(true);
    setStartHour(9);
    setEndHour(18);
    setHasChanges(true);
    toast({
      title: '✓ Configurações recomendadas aplicadas',
      description: 'Clique em Salvar para confirmar.',
    });
  };

  const risk = calculateRiskLevel(dailyLimit, intervalMin);

  const getRiskStyles = () => {
    switch (risk.level) {
      case 'safe': return { bg: 'bg-success/10 border-success/30', text: 'text-success', badge: 'bg-success' };
      case 'moderate': return { bg: 'bg-warning/10 border-warning/30', text: 'text-warning', badge: 'bg-warning' };
      case 'risky': return { bg: 'bg-destructive/10 border-destructive/30', text: 'text-destructive', badge: 'bg-destructive' };
    }
  };

  const styles = getRiskStyles();

  return (
    <div className="space-y-4">
      {/* Risk Indicator */}
      <div className={`p-4 rounded-lg border ${styles.bg}`}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Shield className={`h-5 w-5 ${styles.text}`} />
            <span className="font-medium">Nível de Proteção</span>
          </div>
          <Badge className={styles.badge}>
            {risk.level === 'safe' && '✓ Seguro'}
            {risk.level === 'moderate' && '⚠ Moderado'}
            {risk.level === 'risky' && '⚠ Risco Alto'}
          </Badge>
        </div>
        <Progress value={risk.score} className="h-2 mb-1" />
        <p className={`text-sm ${styles.text}`}>{risk.message}</p>
      </div>

      {/* Essential Settings */}
      <div className="space-y-4">
        {/* Daily Limit */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              Limite diário de mensagens
            </Label>
            <span className="text-sm font-medium">{dailyLimit} msgs</span>
          </div>
          <Slider
            value={[dailyLimit]}
            onValueChange={([v]) => { setDailyLimit(v); setHasChanges(true); }}
            min={10}
            max={100}
            step={5}
            className="py-2"
          />
          <p className="text-xs text-muted-foreground">
            Recomendado: 20-40 mensagens para números novos
          </p>
        </div>

        {/* Interval */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Intervalo entre mensagens
            </Label>
            <span className="text-sm font-medium">{intervalMin}-{intervalMax}s</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Mínimo</p>
              <Slider
                value={[intervalMin]}
                onValueChange={([v]) => { setIntervalMin(v); setHasChanges(true); }}
                min={30}
                max={180}
                step={10}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Máximo</p>
              <Slider
                value={[intervalMax]}
                onValueChange={([v]) => { setIntervalMax(v); setHasChanges(true); }}
                min={60}
                max={300}
                step={10}
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Intervalos maiores = mais seguro (mínimo 60s recomendado)
          </p>
        </div>

        {/* Horário Comercial */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              Horário de envio
            </Label>
            <span className="text-sm font-medium">{startHour}h - {endHour}h</span>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Início</p>
              <Slider
                value={[startHour]}
                onValueChange={([v]) => { setStartHour(v); setHasChanges(true); }}
                min={6}
                max={12}
                step={1}
              />
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Fim</p>
              <Slider
                value={[endHour]}
                onValueChange={([v]) => { setEndHour(v); setHasChanges(true); }}
                min={14}
                max={22}
                step={1}
              />
            </div>
          </div>
        </div>

        {/* Toggles - Compact Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2">
              <Shuffle className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Ordem aleatória</span>
            </div>
            <Switch
              checked={randomizeOrder}
              onCheckedChange={(v) => { setRandomizeOrder(v); setHasChanges(true); }}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Intervalo variável</span>
            </div>
            <Switch
              checked={randomizeInterval}
              onCheckedChange={(v) => { setRandomizeInterval(v); setHasChanges(true); }}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Simular digitação</span>
            </div>
            <Switch
              checked={typingSimulation}
              onCheckedChange={(v) => { setTypingSimulation(v); setHasChanges(true); }}
            />
          </div>

          <div className="flex items-center justify-between p-3 rounded-lg border bg-muted/30">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm">Só dias úteis</span>
            </div>
            <Switch
              checked={workDaysOnly}
              onCheckedChange={(v) => { setWorkDaysOnly(v); setHasChanges(true); }}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button 
          variant="outline" 
          onClick={applyRecommended}
          className="flex-1"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Configuração Segura
        </Button>
        <Button 
          onClick={handleSave} 
          disabled={!hasChanges || isUpdating}
          className="flex-1"
        >
          {isUpdating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4 mr-2" />
          )}
          Salvar
        </Button>
      </div>

      {/* Help Text */}
      <div className="p-3 rounded-lg bg-muted/50 text-xs text-muted-foreground">
        <p className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Essas configurações simulam comportamento humano para evitar bloqueios no WhatsApp.
            Números novos devem começar com limites baixos (20-30 msgs/dia) e aumentar gradualmente.
          </span>
        </p>
      </div>
    </div>
  );
}

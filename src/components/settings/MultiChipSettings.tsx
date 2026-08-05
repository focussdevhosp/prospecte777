import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useToast } from '@/hooks/use-toast';
import {
  Smartphone,
  Plus,
  Trash2,
  Signal,
  RotateCcw,
  Shuffle,
  Zap,
  CheckCircle2,
} from 'lucide-react';

interface ChipInstance {
  id: string;
  instance_id: string;
  label: string;
  status: 'connected' | 'disconnected';
  health: 'healthy' | 'warning' | 'critical';
}

export function MultiChipSettings() {
  const { settings, updateSettings } = useUserSettings();
  const { toast } = useToast();
  const [addChipOpen, setAddChipOpen] = useState(false);
  const [newChipLabel, setNewChipLabel] = useState('');
  const [newChipInstanceId, setNewChipInstanceId] = useState('');

  // Persisted state
  const rotationEnabled = (settings as any)?.chip_rotation_enabled ?? false;
  const rotationStrategy = (settings as any)?.chip_rotation_strategy ?? 'single';
  const extraInstances: ChipInstance[] = (() => {
    try {
      const raw = (settings as any)?.extra_chip_instances;
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  })();
  const activeChipIds: string[] = (() => {
    try {
      const raw = (settings as any)?.active_chip_ids;
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  })();

  // Build full chip list
  const mainChip: ChipInstance | null = settings?.whatsapp_connected ? {
    id: 'main',
    instance_id: settings.whatsapp_instance_id || '',
    label: 'Chip Principal',
    status: 'connected',
    health: 'healthy',
  } : null;

  const allChips: ChipInstance[] = [
    ...(mainChip ? [mainChip] : []),
    ...extraInstances,
  ];

  // If no active chips selected, default to all
  const effectiveActiveIds = activeChipIds.length > 0
    ? activeChipIds
    : allChips.map(c => c.id);

  const healthLabels = {
    healthy: 'Saudável',
    warning: 'Atenção',
    critical: 'Crítico',
  };

  const strategyDescriptions: Record<string, string> = {
    single: 'Usa apenas o chip principal selecionado',
    round_robin: 'Alterna entre os chips selecionados sequencialmente',
    random: 'Escolhe aleatoriamente entre os chips selecionados',
    health: 'Prioriza chips com melhor saúde',
  };

  const handleToggleRotation = (checked: boolean) => {
    updateSettings({
      chip_rotation_enabled: checked,
      chip_rotation_strategy: checked ? (rotationStrategy === 'single' ? 'random' : rotationStrategy) : 'single',
    } as any);
    toast({ title: checked ? 'Rotação ativada' : 'Usando chip único' });
  };

  const handleStrategyChange = (value: string) => {
    updateSettings({ chip_rotation_strategy: value } as any);
    toast({ title: `Estratégia: ${value === 'round_robin' ? 'Round-robin' : value === 'random' ? 'Aleatório' : value === 'health' ? 'Por saúde' : 'Chip único'}` });
  };

  const handleToggleChipActive = (chipId: string, checked: boolean) => {
    let newActive: string[];
    if (checked) {
      newActive = [...effectiveActiveIds.filter(id => id !== chipId), chipId];
    } else {
      newActive = effectiveActiveIds.filter(id => id !== chipId);
      if (newActive.length === 0) {
        toast({ title: 'Pelo menos um chip deve estar ativo', variant: 'destructive' });
        return;
      }
    }
    updateSettings({ active_chip_ids: newActive } as any);
  };

  const handleAddChip = () => {
    if (!newChipLabel.trim() || !newChipInstanceId.trim()) {
      toast({ title: 'Preencha todos os campos', variant: 'destructive' });
      return;
    }
    const newChip: ChipInstance = {
      id: `chip_${Date.now()}`,
      instance_id: newChipInstanceId.trim(),
      label: newChipLabel.trim(),
      status: 'connected',
      health: 'healthy',
    };
    const updated = [...extraInstances, newChip];
    updateSettings({
      extra_chip_instances: updated,
      active_chip_ids: [...effectiveActiveIds, newChip.id],
    } as any);
    setNewChipLabel('');
    setNewChipInstanceId('');
    setAddChipOpen(false);
    toast({ title: `Chip "${newChip.label}" adicionado!` });
  };

  const handleRemoveChip = (chipId: string) => {
    const updated = extraInstances.filter(c => c.id !== chipId);
    const newActive = effectiveActiveIds.filter(id => id !== chipId);
    updateSettings({
      extra_chip_instances: updated,
      active_chip_ids: newActive.length > 0 ? newActive : ['main'],
    } as any);
    toast({ title: 'Chip removido' });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smartphone className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Múltiplos Números</CardTitle>
              <CardDescription className="text-xs">
                Use mais de um número WhatsApp e escolha a estratégia de envio
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary">{allChips.length} número{allChips.length !== 1 ? 's' : ''}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Strategy Selection - Always visible */}
        <div className="space-y-3 p-4 rounded-xl border bg-muted/20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shuffle className="h-4 w-4 text-primary" />
              <Label className="font-medium text-sm">Usar múltiplos números</Label>
            </div>
            <Switch
              checked={rotationEnabled}
              onCheckedChange={handleToggleRotation}
              disabled={allChips.length < 2}
            />
          </div>

          {allChips.length < 2 && (
            <p className="text-xs text-muted-foreground">
              Adicione pelo menos 2 números para ativar a rotação
            </p>
          )}

          {rotationEnabled && allChips.length >= 2 && (
            <div className="space-y-3 pt-2">
              <Label className="text-xs text-muted-foreground">Como distribuir os envios?</Label>
              <Select value={rotationStrategy} onValueChange={handleStrategyChange}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="random">
                    <div className="flex items-center gap-2">
                      <Shuffle className="h-3.5 w-3.5" />
                      Aleatório
                    </div>
                  </SelectItem>
                  <SelectItem value="round_robin">
                    <div className="flex items-center gap-2">
                      <RotateCcw className="h-3.5 w-3.5" />
                      Alternado (Round-robin)
                    </div>
                  </SelectItem>
                  <SelectItem value="health">
                    <div className="flex items-center gap-2">
                      <Signal className="h-3.5 w-3.5" />
                      Por saúde do chip
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {strategyDescriptions[rotationStrategy]}
              </p>
            </div>
          )}
        </div>

        {/* Chip List with checkboxes */}
        {allChips.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">
            Nenhum número conectado. Conecte o WhatsApp acima primeiro.
          </div>
        ) : (
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground uppercase tracking-wider">
              {rotationEnabled ? 'Selecione quais números usar:' : 'Números conectados:'}
            </Label>
            {allChips.map((chip) => {
              const isActive = effectiveActiveIds.includes(chip.id);
              return (
                <div
                  key={chip.id}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    isActive ? 'bg-primary/5 border-primary/20' : 'bg-muted/30 border-border opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {rotationEnabled && (
                      <Checkbox
                        checked={isActive}
                        onCheckedChange={(checked) => handleToggleChipActive(chip.id, !!checked)}
                      />
                    )}
                    <div className={`h-2.5 w-2.5 rounded-full ${chip.status === 'connected' ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`} />
                    <div>
                      <p className="text-sm font-medium">{chip.label}</p>
                      <p className="text-xs text-muted-foreground font-mono">{chip.instance_id}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isActive && (
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                    )}
                    <Badge variant="outline" className="text-xs">
                      {healthLabels[chip.health]}
                    </Badge>
                    <Badge variant={chip.status === 'connected' ? 'default' : 'secondary'} className="text-xs">
                      {chip.status === 'connected' ? 'Online' : 'Offline'}
                    </Badge>
                    {chip.id !== 'main' && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleRemoveChip(chip.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Chip */}
        <Dialog open={addChipOpen} onOpenChange={setAddChipOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full gap-2">
              <Plus className="h-4 w-4" />
              Adicionar novo número
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar número WhatsApp</DialogTitle>
              <DialogDescription>
                Informe o ID da instância Evolution API do novo número
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome do chip</Label>
                <Input
                  placeholder="Ex: Chip Vendas, Número 2..."
                  value={newChipLabel}
                  onChange={(e) => setNewChipLabel(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>ID da instância (Evolution API)</Label>
                <Input
                  placeholder="Ex: instance_abc123"
                  value={newChipInstanceId}
                  onChange={(e) => setNewChipInstanceId(e.target.value)}
                  className="font-mono"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddChipOpen(false)}>Cancelar</Button>
              <Button onClick={handleAddChip} className="gap-2">
                <Zap className="h-4 w-4" />
                Adicionar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

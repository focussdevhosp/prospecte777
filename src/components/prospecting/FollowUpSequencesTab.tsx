import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFollowUpSequences } from '@/hooks/use-follow-up-sequences';
import {
  RefreshCw,
  Plus,
  Trash2,
  Edit2,
  Clock,
  MessageSquare,
  Loader2,
  ArrowRight,
} from 'lucide-react';

const DEFAULT_DAYS = [1, 3, 5, 7, 14];

const TRIGGER_TYPES = [
  { value: 'no_response', label: 'Sem Resposta', description: 'Quando o lead não responde' },
  { value: 'new_lead', label: 'Novo Lead', description: 'Quando um novo lead é criado' },
  { value: 'stage_change', label: 'Mudança de Estágio', description: 'Quando o lead muda de estágio' },
];

export function FollowUpSequencesTab() {
  const { sequences, isLoading, createSequence, updateSequence, deleteSequence, toggleSequence } = useFollowUpSequences();
  const [isCreating, setIsCreating] = useState(false);
  const [newSequence, setNewSequence] = useState({
    name: '',
    description: '',
    trigger_type: 'no_response' as const,
    trigger_after_days: DEFAULT_DAYS,
    message_templates: DEFAULT_DAYS.map(day => ({
      day,
      message: '',
    })),
  });

  const handleCreate = async () => {
    if (!newSequence.name) return;

    await createSequence.mutateAsync({
      name: newSequence.name,
      description: newSequence.description,
      trigger_type: newSequence.trigger_type,
      trigger_after_days: newSequence.trigger_after_days,
      message_templates: newSequence.message_templates.filter(t => t.message.trim()),
    });
    
    setNewSequence({
      name: '',
      description: '',
      trigger_type: 'no_response',
      trigger_after_days: DEFAULT_DAYS,
      message_templates: DEFAULT_DAYS.map(day => ({ day, message: '' })),
    });
    setIsCreating(false);
  };

  const updateMessage = (day: number, message: string) => {
    setNewSequence(prev => ({
      ...prev,
      message_templates: prev.message_templates.map(t =>
        t.day === day ? { ...t, message } : t
      ),
    }));
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Sequências de Follow-up</h3>
          <p className="text-sm text-muted-foreground">
            Crie fluxos automáticos de acompanhamento para leads sem resposta
          </p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Nova Sequência
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Sequência de Follow-up</DialogTitle>
              <DialogDescription>
                Configure mensagens automáticas para leads sem resposta
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Nome da Sequência</Label>
                  <Input
                    placeholder="Ex: Follow-up Padrão"
                    value={newSequence.name}
                    onChange={e => setNewSequence(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Gatilho</Label>
                  <Select
                    value={newSequence.trigger_type}
                    onValueChange={(v: any) => setNewSequence(prev => ({ ...prev, trigger_type: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGER_TYPES.map(trigger => (
                        <SelectItem key={trigger.value} value={trigger.value}>
                          {trigger.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Descrição (opcional)</Label>
                <Input
                  placeholder="Descreva o objetivo desta sequência..."
                  value={newSequence.description}
                  onChange={e => setNewSequence(prev => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="space-y-4">
                <Label>Mensagens de Follow-up</Label>
                <p className="text-xs text-muted-foreground">
                  Configure as mensagens que serão enviadas automaticamente. Use {'{empresa}'}, {'{nome}'} para personalização.
                </p>

                <div className="space-y-4">
                  {newSequence.message_templates.map((template, index) => (
                    <div key={template.day} className="flex gap-4">
                      <div className="flex flex-col items-center">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-medium">
                          D{template.day}
                        </div>
                        {index < newSequence.message_templates.length - 1 && (
                          <div className="w-0.5 h-full bg-border mt-2" />
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <Label className="text-xs text-muted-foreground">
                          Dia {template.day} após último contato
                        </Label>
                        <Textarea
                          placeholder={`Mensagem de follow-up para o dia ${template.day}...`}
                          value={template.message}
                          onChange={e => updateMessage(template.day, e.target.value)}
                          rows={3}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCreating(false)}>
                Cancelar
              </Button>
              <Button 
                onClick={handleCreate}
                disabled={!newSequence.name || createSequence.isPending}
              >
                {createSequence.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Criar Sequência'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Sequências Ativas</p>
                <p className="text-3xl font-bold">
                  {sequences?.filter(s => s.is_active).length || 0}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-primary/20">
                <RefreshCw className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total de Mensagens</p>
                <p className="text-3xl font-bold">
                  {sequences?.reduce((sum, s) => sum + (s.message_templates?.length || 0), 0) || 0}
                </p>
              </div>
              <div className="p-3 rounded-xl bg-info/20">
                <MessageSquare className="h-6 w-6 text-info" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Maior Cadência</p>
                <p className="text-3xl font-bold">
                  {Math.max(...(sequences?.flatMap(s => s.trigger_after_days || []) || [0]))} dias
                </p>
              </div>
              <div className="p-3 rounded-xl bg-primary/20">
                <Clock className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sequences List */}
      {!sequences || sequences.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <RefreshCw className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <h3 className="font-medium mb-2">Nenhuma sequência</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Crie uma sequência para automatizar o follow-up com leads
            </p>
            <Button onClick={() => setIsCreating(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeira Sequência
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {sequences.map(sequence => (
            <Card key={sequence.id}>
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <h4 className="font-medium">{sequence.name}</h4>
                      <Badge variant={sequence.is_active ? 'default' : 'secondary'}>
                        {sequence.is_active ? 'Ativa' : 'Pausada'}
                      </Badge>
                      <Badge variant="outline">
                        {TRIGGER_TYPES.find(t => t.value === sequence.trigger_type)?.label}
                      </Badge>
                    </div>

                    {sequence.description && (
                      <p className="text-sm text-muted-foreground">{sequence.description}</p>
                    )}

                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>Cadência:</span>
                      <div className="flex items-center gap-1">
                        {sequence.trigger_after_days.map((day, i) => (
                          <span key={day} className="flex items-center">
                            <Badge variant="outline" className="text-xs">
                              D{day}
                            </Badge>
                            {i < sequence.trigger_after_days.length - 1 && (
                              <ArrowRight className="h-3 w-3 mx-1" />
                            )}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <MessageSquare className="h-4 w-4 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        {sequence.message_templates?.length || 0} mensagens configuradas
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Switch
                      checked={sequence.is_active}
                      onCheckedChange={(checked) => 
                        toggleSequence.mutate({ id: sequence.id, is_active: checked })
                      }
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteSequence.mutate(sequence.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useLeads } from '@/hooks/use-leads';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Clock,
  MessageSquare,
  Plus,
  Trash2,
  Play,
  Settings2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Zap,
  Users,
  Timer,
  ListChecks,
  Terminal,
} from 'lucide-react';
import { format, addDays, differenceInDays, parseISO } from 'date-fns';

interface FollowUpSequence {
  id: string;
  name: string;
  enabled: boolean;
  steps: FollowUpStep[];
}

interface FollowUpStep {
  id: string;
  daysAfterPrevious: number;
  message: string;
  condition: 'no_response' | 'any' | 'positive_only';
}

const DEFAULT_SEQUENCES: FollowUpSequence[] = [
  {
    id: 'default',
    name: 'Sequência Padrão',
    enabled: true,
    steps: [
      {
        id: 'step1',
        daysAfterPrevious: 3,
        message: 'Olá {empresa}! 👋 Passei aqui para saber se você teve a oportunidade de analisar minha proposta. Ficou alguma dúvida?',
        condition: 'no_response',
      },
      {
        id: 'step2',
        daysAfterPrevious: 7,
        message: 'Oi {empresa}! Tudo bem? Sei que a rotina é corrida, mas gostaria de saber se posso ajudar de alguma forma. Estou à disposição! 😊',
        condition: 'no_response',
      },
      {
        id: 'step3',
        daysAfterPrevious: 15,
        message: '{empresa}, última tentativa de contato! Se não for o momento, sem problemas. Caso mude de ideia futuramente, é só me chamar. Sucesso! 🚀',
        condition: 'no_response',
      },
    ],
  },
];

export function FollowUpManager() {
  const { settings } = useUserSettings();
  const { leads } = useLeads();
  const { toast } = useToast();

  const [sequences, setSequences] = useState<FollowUpSequence[]>(DEFAULT_SEQUENCES);
  const [isCreatingSequence, setIsCreatingSequence] = useState(false);
  const [newSequenceName, setNewSequenceName] = useState('');
  const [selectedSequence, setSelectedSequence] = useState<string>('default');
  const [isRunning, setIsRunning] = useState(false);
  const [followUpLog, setFollowUpLog] = useState<string[]>([]);
  const [pendingFollowUps, setPendingFollowUps] = useState<any[]>([]);

  const leadsNeedingFollowUp = leads.filter(lead => {
    if (lead.stage === 'Ganho' || lead.stage === 'Perdido') return false;
    if (!lead.last_contact_at) return false;
    const daysSinceContact = differenceInDays(new Date(), parseISO(lead.last_contact_at));
    return daysSinceContact >= 3 && !lead.last_response_at;
  });

  const currentSequence = sequences.find(s => s.id === selectedSequence) || sequences[0];

  const addLog = (message: string) => {
    const timestamp = format(new Date(), 'HH:mm:ss');
    setFollowUpLog(prev => [`[${timestamp}] ${message}`, ...prev.slice(0, 49)]);
  };

  const calculatePendingFollowUps = () => {
    const pending: any[] = [];
    leadsNeedingFollowUp.forEach(lead => {
      if (!lead.last_contact_at) return;
      const daysSinceContact = differenceInDays(new Date(), parseISO(lead.last_contact_at));
      const followUpCount = lead.follow_up_count || 0;
      const nextStep = currentSequence.steps[followUpCount];
      if (!nextStep) return;
      const cumulativeDays = currentSequence.steps
        .slice(0, followUpCount + 1)
        .reduce((sum, step) => sum + step.daysAfterPrevious, 0);
      const daysUntilFollowUp = cumulativeDays - daysSinceContact;
      pending.push({
        lead, step: followUpCount + 1, totalSteps: currentSequence.steps.length,
        daysUntilFollowUp,
        message: nextStep.message.replace('{empresa}', lead.business_name).replace('{nicho}', lead.niche || ''),
        isOverdue: daysUntilFollowUp <= 0,
      });
    });
    pending.sort((a, b) => a.daysUntilFollowUp - b.daysUntilFollowUp);
    setPendingFollowUps(pending);
    return pending;
  };

  const runFollowUps = async () => {
    if (!settings?.whatsapp_connected) {
      toast({ title: 'WhatsApp não conectado', description: 'Conecte seu WhatsApp em Configurações.', variant: 'destructive' });
      return;
    }
    setIsRunning(true);
    addLog('🚀 Iniciando sequência de follow-ups...');
    const pending = calculatePendingFollowUps();
    const overdue = pending.filter(p => p.isOverdue);
    addLog(`📋 ${overdue.length} follow-ups pendentes para enviar`);
    for (const item of overdue) {
      try {
        addLog(`📤 Enviando follow-up #${item.step} para ${item.lead.business_name}...`);
        const response = await supabase.functions.invoke('whatsapp-send', {
          body: { phone: item.lead.phone, message: item.message, instance_id: settings.whatsapp_instance_id },
        });
        if (response.error) throw new Error(response.error.message);
        await supabase.from('leads').update({
          last_contact_at: new Date().toISOString(),
          follow_up_count: item.step,
          next_follow_up_at: item.step < item.totalSteps
            ? addDays(new Date(), currentSequence.steps[item.step]?.daysAfterPrevious || 7).toISOString()
            : null,
        }).eq('id', item.lead.id);
        await supabase.from('chat_messages').insert({
          lead_id: item.lead.id, sender_type: 'agent', content: item.message, status: 'sent',
        });
        addLog(`✅ Follow-up enviado para ${item.lead.business_name}`);
        const delay = Math.floor(Math.random() * 60000) + 30000;
        addLog(`⏳ Aguardando ${Math.round(delay / 1000)}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      } catch (error: any) {
        addLog(`❌ Erro ao enviar para ${item.lead.business_name}: ${error.message}`);
      }
    }
    addLog('✨ Sequência de follow-ups concluída!');
    setIsRunning(false);
    toast({ title: '✓ Follow-ups enviados', description: `${overdue.length} mensagens de acompanhamento enviadas.` });
  };

  const addStep = () => {
    setSequences(prev => prev.map(seq => {
      if (seq.id !== selectedSequence) return seq;
      return {
        ...seq,
        steps: [...seq.steps, {
          id: `step-${Date.now()}`,
          daysAfterPrevious: 7,
          message: 'Olá {empresa}! Gostaria de saber se posso ajudar...',
          condition: 'no_response' as const,
        }],
      };
    }));
  };

  const updateStep = (stepId: string, updates: Partial<FollowUpStep>) => {
    setSequences(prev => prev.map(seq => {
      if (seq.id !== selectedSequence) return seq;
      return { ...seq, steps: seq.steps.map(step => step.id === stepId ? { ...step, ...updates } : step) };
    }));
  };

  const removeStep = (stepId: string) => {
    setSequences(prev => prev.map(seq => {
      if (seq.id !== selectedSequence) return seq;
      return { ...seq, steps: seq.steps.filter(step => step.id !== stepId) };
    }));
  };

  const createSequence = () => {
    if (!newSequenceName.trim()) return;
    const newSeq: FollowUpSequence = { id: `seq-${Date.now()}`, name: newSequenceName, enabled: true, steps: [] };
    setSequences(prev => [...prev, newSeq]);
    setSelectedSequence(newSeq.id);
    setNewSequenceName('');
    setIsCreatingSequence(false);
  };

  const overdueCount = pendingFollowUps.filter(p => p.isOverdue).length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-3 grid-cols-3">
        {[
          {
            label: 'Aguardando Follow-up',
            value: leadsNeedingFollowUp.length,
            icon: Users,
            colorClass: 'text-primary',
          },
          {
            label: 'Atrasados (enviar agora)',
            value: overdueCount,
            icon: AlertCircle,
            colorClass: 'text-brand',
          },
          {
            label: 'Sequências Ativas',
            value: sequences.filter(s => s.enabled).length,
            icon: Zap,
            colorClass: 'text-info',
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="relative overflow-hidden rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 transition-all hover:border-border"
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs text-muted-foreground leading-tight max-w-[100px]">{stat.label}</p>
              <div className={`flex items-center justify-center h-9 w-9 rounded-lg bg-muted/60 ${stat.colorClass}`}>
                <stat.icon className="h-4 w-4" />
              </div>
            </div>
            <p className={`text-3xl font-bold tracking-tight ${stat.colorClass}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Main Grid */}
      <div className="space-y-5">
        {/* Sequence Editor */}
        <Card className="border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden">
          <div className="border-b border-border/40 bg-muted/30 px-6 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary">
                  <Settings2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Sequências de Follow-up</h3>
                  <p className="text-sm text-muted-foreground">Configure mensagens automáticas de acompanhamento</p>
                </div>
              </div>
              <Dialog open={isCreatingSequence} onOpenChange={setIsCreatingSequence}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    Nova
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova Sequência</DialogTitle>
                    <DialogDescription>Crie uma nova sequência de follow-up</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nome da Sequência</Label>
                      <Input value={newSequenceName} onChange={(e) => setNewSequenceName(e.target.value)} placeholder="Ex: Follow-up Agressivo" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button onClick={createSequence}>Criar Sequência</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <CardContent className="p-5 space-y-4">
            {/* Sequence Selector */}
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sequência Ativa</Label>
              <Select value={selectedSequence} onValueChange={setSelectedSequence}>
                <SelectTrigger className="bg-background/60 border-border/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sequences.map(seq => (
                    <SelectItem key={seq.id} value={seq.id}>
                      {seq.name} ({seq.steps.length} passos)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Steps */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Passos da Sequência
                </Label>
                <Button variant="ghost" size="sm" onClick={addStep} className="gap-1 h-7 text-xs text-primary hover:text-primary">
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar Passo
                </Button>
              </div>

              <ScrollArea className="h-[340px] pr-2">
                <div className="space-y-3">
                  {currentSequence.steps.map((step, index) => (
                    <div key={step.id} className="rounded-xl border border-border/40 bg-background/40 p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                          <span className="text-sm font-bold text-primary">{index + 1}</span>
                        </div>
                        <div className="flex-1 space-y-3 min-w-0">
                          <div className="flex items-center gap-2">
                            <Timer className="h-4 w-4 text-muted-foreground shrink-0" />
                            <Input
                              type="number"
                              value={step.daysAfterPrevious}
                              onChange={(e) => updateStep(step.id, { daysAfterPrevious: Number(e.target.value) })}
                              className="w-16 h-8 text-sm bg-muted/50 border-border/40"
                              min={1}
                            />
                            <span className="text-xs text-muted-foreground">
                              dias após {index === 0 ? 'primeiro contato' : 'passo anterior'}
                            </span>
                          </div>
                          <Textarea
                            value={step.message}
                            onChange={(e) => updateStep(step.id, { message: e.target.value })}
                            rows={3}
                            className="resize-none text-sm bg-muted/30 border-border/40"
                            placeholder="Mensagem de follow-up..."
                          />
                          <div className="flex items-center justify-between">
                            <Badge variant="outline" className="text-[10px]">
                              {step.condition === 'no_response' ? 'Sem resposta' : step.condition === 'any' ? 'Qualquer' : 'Positivo'}
                            </Badge>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeStep(step.id)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {currentSequence.steps.length === 0 && (
                    <div className="text-center py-10 text-muted-foreground">
                      <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-muted/50 mx-auto mb-3">
                        <MessageSquare className="h-7 w-7 opacity-40" />
                      </div>
                      <p className="font-medium text-foreground/70">Nenhum passo configurado</p>
                      <Button variant="link" onClick={addStep} className="text-xs mt-1">
                        Adicionar primeiro passo
                      </Button>
                    </div>
                  )}
                </div>
              </ScrollArea>
            </div>
          </CardContent>
        </Card>

        {/* Execution Panel */}
        <Card className="border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden">
          <div className="border-b border-border/40 bg-muted/30 px-6 py-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary">
                <Play className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">Executar Follow-ups</h3>
                <p className="text-sm text-muted-foreground">Envie mensagens de acompanhamento para leads pendentes</p>
              </div>
            </div>
          </div>

          <CardContent className="p-5 space-y-5">
            {/* Actions */}
            <div className="flex gap-2">
              <Button
                onClick={() => { calculatePendingFollowUps(); addLog('📊 Lista de follow-ups atualizada'); }}
                variant="outline"
                disabled={isRunning}
                className="gap-1.5"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar Lista
              </Button>
              <Button
                onClick={runFollowUps}
                disabled={isRunning || overdueCount === 0}
                className="flex-1 gap-1.5"
              >
                {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Enviar Follow-ups ({overdueCount})
              </Button>
            </div>

            {/* Pending List */}
            <div className="space-y-2.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5" />
                Próximos Follow-ups
              </Label>
              <div className="border border-border/40 rounded-xl overflow-hidden">
                <ScrollArea className="h-[200px]">
                  {pendingFollowUps.length === 0 ? (
                    <div className="text-center py-10 text-muted-foreground">
                      <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                      <p className="text-sm">Nenhum follow-up pendente</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/30">
                      {pendingFollowUps.slice(0, 10).map((item, idx) => (
                        <div
                          key={idx}
                          className={`px-4 py-3 transition-colors ${item.isOverdue ? 'bg-brand/5' : 'hover:bg-muted/30'}`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className={`h-2 w-2 rounded-full shrink-0 ${item.isOverdue ? 'bg-brand' : 'bg-muted-foreground/30'}`} />
                              <span className="font-medium text-sm truncate">{item.lead.business_name}</span>
                            </div>
                            <Badge
                              variant={item.isOverdue ? 'destructive' : 'secondary'}
                              className="text-[10px] shrink-0 ml-2"
                            >
                              {item.isOverdue ? 'Atrasado!' : `Em ${item.daysUntilFollowUp} dia(s)`}
                            </Badge>
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-1 ml-4">
                            Passo {item.step}/{item.totalSteps} • {item.lead.niche || 'Sem nicho'}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
              </div>
            </div>

            {/* Log */}
            <div className="space-y-2.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Terminal className="h-3.5 w-3.5" />
                Log de Execução
              </Label>
              <div className="border border-border/40 rounded-xl bg-muted/20 overflow-hidden">
                <ScrollArea className="h-[150px] p-3">
                  <div className="space-y-1 font-mono text-[11px]">
                    {followUpLog.length === 0 ? (
                      <p className="text-muted-foreground">Aguardando execução...</p>
                    ) : (
                      followUpLog.map((log, idx) => (
                        <p key={idx} className={
                          log.includes('✅') ? 'text-success' :
                          log.includes('❌') ? 'text-destructive' :
                          log.includes('⏳') ? 'text-muted-foreground' :
                          log.includes('🚀') ? 'text-primary' :
                          'text-foreground'
                        }>
                          {log}
                        </p>
                      ))
                    )}
                  </div>
                </ScrollArea>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

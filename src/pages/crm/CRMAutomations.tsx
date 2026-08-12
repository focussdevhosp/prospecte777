import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

import { useUserSettings } from '@/hooks/use-user-settings';
import { useToast } from '@/hooks/use-toast';
import {
  Zap, ArrowRight, Clock, MessageCircle, Move, Tag, Flame,
  Bot, Calendar, Bell, CheckCircle, Plus, Trash2, Settings2,
  TrendingUp, Users, AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

interface AutomationRule {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  enabled: boolean;
  category: 'pipeline' | 'messaging' | 'scoring' | 'notification';
  settingsKey?: string;
}

const defaultRules: AutomationRule[] = [
  {
    id: 'auto-first-message',
    name: 'Primeira Mensagem Automática',
    description: 'Envia uma mensagem de apresentação quando um novo lead é criado',
    icon: <MessageCircle className="h-5 w-5" />,
    iconBg: 'bg-success/10 text-success',
    enabled: false,
    category: 'messaging',
    settingsKey: 'auto_first_message_enabled',
  },
  {
    id: 'auto-followup',
    name: 'Follow-up Automático',
    description: 'Envia follow-up após X dias sem resposta do lead',
    icon: <Clock className="h-5 w-5" />,
    iconBg: 'bg-warning/10 text-warning',
    enabled: false,
    category: 'messaging',
    settingsKey: 'auto_followup_enabled',
  },
  {
    id: 'auto-pipeline',
    name: 'Pipeline Inteligente',
    description: 'Move leads automaticamente entre estágios baseado em interações',
    icon: <Move className="h-5 w-5" />,
    iconBg: 'bg-primary/10 text-primary',
    enabled: false,
    category: 'pipeline',
    settingsKey: 'auto_pipeline_enabled',
  },
  {
    id: 'auto-scoring',
    name: 'Lead Scoring Automático',
    description: 'Calcula e atualiza o score do lead baseado em comportamento',
    icon: <TrendingUp className="h-5 w-5" />,
    iconBg: 'bg-info/10 text-info',
    enabled: false,
    category: 'scoring',
    settingsKey: 'auto_lead_scoring',
  },
  {
    id: 'auto-reactivation',
    name: 'Reativação de Leads Frios',
    description: 'Re-engaja leads inativos há mais de 14 dias com mensagem personalizada',
    icon: <Flame className="h-5 w-5" />,
    iconBg: 'bg-destructive/10 text-destructive',
    enabled: false,
    category: 'messaging',
    settingsKey: 'auto_reactivation_enabled',
  },
  {
    id: 'sdr-agent',
    name: 'Agente SDR (IA)',
    description: 'Responde automaticamente leads usando IA contextual',
    icon: <Bot className="h-5 w-5" />,
    iconBg: 'bg-info/10 text-info',
    enabled: false,
    category: 'messaging',
    settingsKey: 'sdr_agent_enabled',
  },
];

const categories = [
  { key: 'all', label: 'Todas', icon: Zap },
  { key: 'pipeline', label: 'Pipeline', icon: Move },
  { key: 'messaging', label: 'Mensagens', icon: MessageCircle },
  { key: 'scoring', label: 'Scoring', icon: TrendingUp },
  { key: 'notification', label: 'Notificações', icon: Bell },
];

export default function CRMAutomationsPage() {
  const { settings, updateSettings } = useUserSettings();
  const { toast } = useToast();
  const [activeCategory, setActiveCategory] = useState('all');

  const rules = defaultRules.map(rule => ({
    ...rule,
    enabled: rule.settingsKey ? !!(settings as any)?.[rule.settingsKey] : false,
  }));

  const filtered = activeCategory === 'all' ? rules : rules.filter(r => r.category === activeCategory);
  const enabledCount = rules.filter(r => r.enabled).length;

  const toggleRule = async (rule: AutomationRule) => {
    if (!rule.settingsKey) return;
    const newValue = !(settings as any)?.[rule.settingsKey];
    await updateSettings({ [rule.settingsKey]: newValue } as any);
    toast({
      title: newValue ? '✅ Automação ativada' : '⏸️ Automação pausada',
      description: rule.name,
    });
  };

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-3">
        <PageHeader
          eyebrow="CRM"
          title="Automações"
          description="Configure regras automáticas para o seu CRM"
          icon={<Zap className="h-5 w-5" />}
          className="mb-0"
        />
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">
            {enabledCount}/{rules.length} ativas
          </Badge>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{enabledCount}</p>
              <p className="text-[11px] text-muted-foreground">Ativas</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-success/10 flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-success" />
            </div>
            <div>
              <p className="text-lg font-bold">{rules.filter(r => r.category === 'messaging' && r.enabled).length}</p>
              <p className="text-[11px] text-muted-foreground">Msgs Auto</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Move className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-lg font-bold">{rules.filter(r => r.category === 'pipeline' && r.enabled).length}</p>
              <p className="text-[11px] text-muted-foreground">Pipeline</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-3 pb-3 flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-info/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-info" />
            </div>
            <div>
              <p className="text-lg font-bold">{rules.filter(r => r.category === 'scoring' && r.enabled).length}</p>
              <p className="text-[11px] text-muted-foreground">Scoring</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Category filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {categories.map(cat => (
          <Button
            key={cat.key}
            variant={activeCategory === cat.key ? 'secondary' : 'ghost'}
            size="sm"
            className="gap-1.5 rounded-xl h-8"
            onClick={() => setActiveCategory(cat.key)}
          >
            <cat.icon className="h-3.5 w-3.5" />
            {cat.label}
          </Button>
        ))}
      </div>

      {/* Rules grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filtered.map(rule => (
          <Card key={rule.id} className={`border-border/50 transition-all hover:shadow-md ${rule.enabled ? 'ring-1 ring-primary/20' : ''}`}>
            <CardContent className="p-5">
              <div className="flex items-start gap-4">
                <div className={`h-12 w-12 rounded-xl flex items-center justify-center shrink-0 ${rule.iconBg}`}>
                  {rule.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold text-sm">{rule.name}</h3>
                    <Switch
                      checked={rule.enabled}
                      onCheckedChange={() => toggleRule(rule)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{rule.description}</p>
                  <div className="flex items-center gap-2 mt-3">
                    <Badge variant="outline" className={`text-[10px] ${rule.enabled ? 'text-success border-success/20' : 'text-muted-foreground'}`}>
                      {rule.enabled ? '● Ativa' : '○ Inativa'}
                    </Badge>
                    <Badge variant="outline" className="text-[10px]">
                      {rule.category === 'pipeline' ? 'Pipeline' : rule.category === 'messaging' ? 'Mensagens' : rule.category === 'scoring' ? 'Scoring' : 'Notificação'}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* How it works */}
      <Card className="mt-6 border-border/50">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Settings2 className="h-4 w-4 text-primary" />
            Como funcionam as automações
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-info/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-sm font-bold text-info">1</span>
              </div>
              <div>
                <p className="text-sm font-medium">Gatilho</p>
                <p className="text-xs text-muted-foreground">Um evento acontece (novo lead, sem resposta, mudança de estágio)</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-sm font-bold text-primary">2</span>
              </div>
              <div>
                <p className="text-sm font-medium">Condição</p>
                <p className="text-xs text-muted-foreground">O sistema verifica regras (temperatura, score, tempo)</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-lg bg-success/10 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-sm font-bold text-success">3</span>
              </div>
              <div>
                <p className="text-sm font-medium">Ação</p>
                <p className="text-xs text-muted-foreground">Executa automaticamente (enviar msg, mover pipeline, atualizar score)</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

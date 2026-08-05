import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import {
  Target,
  Send,
  RefreshCw,
  Bot,
  Kanban,
  Flame,
  Star,
  Mail,
  BarChart3,
  Zap,
  Clock,
  type LucideIcon,
} from 'lucide-react';

interface AutomationConfig {
  id: string;
  title: string;
  description: string;
  detail: string;
  icon: LucideIcon;
  category: 'prospecting' | 'messaging' | 'crm' | 'reporting';
  settingKey: string;
  defaultEnabled: boolean;
  badge?: string;
  requiresWhatsApp?: boolean;
  requiresDeepSeek?: boolean;
}

const AUTOMATIONS: AutomationConfig[] = [
  {
    id: 'weekly_prospecting',
    title: 'Prospecção semanal automática',
    description: 'Captura novos leads toda semana sem você precisar fazer nada',
    detail: 'Toda segunda-feira às 8h o sistema busca novos leads no Google Maps pelo seu nicho e cidade e os adiciona ao CRM automaticamente.',
    icon: Target,
    category: 'prospecting',
    settingKey: 'auto_prospecting_enabled',
    defaultEnabled: true,
    badge: 'Recomendado',
  },
  {
    id: 'auto_first_message',
    title: 'Primeira mensagem automática',
    description: 'Envia mensagem de apresentação para novos leads automaticamente',
    detail: 'Quando um novo lead é capturado, o sistema envia a primeira mensagem personalizada em até 30 minutos — no horário comercial.',
    icon: Send,
    category: 'messaging',
    settingKey: 'auto_first_message_enabled',
    defaultEnabled: true,
    requiresWhatsApp: true,
    badge: 'Popular',
  },
  {
    id: 'auto_followup',
    title: 'Follow-up automático',
    description: 'Envia follow-up para leads que não responderam em 3 dias',
    detail: 'Leads sem resposta recebem mensagens de follow-up automaticamente nos dias 3, 7 e 15. Se ainda não responder, vai para reativação.',
    icon: RefreshCw,
    category: 'messaging',
    settingKey: 'auto_followup_enabled',
    defaultEnabled: true,
    requiresWhatsApp: true,
  },
  {
    id: 'ai_auto_reply',
    title: 'Resposta automática da IA',
    description: 'A IA responde perguntas dos leads sem você precisar intervir',
    detail: 'Quando um lead envia mensagem, a IA analisa a intenção e responde automaticamente. Você só precisa intervir quando o lead estiver pronto para fechar.',
    icon: Bot,
    category: 'messaging',
    settingKey: 'sdr_agent_enabled',
    defaultEnabled: false,
    requiresWhatsApp: true,
    requiresDeepSeek: true,
    badge: 'IA',
  },
  {
    id: 'intent_pipeline',
    title: 'Movimentação automática do pipeline',
    description: 'Lead se move no funil de acordo com o que responde',
    detail: 'Quando o lead responde positivamente → vai para Qualificado. Pede preço → Proposta. Não responde em 30 dias → Perdido. Tudo automático.',
    icon: Kanban,
    category: 'crm',
    settingKey: 'auto_pipeline_enabled',
    defaultEnabled: true,
    requiresWhatsApp: true,
  },
  {
    id: 'cold_reactivation',
    title: 'Reativação de leads frios',
    description: 'Tenta reativar leads que sumiram com uma nova abordagem',
    detail: 'Leads sem resposta há 20 dias recebem uma mensagem completamente diferente — nova oferta, novo ângulo. 3 tentativas em 10 dias. Se não responder, arquiva.',
    icon: Flame,
    category: 'messaging',
    settingKey: 'auto_reactivation_enabled',
    defaultEnabled: false,
    requiresWhatsApp: true,
  },
  {
    id: 'lead_scoring',
    title: 'Pontuação automática de leads',
    description: 'Classifica leads por potencial de conversão em tempo real',
    detail: 'Analisa cada interação e atribui um score de 0 a 100. Leads com score alto recebem prioridade e aparecem no topo do CRM.',
    icon: Star,
    category: 'crm',
    settingKey: 'auto_lead_scoring',
    defaultEnabled: true,
  },
  {
    id: 'daily_report',
    title: 'Relatório diário por email',
    description: 'Receba um resumo das atividades todo dia às 8h',
    detail: 'Email diário com: leads novos, mensagens enviadas, respostas recebidas, leads qualificados e ações pendentes do dia.',
    icon: Mail,
    category: 'reporting',
    settingKey: 'daily_report_enabled',
    defaultEnabled: false,
  },
  {
    id: 'weekly_report',
    title: 'Relatório semanal de performance',
    description: 'Resumo semanal com métricas e sugestões de melhoria',
    detail: 'Toda sexta-feira: comparativo da semana anterior, melhores horários de envio, templates com maior taxa de resposta e sugestões da IA.',
    icon: BarChart3,
    category: 'reporting',
    settingKey: 'weekly_report_enabled',
    defaultEnabled: true,
  },
];

const CATEGORIES = [
  { id: 'prospecting' as const, label: '🎯 Captura', description: 'Automações de prospecção' },
  { id: 'messaging' as const, label: '💬 Mensagens', description: 'Envio e respostas automáticas' },
  { id: 'crm' as const, label: '📋 CRM', description: 'Gestão automática de pipeline' },
  { id: 'reporting' as const, label: '📊 Relatórios', description: 'Relatórios e notificações' },
];

export function AutomationsPanel() {
  const { settings, updateSettings, isUpdating } = useUserSettings();
  const { toast } = useToast();
  const [togglingKey, setTogglingKey] = useState<string | null>(null);

  const getSettingValue = (key: string): boolean => {
    if (!settings) return false;
    return (settings as any)[key] ?? false;
  };

  const activeCount = AUTOMATIONS.filter(a => getSettingValue(a.settingKey)).length;
  const hoursEconomized = activeCount * 2;

  const handleToggle = async (settingKey: string, value: boolean) => {
    setTogglingKey(settingKey);
    try {
      await updateSettings({ [settingKey]: value } as any);
      toast({
        title: value ? '✅ Automação ativada' : '⏸️ Automação desativada',
        description: value ? 'A automação vai começar a funcionar agora' : 'A automação foi pausada',
      });
    } finally {
      setTogglingKey(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header card */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-primary/10">
        <CardContent className="p-6">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-2xl bg-primary/10">
                <Zap className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">
                  {activeCount} automações ativas
                </h2>
                <p className="text-sm text-muted-foreground">
                  Seu app está trabalhando por você
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="bg-primary/10 text-primary border-0 px-3 py-1.5">
                <Clock className="h-3.5 w-3.5 mr-1.5" />
                Economizando ~{hoursEconomized}h/semana
              </Badge>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-muted-foreground">{activeCount} de {AUTOMATIONS.length} ativas</span>
              <span className="text-xs font-medium text-primary">{Math.round((activeCount / AUTOMATIONS.length) * 100)}%</span>
            </div>
            <Progress value={(activeCount / AUTOMATIONS.length) * 100} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Automation categories */}
      {CATEGORIES.map((category) => {
        const categoryAutomations = AUTOMATIONS.filter(a => a.category === category.id);
        if (categoryAutomations.length === 0) return null;

        return (
          <div key={category.id} className="space-y-3">
            <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-wider px-1">
              {category.label}
            </h3>
            <div className="space-y-2">
              {categoryAutomations.map((automation) => {
                const isEnabled = getSettingValue(automation.settingKey);
                const isToggling = togglingKey === automation.settingKey;

                return (
                  <Card
                    key={automation.id}
                    className={cn(
                      "border transition-all duration-200",
                      isEnabled ? "border-primary/20 bg-primary/[0.02]" : "hover:border-border/80"
                    )}
                  >
                    <CardContent className="p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-start gap-4 flex-1">
                          <div
                            className={cn(
                              "p-2.5 rounded-xl transition-colors shrink-0",
                              isEnabled ? "bg-primary/10" : "bg-muted"
                            )}
                          >
                            <automation.icon
                              className={cn(
                                "h-5 w-5",
                                isEnabled ? "text-primary" : "text-muted-foreground"
                              )}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <h3 className="font-semibold text-[15px]">{automation.title}</h3>
                              {automation.badge && (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] bg-primary/10 text-primary border-0"
                                >
                                  {automation.badge}
                                </Badge>
                              )}
                              {automation.requiresWhatsApp && !settings?.whatsapp_connected && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-warning border-warning"
                                >
                                  Requer WhatsApp
                                </Badge>
                              )}
                              {automation.requiresDeepSeek && !(settings as any)?.deepseek_api_key && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-warning border-warning"
                                >
                                  Requer DeepSeek API
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {automation.description}
                            </p>
                            <Collapsible>
                              <CollapsibleTrigger className="text-xs text-primary hover:underline mt-1.5 inline-block">
                                Como funciona →
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <p className="text-xs text-muted-foreground mt-2 leading-relaxed bg-muted/50 rounded-lg p-3">
                                  {automation.detail}
                                </p>
                              </CollapsibleContent>
                            </Collapsible>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-2 shrink-0">
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(v) => handleToggle(automation.settingKey, v)}
                            disabled={isUpdating || isToggling}
                          />
                          <span
                            className={cn(
                              "text-[11px] font-medium",
                              isEnabled ? "text-success" : "text-muted-foreground"
                            )}
                          >
                            {isEnabled ? "Ativo" : "Inativo"}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

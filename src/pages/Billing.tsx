import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useLeads } from '@/hooks/use-leads';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useSubscription } from '@/hooks/use-subscription';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  Check,
  Crown,
  MessageSquare,
  Smartphone,
  Zap,
  Star,
  CreditCard,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Receipt,
  Copy,
  Shield,
  ArrowRight,
  Clock,
  Rocket,
  Building2,
} from 'lucide-react';

const CAKTO_CHECKOUT_URL = 'https://pay.cakto.com.br/o5dfn8a_827823';

const plans = [
  {
    id: 'starter',
    name: 'Starter',
    tagline: 'Para começar',
    icon: Rocket,
    monthlyPrice: 49,
    chips: 1,
    features: [
      'Até 500 disparos/mês',
      '1 chip WhatsApp',
      'Google Maps',
      'Prospecção agendada',
      'Templates básicos',
      'Suporte por email',
    ],
  },
  {
    id: 'pro',
    name: 'Profissional',
    tagline: 'Mais popular',
    icon: Crown,
    monthlyPrice: 97,
    chips: 3,
    popular: true,
    features: [
      'Disparos ilimitados',
      '3 chips WhatsApp',
      'Todos os extratores',
      'Agente SDR ativo',
      'Google Maps + Radar CNPJ',
      'Anti-Ban inteligente',
      'Relatórios avançados',
      'Teste A/B',
      'Suporte prioritário',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'Para grandes equipes',
    icon: Building2,
    monthlyPrice: 349,
    chips: 10,
    features: [
      'Tudo do Pro',
      '10 chips WhatsApp',
      'API pública',
      'Múltiplos funis',
      'Equipe ilimitada',
      'Webhooks avançados',
      'Onboarding dedicado',
      'SLA de suporte',
      'White-label (em breve)',
    ],
  },
];

const EVENT_LABELS: Record<string, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  purchase_approved: { label: 'Pagamento aprovado', color: 'text-success', icon: CheckCircle2 },
  subscription_created: { label: 'Assinatura criada', color: 'text-success', icon: CheckCircle2 },
  subscription_renewed: { label: 'Assinatura renovada', color: 'text-success', icon: CheckCircle2 },
  subscription_canceled: { label: 'Assinatura cancelada', color: 'text-destructive', icon: XCircle },
  subscription_renewal_refused: { label: 'Renovação recusada', color: 'text-brand', icon: AlertTriangle },
  refund: { label: 'Reembolso', color: 'text-brand', icon: AlertTriangle },
  chargeback: { label: 'Chargeback', color: 'text-destructive', icon: XCircle },
  purchase_refused: { label: 'Pagamento recusado', color: 'text-destructive', icon: XCircle },
};

const STATUS_BADGES: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'Ativo', variant: 'default' },
  canceled: { label: 'Cancelado', variant: 'destructive' },
  past_due: { label: 'Pagamento pendente', variant: 'secondary' },
  refunded: { label: 'Reembolsado', variant: 'destructive' },
  chargeback: { label: 'Chargeback', variant: 'destructive' },
  free: { label: 'Gratuito', variant: 'outline' },
};

export default function BillingPage() {
  const { leads } = useLeads();
  const { settings } = useUserSettings();
  const { user } = useAuth();
  const { toast } = useToast();
  const { subscription, paymentHistory, isActive, isPastDue } = useSubscription();

  const chipsConnected = settings?.whatsapp_connected ? 1 : 0;
  const leadsCount = leads?.length || 0;
  const currentPlanId = subscription?.plan || 'free';

  const webhookUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/cakto-webhook`;

  const getCheckoutUrl = () => {
    const email = user?.email;
    if (email) {
      const separator = CAKTO_CHECKOUT_URL.includes('?') ? '&' : '?';
      return `${CAKTO_CHECKOUT_URL}${separator}email=${encodeURIComponent(email)}`;
    }
    return CAKTO_CHECKOUT_URL;
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: '✓ Copiado!' });
  };

  const statusBadge = STATUS_BADGES[subscription?.status || 'free'] || STATUS_BADGES.free;
  const checkoutUrl = getCheckoutUrl();

  return (
    <DashboardLayout
      title="Planos e Faturamento"
      description="Gerencie seu plano e acompanhe pagamentos"
    >
      <div className="space-y-8 animate-fade-in">
        {/* Current Subscription Status */}
        <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary/8 via-primary/3 to-transparent shadow-lg">
          <CardContent className="p-6">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/15 shadow-sm">
                  <Zap className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Sua Assinatura</h3>
                  {subscription?.started_at && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Desde {format(new Date(subscription.started_at), "MMMM 'de' yyyy", { locale: ptBR })}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={statusBadge.variant} className="text-xs">{statusBadge.label}</Badge>
              </div>
            </div>

            {isPastDue && (
              <div className="flex items-center gap-2.5 p-3 mb-5 rounded-xl bg-brand/10 border border-brand/20">
                <AlertTriangle className="h-4 w-4 text-brand shrink-0" />
                <p className="text-sm text-brand">Pagamento pendente. Regularize para manter o acesso.</p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { icon: MessageSquare, label: 'Disparos', value: isActive ? 'Ilimitados ∞' : '50/mês', color: 'text-success', bg: 'bg-success/10' },
                { icon: Smartphone, label: 'Chips WhatsApp', value: `${chipsConnected} conectado(s)`, color: 'text-info', bg: 'bg-info/10' },
                { icon: Star, label: 'Leads Capturados', value: `${leadsCount.toLocaleString()}`, color: 'text-warning', bg: 'bg-warning/10' },
                { icon: CreditCard, label: 'Valor', value: subscription?.amount ? `R$ ${(subscription.amount / 100).toFixed(0)}/mês` : 'Gratuito', color: 'text-primary', bg: 'bg-primary/10' },
              ].map((stat) => (
                <div key={stat.label} className="flex items-center gap-3 p-3.5 rounded-xl bg-background/60 backdrop-blur-sm border border-border/50">
                  <div className={cn("p-2 rounded-lg", stat.bg)}>
                    <stat.icon className={cn("h-4 w-4", stat.color)} />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground font-medium">{stat.label}</p>
                    <p className="font-bold text-sm">{stat.value}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Plans grid */}
        <div>
          <h2 className="text-lg font-bold mb-4">Escolha seu plano</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {plans.map((plan, i) => {
              const isCurrentPlan = currentPlanId === plan.id || (isActive && plan.id === 'pro');
              const PlanIcon = plan.icon;
              return (
                <motion.div
                  key={plan.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, type: 'spring', stiffness: 300, damping: 25 }}
                  whileHover={{ y: -4 }}
                >
                <Card
                  className={cn(
                    "relative overflow-hidden transition-all duration-300 border-0",
                    plan.popular
                      ? "ring-2 ring-primary/40 shadow-xl shadow-primary/10 bg-gradient-to-b from-primary/10 via-primary/3 to-transparent"
                      : "bg-gradient-to-b from-muted/30 to-transparent ring-1 ring-border/50",
                    isCurrentPlan && 'ring-2 ring-primary/50'
                  )}
                >
                  {plan.popular && (
                    <div className="absolute -top-px left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-primary to-transparent" />
                  )}

                  <CardContent className="p-5 pt-6">
                    {plan.popular && (
                      <Badge className="absolute top-3 right-3 bg-primary text-primary-foreground text-[10px]">
                        Mais popular
                      </Badge>
                    )}

                    <div className="mb-5">
                      <div className={cn("inline-flex p-2.5 rounded-xl mb-3", plan.popular ? 'bg-primary/15' : 'bg-muted/50')}>
                        <PlanIcon className={cn("h-5 w-5", plan.popular ? 'text-primary' : 'text-muted-foreground')} />
                      </div>
                      <h3 className="text-lg font-bold">{plan.name}</h3>
                      <p className="text-xs text-muted-foreground">{plan.tagline}</p>
                    </div>

                    <div className="mb-5">
                      <div className="flex items-baseline gap-1">
                        <span className="text-sm text-muted-foreground">R$</span>
                        <span className="text-3xl font-extrabold tracking-tight">{plan.monthlyPrice}</span>
                        <span className="text-sm text-muted-foreground">/mês</span>
                      </div>
                    </div>

                    <ul className="space-y-2 mb-5">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex items-center gap-2 text-sm">
                          <div className={cn("p-0.5 rounded-full", plan.popular ? 'bg-primary/15' : 'bg-muted/50')}>
                            <Check className={cn("h-3 w-3", plan.popular ? 'text-primary' : 'text-muted-foreground')} />
                          </div>
                          <span className="text-muted-foreground text-xs">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    <Button
                      className={cn(
                        "w-full h-10 font-semibold text-sm gap-2 transition-all",
                        isCurrentPlan && "bg-muted text-muted-foreground",
                        !isCurrentPlan && plan.popular && "gradient-primary shadow-md hover:shadow-lg",
                      )}
                      variant={isCurrentPlan ? 'secondary' : plan.popular ? 'default' : 'outline'}
                      disabled={isCurrentPlan}
                      asChild={!isCurrentPlan}
                    >
                      {isCurrentPlan ? (
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          Plano atual
                        </span>
                      ) : (
                        <a href={checkoutUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                          Assinar agora
                          <ArrowRight className="h-4 w-4" />
                        </a>
                      )}
                    </Button>
                  </CardContent>
                </Card>
                </motion.div>
              );
            })}
          </div>
          <p className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/50 mt-4">
            <Shield className="h-3 w-3" />
            Pagamento seguro via Cakto • Cancele quando quiser
          </p>
        </div>

        {/* Payment History */}
        {paymentHistory.length > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Receipt className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-base">Histórico de Pagamentos</CardTitle>
                  <CardDescription className="text-xs">Eventos via webhook Cakto</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                {paymentHistory.map((event) => {
                  const eventInfo = EVENT_LABELS[event.event_type] || { label: event.event_type, color: 'text-muted-foreground', icon: Clock };
                  const EventIcon = eventInfo.icon;
                  return (
                    <div key={event.id} className="flex items-center justify-between p-3 rounded-xl border border-border/30 bg-muted/20 hover:bg-muted/40 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="p-1.5 rounded-lg bg-background">
                          <EventIcon className={cn("h-3.5 w-3.5", eventInfo.color)} />
                        </div>
                        <div>
                          <p className="text-sm font-medium">{eventInfo.label}</p>
                          {event.product_name && <p className="text-[11px] text-muted-foreground">{event.product_name}</p>}
                        </div>
                      </div>
                      <div className="text-right">
                        {event.amount > 0 && <p className="text-sm font-bold">R$ {(event.amount / 100).toFixed(2)}</p>}
                        <p className="text-[10px] text-muted-foreground">{format(new Date(event.created_at), "dd/MM/yyyy HH:mm")}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Webhook Config */}
        <Card className="border-dashed border-border/40">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground/60" />
              <CardTitle className="text-xs text-muted-foreground/60 font-medium">Integração Cakto (Admin)</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-[10px] text-muted-foreground/60">URL do Webhook</p>
              <div className="flex items-center gap-2 mt-1">
                <code className="flex-1 text-[11px] bg-muted/50 p-2.5 rounded-lg font-mono break-all select-all text-muted-foreground">{webhookUrl}</code>
                <Button variant="ghost" size="sm" onClick={() => copyToClipboard(webhookUrl)} className="gap-1.5 shrink-0 h-8 text-xs">
                  <Copy className="h-3 w-3" />Copiar
                </Button>
              </div>
            </div>
            <details className="group">
              <summary className="text-[11px] text-muted-foreground/50 cursor-pointer hover:text-muted-foreground transition-colors list-none flex items-center gap-1">
                <ArrowRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                Como configurar
              </summary>
              <ol className="text-[11px] text-muted-foreground/60 space-y-1 list-decimal list-inside mt-2 pl-4">
                <li>Acesse Cakto → Integrações → Webhooks</li>
                <li>Cole a URL acima como endpoint</li>
                <li>Selecione: purchase_approved, subscription_created, subscription_canceled, refund</li>
                <li>Nomes dos produtos devem conter "Starter", "Pro" ou "Enterprise"</li>
                <li>O email do cliente deve ser o mesmo do cadastro</li>
              </ol>
            </details>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

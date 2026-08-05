import { ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useSubscription } from '@/hooks/use-subscription';
import { useAdminRole } from '@/hooks/use-admin';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Crown, AlertTriangle, CreditCard, ExternalLink, Check, Shield } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import logoImg from '@/assets/logo.webp';

const CAKTO_CHECKOUT_URL = 'https://pay.cakto.com.br/o5dfn8a_827823';

const plan = {
  name: 'Profissional',
  price: 97,
  features: [
    '3 chips WhatsApp',
    'Todos os extratores',
    'Agente SDR ativo',
    'Google Maps + Radar CNPJ',
    'Leads ilimitados',
    'Relatórios avançados',
    'Anti-Ban inteligente',
    'Suporte prioritário',
  ],
};

interface SubscriptionGuardProps {
  children: ReactNode;
}

export function SubscriptionGuard({ children }: SubscriptionGuardProps) {
  const { subscription, isLoading } = useSubscription();
  const { isAdmin, isLoading: isLoadingAdmin } = useAdminRole();
  const { user } = useAuth();
  const location = useLocation();

  // These routes are always accessible without subscription
  const ALWAYS_ACCESSIBLE = ['/dashboard', '/tutorial', '/billing', '/settings', '/support', '/admin'];
  const isAccessibleRoute = ALWAYS_ACCESSIBLE.some(route => location.pathname.startsWith(route));

  if (isLoading || isLoadingAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <img src={logoImg} alt="Logo" className="h-16 w-auto animate-pulse" width={64} height={64} />
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <p className="text-muted-foreground">Verificando assinatura...</p>
        </div>
      </div>
    );
  }

  // Admin não passa por paywall — mesma regra do backend em requirePaidPlan().
  const isActive = subscription?.status === 'active' || isAdmin;

  if (isActive || isAccessibleRoute) {
    return <>{children}</>;
  }

  const getCheckoutUrl = () => {
    const email = user?.email;
    if (email) {
      const separator = CAKTO_CHECKOUT_URL.includes('?') ? '&' : '?';
      return `${CAKTO_CHECKOUT_URL}${separator}email=${encodeURIComponent(email)}`;
    }
    return CAKTO_CHECKOUT_URL;
  };

  const isExpired = subscription?.status === 'canceled' || subscription?.status === 'past_due' || subscription?.status === 'refunded' || subscription?.status === 'chargeback';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6 animate-fade-in">
        {/* Header */}
        <div className="text-center space-y-3">
          <img src={logoImg} alt="Logo" className="h-14 w-auto mx-auto" width={56} height={56} />
          <div className="flex items-center justify-center gap-2">
            <AlertTriangle className="h-6 w-6 text-brand" />
            <h1 className="text-2xl font-bold tracking-tight">
              {isExpired ? 'Seu plano expirou' : 'Assine para acessar'}
            </h1>
          </div>
          <p className="text-muted-foreground max-w-md mx-auto">
            {isExpired
              ? 'Sua assinatura não está mais ativa. Renove agora para recuperar o acesso completo.'
              : 'Para utilizar a plataforma, assine o plano e comece a prospectar agora mesmo.'
            }
          </p>
          {subscription?.status && (
            <Badge variant="destructive" className="text-xs">
              Status: {subscription.status === 'canceled' ? 'Cancelado' : subscription.status === 'past_due' ? 'Pagamento pendente' : subscription.status === 'refunded' ? 'Reembolsado' : subscription.status}
            </Badge>
          )}
        </div>

        {/* Single Plan */}
        <Card className="relative transition-all border-primary ring-2 ring-primary/20 shadow-xl">
          <CardHeader className="text-center pt-6 pb-2">
            <div className="mx-auto p-2.5 rounded-xl bg-primary/10 w-fit mb-2">
              <Crown className="h-5 w-5 text-primary" />
            </div>
            <CardTitle className="text-lg">{plan.name}</CardTitle>
            <div className="flex items-baseline justify-center gap-1 mt-1">
              <span className="text-2xl font-bold">R$ {plan.price}</span>
              <span className="text-muted-foreground text-sm">/mês</span>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm">
                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              className="w-full gradient-primary shadow-md"
              asChild
            >
              <a href={getCheckoutUrl()} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
                <CreditCard className="h-4 w-4" />
                Assinar agora
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
            <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground">
              <Shield className="h-3 w-3" />
              Pagamento seguro via Cakto
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Após o pagamento, seu acesso será liberado automaticamente em segundos.
        </p>
      </div>
    </div>
  );
}

import { useSubscription } from '@/hooks/use-subscription';
import { useAdminRole } from '@/hooks/use-admin';

/**
 * O produto vende um plano só: Profissional, R$97/mês.
 *
 * O modelo anterior tinha quatro faixas (free/starter/pro/enterprise) com
 * limites diferentes de chips e features — sobra de uma versão que não
 * existe mais. Na prática todo assinante caía em `pro`, e as faixas
 * `starter`/`enterprise` nunca eram atribuídas por ninguém.
 *
 * IMPORTANTE: isto aqui é conveniência de interface, não segurança. Quem
 * barra de verdade é `requirePaidPlan()` nas edge functions — o navegador é
 * do usuário e qualquer checagem feita aqui pode ser contornada.
 */
export type Feature =
  | 'whatsapp_chips'
  | 'sdr_agent'
  | 'api_access'
  | 'advanced_reports'
  | 'all_extractors'
  | 'multiple_funnels'
  | 'scheduled_prospecting'
  | 'ab_testing';

const PRO_FEATURES: Feature[] = [
  'whatsapp_chips',
  'sdr_agent',
  'api_access',
  'advanced_reports',
  'all_extractors',
  'multiple_funnels',
  'scheduled_prospecting',
  'ab_testing',
];

export const PLAN = {
  id: 'pro',
  name: 'Profissional',
  price: 97,
  chips: 3,
  features: PRO_FEATURES,
} as const;

export function usePlanGuard() {
  const { subscription, isActive, isLoading } = useSubscription();
  const { isAdmin, isLoading: isLoadingAdmin } = useAdminRole();

  // Admin usa a plataforma inteira sem precisar assinar o próprio produto.
  const hasAccess = isActive || isAdmin;

  const canUse = (_feature: Feature): boolean => hasAccess;

  return {
    currentPlan: hasAccess ? PLAN.id : 'free',
    planName: hasAccess ? PLAN.name : 'Sem assinatura',
    price: PLAN.price,
    isActive: hasAccess,
    isLoading: isLoading || isLoadingAdmin,
    canUse,
    maxChips: hasAccess ? PLAN.chips : 0,
    status: subscription?.status ?? null,
    limits: {
      chips: hasAccess ? PLAN.chips : 0,
      features: hasAccess ? PRO_FEATURES : [],
    },
  };
}

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, subDays } from 'date-fns';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardMetrics } from '@/hooks/use-dashboard-metrics';
import { useActivityLog } from '@/hooks/use-activity-log';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useLeads } from '@/hooks/use-leads';
import { OnboardingWizard } from '@/components/onboarding/OnboardingWizard';
import { WelcomeCard } from '@/components/dashboard/WelcomeCard';
import { KPICard } from '@/components/dashboard/KPICard';
import { PeriodFilter } from '@/components/dashboard/PeriodFilter';
import { ProspectionChart } from '@/components/dashboard/ProspectionChart';
import { ConversionFunnelChart } from '@/components/dashboard/ConversionFunnelChart';
import { RecentActivity } from '@/components/dashboard/RecentActivity';
import { RecentLeadsTable } from '@/components/dashboard/RecentLeadsTable';
import { HandoffQueue } from '@/components/dashboard/HandoffQueue';
import {
  Users,
  TrendingUp,
  MessageSquare,
  Send,
  Flame,
  Target,
  Wifi,
  ArrowRight,
  X,
} from 'lucide-react';

export default function DashboardPage() {
  const { data: metrics, isLoading: metricsLoading } = useDashboardMetrics();
  const { activities, isLoading: activitiesLoading } = useActivityLog(10);
  const { settings } = useUserSettings();
  const { leads } = useLeads();
  const [period, setPeriod] = useState('30d');
  const [bannerDismissed, setBannerDismissed] = useState(
    () => localStorage.getItem('nexaprospect-banner-dismissed-v1') === 'true'
  );

  const funnelStages = useMemo(
    () => Object.entries(metrics?.leadsByStage || {}),
    [metrics?.leadsByStage]
  );
  const totalFunnelLeads = funnelStages.reduce((acc, [, count]) => acc + count, 0);

  const chartData = useMemo(() => {
    if (!metrics?.leadsByDate) return [];
    const days = period === 'today' ? 1 : period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const cutoff = format(subDays(new Date(), days), 'yyyy-MM-dd');
    return Object.entries(metrics.leadsByDate)
      .filter(([date]) => date >= cutoff)
      .map(([date, leads]) => ({ date: format(new Date(date + 'T12:00:00'), 'dd/MM'), leads }));
  }, [period, metrics]);

  const nextStep = useMemo(() => {
    if (!settings?.whatsapp_connected)
      return { icon: Wifi, title: 'Conecte seu WhatsApp', desc: 'Ative envios automáticos e o Agente SDR', path: '/settings/connections' };
    if ((metrics?.totalLeads || 0) === 0)
      return { icon: Target, title: 'Capture seus primeiros leads', desc: 'Busque no Google Maps, Instagram ou Facebook', path: '/prospecting' };
    if ((metrics?.hotLeads || 0) > 0)
      return { icon: Flame, title: `${metrics?.hotLeads} leads quentes esperando resposta`, desc: 'Responda agora para aumentar conversões', path: '/crm/inbox' };
    return null;
  }, [settings?.whatsapp_connected, metrics?.totalLeads, metrics?.hotLeads]);

  const showNextStep = nextStep && !bannerDismissed;

  const dismissBanner = () => {
    setBannerDismissed(true);
    localStorage.setItem('nexaprospect-banner-dismissed-v1', 'true');
  };

  if (metricsLoading && !metrics) {
    return (
      <DashboardLayout title="Dashboard">
        <div className="space-y-6">
          <Skeleton className="h-40 rounded-2xl skeleton-wave" />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl skeleton-wave" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl skeleton-wave" />
        </div>
      </DashboardLayout>
    );
  }

  const totalLeads = metrics?.totalLeads || 0;
  const wonLeads = metrics?.leadsByStage?.['Ganho'] || 0;
  const contactedLeads = metrics?.leadsByStage?.['Contato'] || 0;

  return (
    <DashboardLayout
      title="Dashboard"
      description="Onde a operação está agora, e o que fazer em seguida."
    >
      <OnboardingWizard />

      <WelcomeCard
        userName={settings?.agent_name}
        totalLeads={totalLeads}
        whatsappConnected={!!settings?.whatsapp_connected}
      />

      {/* Next Step Banner */}
      {showNextStep && (
        <div className="mb-8 relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/[0.08] via-primary/[0.04] to-transparent p-4 sm:p-5">
          <div className="flex items-center gap-4">
            <div className="h-11 w-11 shrink-0 rounded-xl bg-primary/15 flex items-center justify-center">
              <nextStep.icon className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold">{nextStep.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{nextStep.desc}</p>
            </div>
            <Button size="sm" asChild className="gradient-primary shrink-0 shadow-md shadow-primary/20">
              <Link to={nextStep.path}>Fazer agora <ArrowRight className="h-3 w-3 ml-1" /></Link>
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={dismissBanner} aria-label="Fechar">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Visão Geral */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-bold tracking-tight">Visão Geral</h2>
        <PeriodFilter value={period} onChange={setPeriod} />
      </div>

      <div className="stagger mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* `change` só aparece quando existe medição real. Dois destes
            cartões mostravam +125% e +12% escritos no código — número
            inventado apresentado como crescimento medido. */}
        <KPICard
          icon={<Users className="h-4 w-4" />}
          label="Total de Leads"
          value={totalLeads}
          change={
            metrics?.leadsThisMonth
              ? Math.round((metrics.leadsThisMonth / Math.max(totalLeads - metrics.leadsThisMonth, 1)) * 100)
              : undefined
          }
          changeLabel={`+${metrics?.leadsThisMonth || 0} este mês`}
          tone="primary"
          delay={0}
        />
        <KPICard
          icon={<Send className="h-4 w-4" />}
          label="Leads Contatados"
          value={contactedLeads}
          changeLabel={`${contactedLeads} de ${totalLeads} leads`}
          tone="info"
          delay={50}
        />
        <KPICard
          icon={<MessageSquare className="h-4 w-4" />}
          label="Taxa de Conversão"
          value={`${metrics?.conversionRate?.toFixed(1) || '0.0'}%`}
          changeLabel={`${wonLeads} fechados`}
          tone="success"
          delay={100}
        />
        <KPICard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Negócios Ganhos"
          value={wonLeads}
          changeLabel={`+${wonLeads} este mês`}
          tone="brand"
          delay={150}
        />
      </div>

      {/* Leads em que a IA saiu de cena e alguém precisa entrar — fica
          acima dos gráficos porque é a única coisa aqui que custa dinheiro
          a cada minuto parada. */}
      <div className="mb-4">
        <HandoffQueue />
      </div>

      {/* 4-column grid: chart, funnel, activity, leads */}
      <div className="stagger grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <ProspectionChart data={chartData} />
        <ConversionFunnelChart stages={funnelStages} totalLeads={totalFunnelLeads} />
        <RecentActivity activities={activities} isLoading={activitiesLoading} />
        <RecentLeadsTable leads={leads} />
      </div>
    </DashboardLayout>
  );
}

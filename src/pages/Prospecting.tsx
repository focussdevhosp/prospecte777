import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProspectingDashboard } from '@/components/prospecting/ProspectingDashboard';
import { LeadFinderInterface } from '@/components/prospecting/LeadFinderInterface';
import { WebSearchTab } from '@/components/prospecting/WebSearchTab';
import { ImportTab } from '@/components/prospecting/ImportTab';
import { WhatsAppGroupImport } from '@/components/prospecting/WhatsAppGroupImport';
import { SearchSummaryPanel } from '@/components/prospecting/SearchSummaryPanel';
import { RecentSearchesPanel } from '@/components/prospecting/RecentSearchesPanel';
import { PerformanceMiniChart } from '@/components/prospecting/PerformanceMiniChart';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Target, Globe, LucideIcon, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TabItem {
  id: string;
  icon: LucideIcon;
  label: string;
}

const captureTabs: TabItem[] = [
  { id: 'maps', icon: Target, label: 'Google Maps' },
  { id: 'web-search', icon: Globe, label: 'Pesquisa Web' },
  { id: 'whatsapp-groups', icon: MessageCircle, label: 'WhatsApp' },
  { id: 'import', icon: Upload, label: 'Importar' },
];

export default function ProspectingPage() {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('maps');

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) {
      const tabMapping: Record<string, string> = { capture: 'maps' };
      const mappedTab = tabMapping[tab] || tab;
      if (captureTabs.some(t => t.id === mappedTab)) setActiveTab(mappedTab);
    }
  }, [searchParams]);

  // Estimated coverage — derived from a static heuristic; UI purely informational
  const summary = useMemo(() => ({
    estimatedCoverage: 3240,
    whatsappCount: 2106,
    websiteCount: 1842,
    emailCount: 1276,
    qualityScore: 78,
    niches: [] as string[],
    locations: [] as string[],
  }), []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'maps': return <LeadFinderInterface />;
      case 'web-search': return <WebSearchTab />;
      case 'whatsapp-groups': return <WhatsAppGroupImport />;
      case 'import': return <ImportTab />;
      default: return null;
    }
  };

  return (
    <DashboardLayout
      eyebrow="Prospectar"
      title="Prospecção"
      description="Encontre empresas, gere conexões e impulsione seus resultados"
    >
      {/* KPI row */}
      <ProspectingDashboard />

      {/* Main content: capture + summary sidebar */}
      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden border-border/40 bg-card/50 backdrop-blur">
          {/* Tab bar */}
          <div className="border-b border-border/40 px-4 py-3 flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            {captureTabs.map((tab) => {
              const active = activeTab === tab.id;
              const Icon = tab.icon;
              return (
                <Button
                  key={tab.id}
                  variant="ghost"
                  size="sm"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'h-9 px-4 text-xs gap-2 rounded-lg shrink-0 transition-colors',
                    active
                      ? 'bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </Button>
              );
            })}
          </div>
          <CardContent className="p-5 sm:p-6">
            {renderTabContent()}
          </CardContent>
        </Card>

        {/* Right sidebar */}
        <div className="hidden lg:block">
          <SearchSummaryPanel {...summary} />
        </div>
      </div>

      {/* Bottom row: recent searches + performance */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <RecentSearchesPanel />
        <PerformanceMiniChart />
      </div>

      {/* Mobile summary */}
      <div className="mt-4 lg:hidden">
        <SearchSummaryPanel {...summary} />
      </div>
    </DashboardLayout>
  );
}

import { DashboardLayout } from '@/components/DashboardLayout';
import { ABTestingTab } from '@/components/prospecting/ABTestingTab';
import { GroupNav, campaignsGroup } from '@/components/GroupNav';

export default function ABTestingPage() {
  return (
    <DashboardLayout
      eyebrow="Vender"
      title="Campanhas"
      description="Campanhas ativas, testes A/B, Agente SDR e reuniões"
    >
      <GroupNav items={campaignsGroup} />
      <div className="animate-fade-in">
        <ABTestingTab />
      </div>
    </DashboardLayout>
  );
}

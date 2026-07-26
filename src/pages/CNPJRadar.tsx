import { DashboardLayout } from '@/components/DashboardLayout';
import { CNPJRadarTab } from '@/components/prospecting/CNPJRadarTab';
import { GroupNav, prospectGroup } from '@/components/GroupNav';

export default function CNPJRadarPage() {
  return (
    <DashboardLayout
      title="Prospectar"
      description="Ferramentas de captação e enriquecimento de leads"
    >
      <GroupNav items={prospectGroup} />
      <div className="animate-fade-in">
        <CNPJRadarTab />
      </div>
    </DashboardLayout>
  );
}

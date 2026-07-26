import { DashboardLayout } from '@/components/DashboardLayout';
import { EmailFinderTab } from '@/components/prospecting/EmailFinderTab';
import { GroupNav, prospectGroup } from '@/components/GroupNav';

export default function EmailFinderPage() {
  return (
    <DashboardLayout
      title="Prospectar"
      description="Ferramentas de captação e enriquecimento de leads"
    >
      <GroupNav items={prospectGroup} />
      <div className="animate-fade-in">
        <EmailFinderTab />
      </div>
    </DashboardLayout>
  );
}

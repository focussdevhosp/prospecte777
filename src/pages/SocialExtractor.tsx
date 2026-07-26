import { DashboardLayout } from '@/components/DashboardLayout';
import { SocialExtractorTab } from '@/components/prospecting/SocialExtractorTab';
import { GroupNav, prospectGroup } from '@/components/GroupNav';

export default function SocialExtractorPage() {
  return (
    <DashboardLayout
      title="Prospectar"
      description="Ferramentas de captação e enriquecimento de leads"
    >
      <GroupNav items={prospectGroup} />
      <div className="animate-fade-in">
        <SocialExtractorTab />
      </div>
    </DashboardLayout>
  );
}

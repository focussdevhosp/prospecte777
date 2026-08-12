import { DashboardLayout } from '@/components/DashboardLayout';
import { ScheduledProspectingTab } from '@/components/prospecting/ScheduledProspectingTab';

export default function ScheduledProspectingPage() {
  return (
    <DashboardLayout
      eyebrow="Prospectar"
      title="Prospecção Agendada"
      description="Configure capturas automáticas de leads"
    >
      <div className="animate-fade-in">
        <ScheduledProspectingTab />
      </div>
    </DashboardLayout>
  );
}

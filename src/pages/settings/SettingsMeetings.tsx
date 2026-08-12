import { MeetingSettings } from '@/components/settings/MeetingSettings';
import { Calendar } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

export default function SettingsMeetings() {
  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-4xl mx-auto page-enter">
      <PageHeader
        eyebrow="Ajustes"
        title="Reuniões"
        description="Configure links de reunião e integração com Google Meet"
        icon={<Calendar className="h-5 w-5" />}
        className="mb-0"
      />

      <MeetingSettings />
    </div>
  );
}

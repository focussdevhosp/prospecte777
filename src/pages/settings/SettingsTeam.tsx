import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TeamSettings } from '@/components/settings/TeamSettings';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

export default function SettingsTeam() {
  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-4xl mx-auto page-enter">
      <PageHeader
        eyebrow="Ajustes"
        title="Equipe"
        description="Gerencie membros e permissões da sua equipe"
        icon={<Users className="h-5 w-5" />}
        className="mb-0"
      />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Membros da Equipe</CardTitle>
          <CardDescription>Adicione e gerencie quem tem acesso à plataforma</CardDescription>
        </CardHeader>
        <CardContent>
          <TeamSettings />
        </CardContent>
      </Card>
    </div>
  );
}

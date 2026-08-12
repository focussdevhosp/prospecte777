import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ReportExportSettings } from '@/components/settings/ReportExportSettings';
import { Download } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

export default function SettingsReports() {
  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-4xl mx-auto page-enter">
      <PageHeader
        eyebrow="Ajustes"
        title="Relatórios"
        description="Exporte dados e configure relatórios automáticos"
        icon={<Download className="h-5 w-5" />}
        className="mb-0"
      />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Exportar Dados</CardTitle>
          <CardDescription>Gere relatórios detalhados das suas campanhas e leads</CardDescription>
        </CardHeader>
        <CardContent>
          <ReportExportSettings />
        </CardContent>
      </Card>
    </div>
  );
}

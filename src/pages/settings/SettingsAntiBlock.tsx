import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AntiBlockSettings } from '@/components/settings/AntiBlockSettings';
import { Shield } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

export default function SettingsAntiBlock() {
  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-4xl mx-auto page-enter">
      <PageHeader
        eyebrow="Ajustes"
        title="Proteção Anti-Bloqueio"
        description="Configure limites e intervalos para evitar banimento"
        icon={<Shield className="h-5 w-5" />}
        className="mb-0"
      />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Configurações de Proteção</CardTitle>
          <CardDescription>
            Ajuste limites de envio, intervalos e comportamento anti-ban para manter seu chip seguro
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AntiBlockSettings />
        </CardContent>
      </Card>
    </div>
  );
}

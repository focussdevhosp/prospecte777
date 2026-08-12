import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { NotificationSettings } from '@/components/settings/NotificationSettings';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useAuth } from '@/lib/auth';
import { Bell, Mail } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';

export default function SettingsNotifications() {
  const { settings, updateSettings } = useUserSettings();
  const { user } = useAuth();

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-4xl mx-auto page-enter">
      <PageHeader
        eyebrow="Ajustes"
        title="Notificações"
        description="Configure alertas e relatórios automáticos"
        icon={<Bell className="h-5 w-5" />}
        className="mb-0"
      />

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Alertas em Tempo Real</CardTitle>
          <CardDescription>Receba notificações sobre eventos importantes</CardDescription>
        </CardHeader>
        <CardContent>
          <NotificationSettings />
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            Relatório Diário
          </CardTitle>
          <CardDescription>Receba um resumo da prospecção por email todo dia</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-sm font-medium">Ativar relatório diário</Label>
              <p className="text-xs text-muted-foreground mt-0.5">Enviado todo dia às 8h no seu email</p>
            </div>
            <Switch
              checked={settings?.daily_report_enabled || false}
              onCheckedChange={(v) => updateSettings({ daily_report_enabled: v })}
            />
          </div>
          {settings?.daily_report_enabled && (
            <div className="p-3.5 bg-primary/5 border border-primary/10 rounded-lg text-sm text-muted-foreground">
              ✉️ Relatório ativo — você receberá um email diário em <strong className="text-foreground">{user?.email}</strong> com métricas de prospecção, leads novos e atividades do dia anterior.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

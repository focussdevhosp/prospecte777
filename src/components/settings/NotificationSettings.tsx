import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { usePushNotifications } from '@/hooks/use-push-notifications';
import { Bell, BellOff, BellRing, Check, AlertCircle } from 'lucide-react';

export function NotificationSettings() {
  const { 
    isSupported, 
    permission, 
    requestPermission,
  } = usePushNotifications();

  const [testSent, setTestSent] = useState(false);

  const handleEnableNotifications = async () => {
    await requestPermission();
  };

  const handleTestNotification = () => {
    if (permission === 'granted') {
      new Notification('🧪 Teste de notificação', {
        body: 'As notificações estão funcionando corretamente!',
        icon: '/favicon.ico',
      });
      setTestSent(true);
      setTimeout(() => setTestSent(false), 3000);
    }
  };

  const getPermissionStatus = () => {
    switch (permission) {
      case 'granted':
        return { icon: Check, text: 'Ativadas', variant: 'default' as const, color: 'text-success' };
      case 'denied':
        return { icon: BellOff, text: 'Bloqueadas', variant: 'destructive' as const, color: 'text-destructive' };
      default:
        return { icon: Bell, text: 'Não configuradas', variant: 'secondary' as const, color: 'text-muted-foreground' };
    }
  };

  const status = getPermissionStatus();
  const StatusIcon = status.icon;

  if (!isSupported) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BellOff className="h-5 w-5" />
            Notificações Push
          </CardTitle>
          <CardDescription>
            Receba alertas mesmo com o navegador fechado
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertCircle className="h-4 w-4" />
            <span>Seu navegador não suporta notificações push.</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5" />
              Notificações Push
            </CardTitle>
            <CardDescription>
              Receba alertas quando tarefas terminarem ou leads responderem
            </CardDescription>
          </div>
          <Badge variant={status.variant} className="flex items-center gap-1">
            <StatusIcon className={`h-3 w-3 ${status.color}`} />
            {status.text}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {permission !== 'granted' ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Ative as notificações para receber alertas importantes:
            </p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Quando tarefas em segundo plano terminarem</li>
              <li>Quando leads responderem mensagens</li>
              <li>Lembretes de follow-up</li>
            </ul>
            {permission === 'denied' ? (
              <div className="p-3 bg-destructive/10 rounded-lg text-sm">
                <p className="font-medium text-destructive mb-1">Notificações bloqueadas</p>
                <p className="text-muted-foreground">
                  Para reativar, clique no cadeado na barra de endereço do navegador 
                  e altere a permissão de notificações para "Permitir".
                </p>
              </div>
            ) : (
              <Button onClick={handleEnableNotifications} className="w-full">
                <Bell className="h-4 w-4 mr-2" />
                Ativar Notificações
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Tarefas em segundo plano</Label>
                <p className="text-xs text-muted-foreground">
                  Alertar quando envios ou prospecções terminarem
                </p>
              </div>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Respostas de leads</Label>
                <p className="text-xs text-muted-foreground">
                  Alertar quando um lead responder
                </p>
              </div>
              <Switch defaultChecked />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Lembretes de follow-up</Label>
                <p className="text-xs text-muted-foreground">
                  Alertar quando for hora de fazer follow-up
                </p>
              </div>
              <Switch defaultChecked />
            </div>

            <div className="pt-2 border-t">
              <Button 
                variant="outline" 
                onClick={handleTestNotification}
                disabled={testSent}
                className="w-full"
              >
                {testSent ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    Notificação enviada!
                  </>
                ) : (
                  <>
                    <Bell className="h-4 w-4 mr-2" />
                    Enviar notificação de teste
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

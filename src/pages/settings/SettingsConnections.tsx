import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAdminRole } from '@/hooks/use-admin';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WhatsAppConnection } from '@/components/WhatsAppConnection';
import { MultiChipSettings } from '@/components/settings/MultiChipSettings';
import { useUserSettings } from '@/hooks/use-user-settings';
import { MessageSquare, Loader2, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { PageHeader } from '@/components/PageHeader';

export default function SettingsConnections() {
  const { settings, isLoading } = useUserSettings();
  const { toast } = useToast();
  const { isAdmin } = useAdminRole();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isWhatsAppConnected = settings?.whatsapp_connected;

  return (
    <div className="p-6 sm:p-8 space-y-8 max-w-4xl mx-auto page-enter">
      {/* Page Header */}
      <PageHeader
        eyebrow="Ajustes"
        title="Conexões"
        description="Gerencie suas conexões WhatsApp e multi-chip"
        icon={<MessageSquare className="h-5 w-5" />}
        className="mb-0"
      />

      {/* Status Banner */}
      <div className={cn(
        "flex items-center gap-3 p-4 rounded-xl border transition-all",
        isWhatsAppConnected 
          ? "bg-success/5 border-success/20" 
          : "bg-destructive/5 border-destructive/20"
      )}>
        {isWhatsAppConnected ? (
          <Wifi className="h-5 w-5 text-success" />
        ) : (
          <WifiOff className="h-5 w-5 text-destructive" />
        )}
        <div className="flex-1">
          <p className="text-sm font-medium">
            {isWhatsAppConnected ? 'WhatsApp conectado e pronto' : 'WhatsApp desconectado'}
          </p>
          <p className="text-xs text-muted-foreground">
            {isWhatsAppConnected 
              ? 'Seu chip está ativo e pronto para enviar mensagens'
              : 'Conecte seu WhatsApp para começar a prospectar'}
          </p>
        </div>
        <Badge className={cn(
          isWhatsAppConnected 
            ? "bg-success/10 text-success border-success/30 hover:bg-success/20" 
            : "bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20"
        )} variant="outline">
          {isWhatsAppConnected ? 'Online' : 'Offline'}
        </Badge>
      </div>

      {/* WhatsApp Connection */}
      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Conectar WhatsApp</CardTitle>
          <CardDescription>
            Escaneie o QR Code para vincular seu número
          </CardDescription>
        </CardHeader>
        <CardContent>
          <WhatsAppConnection />
        </CardContent>
      </Card>

      {/* Multi-Chip */}
      <MultiChipSettings />

    </div>
  );
}
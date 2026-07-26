import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useLeads } from '@/hooks/use-leads';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Flame,
  Clock,
  Users,
  Send,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Zap,
  MessageSquare,
} from 'lucide-react';

const REACTIVATION_TEMPLATES: Record<string, string> = {
  restaurantes: "Olá {nome_empresa}! Tudo bem por aí? 😊\n\nPassou um tempo desde nosso último contato. Tenho novidades que podem interessar vocês.\n\nTem interesse em saber mais?",
  clinicas: "Olá {nome_empresa}! Tudo bem? 😊\n\nFazem alguns meses desde nosso contato. Temos novidades que podem ajudar sua clínica.\n\nTem interesse em conhecer?",
  academias: "Fala {nome_empresa}! Tudo certo? 💪\n\nPassou um tempo do nosso contato. Temos algo novo que pode ajudar.\n\nTem interesse?",
  default: "Olá {nome_empresa}! Tudo bem? 😊\n\nPassou um tempo desde nosso contato. Tenho novidades que podem te interessar. Ainda faz sentido conversar?",
};

export default function ColdReactivationPage() {
  const { settings, updateSettings, isUpdating } = useUserSettings();
  const { leads } = useLeads();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [inactiveDays, setInactiveDays] = useState(20);
  const [maxPerRun, setMaxPerRun] = useState(10);
  const [customMessage, setCustomMessage] = useState('');
  const [selectedNiche, setSelectedNiche] = useState('default');

  const isEnabled = (settings as any)?.auto_reactivation_enabled || false;
  const isWhatsAppConnected = (settings as any)?.whatsapp_connected || false;

  const coldLeads = leads.filter(l => {
    if (!l.last_contact_at) return false;
    const daysSince = (Date.now() - new Date(l.last_contact_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince >= inactiveDays && ['Contato', 'Qualificado'].includes(l.stage);
  });

  const handleToggle = async (enabled: boolean) => {
    await updateSettings({ auto_reactivation_enabled: enabled } as any);
    toast({
      title: enabled ? '✅ Reativação automática ativada' : '⏸️ Reativação automática desativada',
      description: enabled ? 'Leads frios serão reativados automaticamente a cada ciclo.' : undefined,
    });
  };

  const handleManualRun = async () => {
    if (!isWhatsAppConnected) {
      toast({ title: 'WhatsApp não conectado', description: 'Conecte seu WhatsApp primeiro.', variant: 'destructive' });
      return;
    }
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke('cold-reactivation');
      if (error) throw error;
      toast({
        title: '✅ Reativação executada',
        description: `${data?.processed || 0} leads reativados com sucesso.`,
      });
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
    setRunning(false);
  };

  const templatePreview = customMessage || REACTIVATION_TEMPLATES[selectedNiche] || REACTIVATION_TEMPLATES.default;

  return (
    <DashboardLayout
      title="Disparos"
      description="Envie mensagens em massa, follow-ups e reative leads frios"
    >
      <GroupNav items={messagingGroup} />
      <div className="space-y-6 animate-fade-in">
        {/* Status Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-500/20">
                  <Flame className="h-5 w-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{coldLeads.length}</p>
                  <p className="text-xs text-muted-foreground">Leads frios</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-500/20">
                  <Clock className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{inactiveDays}+</p>
                  <p className="text-xs text-muted-foreground">Dias inativos</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-500/20">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{isEnabled ? 'Ativa' : 'Inativa'}</p>
                  <p className="text-xs text-muted-foreground">Automação</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{maxPerRun}</p>
                  <p className="text-xs text-muted-foreground">Máx por ciclo</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-500" />
                Configuração
              </CardTitle>
              <CardDescription>
                Defina quando e como reativar leads inativos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">Reativação automática</Label>
                  <p className="text-sm text-muted-foreground">Executar a cada ciclo do cron</p>
                </div>
                <Switch checked={isEnabled} onCheckedChange={handleToggle} disabled={isUpdating} />
              </div>

              <div className="space-y-3">
                <Label>Dias de inatividade mínima: {inactiveDays} dias</Label>
                <Slider
                  value={[inactiveDays]}
                  onValueChange={([v]) => setInactiveDays(v)}
                  min={7}
                  max={60}
                  step={1}
                />
                <p className="text-xs text-muted-foreground">
                  Leads sem contato há mais de {inactiveDays} dias serão considerados frios
                </p>
              </div>

              <div className="space-y-3">
                <Label>Máximo por execução: {maxPerRun} leads</Label>
                <Slider
                  value={[maxPerRun]}
                  onValueChange={([v]) => setMaxPerRun(v)}
                  min={1}
                  max={50}
                  step={1}
                />
              </div>

              <div className="space-y-2">
                <Label>Nicho do template</Label>
                <Select value={selectedNiche} onValueChange={setSelectedNiche}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="default">Genérico</SelectItem>
                    <SelectItem value="restaurantes">Restaurantes</SelectItem>
                    <SelectItem value="clinicas">Clínicas</SelectItem>
                    <SelectItem value="academias">Academias</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!isWhatsAppConnected && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  <p className="text-sm text-destructive">WhatsApp não conectado. Conecte primeiro nas configurações.</p>
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleManualRun}
                disabled={running || !isWhatsAppConnected || coldLeads.length === 0}
              >
                {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
                Executar Agora ({coldLeads.length} leads)
              </Button>
            </CardContent>
          </Card>

          {/* Preview */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Preview da Mensagem
              </CardTitle>
              <CardDescription>
                Mensagem que será enviada para leads frios
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 rounded-lg bg-muted/50 border whitespace-pre-wrap text-sm">
                {templatePreview.replace(/\{nome_empresa\}/g, 'Empresa Exemplo')}
              </div>

              <div className="space-y-2">
                <Label>Mensagem personalizada (opcional)</Label>
                <Textarea
                  placeholder="Deixe vazio para usar o template do nicho. Use {nome_empresa} para personalizar."
                  value={customMessage}
                  onChange={e => setCustomMessage(e.target.value)}
                  rows={4}
                />
                <p className="text-xs text-muted-foreground">
                  Variáveis disponíveis: {'{nome_empresa}'}
                </p>
              </div>

              <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
                <p className="text-sm font-medium mb-1">Como funciona:</p>
                <ul className="text-xs text-muted-foreground space-y-1">
                  <li>• Leads sem contato há {inactiveDays}+ dias são selecionados</li>
                  <li>• Mensagem personalizada é enviada via WhatsApp</li>
                  <li>• Após 3 tentativas sem resposta, lead é marcado como Perdido</li>
                  <li>• Follow-ups automáticos a cada 4 dias</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cold Leads Preview */}
        {coldLeads.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Leads Frios ({coldLeads.length})</CardTitle>
              <CardDescription>Leads sem contato há mais de {inactiveDays} dias</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 max-h-[300px] overflow-y-auto">
                {coldLeads.slice(0, 20).map(lead => {
                  const daysSince = Math.floor((Date.now() - new Date(lead.last_contact_at!).getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={lead.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                      <div>
                        <p className="text-sm font-medium">{lead.business_name}</p>
                        <p className="text-xs text-muted-foreground">{lead.niche} · {lead.location}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">{daysSince} dias</Badge>
                        <Badge variant="secondary">{lead.stage}</Badge>
                      </div>
                    </div>
                  );
                })}
                {coldLeads.length > 20 && (
                  <p className="text-center text-sm text-muted-foreground py-2">
                    + {coldLeads.length - 20} leads adicionais
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}

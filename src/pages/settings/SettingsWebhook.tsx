import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useToast } from '@/hooks/use-toast';
import { Webhook, Save, Code2, Send, Loader2, CheckCircle2, XCircle } from 'lucide-react';

export default function SettingsWebhook() {
  const { settings, updateSettings, isUpdating } = useUserSettings();
  const { toast } = useToast();
  const [webhookUrl, setWebhookUrl] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  useEffect(() => {
    if (settings) {
      setWebhookUrl(settings.webhook_url || '');
    }
  }, [settings]);

  const handleSave = () => {
    updateSettings({ webhook_url: webhookUrl });
    toast({ title: '✓ Webhook salvo' });
  };

  const handleTest = async () => {
    if (!webhookUrl.trim()) {
      toast({ title: 'URL vazia', description: 'Insira uma URL de webhook primeiro.', variant: 'destructive' });
      return;
    }

    setIsTesting(true);
    setTestResult(null);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'test',
          timestamp: new Date().toISOString(),
          data: {
            message: 'Teste de webhook do sistema de prospecção',
            source: 'webhook_settings',
          },
        }),
      });

      if (response.ok || response.status < 400) {
        setTestResult('success');
        toast({ title: '✓ Webhook funcionando!', description: `Status: ${response.status}` });
      } else {
        setTestResult('error');
        toast({ title: 'Webhook retornou erro', description: `Status: ${response.status}`, variant: 'destructive' });
      }
    } catch (err: any) {
      setTestResult('error');
      toast({
        title: 'Erro ao testar webhook',
        description: err.message?.includes('Failed to fetch') 
          ? 'Não foi possível conectar. Verifique a URL e CORS.'
          : err.message,
        variant: 'destructive',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const events = [
    { name: 'lead_created', desc: 'Novo lead capturado' },
    { name: 'message_sent', desc: 'Mensagem enviada' },
    { name: 'message_received', desc: 'Resposta recebida' },
    { name: 'meeting_scheduled', desc: 'Reunião agendada' },
    { name: 'lead_stage_changed', desc: 'Mudança de estágio' },
    { name: 'campaign_completed', desc: 'Campanha concluída' },
  ];

  return (
    <div className="p-8 space-y-8 max-w-4xl mx-auto">
      <div className="space-y-1">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Webhook className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Webhook</h1>
            <p className="text-sm text-muted-foreground">Receba eventos em tempo real no seu sistema externo</p>
          </div>
        </div>
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">URL do Webhook</CardTitle>
          <CardDescription>
            Integre com n8n, Zapier, Make ou qualquer sistema que aceite webhooks
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Endpoint URL</Label>
            <div className="flex gap-2">
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://seu-webhook.com/endpoint"
                className="flex-1 font-mono text-sm"
              />
              <Button onClick={handleSave} disabled={isUpdating} className="gap-2 shrink-0">
                <Save className="h-4 w-4" />
                Salvar
              </Button>
            </div>
          </div>

          {/* Test Button */}
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || !webhookUrl.trim()}
              className="gap-2"
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Testar Webhook
            </Button>
            {testResult === 'success' && (
              <div className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="h-4 w-4" />
                Webhook respondeu com sucesso
              </div>
            )}
            {testResult === 'error' && (
              <div className="flex items-center gap-1.5 text-sm text-destructive">
                <XCircle className="h-4 w-4" />
                Falha na conexão
              </div>
            )}
          </div>

          <div className="space-y-3">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <Code2 className="h-3 w-3" />
              Eventos Disponíveis
            </Label>
            <div className="grid gap-2 sm:grid-cols-3">
              {events.map((event) => (
                <div key={event.name} className="flex items-center gap-2 p-3 rounded-lg border bg-muted/30">
                  <Badge variant="outline" className="font-mono text-[10px] shrink-0">{event.name}</Badge>
                  <span className="text-xs text-muted-foreground truncate">{event.desc}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Payload Example */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Exemplo de Payload</Label>
            <pre className="p-4 rounded-lg bg-muted/50 border text-xs font-mono overflow-x-auto">
{JSON.stringify({
  event: "lead_created",
  timestamp: "2026-04-06T14:30:00Z",
  data: {
    lead_id: "uuid-do-lead",
    business_name: "Empresa Exemplo",
    phone: "11999998888",
    niche: "restaurantes",
  }
}, null, 2)}
            </pre>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

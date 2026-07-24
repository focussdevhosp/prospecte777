import { useState } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useLeads } from '@/hooks/use-leads';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Facebook, Shield, Loader2, Plug, Unplug, Download, Users,
  DollarSign, Target, TrendingUp, Copy, ExternalLink, Info,
} from 'lucide-react';
import { MetaTokenStatus } from '@/components/meta-ads/MetaTokenStatus';

export default function CRMMetaAdsPage() {
  const { settings, updateSettings } = useUserSettings();
  const { leads, createLead } = useLeads();
  const { toast } = useToast();
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [audienceName, setAudienceName] = useState('');
  const [audienceFilter, setAudienceFilter] = useState('all');

  const metaToken = (settings as any)?.meta_access_token;
  const isConnected = !!metaToken;

  const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID || 'oeztpxyprifabkvysroh';
  const webhookUrl = `https://${projectRef}.supabase.co/functions/v1/webhook`;

  const callMetaFn = async (action: string, payload: any = {}) => {
    const { data, error } = await supabase.functions.invoke('meta-ads', {
      body: { action, access_token: metaToken, ad_account_id: selectedAccount, payload },
    });
    if (error) throw error;
    return data;
  };

  const handleConnect = async () => {
    if (!tokenInput) return;
    await updateSettings({ meta_access_token: tokenInput } as any);
    setTokenInput('');
    toast({ title: 'Token salvo', description: 'Facebook Business conectado com sucesso.' });
  };

  const handleDisconnect = async () => {
    await updateSettings({ meta_access_token: null } as any);
    setCampaigns([]);
    setAccounts([]);
  };

  const loadAccounts = async () => {
    setLoading(true);
    try {
      const data = await callMetaFn('get_accounts');
      setAccounts(data?.data || []);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const loadCampaigns = async () => {
    if (!selectedAccount) return;
    setLoading(true);
    try {
      const data = await callMetaFn('get_campaigns');
      setCampaigns(data?.data || []);
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const createAudience = async () => {
    if (!audienceName || !selectedAccount) return;
    setLoading(true);
    try {
      let filteredLeads = leads;
      if (audienceFilter === 'hot') filteredLeads = leads.filter(l => l.temperature === 'quente');
      if (audienceFilter === 'won') filteredLeads = leads.filter(l => l.stage === 'Ganho');
      if (audienceFilter === 'active') filteredLeads = leads.filter(l => l.stage !== 'Perdido');

      const phones = filteredLeads.map(l => l.phone).filter(Boolean);
      if (phones.length === 0) { toast({ title: 'Nenhum lead', description: 'Nenhum lead com telefone encontrado.', variant: 'destructive' }); return; }

      const audience = await callMetaFn('create_custom_audience', { name: audienceName, description: `Audiência ${audienceFilter} — ${phones.length} contatos` });
      const audienceId = audience?.id;
      if (audienceId) {
        await callMetaFn('add_users_to_audience', { audience_id: audienceId, phones });
        toast({ title: 'Audiência criada!', description: `${phones.length} contatos adicionados.` });
      }
    } catch (e: any) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const metaLeadsCount = leads.filter(l => l.source === 'meta_lead_ads').length;

  return (
    <div className="p-6">
      {/* LGPD Alert */}
      <Alert className="mb-6 border-blue-500/30 bg-blue-500/5">
        <Shield className="h-4 w-4 text-blue-500" />
        <AlertTitle className="text-blue-600">Conformidade LGPD</AlertTitle>
        <AlertDescription className="text-sm">
          Os dados enviados ao Facebook são hasheados (SHA-256) antes do envio, conforme as diretrizes da LGPD e as políticas de dados da Meta. Apenas telefones públicos são compartilhados.
        </AlertDescription>
      </Alert>

      {isConnected && (
        <div className="mb-6">
          <MetaTokenStatus
            accessToken={metaToken}
            onReconnect={() => { void handleDisconnect(); }}
          />
        </div>
      )}

      {/* Connection */}
      <Card className="mb-6">
        <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Facebook className="h-4 w-4" />Conexão Facebook Business</CardTitle></CardHeader>
        <CardContent>
          {isConnected ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className="bg-green-500 text-white">Conectado</Badge>
                <Button variant="outline" size="sm" onClick={handleDisconnect}><Unplug className="h-4 w-4 mr-1" />Desconectar</Button>
                <Button variant="outline" size="sm" onClick={loadAccounts} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}Carregar Contas
                </Button>
              </div>
              {accounts.length > 0 && (
                <div className="flex items-center gap-2">
                  <Select value={selectedAccount} onValueChange={v => { setSelectedAccount(v); }}>
                    <SelectTrigger className="w-[250px]"><SelectValue placeholder="Selecionar conta" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.name} ({a.id})</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={loadCampaigns} disabled={!selectedAccount || loading}>Ver campanhas</Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Cole seu token de acesso do Facebook Business para conectar.</p>
              <div className="flex gap-2">
                <Input type="password" placeholder="Cole seu token aqui" value={tokenInput} onChange={e => setTokenInput(e.target.value)} />
                <Button onClick={handleConnect} disabled={!tokenInput}><Plug className="h-4 w-4 mr-1" />Conectar</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Obtenha seu token em{' '}
                <a href="https://developers.facebook.com/tools/explorer/" target="_blank" className="underline">Graph API Explorer</a>
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campaigns */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Campanhas Ativas</CardTitle></CardHeader>
          <CardContent>
            {campaigns.length === 0 ? (
              <p className="text-sm text-muted-foreground">{isConnected ? 'Selecione uma conta e carregue as campanhas.' : 'Conecte sua conta primeiro.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Campanha</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Objetivo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {campaigns.map((c: any) => (
                      <TableRow key={c.id}>
                        <TableCell className="text-sm font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={c.status === 'ACTIVE' ? 'text-green-600' : 'text-muted-foreground'}>{c.status}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">{c.objective}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Custom Audiences */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Criar Audiência Customizada</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select value={audienceFilter} onValueChange={setAudienceFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os leads (não perdidos)</SelectItem>
                <SelectItem value="hot">Leads quentes</SelectItem>
                <SelectItem value="won">Leads ganhos (Lookalike)</SelectItem>
                <SelectItem value="active">Leads ativos</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Nome da audiência" value={audienceName} onChange={e => setAudienceName(e.target.value)} />
            <Button className="w-full" onClick={createAudience} disabled={loading || !audienceName || !selectedAccount}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Facebook className="h-4 w-4 mr-1" />}
              Criar Audiência no Facebook
            </Button>
          </CardContent>
        </Card>

        {/* Webhook setup */}
        <Card>
          <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Info className="h-4 w-4" />Webhook de Captura Automática</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">URL do Webhook:</p>
              <div className="flex items-center gap-2">
                <Input value={webhookUrl} readOnly className="text-xs" />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText(webhookUrl); toast({ title: 'Copiado!' }); }}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Token de Verificação:</p>
              <div className="flex items-center gap-2">
                <Input value="nexaprospect_meta_verify" readOnly className="text-xs" />
                <Button variant="outline" size="icon" onClick={() => { navigator.clipboard.writeText('nexaprospect_meta_verify'); toast({ title: 'Copiado!' }); }}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
            <Separator />
            <div className="text-xs text-muted-foreground space-y-1">
              <p className="font-medium">Instruções:</p>
              <ol className="list-decimal pl-4 space-y-0.5">
                <li>Acesse Meta Business Manager → Webhooks</li>
                <li>Adicione a URL acima</li>
                <li>Cole o token de verificação</li>
                <li>Selecione o evento: <code>leadgen</code></li>
                <li>Salve — os leads serão capturados automaticamente</li>
              </ol>
            </div>
          </CardContent>
        </Card>

        {/* KPIs */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Métricas Meta Ads</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-lg bg-muted">
                <p className="text-xl font-bold">{metaLeadsCount}</p>
                <p className="text-xs text-muted-foreground">Leads via Meta</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <p className="text-xl font-bold">{leads.filter(l => l.source === 'meta_lead_ads' && l.stage === 'Ganho').length}</p>
                <p className="text-xs text-muted-foreground">Convertidos</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <p className="text-xl font-bold">{metaLeadsCount > 0 ? Math.round((leads.filter(l => l.source === 'meta_lead_ads' && l.stage === 'Ganho').length / metaLeadsCount) * 100) : 0}%</p>
                <p className="text-xs text-muted-foreground">Conversão</p>
              </div>
              <div className="text-center p-3 rounded-lg bg-muted">
                <p className="text-xl font-bold">{campaigns.length}</p>
                <p className="text-xs text-muted-foreground">Campanhas</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

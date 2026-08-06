import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useUserSettings } from '@/hooks/use-user-settings';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';
import {
  Key,
  Eye,
  EyeOff,
  Check,
  Loader2,
  ExternalLink,
  Shield,
  Sparkles,
  Search,
  AlertCircle,
  Info,
  Mail,
  Zap,
  Bot,
} from 'lucide-react';

export function ApiKeysSettings() {
  const { user } = useAuth();
  const { settings, isLoading } = useUserSettings();
  const { toast } = useToast();

  const [serpApiKey, setSerpApiKey] = useState('');
  const [serperKey, setSerperKey] = useState('');
  const [hunterKey, setHunterKey] = useState('');
  const [apifyKey, setApifyKey] = useState('');
  const [preferredApi, setPreferredApi] = useState<'serper' | 'serpapi'>('serper');

  const [showSerpApi, setShowSerpApi] = useState(false);
  const [showSerper, setShowSerper] = useState(false);
  const [showHunter, setShowHunter] = useState(false);
  const [showApify, setShowApify] = useState(false);

  const [testingSerpApi, setTestingSerpApi] = useState(false);
  const [testingSerper, setTestingSerper] = useState(false);
  const [testingHunter, setTestingHunter] = useState(false);

  const [serpApiStatus, setSerpApiStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown');
  const [serperStatus, setSerperStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown');
  const [hunterStatus, setHunterStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown');
  const [apifyStatus, setApifyStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown');

  useEffect(() => {
    if (settings) {
      const serp = (settings as any).serpapi_api_key;
      const serper = (settings as any).serper_api_key;
      const hunter = (settings as any).hunter_api_token;
      const apify = (settings as any).apify_token;
      const preferred = (settings as any).preferred_search_api || 'serper';

      if (serp) { setSerpApiKey('••••••••••••••••' + serp.slice(-4)); setSerpApiStatus('valid'); }
      if (serper) { setSerperKey('••••••••••••••••' + serper.slice(-4)); setSerperStatus('valid'); }
      if (hunter) { setHunterKey('••••••••••••••••' + hunter.slice(-4)); setHunterStatus('valid'); }
      if (apify) { setApifyKey('••••••••••••••••' + apify.slice(-4)); setApifyStatus('valid'); }
      setPreferredApi(preferred);
    }
  }, [settings]);

  const saveKey = async (field: string, value: string, label: string) => {
    if (!value || value.includes('••••')) {
      toast({ title: 'Chave inválida', description: 'Digite uma chave de API válida.', variant: 'destructive' });
      return false;
    }
    try {
      const { error } = await supabase.from('user_settings').update({ [field]: value } as any).eq('user_id', user?.id);
      if (error) throw error;
      toast({ title: `✓ ${label} salva`, description: `Sua chave foi salva com segurança.` });
      return true;
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      return false;
    }
  };

  const clearKey = async (field: string, label: string, setKey: (v: string) => void, setStatus: (v: 'unknown' | 'valid' | 'invalid') => void) => {
    try {
      const { error } = await supabase.from('user_settings').update({ [field]: null } as any).eq('user_id', user?.id);
      if (error) throw error;
      setKey(''); setStatus('unknown');
      toast({ title: `${label} removida` });
    } catch (error: any) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    }
  };

  const handleSaveSerper = async () => {
    const ok = await saveKey('serper_api_key', serperKey, 'Chave Serper.dev');
    if (ok) { setSerperKey('••••••••••••••••' + serperKey.slice(-4)); setSerperStatus('valid'); }
  };

  const handleSaveSerpApi = async () => {
    const ok = await saveKey('serpapi_api_key', serpApiKey, 'Chave SerpAPI');
    if (ok) { setSerpApiKey('••••••••••••••••' + serpApiKey.slice(-4)); setSerpApiStatus('valid'); }
  };

  const handleSaveHunter = async () => {
    const ok = await saveKey('hunter_api_token', hunterKey, 'Chave Hunter.io');
    if (ok) { setHunterKey('••••••••••••••••' + hunterKey.slice(-4)); setHunterStatus('valid'); }
  };

  const handleSaveApify = async () => {
    const ok = await saveKey('apify_token', apifyKey, 'Token Apify');
    if (ok) { setApifyKey('••••••••••••••••' + apifyKey.slice(-4)); setApifyStatus('valid'); }
  };

  const handleSavePreferredApi = async (value: 'serper' | 'serpapi') => {
    setPreferredApi(value);
    try {
      const { error } = await supabase.from('user_settings').update({ preferred_search_api: value }).eq('user_id', user?.id);
      if (error) throw error;
      toast({ title: '✓ Preferência salva', description: `API de busca preferida: ${value === 'serper' ? 'Serper.dev' : 'SerpAPI'}` });
    } catch (error: any) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    }
  };

  const testSerperKey = async () => {
    if (!serperKey || serperKey.includes('••••')) return;
    setTestingSerper(true);
    try {
      const response = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': serperKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: 'test', num: 1 }),
      });
      if (response.ok) { setSerperStatus('valid'); toast({ title: '✓ Chave válida', description: 'Serper.dev está funcionando!' }); }
      else { setSerperStatus('invalid'); toast({ title: 'Chave inválida', variant: 'destructive' }); }
    } catch { setSerperStatus('invalid'); toast({ title: 'Erro ao testar', variant: 'destructive' }); }
    finally { setTestingSerper(false); }
  };

  const testSerpApiKey = async () => {
    if (!serpApiKey || serpApiKey.includes('••••')) return;
    setTestingSerpApi(true);
    try {
      const response = await fetch(`https://serpapi.com/account.json?api_key=${serpApiKey}`);
      if (response.ok) { const data = await response.json(); setSerpApiStatus('valid'); toast({ title: '✓ Chave válida', description: `SerpAPI ativo! ${data.searches_remaining || 0} buscas restantes.` }); }
      else { setSerpApiStatus('invalid'); toast({ title: 'Chave inválida', variant: 'destructive' }); }
    } catch { setSerpApiStatus('invalid'); toast({ title: 'Erro ao testar', variant: 'destructive' }); }
    finally { setTestingSerpApi(false); }
  };

  const testHunterKey = async () => {
    if (!hunterKey || hunterKey.includes('••••')) return;
    setTestingHunter(true);
    try {
      const response = await fetch(`https://api.hunter.io/v2/account?api_key=${hunterKey}`);
      if (response.ok) { const data = await response.json(); setHunterStatus('valid'); toast({ title: '✓ Chave válida', description: `Hunter.io ativo! ${data.data?.requests?.searches?.available || 0} buscas disponíveis.` }); }
      else { setHunterStatus('invalid'); toast({ title: 'Chave inválida', variant: 'destructive' }); }
    } catch { setHunterStatus('invalid'); toast({ title: 'Erro ao testar', variant: 'destructive' }); }
    finally { setTestingHunter(false); }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }

  const StatusBadge = ({ status }: { status: 'unknown' | 'valid' | 'invalid' }) => {
    if (status === 'valid') return <Badge className="bg-success text-white"><Check className="h-3 w-3 mr-1" />Configurada</Badge>;
    if (status === 'invalid') return <Badge variant="destructive"><AlertCircle className="h-3 w-3 mr-1" />Inválida</Badge>;
    return null;
  };

  return (
    <div className="space-y-6">
      {/* DeepSeek - Global Info */}
      <Alert className="border-primary/20 bg-primary/5">
        <Sparkles className="h-4 w-4" />
        <AlertTitle className="flex items-center gap-2">
          DeepSeek IA
          <Badge className="bg-success text-white">Incluída no Plano</Badge>
        </AlertTitle>
        <AlertDescription>
          A IA DeepSeek é compartilhada e já está configurada globalmente. 
          Você não precisa configurar nenhuma chave — ela funciona automaticamente para todos os usuários.
        </AlertDescription>
      </Alert>

      <Alert className="border-muted">
        <Shield className="h-4 w-4" />
        <AlertTitle>Suas chaves são privadas</AlertTitle>
        <AlertDescription>
          Configure suas próprias chaves de API abaixo. Elas são armazenadas de forma segura e usadas apenas para suas operações.
        </AlertDescription>
      </Alert>

      {/* API de Busca Preferida */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            API de Busca Preferida
          </CardTitle>
          <CardDescription>
            Escolha qual API usar para buscar leads no Google Maps e Google Search
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={preferredApi} onValueChange={(v) => handleSavePreferredApi(v as 'serper' | 'serpapi')} className="grid gap-4 md:grid-cols-2">
            <div className="flex items-start space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="serper" id="serper" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="serper" className="cursor-pointer font-medium flex items-center gap-2">
                  Serper.dev
                  <Badge variant="outline" className="bg-success/10 text-success border-success/30">Recomendado</Badge>
                </Label>
                <p className="text-sm text-muted-foreground mt-1"><strong>2.500 buscas grátis/mês</strong> • Mais rápido</p>
              </div>
            </div>
            <div className="flex items-start space-x-3 rounded-lg border p-4 cursor-pointer hover:bg-muted/50 transition-colors">
              <RadioGroupItem value="serpapi" id="serpapi" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="serpapi" className="cursor-pointer font-medium">SerpAPI</Label>
                <p className="text-sm text-muted-foreground mt-1"><strong>100 buscas grátis/mês</strong> • Mais estabelecido</p>
              </div>
            </div>
          </RadioGroup>
          <p className="text-xs text-muted-foreground mt-3">💡 Se a API preferida falhar, o sistema tentará automaticamente a outra como fallback.</p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Serper.dev */}
        <Card className={preferredApi === 'serper' ? 'ring-2 ring-primary/50' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Serper.dev
              {preferredApi === 'serper' && <Badge variant="default">Preferida</Badge>}
              <StatusBadge status={serperStatus} />
            </CardTitle>
            <CardDescription>API rápida para buscar leads no Google • 2.500 buscas grátis/mês</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Chave de API do Serper.dev</Label>
              <div className="relative">
                <Input type={showSerper ? 'text' : 'password'} placeholder="Sua chave Serper.dev..." value={serperKey} onChange={(e) => { setSerperKey(e.target.value); setSerperStatus('unknown'); }} />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full" onClick={() => setShowSerper(!showSerper)}>
                  {showSerper ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={testSerperKey} disabled={testingSerper || !serperKey}>
                {testingSerper ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}Testar
              </Button>
              <Button size="sm" onClick={handleSaveSerper} disabled={!serperKey || serperKey.includes('••••')}>
                <Key className="h-4 w-4 mr-2" />Salvar
              </Button>
              {serperStatus === 'valid' && <Button variant="ghost" size="sm" onClick={() => clearKey('serper_api_key', 'Chave Serper.dev', setSerperKey, setSerperStatus)} className="text-destructive">Remover</Button>}
            </div>
            <div className="pt-2 border-t">
              <a href="https://serper.dev/api-key" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />Obter chave no Serper.dev (grátis)
              </a>
            </div>
          </CardContent>
        </Card>

        {/* SerpAPI */}
        <Card className={preferredApi === 'serpapi' ? 'ring-2 ring-primary/50' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-brand" />
              SerpAPI
              {preferredApi === 'serpapi' && <Badge variant="default">Preferida</Badge>}
              <StatusBadge status={serpApiStatus} />
            </CardTitle>
            <CardDescription>API alternativa para buscar leads • 100 buscas grátis/mês</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Chave de API do SerpAPI</Label>
              <div className="relative">
                <Input type={showSerpApi ? 'text' : 'password'} placeholder="Sua chave SerpAPI..." value={serpApiKey} onChange={(e) => { setSerpApiKey(e.target.value); setSerpApiStatus('unknown'); }} />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full" onClick={() => setShowSerpApi(!showSerpApi)}>
                  {showSerpApi ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={testSerpApiKey} disabled={testingSerpApi || !serpApiKey}>
                {testingSerpApi ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}Testar
              </Button>
              <Button size="sm" onClick={handleSaveSerpApi} disabled={!serpApiKey || serpApiKey.includes('••••')}>
                <Key className="h-4 w-4 mr-2" />Salvar
              </Button>
              {serpApiStatus === 'valid' && <Button variant="ghost" size="sm" onClick={() => clearKey('serpapi_api_key', 'Chave SerpAPI', setSerpApiKey, setSerpApiStatus)} className="text-destructive">Remover</Button>}
            </div>
            <div className="pt-2 border-t">
              <a href="https://serpapi.com/manage-api-key" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />Obter chave no SerpAPI
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Hunter.io */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              Hunter.io API
              <StatusBadge status={hunterStatus} />
            </CardTitle>
            <CardDescription>Descobrir e verificar emails profissionais • 25 buscas grátis/mês</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Chave de API do Hunter.io</Label>
              <div className="relative">
                <Input type={showHunter ? 'text' : 'password'} placeholder="Sua chave Hunter.io..." value={hunterKey} onChange={(e) => { setHunterKey(e.target.value); setHunterStatus('unknown'); }} />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full" onClick={() => setShowHunter(!showHunter)}>
                  {showHunter ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={testHunterKey} disabled={testingHunter || !hunterKey}>
                {testingHunter ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}Testar
              </Button>
              <Button size="sm" onClick={handleSaveHunter} disabled={!hunterKey || hunterKey.includes('••••')}>
                <Key className="h-4 w-4 mr-2" />Salvar
              </Button>
              {hunterStatus === 'valid' && <Button variant="ghost" size="sm" onClick={() => clearKey('hunter_api_token', 'Chave Hunter.io', setHunterKey, setHunterStatus)} className="text-destructive">Remover</Button>}
            </div>
            <div className="pt-2 border-t">
              <a href="https://hunter.io/api-keys" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />Obter chave no Hunter.io
              </a>
            </div>
          </CardContent>
        </Card>

        {/* Apify Token */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-brand" />
              Apify Token
              <StatusBadge status={apifyStatus} />
            </CardTitle>
            <CardDescription>Necessário para extração de Instagram e Facebook • Gratuito em apify.com</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Token Apify</Label>
              <div className="relative">
                <Input type={showApify ? 'text' : 'password'} placeholder="apify_api_..." value={apifyKey} onChange={(e) => { setApifyKey(e.target.value); setApifyStatus('unknown'); }} />
                <Button type="button" variant="ghost" size="sm" className="absolute right-0 top-0 h-full" onClick={() => setShowApify(!showApify)}>
                  {showApify ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSaveApify} disabled={!apifyKey || apifyKey.includes('••••')}>
                <Key className="h-4 w-4 mr-2" />Salvar
              </Button>
              {apifyStatus === 'valid' && <Button variant="ghost" size="sm" onClick={() => clearKey('apify_token', 'Token Apify', setApifyKey, setApifyStatus)} className="text-destructive">Remover</Button>}
            </div>
            <div className="pt-2 border-t">
              <a href="https://apify.com" target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />Criar conta gratuita no Apify →
              </a>
            </div>
          </CardContent>
        </Card>
      </div>

      <Alert variant="default">
        <Info className="h-4 w-4" />
        <AlertTitle>Resumo das APIs</AlertTitle>
        <AlertDescription className="mt-2 space-y-2">
          <p><strong>🤖 DeepSeek IA:</strong> Incluída no plano — não precisa configurar.</p>
          <p><strong>🔍 Serper.dev:</strong> Buscar empresas no Google. 2.500 buscas grátis/mês.</p>
          <p><strong>🔍 SerpAPI:</strong> Alternativa para buscar no Google Maps. 100 buscas grátis/mês.</p>
          <p><strong>📧 Hunter.io:</strong> Descobrir emails profissionais. 25 buscas grátis/mês.</p>
          <p><strong>🤖 Apify:</strong> Extração de dados do Instagram e Facebook. Gratuito.</p>
        </AlertDescription>
      </Alert>
    </div>
  );
}

import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Send,
  Search,
  Database,
  Wifi,
  MessageSquare,
  Bot,
  Zap,
  RefreshCw,
  AlertCircle,
  Settings,
  Smartphone,
  Globe,
  Server,
} from 'lucide-react';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  duration?: number;
}

export default function DiagnosticsPage() {
  const { settings } = useUserSettings();
  const { user } = useAuth();
  const { toast } = useToast();
  
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunningAll, setIsRunningAll] = useState(false);
  
  // WhatsApp Test
  const [testPhone, setTestPhone] = useState('');
  const [testMessage, setTestMessage] = useState('Olá! Esta é uma mensagem de teste do Prospecte. 🚀');
  const [isSendingTest, setIsSendingTest] = useState(false);
  
  // Search Test
  const [testNiche, setTestNiche] = useState('Restaurantes');
  const [testLocation, setTestLocation] = useState('São Paulo, SP');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // AI Test
  const [aiTestPrompt, setAiTestPrompt] = useState('Crie uma mensagem de prospecção para um restaurante em São Paulo.');
  const [aiResult, setAiResult] = useState('');
  const [isTestingAI, setIsTestingAI] = useState(false);

  const updateTestResult = (name: string, result: Partial<TestResult>) => {
    setTestResults(prev => {
      const existing = prev.find(r => r.name === name);
      if (existing) {
        return prev.map(r => r.name === name ? { ...r, ...result } : r);
      }
      return [...prev, { name, status: 'pending', ...result }];
    });
  };

  const testSupabaseConnection = async (): Promise<boolean> => {
    const start = Date.now();
    updateTestResult('Supabase', { status: 'running' });
    
    try {
      const { data, error } = await supabase.from('profiles').select('count').limit(1);
      if (error) throw error;
      
      updateTestResult('Supabase', {
        status: 'success',
        message: 'Conexão com banco de dados OK',
        duration: Date.now() - start,
      });
      return true;
    } catch (error: any) {
      updateTestResult('Supabase', {
        status: 'error',
        message: error.message,
        duration: Date.now() - start,
      });
      return false;
    }
  };

  const testWhatsAppConnection = async (): Promise<boolean> => {
    const start = Date.now();
    updateTestResult('WhatsApp', { status: 'running' });
    
    if (!settings?.whatsapp_instance_id) {
      updateTestResult('WhatsApp', {
        status: 'error',
        message: 'WhatsApp não configurado. Vá em Configurações > WhatsApp.',
        duration: Date.now() - start,
      });
      return false;
    }

    try {
      const response = await supabase.functions.invoke('whatsapp-connect', {
        body: {
          action: 'check_status',
        },
      });

      if (response.error) throw response.error;
      
      const connected = response.data?.connected || response.data?.status === 'open';
      
      updateTestResult('WhatsApp', {
        status: connected ? 'success' : 'error',
        message: connected ? 'WhatsApp conectado e funcionando' : 'WhatsApp desconectado',
        duration: Date.now() - start,
      });
      return connected;
    } catch (error: any) {
      updateTestResult('WhatsApp', {
        status: 'error',
        message: error.message,
        duration: Date.now() - start,
      });
      return false;
    }
  };

  const testSearchAPI = async (): Promise<boolean> => {
    const start = Date.now();
    updateTestResult('SerpAPI', { status: 'running' });
    
    try {
      const response = await supabase.functions.invoke('ai-prospecting', {
        body: {
          action: 'search_leads',
          data: { niche: 'Restaurantes', location: 'São Paulo, SP', maxResults: 5 },
        },
      });

      if (response.error) throw response.error;
      
      const leads = response.data?.leads || [];
      
      updateTestResult('SerpAPI', {
        status: leads.length > 0 ? 'success' : 'error',
        message: leads.length > 0 ? `API funcionando (${leads.length} leads encontrados)` : 'Nenhum resultado retornado',
        duration: Date.now() - start,
      });
      return leads.length > 0;
    } catch (error: any) {
      updateTestResult('SerpAPI', {
        status: 'error',
        message: error.message,
        duration: Date.now() - start,
      });
      return false;
    }
  };

  const testAIAPI = async (): Promise<boolean> => {
    const start = Date.now();
    updateTestResult('AI/DeepSeek', { status: 'running' });
    
    try {
      const response = await supabase.functions.invoke('ai-prospecting', {
        body: {
          action: 'analyze_and_personalize',
          data: {
            lead: {
              business_name: 'Teste Restaurante',
              niche: 'Restaurantes',
              location: 'São Paulo, SP',
              rating: 4.5,
            },
            agentSettings: {
              agent_name: settings?.agent_name || 'Consultor',
              services_offered: settings?.services_offered || ['Marketing Digital'],
            },
          },
        },
      });

      if (response.error) throw response.error;
      
      const hasMessage = !!response.data?.message;
      
      updateTestResult('AI/DeepSeek', {
        status: hasMessage ? 'success' : 'error',
        message: hasMessage ? 'IA respondendo normalmente' : 'IA não retornou mensagem',
        duration: Date.now() - start,
      });
      return hasMessage;
    } catch (error: any) {
      updateTestResult('AI/DeepSeek', {
        status: 'error',
        message: error.message,
        duration: Date.now() - start,
      });
      return false;
    }
  };

  const runAllTests = async () => {
    setIsRunningAll(true);
    setTestResults([]);
    
    await testSupabaseConnection();
    await testWhatsAppConnection();
    await testSearchAPI();
    await testAIAPI();
    
    setIsRunningAll(false);
    
    toast({
      title: 'Testes concluídos',
      description: 'Verifique os resultados abaixo.',
    });
  };

  const sendTestMessage = async () => {
    if (!testPhone.trim()) {
      toast({ title: 'Digite um número de telefone', variant: 'destructive' });
      return;
    }
    
    setIsSendingTest(true);
    
    try {
      const response = await supabase.functions.invoke('whatsapp-send', {
        body: {
          phone: testPhone,
          message: testMessage,
          instance_id: settings?.whatsapp_instance_id,
        },
      });

      if (response.error) throw response.error;
      
      toast({
        title: '✓ Mensagem enviada!',
        description: `Mensagem enviada para ${testPhone}`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao enviar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const runSearchTest = async () => {
    setIsSearching(true);
    setSearchResults([]);
    
    try {
      const response = await supabase.functions.invoke('ai-prospecting', {
        body: {
          action: 'search_leads',
          data: { niche: testNiche, location: testLocation, maxResults: 10 },
        },
      });

      if (response.error) throw response.error;
      
      setSearchResults(response.data?.leads || []);
      
      toast({
        title: `${response.data?.leads?.length || 0} leads encontrados`,
        description: `Busca: ${testNiche} em ${testLocation}`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro na busca',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSearching(false);
    }
  };

  const runAITest = async () => {
    setIsTestingAI(true);
    setAiResult('');
    
    try {
      const response = await supabase.functions.invoke('ai-prospecting', {
        body: {
          action: 'analyze_and_personalize',
          data: {
            lead: {
              business_name: 'Empresa Teste',
              niche: testNiche,
              location: testLocation,
              rating: 4.5,
            },
            agentSettings: {
              agent_name: settings?.agent_name || 'Consultor',
              agent_persona: settings?.agent_persona,
              services_offered: settings?.services_offered,
              communication_style: settings?.communication_style,
            },
          },
        },
      });

      if (response.error) throw response.error;
      
      setAiResult(response.data?.message || 'Sem resposta');
      
      toast({ title: '✓ IA respondeu com sucesso!' });
    } catch (error: any) {
      toast({
        title: 'Erro na IA',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsTestingAI(false);
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-5 w-5 animate-spin text-primary" />;
      case 'success':
        return <CheckCircle2 className="h-5 w-5 text-success" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <AlertCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const systemStatus = {
    supabase: true,
    whatsapp: settings?.whatsapp_connected,
    serpapi: true, // Assume configured if settings exist
    ai: true,
  };

  return (
    <DashboardLayout
      title="Diagnóstico do Sistema"
      description="Teste todas as funcionalidades da plataforma"
    >
      <div className="space-y-6">
        {/* System Status Overview */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className={systemStatus.supabase ? 'border-success/30' : 'border-destructive/30'}>
            <CardContent className="p-4 flex items-center gap-3">
              <Database className={`h-8 w-8 ${systemStatus.supabase ? 'text-success' : 'text-destructive'}`} />
              <div>
                <p className="font-medium">Banco de Dados</p>
                <p className="text-sm text-muted-foreground">Supabase</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className={systemStatus.whatsapp ? 'border-success/30' : 'border-warning/30'}>
            <CardContent className="p-4 flex items-center gap-3">
              <Smartphone className={`h-8 w-8 ${systemStatus.whatsapp ? 'text-success' : 'text-warning'}`} />
              <div>
                <p className="font-medium">WhatsApp</p>
                <p className="text-sm text-muted-foreground">
                  {systemStatus.whatsapp ? 'Conectado' : 'Não conectado'}
                </p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-success/30">
            <CardContent className="p-4 flex items-center gap-3">
              <Search className="h-8 w-8 text-success" />
              <div>
                <p className="font-medium">Busca de Leads</p>
                <p className="text-sm text-muted-foreground">SerpAPI</p>
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-success/30">
            <CardContent className="p-4 flex items-center gap-3">
              <Bot className="h-8 w-8 text-success" />
              <div>
                <p className="font-medium">Inteligência Artificial</p>
                <p className="text-sm text-muted-foreground">DeepSeek</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Run All Tests */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-5 w-5" />
                  Diagnóstico Completo
                </CardTitle>
                <CardDescription>
                  Execute todos os testes para verificar se o sistema está funcionando corretamente
                </CardDescription>
              </div>
              <Button onClick={runAllTests} disabled={isRunningAll}>
                {isRunningAll ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Executar Todos os Testes
              </Button>
            </div>
          </CardHeader>
          {testResults.length > 0 && (
            <CardContent>
              <div className="space-y-3">
                {testResults.map((result) => (
                  <div
                    key={result.name}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(result.status)}
                      <div>
                        <p className="font-medium">{result.name}</p>
                        {result.message && (
                          <p className="text-sm text-muted-foreground">{result.message}</p>
                        )}
                      </div>
                    </div>
                    {result.duration && (
                      <Badge variant="outline">{result.duration}ms</Badge>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>

        {/* Individual Tests */}
        <Tabs defaultValue="whatsapp" className="space-y-4">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="whatsapp" className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              WhatsApp
            </TabsTrigger>
            <TabsTrigger value="search" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Busca de Leads
            </TabsTrigger>
            <TabsTrigger value="ai" className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              IA
            </TabsTrigger>
          </TabsList>

          <TabsContent value="whatsapp">
            <Card>
              <CardHeader>
                <CardTitle>Teste de Envio WhatsApp</CardTitle>
                <CardDescription>
                  Envie uma mensagem de teste para verificar se o WhatsApp está funcionando
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {!settings?.whatsapp_connected ? (
                  <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 text-center">
                    <AlertCircle className="h-8 w-8 text-warning mx-auto mb-2" />
                    <p className="font-medium">WhatsApp não conectado</p>
                    <p className="text-sm text-muted-foreground mb-3">
                      Conecte seu WhatsApp em Configurações antes de testar.
                    </p>
                    <Button variant="outline" asChild>
                      <a href="/settings">Ir para Configurações</a>
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Número de Telefone</label>
                        <Input
                          placeholder="Ex: 11999999999"
                          value={testPhone}
                          onChange={(e) => setTestPhone(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Digite apenas números (DDD + número)
                        </p>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Mensagem de Teste</label>
                        <Textarea
                          value={testMessage}
                          onChange={(e) => setTestMessage(e.target.value)}
                          rows={3}
                        />
                      </div>
                    </div>
                    <Button onClick={sendTestMessage} disabled={isSendingTest}>
                      {isSendingTest ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-2" />
                      )}
                      Enviar Mensagem de Teste
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="search">
            <Card>
              <CardHeader>
                <CardTitle>Teste de Busca de Leads</CardTitle>
                <CardDescription>
                  Teste a busca de leads no Google Maps via SerpAPI
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Nicho</label>
                    <Input
                      value={testNiche}
                      onChange={(e) => setTestNiche(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Localização</label>
                    <Input
                      value={testLocation}
                      onChange={(e) => setTestLocation(e.target.value)}
                    />
                  </div>
                </div>
                
                <Button onClick={runSearchTest} disabled={isSearching}>
                  {isSearching ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Search className="h-4 w-4 mr-2" />
                  )}
                  Buscar Leads
                </Button>

                {searchResults.length > 0 && (
                  <div className="mt-4">
                    <p className="text-sm font-medium mb-2">
                      Resultados ({searchResults.length} leads):
                    </p>
                    <ScrollArea className="h-[200px] rounded-lg border p-3">
                      <div className="space-y-2">
                        {searchResults.map((lead, idx) => (
                          <div key={idx} className="p-2 rounded bg-muted/50 text-sm">
                            <p className="font-medium">{lead.business_name}</p>
                            <p className="text-muted-foreground">{lead.phone || 'Sem telefone'}</p>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ai">
            <Card>
              <CardHeader>
                <CardTitle>Teste de Inteligência Artificial</CardTitle>
                <CardDescription>
                  Teste a geração de mensagens personalizadas com IA
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Contexto do Teste</label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Input
                      placeholder="Nicho"
                      value={testNiche}
                      onChange={(e) => setTestNiche(e.target.value)}
                    />
                    <Input
                      placeholder="Localização"
                      value={testLocation}
                      onChange={(e) => setTestLocation(e.target.value)}
                    />
                  </div>
                </div>
                
                <Button onClick={runAITest} disabled={isTestingAI}>
                  {isTestingAI ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Bot className="h-4 w-4 mr-2" />
                  )}
                  Gerar Mensagem com IA
                </Button>

                {aiResult && (
                  <div className="mt-4 p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-sm font-medium mb-2 flex items-center gap-2">
                      <Bot className="h-4 w-4 text-primary" />
                      Mensagem Gerada:
                    </p>
                    <p className="text-sm whitespace-pre-wrap">{aiResult}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Code2,
  Copy,
  Check,
  Lock,
  Globe,
  Send,
  Users,
  Webhook,
  ChevronDown,
  Zap,
  Bot,
  Calendar,
  BarChart3,
  MessageSquare,
  FileText,
  Heart,
} from 'lucide-react';

// Sai do ambiente: a URL exibida aqui é a que o cliente vai colar no
// código dele. Apontar para o projeto errado quebra a integração dele,
// não a nossa — e o erro só aparece do lado de fora.
const PROJECT_REF = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const BASE_URL = `https://${PROJECT_REF}.supabase.co/functions/v1/api`;

interface Endpoint {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  description: string;
  params?: string;
  body?: string;
  response: string;
  category: string;
}

const endpoints: Endpoint[] = [
  // Health
  {
    method: 'GET',
    path: '/health',
    description: 'Verificar se a API está online (público, sem autenticação)',
    category: 'Sistema',
    response: `{
  "success": true,
  "version": "1.0.0",
  "status": "online",
  "timestamp": "2026-03-28T12:00:00Z"
}`,
  },
  // Leads
  {
    method: 'GET',
    path: '/leads',
    description: 'Listar leads com filtros, paginação e ordenação',
    category: 'Leads',
    params: '?page=1&limit=50&stage=Contato&temperature=quente&niche=Restaurante&search=empresa&sort=created_at&order=desc',
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "business_name": "Empresa X",
      "phone": "5511999999999",
      "niche": "Restaurante",
      "stage": "Contato",
      "temperature": "morno",
      "lead_score": 75,
      "source": "google_maps"
    }
  ],
  "total": 150,
  "page": 1,
  "limit": 50
}`,
  },
  {
    method: 'GET',
    path: '/leads/:id',
    description: 'Obter detalhes completos de um lead específico',
    category: 'Leads',
    response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "business_name": "Empresa X",
    "phone": "5511999999999",
    "email": "contato@empresa.com",
    "niche": "Restaurante",
    "location": "São Paulo, SP",
    "stage": "Qualificado",
    "temperature": "quente",
    "lead_score": 85,
    "tags": ["vip", "prioritário"],
    "created_at": "2026-03-28T00:00:00Z"
  }
}`,
  },
  {
    method: 'POST',
    path: '/leads',
    description: 'Criar um novo lead (integração com CRMs, formulários, etc.)',
    category: 'Leads',
    body: `{
  "business_name": "Nova Empresa",
  "phone": "5511999999999",
  "niche": "Restaurante",
  "location": "São Paulo, SP",
  "email": "contato@empresa.com",
  "source": "api",
  "tags": ["campanha-google"],
  "notes": "Veio do formulário do site"
}`,
    response: `{
  "success": true,
  "data": {
    "id": "uuid",
    "business_name": "Nova Empresa",
    "stage": "Contato",
    "created_at": "2026-03-28T00:00:00Z"
  }
}`,
  },
  {
    method: 'PUT',
    path: '/leads/:id',
    description: 'Atualizar dados de um lead (stage, temperature, tags, etc.)',
    category: 'Leads',
    body: `{
  "stage": "Qualificado",
  "temperature": "quente",
  "tags": ["vip"],
  "deal_value": 5000,
  "notes": "Lead muito interessado"
}`,
    response: `{
  "success": true,
  "data": { "id": "uuid", "stage": "Qualificado", "temperature": "quente" }
}`,
  },
  {
    method: 'DELETE',
    path: '/leads/:id',
    description: 'Remover um lead permanentemente',
    category: 'Leads',
    response: `{ "success": true, "message": "Lead deleted" }`,
  },
  // Messages
  {
    method: 'POST',
    path: '/messages/send',
    description: 'Enviar mensagem WhatsApp para um número (requer WhatsApp conectado)',
    category: 'Mensagens',
    body: `{
  "phone": "5511999999999",
  "message": "Olá! Tudo bem? Tenho uma proposta para você.",
  "lead_id": "uuid (opcional, para registrar no histórico)"
}`,
    response: `{
  "success": true,
  "data": { "status": "sent" }
}`,
  },
  {
    method: 'GET',
    path: '/messages/:lead_id',
    description: 'Buscar histórico de mensagens de um lead',
    category: 'Mensagens',
    params: '?limit=100',
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "content": "Olá!",
      "sender_type": "user",
      "sent_at": "2026-03-28T10:00:00Z",
      "status": "sent"
    }
  ]
}`,
  },
  // Campaigns
  {
    method: 'GET',
    path: '/campaigns',
    description: 'Listar todas as campanhas',
    category: 'Campanhas',
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "Campanha Restaurantes SP",
      "status": "running",
      "leads_found": 200,
      "leads_contacted": 150,
      "leads_responded": 45
    }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/campaigns',
    description: 'Criar uma nova campanha',
    category: 'Campanhas',
    body: `{
  "name": "Campanha Q2 2026",
  "campaign_type": "automatic",
  "niches": ["Restaurante", "Café"],
  "locations": ["São Paulo, SP"],
  "message_template": "Olá {nome_empresa}! ..."
}`,
    response: `{
  "success": true,
  "data": { "id": "uuid", "name": "Campanha Q2 2026", "status": "draft" }
}`,
  },
  {
    method: 'POST',
    path: '/campaigns/:id/start',
    description: 'Iniciar uma campanha',
    category: 'Campanhas',
    response: `{ "success": true, "data": { "id": "uuid", "status": "running" } }`,
  },
  {
    method: 'POST',
    path: '/campaigns/:id/pause',
    description: 'Pausar uma campanha ativa',
    category: 'Campanhas',
    response: `{ "success": true, "data": { "id": "uuid", "status": "paused" } }`,
  },
  // Meetings
  {
    method: 'GET',
    path: '/meetings',
    description: 'Listar reuniões agendadas',
    category: 'Reuniões',
    params: '?status=scheduled',
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Demo NexaProspect",
      "scheduled_at": "2026-04-01T14:00:00Z",
      "status": "scheduled",
      "leads": { "business_name": "Empresa X", "phone": "5511999999999" }
    }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/meetings',
    description: 'Agendar uma nova reunião para um lead',
    category: 'Reuniões',
    body: `{
  "lead_id": "uuid",
  "title": "Apresentação de Proposta",
  "scheduled_at": "2026-04-01T14:00:00Z",
  "duration_minutes": 30,
  "meeting_link": "https://meet.google.com/xxx",
  "description": "Apresentar solução de marketing"
}`,
    response: `{
  "success": true,
  "data": { "id": "uuid", "title": "Apresentação de Proposta", "status": "scheduled" }
}`,
  },
  // Templates
  {
    method: 'GET',
    path: '/templates',
    description: 'Listar templates de mensagem',
    category: 'Templates',
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "name": "1º Contato — Restaurantes",
      "niche": "Restaurantes",
      "content": "Olá {nome_empresa}! ...",
      "response_rate": 32.5,
      "usage_count": 150
    }
  ]
}`,
  },
  {
    method: 'POST',
    path: '/templates',
    description: 'Criar novo template de mensagem',
    category: 'Templates',
    body: `{
  "name": "Follow-up Direto",
  "niche": "Geral",
  "content": "Oi {nome_empresa}! Passei pra dar um alô...",
  "variables": ["nome_empresa"]
}`,
    response: `{ "success": true, "data": { "id": "uuid", "name": "Follow-up Direto" } }`,
  },
  // Analytics
  {
    method: 'GET',
    path: '/analytics/overview',
    description: 'Dashboard geral com métricas consolidadas',
    category: 'Analytics',
    response: `{
  "success": true,
  "data": {
    "total_leads": 1250,
    "leads_by_stage": { "Contato": 500, "Qualificado": 300, "Proposta": 150, "Negociação": 80, "Ganho": 50 },
    "leads_by_temperature": { "frio": 400, "morno": 500, "quente": 350 },
    "total_meetings": 45,
    "total_campaigns": 8
  }
}`,
  },
  {
    method: 'GET',
    path: '/analytics/activity',
    description: 'Log de atividades recentes',
    category: 'Analytics',
    params: '?limit=50',
    response: `{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "activity_type": "lead_created",
      "description": "Lead Empresa X criado via API",
      "created_at": "2026-03-28T10:00:00Z"
    }
  ]
}`,
  },
  {
    method: 'GET',
    path: '/analytics/prospecting',
    description: 'Estatísticas de prospecção dos últimos 30 dias',
    category: 'Analytics',
    response: `{
  "success": true,
  "data": [
    {
      "date": "2026-03-28",
      "niche": "Restaurante",
      "messages_sent": 50,
      "responses_received": 15,
      "positive_responses": 8
    }
  ]
}`,
  },
  // Automations
  {
    method: 'GET',
    path: '/automations',
    description: 'Ver status de todas as automações',
    category: 'Automações',
    response: `{
  "success": true,
  "data": {
    "auto_prospecting_enabled": true,
    "auto_first_message_enabled": true,
    "auto_followup_enabled": true,
    "sdr_agent_enabled": false,
    "auto_pipeline_enabled": true,
    "auto_reactivation_enabled": false,
    "auto_lead_scoring": true,
    "daily_report_enabled": false,
    "weekly_report_enabled": true
  }
}`,
  },
  {
    method: 'PUT',
    path: '/automations',
    description: 'Ativar/desativar automações programaticamente',
    category: 'Automações',
    body: `{
  "auto_first_message_enabled": true,
  "sdr_agent_enabled": true,
  "auto_reactivation_enabled": false
}`,
    response: `{ "success": true, "data": { ... } }`,
  },
  // Webhooks
  {
    method: 'GET',
    path: '/webhooks',
    description: 'Ver configuração de webhooks',
    category: 'Webhooks',
    response: `{
  "success": true,
  "data": {
    "webhook_url": "https://seu-sistema.com/webhook",
    "webhook_events": ["lead_contacted", "meeting_scheduled"]
  }
}`,
  },
  {
    method: 'PUT',
    path: '/webhooks',
    description: 'Configurar URL e eventos de webhook',
    category: 'Webhooks',
    body: `{
  "webhook_url": "https://n8n.seu-servidor.com/webhook/nexa",
  "webhook_events": ["lead_created", "message_sent", "meeting_scheduled", "lead_qualified"]
}`,
    response: `{ "success": true, "data": { "webhook_url": "...", "webhook_events": [...] } }`,
  },
  // AI
  {
    method: 'POST',
    path: '/ai/reply',
    description: 'Gerar resposta da IA para uma mensagem de lead',
    category: 'IA',
    body: `{
  "lead_id": "uuid",
  "message": "Quanto custa o serviço de vocês?"
}`,
    response: `{
  "success": true,
  "data": { "reply": "Olá! Nossos planos começam a partir de...", "intent": "price" }
}`,
  },
  {
    method: 'POST',
    path: '/ai/score',
    description: 'Calcular score de um lead (0-100)',
    category: 'IA',
    body: `{ "lead_id": "uuid" }`,
    response: `{ "success": true, "score": 85 }`,
  },
  {
    method: 'POST',
    path: '/ai/analyze-intent',
    description: 'Analisar intenção de uma mensagem e mover lead no pipeline',
    category: 'IA',
    body: `{
  "lead_id": "uuid",
  "message": "Quero agendar uma reunião para discutir"
}`,
    response: `{
  "success": true,
  "data": {
    "lead_id": "uuid",
    "previous_stage": "Contato",
    "new_stage": "Negociação",
    "action": "schedule_intent",
    "changed": true
  }
}`,
  },
];

const methodColors: Record<string, string> = {
  GET: 'bg-success/10 text-success border-success/30',
  POST: 'bg-info/10 text-info border-info/30',
  PUT: 'bg-warning/10 text-warning border-warning/30',
  DELETE: 'bg-destructive/10 text-destructive border-destructive/30',
};

const categoryIcons: Record<string, any> = {
  'Sistema': Heart,
  'Leads': Users,
  'Mensagens': MessageSquare,
  'Campanhas': Send,
  'Reuniões': Calendar,
  'Templates': FileText,
  'Analytics': BarChart3,
  'Automações': Zap,
  'Webhooks': Webhook,
  'IA': Bot,
};

export default function APIReferencePage() {
  const { toast } = useToast();
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const copyToClipboard = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
    toast({ title: 'Copiado!' });
  };

  const generateCurl = (ep: Endpoint) => {
    const url = `${BASE_URL}${ep.path}`;
    let curl = `curl -X ${ep.method} "${url}"`;
    curl += ` \\\n  -H "X-API-Key: YOUR_API_KEY"`;
    curl += ` \\\n  -H "Content-Type: application/json"`;
    if (ep.body) {
      curl += ` \\\n  -d '${ep.body.replace(/\n/g, '').replace(/\s+/g, ' ')}'`;
    }
    return curl;
  };

  const generatePython = (ep: Endpoint) => {
    let code = `import requests\n\n`;
    code += `url = "${BASE_URL}${ep.path}"\n`;
    code += `headers = {\n    "X-API-Key": "YOUR_API_KEY",\n    "Content-Type": "application/json"\n}\n`;
    if (ep.body) {
      code += `data = ${ep.body}\n\n`;
      code += `response = requests.${ep.method.toLowerCase()}(url, json=data, headers=headers)\n`;
    } else {
      code += `\nresponse = requests.${ep.method.toLowerCase()}(url, headers=headers)\n`;
    }
    code += `print(response.json())`;
    return code;
  };

  const generateJS = (ep: Endpoint) => {
    let code = `const response = await fetch("${BASE_URL}${ep.path}", {\n`;
    code += `  method: "${ep.method}",\n`;
    code += `  headers: {\n    "X-API-Key": "YOUR_API_KEY",\n    "Content-Type": "application/json"\n  },\n`;
    if (ep.body) {
      code += `  body: JSON.stringify(${ep.body.replace(/\n/g, '').replace(/\s+/g, ' ')})\n`;
    }
    code += `});\nconst data = await response.json();\nconsole.log(data);`;
    return code;
  };

  // Group by category
  const categories = [...new Set(endpoints.map(e => e.category))];

  return (
    <DashboardLayout
      title="API Reference"
      description="Documentação completa da API pública do NexaProspect"
    >
      <div className="space-y-6 animate-fade-in max-w-4xl">
        {/* Header */}
        <Card className="bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Code2 className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">API NexaProspect</h2>
                <p className="text-sm text-muted-foreground">v1.0 • REST API • {endpoints.length} endpoints</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Integre o NexaProspect com qualquer sistema — CRMs, ERPs, n8n, Zapier, Make, IAs, chatbots e mais. 
              Gerencie leads, envie mensagens, controle automações e acesse analytics programaticamente.
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">REST</Badge>
              <Badge variant="outline">JSON</Badge>
              <Badge variant="outline">API Key Auth</Badge>
              <Badge variant="outline">JWT Auth</Badge>
              <Badge variant="outline">CORS Enabled</Badge>
              <Badge variant="outline">Rate Limited</Badge>
            </div>
          </CardContent>
        </Card>

        {/* Base URL */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Base URL
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <pre className="bg-muted p-3 rounded-lg text-sm flex-1 overflow-x-auto">
                <code>{BASE_URL}</code>
              </pre>
              <Button variant="ghost" size="sm" onClick={() => copyToClipboard(BASE_URL, -1)}>
                {copiedIdx === -1 ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Authentication */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-primary" />
              Autenticação
            </CardTitle>
            <CardDescription>Dois métodos de autenticação suportados</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="p-4 rounded-lg border bg-muted/30 space-y-2">
                <Badge className="bg-primary/10 text-primary border-0">Recomendado</Badge>
                <h4 className="font-semibold text-sm">API Key</h4>
                <p className="text-xs text-muted-foreground">Use sua API Key pessoal no header X-API-Key</p>
                <pre className="bg-muted p-2 rounded text-xs"><code>X-API-Key: sua_api_key_aqui</code></pre>
                <p className="text-xs text-muted-foreground">Encontre em: Configurações → Chaves API</p>
              </div>
              <div className="p-4 rounded-lg border bg-muted/30 space-y-2">
                <Badge variant="outline">Alternativo</Badge>
                <h4 className="font-semibold text-sm">Bearer JWT</h4>
                <p className="text-xs text-muted-foreground">Use o token JWT do Supabase Auth</p>
                <pre className="bg-muted p-2 rounded text-xs"><code>Authorization: Bearer eyJhb...</code></pre>
                <p className="text-xs text-muted-foreground">Ideal para integrações frontend</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Endpoints by Category */}
        {categories.map((cat) => {
          const catEndpoints = endpoints.filter(e => e.category === cat);
          const Icon = categoryIcons[cat] || Globe;
          return (
            <Collapsible key={cat} defaultOpen={cat === 'Leads' || cat === 'Sistema'}>
              <div className="space-y-3">
                <CollapsibleTrigger className="flex items-center gap-2 w-full text-left group">
                  <Icon className="h-5 w-5 text-primary" />
                  <h3 className="text-lg font-semibold flex-1">{cat}</h3>
                  <Badge variant="outline" className="mr-2">{catEndpoints.length}</Badge>
                  <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-3">
                  {catEndpoints.map((ep, idx) => {
                    const globalIdx = endpoints.indexOf(ep);
                    return (
                      <Card key={globalIdx}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className={`${methodColors[ep.method]} font-mono text-xs`}>
                                {ep.method}
                              </Badge>
                              <code className="text-sm font-mono">{ep.path}</code>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copyToClipboard(generateCurl(ep), globalIdx)}
                            >
                              {copiedIdx === globalIdx ? (
                                <Check className="h-4 w-4 mr-1 text-success" />
                              ) : (
                                <Copy className="h-4 w-4 mr-1" />
                              )}
                              cURL
                            </Button>
                          </div>
                          <CardDescription>{ep.description}</CardDescription>
                          {ep.params && (
                            <p className="text-xs font-mono text-muted-foreground mt-1">Params: {ep.params}</p>
                          )}
                        </CardHeader>
                        <CardContent>
                          <Tabs defaultValue="response">
                            <TabsList className="h-8">
                              {ep.body && <TabsTrigger value="body" className="text-xs">Body</TabsTrigger>}
                              <TabsTrigger value="response" className="text-xs">Response</TabsTrigger>
                              <TabsTrigger value="curl" className="text-xs">cURL</TabsTrigger>
                              <TabsTrigger value="python" className="text-xs">Python</TabsTrigger>
                              <TabsTrigger value="js" className="text-xs">JavaScript</TabsTrigger>
                            </TabsList>
                            {ep.body && (
                              <TabsContent value="body">
                                <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                                  <code>{ep.body}</code>
                                </pre>
                              </TabsContent>
                            )}
                            <TabsContent value="response">
                              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                                <code>{ep.response}</code>
                              </pre>
                            </TabsContent>
                            <TabsContent value="curl">
                              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                                <code>{generateCurl(ep)}</code>
                              </pre>
                            </TabsContent>
                            <TabsContent value="python">
                              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                                <code>{generatePython(ep)}</code>
                              </pre>
                            </TabsContent>
                            <TabsContent value="js">
                              <pre className="bg-muted p-3 rounded-lg text-xs overflow-x-auto">
                                <code>{generateJS(ep)}</code>
                              </pre>
                            </TabsContent>
                          </Tabs>
                        </CardContent>
                      </Card>
                    );
                  })}
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}

        {/* Integration Examples */}
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Exemplos de Integração
            </CardTitle>
            <CardDescription>Conecte o NexaProspect com qualquer plataforma</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                { name: 'n8n / Zapier / Make', desc: 'Use HTTP Request node com X-API-Key' },
                { name: 'ChatGPT / GPTs', desc: 'Use como Action no GPT Builder com OpenAPI schema' },
                { name: 'CRM Externo', desc: 'Sincronize leads bidirecionalmente via API' },
                { name: 'Google Sheets', desc: 'Apps Script + fetch para exportar leads' },
                { name: 'Formulários Web', desc: 'POST /leads no submit do formulário' },
                { name: 'Chatbots', desc: 'POST /ai/reply para respostas inteligentes' },
              ].map((item) => (
                <div key={item.name} className="p-3 rounded-lg border bg-muted/30">
                  <p className="font-medium text-sm">{item.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Rate Limits */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rate Limits & Boas Práticas</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>• <strong>Rate limit:</strong> 100 requisições/minuto por API Key</p>
            <p>• <strong>Paginação:</strong> Máximo 100 itens por página (default: 50)</p>
            <p>• <strong>Envio de mensagens:</strong> Respeite os limites anti-ban configurados</p>
            <p>• <strong>Erros:</strong> Respostas de erro incluem <code className="bg-muted px-1 py-0.5 rounded text-xs">success: false</code> e campo <code className="bg-muted px-1 py-0.5 rounded text-xs">error</code></p>
            <p>• <strong>CORS:</strong> Habilitado para todas as origens — pode chamar do frontend</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

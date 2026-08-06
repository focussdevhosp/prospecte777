import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useUserSettings } from '@/hooks/use-user-settings';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Settings,
  MessageSquare,
  Send,
  BarChart3,
  ArrowRight,
  Smartphone,
  Bot,
  Users,
  Zap,
  Target,
  Sparkles,
} from 'lucide-react';

export default function TutorialPage() {
  const { settings } = useUserSettings();

  const isAgentConfigured = !!(settings?.agent_name && settings?.services_offered?.length);
  const isWhatsAppConnected = !!settings?.whatsapp_connected;
  const hasTargets = !!(settings?.target_niches?.length || settings?.target_locations?.length);

  const steps = [
    {
      number: 1,
      title: 'Configure seu Agente',
      description: 'Defina nome, serviços e personalidade da IA',
      icon: Bot,
      link: '/settings',
      isComplete: isAgentConfigured,
      color: 'from-primary to-primary',
    },
    {
      number: 2,
      title: 'Conecte o WhatsApp',
      description: 'Escaneie o QR Code para conectar',
      icon: Smartphone,
      link: '/settings',
      isComplete: isWhatsAppConnected,
      color: 'from-success to-success',
    },
    {
      number: 3,
      title: 'Capture Leads',
      description: 'Busque empresas por nicho e cidade',
      icon: Target,
      link: '/prospecting',
      isComplete: false,
      color: 'from-info to-info',
    },
    {
      number: 4,
      title: 'Envie Mensagens',
      description: 'Dispare mensagens personalizadas',
      icon: Send,
      link: '/prospecting',
      isComplete: false,
      color: 'from-brand to-warning',
    },
    {
      number: 5,
      title: 'Gerencie Conversas',
      description: 'Acompanhe respostas em tempo real',
      icon: MessageSquare,
      link: '/conversations',
      isComplete: false,
      color: 'from-brand to-destructive',
    },
  ];

  const completedSteps = [isAgentConfigured, isWhatsAppConnected].filter(Boolean).length;

  return (
    <DashboardLayout
      title="Tutorial"
      description="Configure o Prospecte em 5 passos simples"
    >
      <div className="max-w-3xl mx-auto space-y-8">
        {/* Status Card */}
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold">
                  {completedSteps === 2 ? '🎉 Pronto para prospectar!' : `${completedSteps}/2 configurações básicas`}
                </h2>
                <p className="text-muted-foreground mt-1">
                  {completedSteps === 2 
                    ? 'Vá para Prospecção e comece a capturar leads' 
                    : 'Complete as configurações para começar'}
                </p>
              </div>
              {completedSteps === 2 && (
                <Button asChild size="lg" className="gap-2">
                  <Link to="/prospecting">
                    <Zap className="h-4 w-4" />
                    Começar
                  </Link>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Steps */}
        <div className="space-y-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isAccessible = index === 0 || steps[index - 1].isComplete || index >= 2;
            
            return (
              <Card 
                key={step.number} 
                className={`transition-all duration-300 ${
                  step.isComplete 
                    ? 'border-primary/50 bg-primary/5' 
                    : isAccessible 
                    ? 'hover:border-primary/30 hover:shadow-md cursor-pointer' 
                    : 'opacity-50'
                }`}
              >
                <CardContent className="py-5">
                  <div className="flex items-center gap-4">
                    {/* Step Number/Icon */}
                    <div className={`
                      w-14 h-14 rounded-xl flex items-center justify-center shrink-0
                      bg-gradient-to-br ${step.color} ${step.isComplete ? 'opacity-100' : 'opacity-70'}
                    `}>
                      {step.isComplete ? (
                        <CheckCircle2 className="h-7 w-7 text-white" />
                      ) : (
                        <Icon className="h-7 w-7 text-white" />
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">
                          {step.number}. {step.title}
                        </h3>
                        {step.isComplete && (
                          <Badge className="bg-primary/20 text-primary border-0">
                            ✓ Feito
                          </Badge>
                        )}
                      </div>
                      <p className="text-muted-foreground">
                        {step.description}
                      </p>
                    </div>

                    {/* Action */}
                    {!step.isComplete && isAccessible && (
                      <Button asChild variant={index < 2 ? 'default' : 'outline'}>
                        <Link to={step.link} className="gap-2">
                          {index < 2 ? 'Configurar' : 'Ir'}
                          <ArrowRight className="h-4 w-4" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Features Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              O que o Prospecte faz por você
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Target className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Captura Automática</p>
                  <p className="text-sm text-muted-foreground">
                    Encontra empresas no Google Maps por nicho e cidade
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Bot className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">IA Conversacional</p>
                  <p className="text-sm text-muted-foreground">
                    Responde leads automaticamente com memória de longo prazo
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <Send className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Envio Anti-Ban</p>
                  <p className="text-sm text-muted-foreground">
                    Intervalos inteligentes e aquecimento gradual
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                <BarChart3 className="h-5 w-5 text-primary mt-0.5" />
                <div>
                  <p className="font-medium">Analytics Completo</p>
                  <p className="text-sm text-muted-foreground">
                    Taxas de resposta, melhores horários e nichos
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Links */}
        <div className="grid gap-4 md:grid-cols-3">
          <Link to="/settings">
            <Card className="h-full hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
              <CardContent className="py-4 flex items-center gap-3">
                <Settings className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Configurações</span>
              </CardContent>
            </Card>
          </Link>
          <Link to="/leads">
            <Card className="h-full hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
              <CardContent className="py-4 flex items-center gap-3">
                <Users className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Meus Leads</span>
              </CardContent>
            </Card>
          </Link>
          <Link to="/analytics">
            <Card className="h-full hover:border-primary/30 hover:shadow-md transition-all cursor-pointer">
              <CardContent className="py-4 flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-muted-foreground" />
                <span className="font-medium">Analytics</span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}

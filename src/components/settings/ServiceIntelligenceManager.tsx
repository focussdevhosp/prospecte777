import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { useServiceIntelligence, ServiceIntelligence } from '@/hooks/use-service-intelligence';
import {
  Brain,
  Plus,
  Loader2,
  Trash2,
  Edit,
  ChevronRight,
  Target,
  MessageSquare,
  TrendingUp,
  Sparkles,
  BookOpen,
  HelpCircle,
  CheckCircle2,
} from 'lucide-react';

export function ServiceIntelligenceManager() {
  const {
    services,
    isLoading,
    isGenerating,
    generateService,
    deleteService,
    isDeleting,
  } = useServiceIntelligence();

  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [selectedService, setSelectedService] = useState<ServiceIntelligence | null>(null);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceContext, setNewServiceContext] = useState('');

  const handleAddService = () => {
    if (!newServiceName.trim()) return;
    
    generateService(
      { serviceName: newServiceName.trim(), context: newServiceContext.trim() || undefined },
      {
        onSuccess: () => {
          setShowAddDialog(false);
          setNewServiceName('');
          setNewServiceContext('');
        },
      }
    );
  };

  const handleViewDetails = (service: ServiceIntelligence) => {
    setSelectedService(service);
    setShowDetailsDialog(true);
  };

  const handleDeleteService = (serviceId: string) => {
    if (confirm('Tem certeza que deseja remover este serviço e toda sua inteligência?')) {
      deleteService(serviceId);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              Inteligência de Serviços
            </CardTitle>
            <CardDescription>
              Gerencie o conhecimento do agente sobre cada serviço
            </CardDescription>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Novo Serviço
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : services && services.length > 0 ? (
          <div className="space-y-3">
            {services.map((service) => (
              <div
                key={service.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{service.service_name}</h4>
                    {service.conversion_rate > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {service.conversion_rate.toFixed(1)}% conversão
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                    {service.description || 'Sem descrição'}
                  </p>
                  <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                    <span>{service.total_sent || 0} enviados</span>
                    <span>{service.total_responses || 0} respostas</span>
                    <span>{service.total_meetings || 0} reuniões</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewDetails(service)}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteService(service.id)}
                    disabled={isDeleting}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Brain className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Nenhum serviço cadastrado ainda</p>
            <p className="text-sm">Adicione um serviço para treinar o agente</p>
          </div>
        )}
      </CardContent>

      {/* Add Service Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5" />
              Novo Serviço com IA
            </DialogTitle>
            <DialogDescription>
              A IA irá gerar automaticamente templates, objeções, FAQs e toda a
              inteligência necessária para vender este serviço.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium">Nome do Serviço *</label>
              <Input
                placeholder="Ex: Gestão de Tráfego Pago"
                value={newServiceName}
                onChange={(e) => setNewServiceName(e.target.value)}
                disabled={isGenerating}
              />
            </div>

            <div>
              <label className="text-sm font-medium">
                Contexto Adicional (opcional)
              </label>
              <Textarea
                placeholder="Informações específicas sobre como você oferece este serviço, preços, diferenciais..."
                value={newServiceContext}
                onChange={(e) => setNewServiceContext(e.target.value)}
                disabled={isGenerating}
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Quanto mais contexto, mais personalizada será a inteligência gerada
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={isGenerating}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleAddService}
              disabled={!newServiceName.trim() || isGenerating}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando inteligência...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Criar com IA
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              {selectedService?.service_name}
            </DialogTitle>
            <DialogDescription>
              {selectedService?.description}
            </DialogDescription>
          </DialogHeader>

          {selectedService && (
            <Accordion type="multiple" className="w-full">
              {/* Benefits */}
              <AccordionItem value="benefits">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    Benefícios ({selectedService.benefits?.length || 0})
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-1">
                    {selectedService.benefits?.map((benefit, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-success">•</span>
                        {benefit}
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>

              {/* Pain Points */}
              <AccordionItem value="pain_points">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-destructive" />
                    Dores que Resolve ({selectedService.pain_points?.length || 0})
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-1">
                    {selectedService.pain_points?.map((pain, i) => (
                      <li key={i} className="text-sm flex items-start gap-2">
                        <span className="text-destructive">•</span>
                        {pain}
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>

              {/* Objection Responses */}
              <AccordionItem value="objections">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-warning" />
                    Respostas a Objeções
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3">
                    {selectedService.objection_responses &&
                      Object.entries(selectedService.objection_responses).map(
                        ([type, response]) => (
                          <div key={type} className="text-sm">
                            <span className="font-medium capitalize">{type}:</span>
                            <p className="text-muted-foreground mt-1">{response}</p>
                          </div>
                        )
                      )}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Templates */}
              <AccordionItem value="templates">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-info" />
                    Templates de Mensagem
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4">
                    {selectedService.opening_templates?.length ? (
                      <div>
                        <h5 className="text-sm font-medium mb-2">Abertura</h5>
                        {selectedService.opening_templates.map((t, i) => (
                          <p key={i} className="text-sm text-muted-foreground bg-muted p-2 rounded mb-2">
                            {t}
                          </p>
                        ))}
                      </div>
                    ) : null}

                    {selectedService.follow_up_templates?.length ? (
                      <div>
                        <h5 className="text-sm font-medium mb-2">Follow-up</h5>
                        {selectedService.follow_up_templates.map((t, i) => (
                          <p key={i} className="text-sm text-muted-foreground bg-muted p-2 rounded mb-2">
                            {t}
                          </p>
                        ))}
                      </div>
                    ) : null}

                    {selectedService.closing_templates?.length ? (
                      <div>
                        <h5 className="text-sm font-medium mb-2">Fechamento</h5>
                        {selectedService.closing_templates.map((t, i) => (
                          <p key={i} className="text-sm text-muted-foreground bg-muted p-2 rounded mb-2">
                            {t}
                          </p>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </AccordionContent>
              </AccordionItem>

              {/* Target Niches */}
              <AccordionItem value="niches">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Nichos Alvo ({selectedService.target_niches?.length || 0})
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-wrap gap-2">
                    {selectedService.target_niches?.map((niche, i) => (
                      <Badge key={i} variant="secondary">
                        {niche}
                      </Badge>
                    ))}
                  </div>
                  {selectedService.ideal_client_profile && (
                    <div className="mt-3">
                      <h5 className="text-sm font-medium mb-1">Cliente Ideal</h5>
                      <p className="text-sm text-muted-foreground">
                        {selectedService.ideal_client_profile}
                      </p>
                    </div>
                  )}
                </AccordionContent>
              </AccordionItem>

              {/* FAQ */}
              <AccordionItem value="faq">
                <AccordionTrigger>
                  <div className="flex items-center gap-2">
                    <HelpCircle className="h-4 w-4 text-info" />
                    FAQ ({selectedService.faq?.length || 0})
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-3">
                    {selectedService.faq?.map((item, i) => (
                      <div key={i}>
                        <h5 className="text-sm font-medium">{item.question}</h5>
                        <p className="text-sm text-muted-foreground mt-1">
                          {item.answer}
                        </p>
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

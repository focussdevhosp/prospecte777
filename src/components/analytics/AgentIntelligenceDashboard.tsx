import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { 
  Brain, 
  TrendingUp, 
  AlertTriangle, 
  Target, 
  Clock, 
  FileText,
  Flame,
  RefreshCw,
  CheckCircle,
  XCircle,
  Zap
} from "lucide-react";
import {
  useNichePatterns,
  useAgentEscalations,
  useHotLeads,
  useGeneratedProposals,
  useResolveEscalation,
  useAnalyzePatterns,
} from "@/hooks/use-agent-intelligence";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function AgentIntelligenceDashboard() {
  const { data: patterns, isLoading: patternsLoading } = useNichePatterns();
  const { data: escalations } = useAgentEscalations("pending");
  const { data: hotLeads } = useHotLeads();
  const { data: proposals } = useGeneratedProposals();
  
  const resolveEscalation = useResolveEscalation();
  const analyzePatterns = useAnalyzePatterns();

  const [selectedEscalation, setSelectedEscalation] = useState<any>(null);
  const [resolutionNotes, setResolutionNotes] = useState("");

  const handleResolve = async () => {
    if (!selectedEscalation) return;
    await resolveEscalation.mutateAsync({
      escalationId: selectedEscalation.id,
      resolution_notes: resolutionNotes,
    });
    setSelectedEscalation(null);
    setResolutionNotes("");
  };

  const priorityColors: Record<string, string> = {
    urgent: "bg-destructive",
    high: "bg-brand",
    medium: "bg-warning",
    low: "bg-info",
  };

  const signalTypeLabels: Record<string, string> = {
    price_inquiry: "Pergunta de Preço",
    timeline_mention: "Menção de Prazo",
    competitor_comparison: "Comparação com Concorrente",
    feature_interest: "Interesse em Feature",
    urgency_expression: "Expressou Urgência",
    decision_maker_mention: "Mencionou Decisor",
    budget_disclosure: "Revelou Orçamento",
    meeting_request: "Pediu Reunião",
    proposal_request: "Pediu Proposta",
    other: "Outro",
  };

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Escalações Pendentes</CardTitle>
            <AlertTriangle className="h-4 w-4 text-brand" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{escalations?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {escalations?.filter(e => e.priority === "urgent").length || 0} urgentes
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Leads Quentes</CardTitle>
            <Flame className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{hotLeads?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Alta probabilidade de fechar
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Propostas Geradas</CardTitle>
            <FileText className="h-4 w-4 text-info" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{proposals?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              {proposals?.filter(p => p.status === "sent").length || 0} enviadas
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Nichos Analisados</CardTitle>
            <Brain className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{patterns?.length || 0}</div>
            <p className="text-xs text-muted-foreground">
              Com padrões identificados
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="escalations" className="space-y-4">
        <TabsList>
          <TabsTrigger value="escalations" className="gap-2">
            <AlertTriangle className="h-4 w-4" />
            Escalações ({escalations?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="hot-leads" className="gap-2">
            <Flame className="h-4 w-4" />
            Leads Quentes ({hotLeads?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="patterns" className="gap-2">
            <Brain className="h-4 w-4" />
            Padrões
          </TabsTrigger>
          <TabsTrigger value="proposals" className="gap-2">
            <FileText className="h-4 w-4" />
            Propostas
          </TabsTrigger>
        </TabsList>

        {/* Escalations Tab */}
        <TabsContent value="escalations" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Escalações para Revisão Humana</h3>
          </div>

          {escalations?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-success mb-4" />
                <p className="text-muted-foreground">Nenhuma escalação pendente</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {escalations?.map((escalation: any) => (
                <Card key={escalation.id} className="overflow-hidden">
                  <div className={`h-1 ${priorityColors[escalation.priority]}`} />
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="capitalize">
                            {escalation.priority}
                          </Badge>
                          <Badge variant="secondary">
                            {escalation.escalation_reason.replace(/_/g, " ")}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {formatDistanceToNow(new Date(escalation.created_at), { 
                              addSuffix: true, 
                              locale: ptBR 
                            })}
                          </span>
                        </div>

                        <div>
                          <p className="font-medium">{escalation.leads?.business_name}</p>
                          <p className="text-sm text-muted-foreground">
                            {escalation.leads?.phone} • {escalation.leads?.niche}
                          </p>
                        </div>

                        <p className="text-sm">{escalation.context}</p>

                        {escalation.recommended_action && (
                          <div className="bg-muted/50 p-2 rounded text-sm">
                            <strong>Ação recomendada:</strong> {escalation.recommended_action}
                          </div>
                        )}
                      </div>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setSelectedEscalation(escalation)}
                      >
                        Resolver
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Hot Leads Tab */}
        <TabsContent value="hot-leads" className="space-y-4">
          <h3 className="text-lg font-medium">Leads com Alta Probabilidade de Fechamento</h3>

          {hotLeads?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Target className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum lead quente identificado</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {hotLeads?.map((item: any) => (
                <Card key={item.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{item.leads?.business_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {item.leads?.niche}
                        </p>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2">
                          <Flame className="h-4 w-4 text-brand" />
                          <span className="font-bold text-lg">{item.close_probability}%</span>
                        </div>
                        <p className="text-xs text-muted-foreground">Probabilidade</p>
                      </div>
                    </div>

                    <div className="mt-3 space-y-2">
                      <Progress value={item.close_probability} className="h-2" />
                      
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-muted-foreground">BANT Score:</span>{" "}
                          <span className="font-medium">{item.qualification_score}/100</span>
                        </div>
                        {item.deal_value_estimate && (
                          <div>
                            <span className="text-muted-foreground">Valor:</span>{" "}
                            <span className="font-medium">
                              R$ {item.deal_value_estimate.toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Patterns Tab */}
        <TabsContent value="patterns" className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">Padrões de Conversão por Nicho</h3>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => analyzePatterns.mutate("analyze_best_hours")}
                disabled={analyzePatterns.isPending}
              >
                <Clock className="h-4 w-4 mr-2" />
                Analisar Horários
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => analyzePatterns.mutate("analyze_conversion_patterns")}
                disabled={analyzePatterns.isPending}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${analyzePatterns.isPending ? 'animate-spin' : ''}`} />
                Atualizar Padrões
              </Button>
            </div>
          </div>

          {patterns?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Brain className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhum padrão identificado ainda</p>
                <p className="text-sm text-muted-foreground">
                  Continue prospectando para o agente aprender
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {patterns?.map((pattern) => (
                <Card key={pattern.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center justify-between">
                      {pattern.niche}
                      <Badge variant={pattern.response_rate > 20 ? "default" : "secondary"}>
                        {pattern.response_rate.toFixed(1)}% resposta
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-2xl font-bold">{pattern.total_contacts}</p>
                        <p className="text-xs text-muted-foreground">Contatos</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{pattern.total_responses}</p>
                        <p className="text-xs text-muted-foreground">Respostas</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold">{pattern.total_conversions}</p>
                        <p className="text-xs text-muted-foreground">Conversões</p>
                      </div>
                    </div>

                    {pattern.best_contact_hours?.length > 0 && (
                      <div>
                        <p className="text-sm text-muted-foreground mb-1">
                          <Clock className="h-3 w-3 inline mr-1" />
                          Melhores horários:
                        </p>
                        <div className="flex gap-1">
                          {pattern.best_contact_hours.map((hour) => (
                            <Badge key={hour} variant="outline">{hour}h</Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {pattern.best_opening_style && (
                      <div>
                        <p className="text-sm text-muted-foreground">Melhor abordagem:</p>
                        <p className="text-sm">{pattern.best_opening_style}</p>
                      </div>
                    )}

                    {pattern.conversion_rate > 0 && (
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4 text-success" />
                        <span className="text-sm">
                          Taxa de conversão: {pattern.conversion_rate.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Proposals Tab */}
        <TabsContent value="proposals" className="space-y-4">
          <h3 className="text-lg font-medium">Propostas Geradas</h3>

          {proposals?.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Nenhuma proposta gerada ainda</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {proposals?.map((proposal: any) => (
                <Card key={proposal.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{proposal.proposal_title}</p>
                        <p className="text-sm text-muted-foreground">
                          {proposal.leads?.business_name} • {proposal.leads?.niche}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          proposal.status === "accepted" ? "default" :
                          proposal.status === "sent" ? "secondary" :
                          "outline"
                        }>
                          {proposal.status === "draft" ? "Rascunho" :
                           proposal.status === "sent" ? "Enviada" :
                           proposal.status === "viewed" ? "Visualizada" :
                           proposal.status === "accepted" ? "Aceita" :
                           proposal.status === "rejected" ? "Rejeitada" : proposal.status}
                        </Badge>
                      </div>
                    </div>

                    {proposal.pricing_breakdown?.total && (
                      <div className="mt-2">
                        <span className="text-lg font-bold">
                          R$ {proposal.pricing_breakdown.total.toLocaleString()}
                        </span>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground mt-2">
                      Criada {formatDistanceToNow(new Date(proposal.created_at), { 
                        addSuffix: true, 
                        locale: ptBR 
                      })}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Resolve Escalation Dialog */}
      <Dialog open={!!selectedEscalation} onOpenChange={() => setSelectedEscalation(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolver Escalação</DialogTitle>
            <DialogDescription>
              {selectedEscalation?.leads?.business_name} - {selectedEscalation?.escalation_reason?.replace(/_/g, " ")}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-muted/50 p-3 rounded">
              <p className="text-sm font-medium">Contexto:</p>
              <p className="text-sm">{selectedEscalation?.context}</p>
            </div>

            <div>
              <label className="text-sm font-medium">Notas da resolução:</label>
              <Textarea
                placeholder="Descreva como foi resolvido..."
                value={resolutionNotes}
                onChange={(e) => setResolutionNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedEscalation(null)}>
              Cancelar
            </Button>
            <Button onClick={handleResolve} disabled={resolveEscalation.isPending}>
              {resolveEscalation.isPending ? "Resolvendo..." : "Marcar como Resolvido"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

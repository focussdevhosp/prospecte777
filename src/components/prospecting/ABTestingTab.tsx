import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useTemplates } from '@/hooks/use-templates';
import { decideWinner } from '../../../supabase/functions/_shared/agents/ab';
import { useABTests } from '@/hooks/use-ab-tests';
import { useToast } from '@/hooks/use-toast';
import {
  FlaskConical,
  Plus,
  Play,
  Pause,
  TrendingUp,
  Trophy,
  MessageSquare,
  CheckCircle2,
  Trash2,
  Copy,
} from 'lucide-react';

export function ABTestingTab() {
  const { templates } = useTemplates();
  const { tests, isLoading, createTest, updateTest, deleteTest, isCreating } = useABTests();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([]);

  const runningTests = tests.filter(t => t.status === 'running');
  const completedTests = tests.filter(t => t.status === 'completed');

  // A conta que existia aqui era uma copia da do cron, e as duas decidiam por
  // TAXA DE RESPOSTA. E a metrica que engana: a mensagem que promete demais
  // ganha em resposta e perde na venda. Pior, o botao "Declarar Vencedor"
  // colocava essa conclusao errada na mao do usuario com ar de estatistica.
  //
  // Agora a decisao e uma so, compartilhada com o cron, e olha receita
  // primeiro, negocio fechado depois, resposta so em ultimo caso -- dizendo
  // qual das tres decidiu.
  const decisionFor = (test: {
    variant_a_sent: number; variant_a_responses: number; variant_a_conversions: number;
    variant_b_sent: number; variant_b_responses: number; variant_b_conversions: number;
    min_sample_size: number;
  }) =>
    decideWinner(
      {
        sent: test.variant_a_sent,
        replied: test.variant_a_responses,
        converted: test.variant_a_conversions,
        revenueCents: 0,
      },
      {
        sent: test.variant_b_sent,
        replied: test.variant_b_responses,
        converted: test.variant_b_conversions,
        revenueCents: 0,
      },
      test.min_sample_size,
    );

  const toggleTemplateSelection = (templateId: string) => {
    setSelectedTemplates(prev => {
      if (prev.includes(templateId)) return prev.filter(id => id !== templateId);
      if (prev.length >= 2) return prev;
      return [...prev, templateId];
    });
  };

  const handleCreateTest = () => {
    if (selectedTemplates.length !== 2) return;
    const tA = templates?.find(t => t.id === selectedTemplates[0]);
    const tB = templates?.find(t => t.id === selectedTemplates[1]);
    if (!tA || !tB) return;

    createTest({
      name: `Teste: ${tA.name} vs ${tB.name}`,
      niche: tA.niche === tB.niche ? tA.niche : 'Múltiplos',
      variant_a_name: tA.name,
      variant_b_name: tB.name,
      variant_a_content: tA.content,
      variant_b_content: tB.content,
      variant_a_template_id: tA.id,
      variant_b_template_id: tB.id,
    });
    setSelectedTemplates([]);
    setIsDialogOpen(false);
  };

  const avgImprovement = completedTests.length > 0
    ? completedTests.reduce((sum, t) => {
        const rA = t.variant_a_sent > 0 ? t.variant_a_responses / t.variant_a_sent : 0;
        const rB = t.variant_b_sent > 0 ? t.variant_b_responses / t.variant_b_sent : 0;
        const diff = Math.abs(rA - rB) / Math.max(Math.min(rA, rB), 0.01);
        return sum + diff * 100;
      }, 0) / completedTests.length
    : 0;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-full" />
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">Testes A/B</h3>
          <p className="text-sm text-muted-foreground">
            Compare diferentes versões de mensagens para descobrir qual converte mais
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Novo Teste
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Criar Novo Teste A/B</DialogTitle>
              <DialogDescription>
                Selecione 2 templates para comparar. O teste será iniciado automaticamente.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base">Selecione 2 Templates</Label>
                <Badge variant={selectedTemplates.length === 2 ? 'default' : 'secondary'}>
                  {selectedTemplates.length}/2 selecionados
                </Badge>
              </div>
              {(!templates || templates.length === 0) ? (
                <div className="text-center py-8 text-muted-foreground">
                  <MessageSquare className="h-10 w-10 mx-auto mb-2 opacity-50" />
                  <p>Nenhum template disponível.</p>
                  <p className="text-sm">Crie templates na aba "Templates" primeiro.</p>
                </div>
              ) : (
                <div className="grid gap-3 max-h-[400px] overflow-y-auto pr-2">
                  {templates.map(template => {
                    const isSelected = selectedTemplates.includes(template.id);
                    return (
                      <div
                        key={template.id}
                        onClick={() => toggleTemplateSelection(template.id)}
                        className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          isSelected ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                              isSelected ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                            }`}>
                              {isSelected && <CheckCircle2 className="h-3 w-3 text-primary-foreground" />}
                            </div>
                            <span className="font-medium">{template.name}</span>
                          </div>
                          <Badge variant="outline">{template.niche}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-2">{template.content}</p>
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedTemplates.length === 2 && (
                <div className="p-4 rounded-lg bg-primary/10 border border-primary/20">
                  <div className="flex items-center gap-2 mb-2">
                    <FlaskConical className="h-4 w-4 text-primary" />
                    <span className="font-medium text-primary">Configuração Automática</span>
                  </div>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Distribuição 50/50 entre as variantes</li>
                    <li>• Amostra mínima: 50 envios por variante</li>
                    <li>• Análise estatística em tempo real</li>
                  </ul>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setIsDialogOpen(false); setSelectedTemplates([]); }}>
                Cancelar
              </Button>
              <Button onClick={handleCreateTest} disabled={selectedTemplates.length !== 2 || isCreating}>
                <Play className="h-4 w-4 mr-2" />
                Iniciar Teste
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Testes Ativos</p>
                <p className="text-3xl font-bold">{runningTests.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-primary/20">
                <FlaskConical className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Concluídos</p>
                <p className="text-3xl font-bold">{completedTests.length}</p>
              </div>
              <div className="p-3 rounded-xl bg-success/20">
                <CheckCircle2 className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Melhoria Média</p>
                <p className="text-3xl font-bold text-success">+{avgImprovement.toFixed(0)}%</p>
              </div>
              <div className="p-3 rounded-xl bg-success/20">
                <TrendingUp className="h-6 w-6 text-success" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Tests */}
      {runningTests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="h-5 w-5 text-success" />
              Testes em Execução
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {runningTests.map(test => {
              const totalSent = test.variant_a_sent + test.variant_b_sent;
              const progress = Math.min(100, (totalSent / (test.min_sample_size * 2)) * 100);
              const decision = decisionFor(test);
              const significance = decision.confidence;
              const rateA = test.variant_a_sent > 0 ? test.variant_a_responses / test.variant_a_sent : 0;
              const rateB = test.variant_b_sent > 0 ? test.variant_b_responses / test.variant_b_sent : 0;
              const aLeading = decision.winner ? decision.winner === 'a' : rateA >= rateB;

              const variants = [
                { key: 'a', name: test.variant_a_name, content: test.variant_a_content, sent: test.variant_a_sent, responses: test.variant_a_responses, conversions: test.variant_a_conversions, leading: aLeading },
                { key: 'b', name: test.variant_b_name, content: test.variant_b_content, sent: test.variant_b_sent, responses: test.variant_b_responses, conversions: test.variant_b_conversions, leading: !aLeading },
              ];

              return (
                <div key={test.id} className="p-4 border rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium">{test.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{test.niche}</Badge>
                        <Badge variant="default" className="bg-success">Em execução</Badge>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {decision.winner && (
                        <Button
                          size="sm"
                          className="bg-success hover:bg-success"
                          onClick={() => {
                            updateTest({
                              id: test.id,
                              status: 'completed',
                              winner: decision.winner === 'a' ? 'variant_a' : 'variant_b',
                              confidence: decision.confidence,
                              decision_metric: decision.metric,
                              decision_reason: decision.reason,
                              completed_at: new Date().toISOString(),
                            });
                            toast({
                              title: 'Teste concluído',
                              description: decision.reason,
                            });
                          }}
                        >
                          <Trophy className="h-4 w-4 mr-1" />
                          Declarar vencedor
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => updateTest({ id: test.id, status: 'paused' })}>
                        <Pause className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteTest(test.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-4">
                    {variants.map(v => {
                      const rate = v.sent > 0 ? (v.responses / v.sent) * 100 : 0;
                      return (
                        <div key={v.key} className={`p-4 rounded-lg border-2 ${v.leading && totalSent > 0 ? 'border-success bg-success/5' : 'border-muted'}`}>
                          <div className="flex items-center justify-between mb-3">
                            <span className="font-medium">{v.name}</span>
                            {v.leading && totalSent > 0 && (
                              <Badge variant="default" className="bg-success">
                                <Trophy className="h-3 w-3 mr-1" />
                                Liderando
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center mb-3">
                            <div>
                              <p className="text-lg font-bold">{v.sent}</p>
                              <p className="text-xs text-muted-foreground">Enviados</p>
                            </div>
                            <div>
                              <p className="text-lg font-bold">{rate.toFixed(1)}%</p>
                              <p className="text-xs text-muted-foreground">Resposta</p>
                            </div>
                            <div>
                              <p className="text-lg font-bold">{v.conversions}</p>
                              <p className="text-xs text-muted-foreground">Conversões</p>
                            </div>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">{v.content}</p>
                        </div>
                      );
                    })}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Progresso</span>
                      <span>{Math.round(progress)}% ({totalSent}/{test.min_sample_size * 2})</span>
                    </div>
                    <Progress value={progress} className="h-2" />
                    <div className="flex items-center justify-between text-sm mt-2">
                      <span className="text-muted-foreground">Confiança estatística</span>
                      <Badge variant={significance >= 95 ? 'default' : 'secondary'}>{significance}%</Badge>
                    </div>
                    {/* O motivo aparece sempre, inclusive quando ainda não há
                        vencedor. "Confiança 0%" sozinho não diz se faltou
                        amostra, se as variantes empataram ou se ninguém
                        respondeu — e são situações que pedem ações diferentes. */}
                    <p className="text-xs text-muted-foreground leading-relaxed pt-1">
                      {decision.reason}
                    </p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Completed Tests */}
      {completedTests.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-warning" />
              Testes Concluídos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {completedTests.map(test => {
              const rA = test.variant_a_sent > 0 ? test.variant_a_responses / test.variant_a_sent : 0;
              const rB = test.variant_b_sent > 0 ? test.variant_b_responses / test.variant_b_sent : 0;
              // O vencedor gravado manda. Recalcular pela taxa de resposta
              // aqui faria a tela discordar da decisao que foi tomada quando
              // o teste fechou -- e a decisao pode ter sido por receita.
              const winnerIsA = test.winner ? test.winner === 'variant_a' : rA >= rB;
              const improvement = Math.min(rA, rB) > 0
                ? ((Math.max(rA, rB) - Math.min(rA, rB)) / Math.min(rA, rB)) * 100
                : 0;

              const variants = [
                { key: 'a', name: test.variant_a_name, sent: test.variant_a_sent, responses: test.variant_a_responses, conversions: test.variant_a_conversions, isWinner: winnerIsA },
                { key: 'b', name: test.variant_b_name, sent: test.variant_b_sent, responses: test.variant_b_responses, conversions: test.variant_b_conversions, isWinner: !winnerIsA },
              ];

              return (
                <div key={test.id} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-medium">{test.name}</h4>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline">{test.niche}</Badge>
                        <Badge variant="secondary">Concluído</Badge>
                        {/* Decidido por venda ou por curiosidade? São conclusões
                            muito diferentes, e quem abre isto três semanas
                            depois não tem como saber sem esta etiqueta. */}
                        {test.decision_metric && (
                          <Badge
                            variant={test.decision_metric === 'resposta' ? 'outline' : 'default'}
                            className={test.decision_metric === 'resposta' ? 'border-warning text-warning' : ''}
                          >
                            {test.decision_metric === 'receita' && 'decidido por receita'}
                            {test.decision_metric === 'conversao' && 'decidido por venda'}
                            {test.decision_metric === 'resposta' && 'só por resposta'}
                          </Badge>
                        )}
                      </div>
                      {test.decision_reason && (
                        <p className="text-xs text-muted-foreground mt-2 max-w-2xl leading-relaxed">
                          {test.decision_reason}
                        </p>
                      )}
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => deleteTest(test.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid md:grid-cols-2 gap-4">
                    {variants.map(v => {
                      const rate = v.sent > 0 ? (v.responses / v.sent) * 100 : 0;
                      return (
                        <div key={v.key} className={`p-4 rounded-lg ${v.isWinner ? 'bg-success/10 border border-success/30' : 'bg-muted/50'}`}>
                          <div className="flex items-center justify-between mb-2">
                            <span className="font-medium">{v.name}</span>
                            {v.isWinner && (
                              <Badge className="bg-success">
                                <Trophy className="h-3 w-3 mr-1" />
                                Vencedor
                              </Badge>
                            )}
                          </div>
                          <div className="grid grid-cols-3 gap-2 text-center">
                            <div>
                              <p className="text-lg font-bold">{v.sent}</p>
                              <p className="text-xs text-muted-foreground">Enviados</p>
                            </div>
                            <div>
                              <p className={`text-lg font-bold ${v.isWinner ? 'text-success' : ''}`}>{rate.toFixed(1)}%</p>
                              <p className="text-xs text-muted-foreground">Resposta</p>
                            </div>
                            <div>
                              <p className="text-lg font-bold">{v.conversions}</p>
                              <p className="text-xs text-muted-foreground">Conversões</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {improvement > 0 && (
                    <div className="mt-4 p-3 bg-success/10 rounded-lg flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-success" />
                      <span className="text-sm">
                        A variante vencedora teve <strong className="text-success">+{improvement.toFixed(1)}%</strong> mais respostas
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {tests.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FlaskConical className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium">Nenhum teste A/B ainda</p>
            <p className="text-sm text-muted-foreground mb-4">
              Crie seu primeiro teste para começar a otimizar suas mensagens
            </p>
            <Button onClick={() => setIsDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Criar Primeiro Teste
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

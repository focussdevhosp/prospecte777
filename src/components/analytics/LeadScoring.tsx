import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useLeads } from '@/hooks/use-leads';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import {
  Trophy,
  TrendingUp,
  MessageSquare,
  Mail,
  Globe,
  Thermometer,
  RefreshCw,
  Loader2,
  Zap,
  Info,
} from 'lucide-react';

interface ScoreFactors {
  responded?: number;
  response_ratio?: number;
  stage?: number;
  temperature?: number;
  has_email?: number;
  has_website?: number;
}

export function LeadScoring() {
  const { leads } = useLeads();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isScoring, setIsScoring] = useState(false);

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'text-success';
    if (score >= 40) return 'text-warning';
    return 'text-muted-foreground';
  };

  const getScoreBadge = (score: number) => {
    if (score >= 70) return { label: 'Quente 🔥', variant: 'default' as const };
    if (score >= 40) return { label: 'Morno ☀️', variant: 'secondary' as const };
    return { label: 'Frio ❄️', variant: 'outline' as const };
  };

  const handleScoreAllLeads = async () => {
    setIsScoring(true);
    try {
      let scored = 0;
      for (const lead of leads) {
        await supabase.rpc('calculate_lead_score', { p_lead_id: lead.id });
        scored++;
      }

      toast({
        title: '✓ Leads pontuados',
        description: `${scored} leads foram recalculados com sucesso.`,
      });

      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (error: any) {
      toast({
        title: 'Erro ao pontuar leads',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsScoring(false);
    }
  };

  const handleScoreLead = async (leadId: string) => {
    try {
      await supabase.rpc('calculate_lead_score', { p_lead_id: leadId });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
    } catch (error) {
      console.error('Error scoring lead:', error);
    }
  };

  // Sort leads by score
  const sortedLeads = [...leads].sort((a, b) => (b.lead_score || 0) - (a.lead_score || 0));
  const topLeads = sortedLeads.slice(0, 10);

  // Calculate averages
  const avgScore = leads.length > 0
    ? Math.round(leads.reduce((sum, l) => sum + (l.lead_score || 0), 0) / leads.length)
    : 0;

  const hotLeads = leads.filter(l => (l.lead_score || 0) >= 70).length;
  const warmLeads = leads.filter(l => (l.lead_score || 0) >= 40 && (l.lead_score || 0) < 70).length;
  const coldLeads = leads.filter(l => (l.lead_score || 0) < 40).length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{avgScore}</p>
                <p className="text-xs text-muted-foreground">Score médio</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Thermometer className="h-5 w-5 text-destructive" />
              <div>
                <p className="text-2xl font-bold">{hotLeads}</p>
                <p className="text-xs text-muted-foreground">Leads quentes (70+)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <div>
                <p className="text-2xl font-bold">{warmLeads}</p>
                <p className="text-xs text-muted-foreground">Leads mornos (40-69)</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-2xl font-bold">{coldLeads}</p>
                <p className="text-xs text-muted-foreground">Leads frios (&lt;40)</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-primary" />
                Lead Scoring com IA
              </CardTitle>
              <CardDescription>
                Pontuação automática baseada em engajamento, estágio e perfil
              </CardDescription>
            </div>
            <Button onClick={handleScoreAllLeads} disabled={isScoring}>
              {isScoring ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Recalcular Todos
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Scoring explanation */}
          <div className="mb-6 p-4 bg-muted rounded-lg">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Info className="h-4 w-4" />
              Como funciona a pontuação
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span>Respondeu: +40 pts</span>
              </div>
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <span>Taxa resposta: até +20 pts</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span>Estágio: até +20 pts</span>
              </div>
              <div className="flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-primary" />
                <span>Temperatura: até +10 pts</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <span>Tem email: +5 pts</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="h-4 w-4 text-primary" />
                <span>Tem website: +5 pts</span>
              </div>
            </div>
          </div>

          {/* Top leads */}
          <h4 className="font-medium mb-3">Top 10 Leads</h4>
          <div className="space-y-3">
            {topLeads.length === 0 ? (
              <p className="text-center text-muted-foreground py-4">
                Nenhum lead encontrado. Adicione leads para ver o ranking.
              </p>
            ) : (
              topLeads.map((lead, index) => {
                const score = lead.lead_score || 0;
                const factors = (lead.score_factors || {}) as ScoreFactors;
                const badge = getScoreBadge(score);

                return (
                  <div
                    key={lead.id}
                    className="flex items-center gap-4 p-3 rounded-lg border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary/10 text-primary font-bold">
                      {index + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-medium truncate">{lead.business_name}</p>
                        <Badge variant={badge.variant}>{badge.label}</Badge>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <Progress value={score} className="h-2 flex-1" />
                        <span className={`text-sm font-bold ${getScoreColor(score)}`}>
                          {score}
                        </span>
                      </div>
                    </div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleScoreLead(lead.id)}
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="max-w-xs">
                          <div className="text-xs space-y-1">
                            <p className="font-medium">Fatores do score:</p>
                            {factors.responded && <p>✓ Respondeu: +{factors.responded}</p>}
                            {factors.response_ratio && <p>📊 Taxa: +{factors.response_ratio}</p>}
                            {factors.stage && <p>📈 Estágio: +{factors.stage}</p>}
                            {factors.temperature && <p>🌡️ Temp: +{factors.temperature}</p>}
                            {factors.has_email && <p>📧 Email: +{factors.has_email}</p>}
                            {factors.has_website && <p>🌐 Site: +{factors.has_website}</p>}
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

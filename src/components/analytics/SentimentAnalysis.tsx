import { useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useLeads } from '@/hooks/use-leads';
import {
  ThumbsUp,
  ThumbsDown,
  Meh,
  TrendingUp,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

const SENTIMENT_COLORS = {
  positive: 'hsl(var(--chart-3))',
  neutral: 'hsl(var(--chart-6))',
  negative: 'hsl(var(--destructive))',
};

const SENTIMENT_ICONS = {
  positive: ThumbsUp,
  neutral: Meh,
  negative: ThumbsDown,
};

export function SentimentAnalysis() {
  const { leads } = useLeads();

  const sentimentData = useMemo(() => {
    // Analyze temperature as a proxy for sentiment
    const positive = leads.filter(l => l.temperature === 'quente').length;
    const neutral = leads.filter(l => l.temperature === 'morno' || !l.temperature).length;
    const negative = leads.filter(l => l.temperature === 'frio').length;
    const total = leads.length;

    const respondedLeads = leads.filter(l => l.last_response_at);
    const positiveResponses = respondedLeads.filter(l => l.temperature === 'quente').length;
    const neutralResponses = respondedLeads.filter(l => l.temperature === 'morno' || !l.temperature).length;
    const negativeResponses = respondedLeads.filter(l => l.temperature === 'frio').length;

    return {
      distribution: [
        { name: 'Positivo', value: positive, color: SENTIMENT_COLORS.positive },
        { name: 'Neutro', value: neutral, color: SENTIMENT_COLORS.neutral },
        { name: 'Negativo', value: negative, color: SENTIMENT_COLORS.negative },
      ],
      responses: {
        positive: positiveResponses,
        neutral: neutralResponses,
        negative: negativeResponses,
        total: respondedLeads.length,
      },
      percentages: {
        positive: total > 0 ? (positive / total) * 100 : 0,
        neutral: total > 0 ? (neutral / total) * 100 : 0,
        negative: total > 0 ? (negative / total) * 100 : 0,
      },
      averageScore: total > 0 
        ? ((positive * 100) + (neutral * 50) + (negative * 0)) / total 
        : 50,
    };
  }, [leads]);

  const recentSentimentTrend = useMemo(() => {
    const last7DaysLeads = leads.filter(l => {
      const created = new Date(l.created_at);
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return created >= weekAgo;
    });

    const positive = last7DaysLeads.filter(l => l.temperature === 'quente').length;
    const total = last7DaysLeads.length;
    
    return total > 0 ? (positive / total) * 100 : 0;
  }, [leads]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Análise de Sentimento
            </CardTitle>
            <CardDescription>
              Classificação das respostas dos leads por IA
            </CardDescription>
          </div>
          <Badge 
            variant={sentimentData.averageScore >= 60 ? 'default' : 'secondary'}
            className="text-lg px-3 py-1"
          >
            Score: {sentimentData.averageScore.toFixed(0)}/100
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 gap-6">
          {/* Pie Chart */}
          <div>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={sentimentData.distribution}
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {sentimentData.distribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            
            <div className="flex justify-center gap-6 mt-4">
              {sentimentData.distribution.map(item => {
                const Icon = item.name === 'Positivo' ? ThumbsUp : 
                           item.name === 'Negativo' ? ThumbsDown : Meh;
                return (
                  <div key={item.name} className="text-center">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Icon className="h-4 w-4" style={{ color: item.color }} />
                      <span className="text-sm">{item.name}</span>
                    </div>
                    <p className="text-lg font-bold" style={{ color: item.color }}>
                      {item.value}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Metrics */}
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-success/10 border border-success/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ThumbsUp className="h-5 w-5 text-success" />
                  <span className="font-medium">Respostas Positivas</span>
                </div>
                <Badge variant="default" className="bg-success">
                  {sentimentData.percentages.positive.toFixed(1)}%
                </Badge>
              </div>
              <Progress 
                value={sentimentData.percentages.positive} 
                className="h-2"
              />
              <p className="text-sm text-muted-foreground mt-2">
                {sentimentData.responses.positive} leads demonstraram interesse
              </p>
            </div>

            <div className="p-4 rounded-xl bg-warning/10 border border-warning/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Meh className="h-5 w-5 text-warning" />
                  <span className="font-medium">Respostas Neutras</span>
                </div>
                <Badge variant="secondary">
                  {sentimentData.percentages.neutral.toFixed(1)}%
                </Badge>
              </div>
              <Progress 
                value={sentimentData.percentages.neutral} 
                className="h-2"
              />
              <p className="text-sm text-muted-foreground mt-2">
                {sentimentData.responses.neutral} leads aguardando engajamento
              </p>
            </div>

            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <ThumbsDown className="h-5 w-5 text-destructive" />
                  <span className="font-medium">Respostas Negativas</span>
                </div>
                <Badge variant="destructive">
                  {sentimentData.percentages.negative.toFixed(1)}%
                </Badge>
              </div>
              <Progress 
                value={sentimentData.percentages.negative} 
                className="h-2"
              />
              <p className="text-sm text-muted-foreground mt-2">
                {sentimentData.responses.negative} leads não interessados
              </p>
            </div>
          </div>
        </div>

        {/* Trend */}
        <div className="mt-6 p-4 rounded-xl bg-muted/50 border">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              <span className="font-medium">Tendência (últimos 7 dias)</span>
            </div>
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">
                {sentimentData.responses.total} respostas analisadas
              </span>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm">Taxa de sentimento positivo</span>
              <span className={`font-bold ${
                recentSentimentTrend >= 50 ? 'text-success' : 'text-warning'
              }`}>
                {recentSentimentTrend.toFixed(1)}%
              </span>
            </div>
            <Progress value={recentSentimentTrend} className="h-2" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { AdvancedAnalytics } from '@/components/analytics/AdvancedAnalytics';
import { NichePerformanceAnalytics } from '@/components/analytics/NichePerformanceAnalytics';
import { LeadScoring } from '@/components/analytics/LeadScoring';
import { ConversionFunnel } from '@/components/analytics/ConversionFunnel';
import { SentimentAnalysis } from '@/components/analytics/SentimentAnalysis';
import { AgentIntelligenceDashboard } from '@/components/analytics/AgentIntelligenceDashboard';
import { Loader2, BarChart3, Target, Trophy, TrendingUp, Sparkles, Brain } from 'lucide-react';
import { useLeads } from '@/hooks/use-leads';
import { useDashboardMetrics } from '@/hooks/use-dashboard-metrics';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const fadeIn = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } },
};

export default function AnalyticsPage() {
  const { isLoading: leadsLoading } = useLeads();
  const { isLoading: metricsLoading } = useDashboardMetrics();
  const [activeTab, setActiveTab] = useState('overview');

  const isLoading = leadsLoading || metricsLoading;

  const tabs = [
    { id: 'overview', icon: BarChart3, label: 'Visão Geral' },
    { id: 'intelligence', icon: Brain, label: 'Inteligência IA' },
    { id: 'funnel', icon: TrendingUp, label: 'Funil' },
    { id: 'sentiment', icon: Sparkles, label: 'Sentimento' },
    { id: 'niches', icon: Target, label: 'Nichos' },
    { id: 'scoring', icon: Trophy, label: 'Scoring' },
  ];

  return (
    <DashboardLayout
      eyebrow="Analisar"
      title="Análise Avançada"
      description="Métricas detalhadas e insights sobre sua prospecção"
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-4">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
              <div className="relative p-4 rounded-full bg-primary/10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            </div>
            <p className="text-sm text-muted-foreground font-medium">Carregando análises...</p>
          </div>
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.1 }}
              className="overflow-x-auto -mx-1 px-1"
            >
              <TabsList className="inline-flex h-11 p-1 bg-muted/60 backdrop-blur-sm rounded-xl gap-0.5 w-full sm:w-auto">
                {tabs.map(({ id, icon: Icon, label }) => (
                  <TabsTrigger 
                    key={id}
                    value={id} 
                    className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm data-[state=active]:text-foreground transition-all duration-200"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </TabsTrigger>
                ))}
              </TabsList>
            </motion.div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                variants={fadeIn}
                initial="hidden"
                animate="show"
                exit={{ opacity: 0, transition: { duration: 0.15 } }}
              >
                <TabsContent value="overview" className="mt-4" forceMount={activeTab === 'overview' ? true : undefined}>
                  {activeTab === 'overview' && <AdvancedAnalytics />}
                </TabsContent>

                <TabsContent value="intelligence" className="mt-4" forceMount={activeTab === 'intelligence' ? true : undefined}>
                  {activeTab === 'intelligence' && <AgentIntelligenceDashboard />}
                </TabsContent>

                <TabsContent value="funnel" className="mt-4" forceMount={activeTab === 'funnel' ? true : undefined}>
                  {activeTab === 'funnel' && <ConversionFunnel />}
                </TabsContent>

                <TabsContent value="sentiment" className="mt-4" forceMount={activeTab === 'sentiment' ? true : undefined}>
                  {activeTab === 'sentiment' && <SentimentAnalysis />}
                </TabsContent>

                <TabsContent value="niches" className="mt-4" forceMount={activeTab === 'niches' ? true : undefined}>
                  {activeTab === 'niches' && <NichePerformanceAnalytics />}
                </TabsContent>

                <TabsContent value="scoring" className="mt-4" forceMount={activeTab === 'scoring' ? true : undefined}>
                  {activeTab === 'scoring' && <LeadScoring />}
                </TabsContent>
              </motion.div>
            </AnimatePresence>
          </Tabs>
        </motion.div>
      )}
    </DashboardLayout>
  );
}

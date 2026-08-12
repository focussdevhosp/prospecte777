import { FlaskConical } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardLayout } from '@/components/DashboardLayout';
import { AiCostPanel } from '@/components/ai/AiCostPanel';
import { AiPlayground } from '@/components/ai/AiPlayground';
import { IcpProfilesPanel } from '@/components/ai/IcpProfilesPanel';
import { LearningPanel } from '@/components/ai/LearningPanel';

export default function AiCenterPage() {
  return (
    <DashboardLayout
      eyebrow="Analisar"
      title="Central de IA"
      description="Quanto a IA está gastando, e o que exatamente ela diria para cada lead — antes de dizer."
      icon={<FlaskConical className="h-5 w-5" />}
    >
      <div className="space-y-6">
        <Tabs defaultValue="laboratorio">
          <TabsList>
            <TabsTrigger value="laboratorio">Laboratório</TabsTrigger>
            <TabsTrigger value="aprendizado">O que funciona</TabsTrigger>
            <TabsTrigger value="icp">Perfil ideal</TabsTrigger>
            <TabsTrigger value="custo">Custo e teto</TabsTrigger>
          </TabsList>

          <TabsContent value="laboratorio" className="mt-6">
            <AiPlayground />
          </TabsContent>

          <TabsContent value="aprendizado" className="mt-6">
            <LearningPanel />
          </TabsContent>

          <TabsContent value="icp" className="mt-6">
            <IcpProfilesPanel />
          </TabsContent>

          <TabsContent value="custo" className="mt-6">
            <AiCostPanel />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

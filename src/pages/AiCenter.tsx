import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardLayout } from '@/components/DashboardLayout';
import { AiCostPanel } from '@/components/ai/AiCostPanel';
import { AiPlayground } from '@/components/ai/AiPlayground';
import { IcpProfilesPanel } from '@/components/ai/IcpProfilesPanel';

export default function AiCenterPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Central de IA</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Quanto a IA está gastando, e o que exatamente ela diria para cada
            lead — antes de dizer.
          </p>
        </div>

        <Tabs defaultValue="laboratorio">
          <TabsList>
            <TabsTrigger value="laboratorio">Laboratório</TabsTrigger>
            <TabsTrigger value="icp">Perfil ideal</TabsTrigger>
            <TabsTrigger value="custo">Custo e teto</TabsTrigger>
          </TabsList>

          <TabsContent value="laboratorio" className="mt-6">
            <AiPlayground />
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

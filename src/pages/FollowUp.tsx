import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { FollowUpManager } from '@/components/followup/FollowUpManager';
import { FollowUpSequencesTab } from '@/components/prospecting/FollowUpSequencesTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Clock, Layers } from 'lucide-react';
import { GroupNav, messagingGroup } from '@/components/GroupNav';

const fadeSlide = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2 } },
};

export default function FollowUpPage() {
  const [activeTab, setActiveTab] = useState('pending');

  return (
    <DashboardLayout
      eyebrow="Comunicar"
      title="Disparos"
      description="Envie mensagens em massa, follow-ups e reative leads frios"
    >
      <GroupNav items={messagingGroup} />
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      >
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList>
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-4 w-4" />
              Pendentes
            </TabsTrigger>
            <TabsTrigger value="sequences" className="gap-2">
              <Layers className="h-4 w-4" />
              Sequências
            </TabsTrigger>
          </TabsList>

          <AnimatePresence mode="wait">
            <motion.div key={activeTab} {...fadeSlide}>
              <TabsContent value="pending" forceMount={activeTab === 'pending' ? true : undefined} className={activeTab !== 'pending' ? 'hidden' : ''}>
                <FollowUpManager />
              </TabsContent>

              <TabsContent value="sequences" forceMount={activeTab === 'sequences' ? true : undefined} className={activeTab !== 'sequences' ? 'hidden' : ''}>
                <FollowUpSequencesTab />
              </TabsContent>
            </motion.div>
          </AnimatePresence>
        </Tabs>
      </motion.div>
    </DashboardLayout>
  );
}

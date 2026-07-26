import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { MassSendTab } from '@/components/prospecting/MassSendTab';
import { GroupNav, messagingGroup } from '@/components/GroupNav';

export default function MassSendPage() {
  return (
    <DashboardLayout
      title="Disparos"
      description="Envie mensagens em massa, follow-ups e reative leads frios"
    >
      <GroupNav items={messagingGroup} />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <MassSendTab />
      </motion.div>
    </DashboardLayout>
  );
}

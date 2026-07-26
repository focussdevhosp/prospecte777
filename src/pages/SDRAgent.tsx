import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { SDRAgentDashboard } from '@/components/sdr/SDRAgentDashboard';
import { GroupNav, campaignsGroup } from '@/components/GroupNav';

export default function SDRAgentPage() {
  return (
    <DashboardLayout
      title="Campanhas"
      description="Campanhas ativas, testes A/B, Agente SDR e reuniões"
    >
      <GroupNav items={campaignsGroup} />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <SDRAgentDashboard />
      </motion.div>
    </DashboardLayout>
  );
}

import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { CampaignsTab } from '@/components/prospecting/CampaignsTab';
import { GroupNav, campaignsGroup } from '@/components/GroupNav';

export default function CampaignsPage() {
  return (
    <DashboardLayout
      eyebrow="Vender"
      title="Campanhas"
      description="Campanhas ativas, testes A/B, Agente SDR e reuniões"
    >
      <GroupNav items={campaignsGroup} />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <CampaignsTab />
      </motion.div>
    </DashboardLayout>
  );
}

import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { AntiBanDashboard } from '@/components/antiban';
import { GroupNav, libraryGroup } from '@/components/GroupNav';

export default function AntiBanPage() {
  return (
    <DashboardLayout
      title="Biblioteca"
      description="Templates, quebra de objeções e proteções anti-ban"
    >
      <GroupNav items={libraryGroup} />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <AntiBanDashboard />
      </motion.div>
    </DashboardLayout>
  );
}

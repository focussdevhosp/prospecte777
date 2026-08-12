import { motion } from 'framer-motion';
import { DashboardLayout } from '@/components/DashboardLayout';
import { ProspectingHistoryTab } from '@/components/prospecting/ProspectingHistoryTab';
import { useNavigate } from 'react-router-dom';

export default function ProspectingHistoryPage() {
  const navigate = useNavigate();

  const handleReprospect = (niches: string[], locations: string[]) => {
    const params = new URLSearchParams();
    if (niches.length) params.set('niches', niches.join(','));
    if (locations.length) params.set('locations', locations.join(','));
    navigate(`/google-maps?${params.toString()}`);
  };

  return (
    <DashboardLayout
      eyebrow="Prospectar"
      title="Histórico de Prospecção"
      description="Veja o histórico de todas as sessões de captura e envio"
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <ProspectingHistoryTab onReprospect={handleReprospect} />
      </motion.div>
    </DashboardLayout>
  );
}

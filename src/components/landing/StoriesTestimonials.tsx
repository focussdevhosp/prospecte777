import { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';

import avatar1 from '@/assets/avatars/avatar-1.webp';
import avatar2 from '@/assets/avatars/avatar-2.webp';
import avatar3 from '@/assets/avatars/avatar-3.webp';
import avatar4 from '@/assets/avatars/avatar-4.webp';
import avatar5 from '@/assets/avatars/avatar-5.webp';
import avatar6 from '@/assets/avatars/avatar-6.webp';
import avatar7 from '@/assets/avatars/avatar-7.webp';
import avatar8 from '@/assets/avatars/avatar-8.webp';
import avatar9 from '@/assets/avatars/avatar-9.webp';
import avatar10 from '@/assets/avatars/avatar-10.webp';

const TESTIMONIALS = [
  { name: 'Rafael S.', role: 'Agência Digital', text: 'Fechei 8 clientes em 14 dias. A IA personaliza cada mensagem — parece que eu escrevi uma por uma.', avatar: avatar1, gradient: 'from-[hsl(var(--primary))] to-[hsl(var(--brand-accent))]' },
  { name: 'Camila R.', role: 'Consultoria RH', text: 'Eu gastava 6h/dia prospectando. Hoje acordo com reuniões agendadas no meu calendário.', avatar: avatar2, gradient: 'from-[hsl(var(--stage-contact))] to-[hsl(var(--primary))]' },
  { name: 'Lucas M.', role: 'Marketing Digital', text: 'Já enviei mais de 4.000 mensagens. Zero bans. O sistema anti-ban é absurdamente eficiente.', avatar: avatar3, gradient: 'from-[hsl(var(--chart-4))] to-[hsl(var(--chart-1))]' },
  { name: 'Juliana P.', role: 'Arquitetura', text: '3x mais reuniões no primeiro mês. O ROI se pagou no segundo cliente que fechei.', avatar: avatar4, gradient: 'from-[hsl(var(--chart-3))] to-[hsl(var(--chart-6))]' },
  { name: 'Marcos T.', role: 'Advocacia', text: 'Só chega lead qualificado. A segmentação por nicho economizou horas que eu perdia com curiosos.', avatar: avatar5, gradient: 'from-[hsl(var(--brand-accent))] to-[hsl(var(--chart-6))]' },
  { name: 'Fernanda L.', role: 'E-commerce', text: 'Melhor investimento do ano. O primeiro cliente que fechei já cobriu 6 meses de assinatura.', avatar: avatar6, gradient: 'from-[hsl(var(--chart-5))] to-[hsl(var(--primary))]' },
  { name: 'André C.', role: 'Contabilidade', text: 'CRM, prospecção e follow-up num lugar só. Aposentei 3 ferramentas e economizei R$800/mês.', avatar: avatar7, gradient: 'from-[hsl(var(--chart-4))] to-[hsl(var(--stage-contact))]' },
  { name: 'Patrícia N.', role: 'Imobiliária', text: '12 contratos em 30 dias com follow-up automático. Meus corretores agora só fecham.', avatar: avatar8, gradient: 'from-[hsl(var(--stage-contact))] to-[hsl(var(--chart-4))]' },
  { name: 'Diego F.', role: 'SaaS B2B', text: 'Taxa de resposta de 35% via Google Maps. Nenhuma outra ferramenta chegou perto disso.', avatar: avatar9, gradient: 'from-[hsl(var(--chart-3))] to-[hsl(var(--chart-4))]' },
  { name: 'Beatriz A.', role: 'Clínica Estética', text: 'Lotei minha agenda da semana toda com 3 dias de prospecção automática. Simplesmente mágico.', avatar: avatar10, gradient: 'from-[hsl(var(--chart-1))] to-[hsl(var(--chart-5))]' },
];

export function StoriesTestimonials() {
  const [activeStory, setActiveStory] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (activeStory === null) return;
    setProgress(0);
    const start = Date.now();
    const duration = 5000;
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timerRef.current);
        if (activeStory < TESTIMONIALS.length - 1) {
          setActiveStory(activeStory + 1);
        } else {
          setActiveStory(null);
        }
      }
    }, 50);
    return () => clearInterval(timerRef.current);
  }, [activeStory]);

  const goNext = () => {
    if (activeStory !== null && activeStory < TESTIMONIALS.length - 1) setActiveStory(activeStory + 1);
    else setActiveStory(null);
  };

  const goPrev = () => {
    if (activeStory !== null && activeStory > 0) setActiveStory(activeStory - 1);
  };

  return (
    <>
      <div ref={scrollRef} className="flex gap-6 md:gap-7 overflow-x-auto pb-5 px-3 max-w-5xl mx-auto scrollbar-hide justify-start md:justify-center">
        {TESTIMONIALS.map((t, i) => (
          <button
            key={i}
            onClick={() => setActiveStory(i)}
            className="flex flex-col items-center gap-2.5 shrink-0 group"
          >
            <div className={`w-24 h-24 md:w-[110px] md:h-[110px] rounded-full bg-gradient-to-br ${t.gradient} p-[3px] transition-transform group-hover:scale-110`}>
              <img src={t.avatar} alt={t.name} className="w-full h-full rounded-full object-cover" loading="lazy" width={110} height={110} />
            </div>
            <span className="text-lg text-white/60 max-w-[130px] truncate">{t.name}</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {activeStory !== null && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-xl flex items-center justify-center"
            onClick={(e) => { if (e.target === e.currentTarget) setActiveStory(null); }}
          >
            <motion.div
              key={activeStory}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="relative w-[420px] md:w-[520px] max-h-[780px] rounded-3xl overflow-hidden"
            >
              <div className="absolute top-4 left-4 right-4 flex gap-1.5 z-10">
                {TESTIMONIALS.map((_, i) => (
                  <div key={i} className="flex-1 h-[4px] rounded-full bg-white/20 overflow-hidden">
                    <div
                      className="h-full bg-white rounded-full transition-all"
                      style={{
                        width: i < activeStory ? '100%' : i === activeStory ? `${progress}%` : '0%',
                        transition: i === activeStory ? 'none' : 'width 0.3s',
                      }}
                    />
                  </div>
                ))}
              </div>

              <div className={`bg-gradient-to-br ${TESTIMONIALS[activeStory].gradient} p-[1.5px] rounded-3xl`}>
                <div className="bg-[#0c0c1a] rounded-3xl px-10 py-16 min-h-[640px] flex flex-col items-center justify-center text-center gap-8">
                  <div className="flex items-center gap-4 absolute top-12 left-8">
                    <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${TESTIMONIALS[activeStory].gradient} p-[2px]`}>
                      <img src={TESTIMONIALS[activeStory].avatar} alt={TESTIMONIALS[activeStory].name} className="w-full h-full rounded-full object-cover" width={56} height={56} />
                    </div>
                    <div className="text-left">
                      <p className="text-xl font-semibold text-white">{TESTIMONIALS[activeStory].name}</p>
                      <p className="text-base text-white/60">{TESTIMONIALS[activeStory].role}</p>
                    </div>
                  </div>

                  <div className={`w-32 h-32 rounded-full bg-gradient-to-br ${TESTIMONIALS[activeStory].gradient} p-[2.5px] shadow-2xl`}>
                    <img src={TESTIMONIALS[activeStory].avatar} alt={TESTIMONIALS[activeStory].name} className="w-full h-full rounded-full object-cover" width={128} height={128} />
                  </div>

                  <p className="text-white/95 text-2xl leading-relaxed font-medium max-w-[400px]">
                    "{TESTIMONIALS[activeStory].text}"
                  </p>

                  <div className="flex gap-1 mt-2">
                    {[...Array(5)].map((_, i) => (
                      <span key={i} className="text-[hsl(var(--warning))] text-2xl">★</span>
                    ))}
                  </div>
                </div>
              </div>

              <button onClick={() => setActiveStory(null)} className="absolute top-11 right-6 z-10 text-white/60 hover:text-white">
                <X className="h-8 w-8" />
              </button>

              <button onClick={goPrev} className="absolute left-0 top-24 bottom-0 w-1/3 z-10" />
              <button onClick={goNext} className="absolute right-0 top-24 bottom-0 w-1/3 z-10" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

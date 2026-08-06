import { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { ArrowRight, Star, Check, Menu, X, Sparkles, CreditCard, Zap, BarChart3, HelpCircle, ChevronDown, TrendingUp, Search, MessageSquare, CalendarCheck, Users, Target, Clock, Rocket } from 'lucide-react';
import { motion, AnimatePresence, LazyMotion, domAnimation } from 'framer-motion';
import heroVideo from '@/assets/hero-video.mp4';
import logoImg from '@/assets/logo.webp';
import heroPhonesImg from '@/assets/hero-phones-clean.webp';
import googleMapsIcon from '@/assets/google-maps-icon.webp';
import googleGIcon from '@/assets/google-g-icon.webp';
import stepCaptureImg from '@/assets/step-capture.webp';
import stepMessagesImg from '@/assets/step-messages.webp';
import stepMeetingsImg from '@/assets/step-meetings.webp';
import stepBack1 from '@/assets/step-back-1.webp';
import stepBack2 from '@/assets/step-back-2.webp';
import stepBack3 from '@/assets/step-back-3.webp';
import avatar1 from '@/assets/avatar-1.webp';
import avatar2 from '@/assets/avatar-2.webp';
import avatar3 from '@/assets/avatar-3.webp';
import avatar4 from '@/assets/avatar-4.webp';
import { CosmicBackground } from '@/components/landing/CosmicBackground';
import { PremiumPricingCard } from '@/components/landing/PremiumPricingCard';
import { ScrollCurveLine } from '@/components/landing/ScrollCurveLine';
import { GlobeSection } from '@/components/landing/GlobeSection';
import { StoriesTestimonials } from '@/components/landing/StoriesTestimonials';
import { ScrollLightUpSection } from '@/components/landing/ScrollLightUp';

const NAV_LINKS = [
  { label: 'Como funciona', href: '#como-funciona', icon: Zap },
  { label: 'Produto', href: '#produto', icon: BarChart3 },
  { label: 'Preços', href: '#precos', icon: CreditCard },
  { label: 'Cases', href: '#cases', icon: Star },
  { label: 'FAQ', href: '#faq', icon: HelpCircle },
];

const CAKTO_CHECKOUT_URL = 'https://pay.cakto.com.br/o5dfn8a_827823';

const SINGLE_PLAN = {
  id: 'pro',
  name: 'Profissional',
  price: 97,
  features: [
    'Disparos ilimitados de mensagens',
    '3 chips WhatsApp com rotação automática',
    'Extratores: Google Maps, Instagram, Facebook',
    'Agente SDR com IA — prospecta 24/7',
    'Radar CNPJ para leads B2B qualificados',
    'CRM completo com funil de vendas',
    'Anti-Ban inteligente (zero bloqueios)',
    'Relatórios e analytics em tempo real',
    'Follow-up automático com spintax',
    'Suporte prioritário via WhatsApp',
  ],
  cta: 'Quero vender no automático',
  highlight: true,
};

const FAQ_DATA = [
  { q: 'Preciso de conhecimento técnico?', a: 'Zero. Em 5 minutos você conecta seu WhatsApp, escolhe o nicho e a IA começa a prospectar sozinha. A interface é intuitiva e temos tutoriais passo a passo para cada funcionalidade.' },
  { q: 'Meu WhatsApp pode ser banido?', a: 'Praticamente impossível. Nosso sistema anti-ban usa warm-up progressivo, delays que simulam comportamento humano real, spintax inteligente e rotação automática entre chips. Mais de 2.400 contas ativas sem um único bloqueio.' },
  { q: 'Quanto tempo até eu ver resultados?', a: 'A maioria dos clientes agenda a primeira reunião em 48h. A IA captura leads do Google Maps, envia mensagens personalizadas e faz follow-up — tudo automaticamente enquanto você foca em fechar negócios.' },
  { q: 'Posso cancelar a qualquer momento?', a: 'Sim, com 1 clique na sua conta. Sem multa, sem burocracia, sem letras miúdas. Mas spoiler: a taxa de cancelamento é menor que 3% — porque funciona.' },
  { q: 'Funciona para qualquer tipo de negócio?', a: 'Sim. Temos templates otimizados para +50 nichos (agências, contabilidade, advocacia, clínicas, imobiliárias, SaaS…). A IA adapta tom, linguagem e abordagem automaticamente para cada segmento.' },
  { q: 'O que o Agente SDR faz exatamente?', a: 'Ele é seu vendedor digital 24/7. Prospecta leads, envia a primeira mensagem, responde objeções com IA, faz follow-up automático e agenda reuniões no seu calendário. Sua equipe só entra na hora de fechar.' },
  { q: 'Quais fontes de leads estão disponíveis?', a: 'Google Maps, Instagram, Facebook, Radar CNPJ, importação de planilhas, grupos de WhatsApp e busca web. Tudo integrado em uma única plataforma com dados enriquecidos.' },
];

const STEPS = [
  { icon: Search, step: '01', title: 'Capture leads qualificados', desc: 'A IA busca no Google Maps, Instagram e Facebook negócios do seu nicho com telefone, endereço e avaliações. Filtre por cidade, nota e categoria.', color: '#7B2FF2', delay: 0, img: stepCaptureImg, backImg: stepBack1, backTitle: 'Inteligência de Captura', backDesc: 'Algoritmos que varrem múltiplas fontes simultaneamente, cruzam dados e entregam leads com telefone validado e score de qualidade.' },
  { icon: MessageSquare, step: '02', title: 'Envie mensagens com IA', desc: 'Cada lead recebe uma mensagem personalizada no WhatsApp. O sistema anti-ban garante zero bloqueios com spintax, delays humanizados e rotação de chips.', color: '#F7941D', delay: 0.2, img: stepMessagesImg, backImg: stepBack2, backTitle: 'Comunicação Humanizada', backDesc: 'Spintax + IA geram mensagens únicas para cada lead. Delays naturais e rotação de chips tornam cada envio indistinguível de uma conversa real.' },
  { icon: CalendarCheck, step: '03', title: 'Feche negócios no automático', desc: 'O Agente SDR responde objeções, faz follow-up inteligente e agenda reuniões no seu calendário — 24 horas por dia, 7 dias por semana.', color: '#00B4D8', delay: 0.4, img: stepMeetingsImg, backImg: stepBack3, backTitle: 'Agente SDR Autônomo', backDesc: 'IA que entende contexto, responde objeções e agenda reuniões automaticamente. Seu time comercial só entra na hora de fechar o deal.' },
];

const STATS = [
  { value: '2.4M+', label: 'Leads capturados', icon: Target, color: '#7B2FF2', delay: 0 },
  { value: '890K+', label: 'Mensagens enviadas', icon: MessageSquare, color: '#F7941D', delay: 0.1 },
  { value: '23x', label: 'ROI médio', icon: TrendingUp, color: '#00B4D8', delay: 0.2 },
  { value: '48h', label: 'Até 1ª reunião', icon: Clock, color: '#E91E8C', delay: 0.3 },
];

const FLOATING_ICONS = [
  { icon: <img src={googleMapsIcon} alt="Google Maps" className="h-5 w-5 object-contain" width={20} height={20} loading="lazy" />, label: 'Google Maps', color: '#34A853', x: 'left-[5%] md:left-[12%]', y: 'top-[18%]', float: '5s' },
  { icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>, label: 'WhatsApp', color: '#25D366', x: 'left-[2%] md:left-[10%]', y: 'bottom-[28%]', float: '6s' },
  { icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>, label: 'Facebook', color: '#1877F2', x: 'right-[5%] md:right-[12%]', y: 'top-[12%]', float: '7s' },
  { icon: <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C16.67.014 16.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>, label: 'Instagram', color: '#E4405F', x: 'right-[2%] md:right-[10%]', y: 'bottom-[22%]', float: '5.5s' },
  { icon: <img src={googleGIcon} alt="Google" className="h-5 w-5 object-contain" width={20} height={20} loading="lazy" />, label: 'Google', color: '#4285F4', x: 'left-[18%] md:left-[22%]', y: 'top-[2%]', float: '6.5s' },
  { icon: <Zap className="h-4 w-4" />, label: 'SDR Agent', color: '#7B2FF2', x: 'right-[15%] md:right-[18%]', y: 'bottom-[8%]', float: '7.5s' },
];

export default function Landing() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [mobileMenu, setMobileMenu] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeNav, setActiveNav] = useState('');
  const [hoveredNav, setHoveredNav] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [flippedCard, setFlippedCard] = useState<number | null>(null);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          setScrolled(window.scrollY > 40);
          const sections = NAV_LINKS.map(l => l.href.replace('#', ''));
          let current = '';
          for (const id of sections) {
            const el = document.getElementById(id);
            if (el && el.getBoundingClientRect().top <= 200) current = id;
          }
          setActiveNav(current);
          ticking = false;
        });
        ticking = true;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const SectionHeader = ({ tag, title, subtitle, id }: { tag: string; title: React.ReactNode; subtitle?: string; id?: string }) => (
    <div id={id} className="text-center mb-10 scroll-mt-24">
      <span className="text-xs uppercase tracking-[0.3em] text-[#F7941D] font-semibold">{tag}</span>
      <h2 className="text-3xl md:text-5xl font-black tracking-[-0.03em] mt-3 text-white">{title}</h2>
      {subtitle && <p className="text-white/50 text-base mt-3 max-w-xl mx-auto leading-relaxed">{subtitle}</p>}
    </div>
  );

  return (
    <main className="text-white min-h-screen overflow-x-hidden relative">
      <CosmicBackground />

      {/* ═══ 1. FLOATING GLASS NAVBAR ═══ */}
      <nav className="fixed top-0 w-full z-50 flex justify-center pt-4 pointer-events-none">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: -20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 200, damping: 25, delay: 0.3 }}
          className="pointer-events-auto flex items-center rounded-full pr-3 pl-4 py-2.5 glass-nav-container"
        >
          <a href="#" className="flex items-center gap-3 mr-4 shrink-0">
            <img src={logoImg} alt="NexaProspect" className="h-10 w-10 rounded-xl object-contain" width={40} height={40} />
            <span className="text-2xl font-bold tracking-[-0.02em] text-white hidden sm:block">Nexa</span>
          </a>
          <div className="hidden lg:flex items-center">
            {NAV_LINKS.map((l, idx) => {
              const Icon = l.icon;
              return (
                <a key={l.label} href={l.href} onMouseEnter={() => setHoveredNav(idx)} onMouseLeave={() => setHoveredNav(null)} className="nav-optn relative group">
                  <div className="nav-optn-inner">
                    <span className="nav-optn-icon"><Icon className="h-6 w-6 text-white" /></span>
                    <span className={`text-xl font-semibold tracking-wide transition-colors duration-300 ${activeNav === l.href.replace('#', '') ? 'text-white' : 'text-white/55 group-hover:text-white'}`}>{l.label}</span>
                    {hoveredNav === idx && (
                      <motion.span layoutId="navGlow" initial={{ scaleX: 0, opacity: 0 }} animate={{ scaleX: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 380, damping: 30 }} className="absolute bottom-[-2px] left-2 right-2 h-[2px] bg-gradient-to-r from-transparent via-[#F7941D] to-transparent origin-center shadow-[0_0_10px_rgba(247,148,29,0.6)]" />
                    )}
                  </div>
                </a>
              );
            })}
          </div>
          <button onClick={() => navigate('/auth')} className="nav-shimmer-btn group ml-4">
            <span className="nav-shimmer-icon"><ArrowRight className="h-5 w-5 text-white nav-shimmer-arrow" /></span>
            <span className="nav-shimmer-text">Entrar</span>
          </button>
          <button className="lg:hidden text-white/60 ml-3" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Menu">
            {mobileMenu ? <X className="h-7 w-7" /> : <Menu className="h-7 w-7" />}
          </button>
        </motion.div>
        <div className={`lg:hidden pointer-events-auto fixed top-[82px] left-4 right-4 rounded-2xl overflow-hidden transition-all duration-300 ease-out glass-nav-container ${mobileMenu ? 'max-h-[520px] opacity-100' : 'max-h-0 opacity-0'}`}>
          <div className="px-7 py-6 space-y-2">
            {NAV_LINKS.map(l => (
              <a key={l.label} href={l.href} className="flex items-center gap-4 text-xl text-white/50 hover:text-white py-4 transition-colors" onClick={() => setMobileMenu(false)}>
                <l.icon className="h-6 w-6" />{l.label}
              </a>
            ))}
            <Link to="/auth" className="block text-center bg-white text-[#0B0D15] text-xl font-semibold px-6 py-4 rounded-full mt-4" onClick={() => setMobileMenu(false)}>Começar grátis</Link>
          </div>
        </div>
      </nav>

      {/* ═══ 2. HERO ═══ */}
      <section className="hero-section min-h-screen relative overflow-hidden flex items-center">
        <div className="absolute inset-0 pointer-events-none">
          <video src={heroVideo} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-40" preload="none" />
          <div className="absolute inset-0 hero-energy-overlay" />
        </div>
        {/* Bottom gradient fade — replaces hard edge */}
        <div className="absolute bottom-0 left-0 right-0 h-40 pointer-events-none z-[5]" style={{ background: 'linear-gradient(to bottom, transparent 0%, #0B0D15 100%)' }} />
        <div className="relative z-10 max-w-[1280px] mx-auto px-5 sm:px-6 lg:px-8 w-full">
          <div className="max-w-[720px] pt-28 sm:pt-24">
            <div className="inline-flex items-center gap-3 bg-white/[0.06] border border-white/[0.08] rounded-full px-5 py-3 mb-6 sm:mb-8 animate-fade-in" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
              <Sparkles className="h-5 w-5 text-[#F7941D]" />
              <span className="text-base sm:text-lg text-white/60 font-medium">+2.400 empresas faturam mais no automático</span>
            </div>
            <h1 className="text-[48px] sm:text-[68px] lg:text-[88px] font-extrabold leading-[1.02] tracking-[-0.04em] animate-fade-in" style={{ animationDelay: '0.5s', animationFillMode: 'both' }}>
              <span className="text-white">Sua máquina de </span>
              <span className="landing-gradient-text">vendas com IA.</span>
            </h1>
            <p className="text-xl sm:text-2xl text-white/50 max-w-[680px] mt-6 sm:mt-8 leading-[1.65] animate-fade-in" style={{ animationDelay: '0.7s', animationFillMode: 'both' }}>
              Captura leads do Google Maps, Instagram e Facebook. Envia mensagens personalizadas no WhatsApp. Faz follow-up automático. Agenda reuniões no seu calendário — <strong className="text-white/70">24 horas por dia, sem parar.</strong>
            </p>
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5 mt-10 sm:mt-12 animate-fade-in" style={{ animationDelay: '0.9s', animationFillMode: 'both' }}>
              <button onClick={() => navigate('/auth')} className="nav-shimmer-btn group !h-16 !min-w-[320px]">
                <span className="nav-shimmer-icon !w-14 !h-14"><ArrowRight className="h-5 w-5 text-white nav-shimmer-arrow" /></span>
                <span className="nav-shimmer-text !text-xl">Testar grátis agora</span>
              </button>
              <a href="#como-funciona" className="text-lg sm:text-xl text-white/50 hover:text-white/80 transition-colors flex items-center gap-3 group">
                Ver como funciona <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
            <div className="flex flex-wrap items-center gap-4 sm:gap-5 mt-5 animate-fade-in" style={{ animationDelay: '1s', animationFillMode: 'both' }}>
              {['Leads ilimitados', 'Setup em 5 min', 'Anti-ban inteligente', 'Cancele com 1 clique'].map(t => (
                <span key={t} className="flex items-center gap-2 text-base sm:text-lg text-white/50">
                  <Check className="h-4 w-4 text-success/60" /> {t}
                </span>
              ))}
            </div>

            {/* Social proof row */}
            <div className="flex items-center gap-6 sm:gap-8 mt-8 sm:mt-10 animate-fade-in" style={{ animationDelay: '1.1s', animationFillMode: 'both' }}>
              <div className="flex items-center gap-3">
                <div className="flex -space-x-3">
                  {[avatar1, avatar2, avatar3, avatar4].map((src, i) => (
                    <img key={i} src={src} alt="" className="h-10 w-10 rounded-full border-2 border-[#0B0D15] shadow-lg object-cover" loading="lazy" width={40} height={40} />
                  ))}
                </div>
                <span className="text-base sm:text-lg text-white/55 font-medium">+2.400 ativos</span>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5].map(i => <Star key={i} className="h-4 w-4 text-[#F7941D] fill-[#F7941D]" />)}
                <span className="text-base sm:text-lg text-white/50 ml-1 font-medium">4.9/5</span>
              </div>
            </div>
          </div>
        </div>
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 animate-bounce">
          <a href="#como-funciona" className="block" aria-label="Rolar para baixo">
            <div className="w-5 h-8 rounded-full border-2 border-white/15 flex justify-center pt-1.5">
              <div className="w-1 h-2 bg-white/30 rounded-full landing-scroll-dot" />
            </div>
          </a>
        </div>
      </section>

      {/* ═══ SCROLL CURVE LINE WRAPPER ═══ */}
      <div className="relative overflow-visible">
        <ScrollCurveLine />

        {/* ═══ 3. COMO FUNCIONA - 3 STEPS ═══ */}
        <ScrollLightUpSection>
        <section id="como-funciona" className="relative py-20 px-4 md:px-8 scroll-mt-24 overflow-hidden">
          <SectionHeader tag="Como funciona" title={<>3 passos para <span className="landing-gradient-text">automatizar suas vendas.</span></>} subtitle="Conecte seu WhatsApp, escolha o nicho e deixe a IA trabalhar por você — todos os dias." />
          <div className="max-w-[1000px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
            {STEPS.map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 80, scale: 0.85, rotateX: 12 }}
                whileInView={{ opacity: 1, y: 0, scale: 1, rotateX: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.8, delay: item.delay, ease: [0.16, 1, 0.3, 1] }}
                className="relative group cursor-pointer"
                style={{ perspective: '1000px' }}
                onClick={() => setFlippedCard(flippedCard === i ? null : i)}
              >
                <div
                  className="relative w-full min-h-[340px] transition-transform duration-700"
                  style={{
                    transformStyle: 'preserve-3d',
                    transform: flippedCard === i ? 'rotateY(180deg)' : 'rotateY(0deg)',
                  }}
                >
                  {/* FRONT */}
                  <div
                    className="absolute inset-0 border border-white/[0.06] rounded-2xl p-6 bg-white/[0.03] overflow-hidden"
                    style={{ backfaceVisibility: 'hidden' }}
                  >
                    {/* Sweep effect bar */}
                    <div
                      className="absolute left-0 top-0 w-[5px] h-full z-0 transition-all duration-500 group-hover:w-full rounded-2xl"
                      style={{ background: item.color, opacity: 0.15 }}
                    />
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 30%, ${item.color}18, transparent 70%)` }} />
                    <span className="text-[64px] font-black absolute top-3 right-5 leading-none pointer-events-none" style={{ color: `${item.color}08` }}>{item.step}</span>

                    <div className="flex justify-center mb-4 relative z-10">
                      <div className="relative">
                        <div className="absolute inset-0 -m-4 pointer-events-none" style={{ background: `radial-gradient(circle, ${item.color}15, transparent 70%)` }} />
                        <img src={item.img} alt={item.title} className="h-24 w-24 object-contain relative z-10 group-hover:scale-110 transition-transform duration-500 drop-shadow-[0_0_20px_rgba(123,47,242,0.2)]" loading="lazy" decoding="async" width={96} height={96} />
                      </div>
                    </div>

                    <div className="relative z-10">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-4 border border-white/[0.08]" style={{ background: `${item.color}12` }}>
                        <item.icon className="h-4 w-4" style={{ color: item.color }} />
                      </div>
                      <h3 className="text-base font-bold text-white mb-1.5">{item.title}</h3>
                      <p className="text-sm text-white/55 leading-relaxed">{item.desc}</p>
                    </div>
                    <span className="absolute bottom-3 right-4 text-xs text-white/30 z-10">Clique para ver mais →</span>
                    {i < 2 && <div className="hidden md:block absolute top-1/2 -right-3 w-6 h-[2px] bg-gradient-to-r from-white/10 to-transparent z-20" />}
                  </div>

                  {/* BACK */}
                  <div
                    className="absolute inset-0 rounded-2xl overflow-hidden border border-white/[0.1]"
                    style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                  >
                    <img src={item.backImg} alt={item.backTitle} className="absolute inset-0 w-full h-full object-cover" loading="lazy" decoding="async" />
                    <div className="absolute inset-0" style={{ background: `linear-gradient(to top, ${item.color}CC 0%, ${item.color}44 40%, transparent 100%)` }} />
                    <div className="relative z-10 h-full flex flex-col justify-end p-6">
                      <h3 className="text-lg font-black text-white mb-2 drop-shadow-lg">{item.backTitle}</h3>
                      <p className="text-sm text-white/90 leading-relaxed drop-shadow-md">{item.backDesc}</p>
                      <span className="mt-3 text-xs text-white/50">← Clique para voltar</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </section>
        </ScrollLightUpSection>

        <ScrollLightUpSection>
        <section id="produto" className="relative py-24 px-4 md:px-8 scroll-mt-24 overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#0B0D15] to-transparent pointer-events-none z-10" />
          <div className="relative z-10 max-w-[900px] mx-auto text-center">
            <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }}>
              <span className="text-xs uppercase tracking-[0.3em] text-[#F7941D] font-semibold">Plataforma completa</span>
              <h2 className="text-3xl md:text-5xl font-black tracking-[-0.03em] mt-3 text-white leading-[1.1]">
                 Tudo em um <span className="landing-gradient-text">único painel</span>
               </h2>
               <p className="text-base text-white/55 mt-4 max-w-[520px] mx-auto leading-relaxed">
                CRM, prospecção, envio em massa, follow-up, agente SDR e analytics — sem precisar de 5 ferramentas diferentes. Acesse do celular ou desktop.
              </p>
            </motion.div>

            <div className="relative mt-16 flex items-center justify-center animate-fade-in" style={{ animationDelay: '0.3s', animationFillMode: 'both' }}>
              <div className="absolute inset-0 -m-16 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(123,47,242,0.18) 0%, rgba(123,47,242,0.04) 50%, transparent 75%)' }} />
              <div className="animate-[floating_6s_ease-in-out_infinite]">
                <img src={heroPhonesImg} alt="NexaProspect no celular" className="relative z-10 w-full max-w-[620px] h-auto drop-shadow-[0_30px_60px_rgba(123,47,242,0.2)]" loading="lazy" decoding="async" width={620} height={620} />
              </div>
              {FLOATING_ICONS.map((item, i) => (
                <div key={i} className={`absolute ${item.x} ${item.y} z-30`} style={{ animation: `floating ${item.float} ease-in-out infinite`, animationDelay: `${i * 0.15}s` }}>
                  <div className="w-10 h-10 md:w-11 md:h-11 rounded-xl flex items-center justify-center border border-white/10" style={{ background: `${item.color}12`, boxShadow: `0 0 18px ${item.color}25` }} title={item.label}>
                    <span style={{ color: item.color }}>{item.icon}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
        </ScrollLightUpSection>

        <ScrollLightUpSection>
        <section className="relative py-20 px-4 md:px-8 overflow-hidden">
          <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at 50% 50%, rgba(123,47,242,0.06) 0%, transparent 60%)' }} />
          <SectionHeader tag="Resultados comprovados" title={<>Números que <span className="landing-gradient-text">falam por si.</span></>} subtitle="Dados reais de empresas que substituíram a prospecção manual pela IA." />
          <div className="max-w-[900px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-4 mt-12">
            {STATS.map((stat, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 40, rotateX: 15 }} whileInView={{ opacity: 1, y: 0, rotateX: 0 }} viewport={{ once: true, margin: '-60px' }} transition={{ duration: 0.8, delay: stat.delay, ease: [0.16, 1, 0.3, 1] }} className="group">
                <div className="relative border border-white/[0.06] rounded-2xl p-6 bg-white/[0.03] text-center hover:border-white/[0.12] transition-all duration-500 overflow-hidden">
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 50%, ${stat.color}12, transparent 70%)` }} />
                  <div className="relative z-10">
                    <stat.icon className="h-5 w-5 mx-auto mb-3 opacity-50" style={{ color: stat.color }} />
                    <motion.span initial={{ scale: 0.5 }} whileInView={{ scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.5, delay: stat.delay + 0.3, type: 'spring', stiffness: 200 }} className="block text-2xl md:text-3xl font-black tracking-[-0.03em]" style={{ color: stat.color }}>
                      {stat.value}
                    </motion.span>
                    <span className="text-xs text-white/50 mt-1 block">{stat.label}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, delay: 0.5 }} className="flex flex-wrap items-center justify-center gap-6 mt-10">
            {[
              { icon: Users, text: '+2.400 empresas ativas' },
              { icon: Rocket, text: 'Setup em 5 min' },
              { icon: Star, text: '4.9/5 de avaliação' },
            ].map((badge, i) => (
              <span key={i} className="flex items-center gap-2 text-xs text-white/50">
                <badge.icon className="h-3.5 w-3.5 text-[#F7941D]/50" />
                {badge.text}
              </span>
            ))}
          </motion.div>
        </section>
        </ScrollLightUpSection>

        <ScrollLightUpSection>
        <GlobeSection />
        </ScrollLightUpSection>

        <ScrollLightUpSection>
        <section id="precos" className="relative py-16 px-4 md:px-8 scroll-mt-24">
          <SectionHeader tag="Investimento" title={<>Um plano. <span className="landing-gradient-text">Acesso total.</span></>} subtitle="Sem surpresas. Todas as funcionalidades desbloqueadas desde o primeiro dia. Cancele quando quiser, sem burocracia." />
          <div className="max-w-md mx-auto">
            <div className="h-[560px]">
              <PremiumPricingCard plan={{ ...SINGLE_PLAN, annual: SINGLE_PLAN.price }} annual={false} index={0} checkoutUrl={CAKTO_CHECKOUT_URL} />
            </div>
          </div>
        </section>
        </ScrollLightUpSection>

        <ScrollLightUpSection>
        <section id="cases" className="relative py-12 px-4 md:px-8 scroll-mt-24">
          <SectionHeader tag="Resultados reais" title={<>Quem usa, <span className="landing-gradient-text">recomenda.</span></>} subtitle="Histórias de quem saiu da prospecção manual e nunca mais voltou." />
          <StoriesTestimonials />
        </section>
        </ScrollLightUpSection>

        <ScrollLightUpSection>
        <section id="faq" className="relative py-16 px-4 md:px-8 scroll-mt-24">
          <SectionHeader tag="Tire suas dúvidas" title={<>Tudo que você precisa <span className="text-white/50">saber.</span></>} />
          <div className="max-w-2xl mx-auto space-y-2">
            {FAQ_DATA.map((item, i) => (
              <div key={i} className="border border-white/[0.06] rounded-xl overflow-hidden bg-white/[0.03]">
                <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between px-5 py-4 text-left">
                  <span className="text-sm font-semibold text-white/80">{item.q}</span>
                  <ChevronDown className={`h-4 w-4 text-white/50 transition-transform shrink-0 ml-3 ${openFaq === i ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence>
                  {openFaq === i && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
                      <p className="px-5 pb-4 text-sm text-white/55 leading-relaxed">{item.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </section>
        </ScrollLightUpSection>

        <ScrollLightUpSection>
        <section className="relative py-20 px-4 md:px-8">
          <div className="max-w-2xl mx-auto text-center">
            <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.8 }}>
              <h2 className="text-4xl md:text-6xl font-black tracking-[-0.03em] text-white">
                Pare de prospectar manualmente. <span className="landing-gradient-text">Deixe a IA fechar por você.</span>
              </h2>
              <p className="text-white/55 text-base mt-4 max-w-lg mx-auto leading-relaxed">
                Enquanto você lê isso, +2.400 empresas já estão capturando leads, enviando mensagens e agendando reuniões no automático. Sua vez.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-8">
                <button onClick={() => navigate('/auth')} className="nav-shimmer-btn group !h-12 !min-w-[220px]">
                  <span className="nav-shimmer-icon !w-10 !h-10"><ArrowRight className="h-4 w-4 text-white nav-shimmer-arrow" /></span>
                  <span className="nav-shimmer-text !text-[14px]">Começar agora</span>
                </button>
              </div>
              <div className="flex items-center justify-center gap-4 mt-4">
                {['Leads ilimitados', 'Resultado em 48h', 'Cancele com 1 clique'].map(t => (
                  <span key={t} className="flex items-center gap-1.5 text-xs text-white/50">
                    <Check className="h-3 w-3 text-success/50" /> {t}
                  </span>
                ))}
              </div>
            </motion.div>
          </div>
        </section>
        </ScrollLightUpSection>

      </div>{/* end scroll curve wrapper */}

      {/* ═══ 11. FOOTER ═══ */}
      <footer className="relative border-t border-white/[0.05] py-12 px-4 md:px-8">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <img src={logoImg} alt="NexaProspect" className="h-7 w-7 rounded-lg object-contain" loading="lazy" width={28} height={28} />
              <span className="text-[14px] font-bold text-white/70">NexaProspect</span>
            </div>
            <p className="text-xs text-white/50 leading-relaxed max-w-[280px]">
              Plataforma de prospecção com IA que captura leads, envia mensagens no WhatsApp e agenda reuniões — tudo no piloto automático.
            </p>
          </div>
          <div className="flex flex-col gap-2.5">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">Contato</span>
            <a href="mailto:devcriador1@gmail.com" className="text-xs text-white/55 hover:text-white/80 transition-colors flex items-center gap-2">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              devcriador1@gmail.com
            </a>
            <a href="https://wa.me/5533984123591" target="_blank" rel="noopener noreferrer" className="text-xs text-white/55 hover:text-white/80 transition-colors flex items-center gap-2">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0012.05 0zm0 21.785a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884z"/></svg>
              (33) 98412-3591
            </a>
            <a href="https://instagram.com/Focussdev" target="_blank" rel="noopener noreferrer" className="text-xs text-white/55 hover:text-white/80 transition-colors flex items-center gap-2">
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C16.67.014 16.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              @Focussdev
            </a>
          </div>
          <div className="flex flex-col gap-2.5 md:items-end">
            <span className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-1">Legal</span>
            <p className="text-xs text-white/50">FOCUSS DEV</p>
            <p className="text-xs text-white/50">CNPJ 65.132.412/0001-20</p>
          </div>
        </div>
        <div className="max-w-5xl mx-auto mt-8 pt-6 border-t border-white/[0.05] flex flex-col md:flex-row items-center justify-between gap-2">
          <p className="text-xs text-white/50">© {new Date().getFullYear()} NexaProspect — FOCUSS DEV. Todos os direitos reservados.</p>
          <div className="flex gap-4">
            <a href="#" className="text-xs text-white/50 hover:text-white/70 transition-colors">Termos de Uso</a>
            <a href="#" className="text-xs text-white/50 hover:text-white/70 transition-colors">Privacidade</a>
          </div>
        </div>
      </footer>
    </main>
  );
}

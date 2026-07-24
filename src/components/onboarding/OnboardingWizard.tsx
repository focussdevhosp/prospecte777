import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { NICHE_CONFIGS, NICHE_LIST } from '@/constants/niche-configs';
import {
  Rocket,
  Zap,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Bot,
  Phone,
  PartyPopper,
  MapPin,
  X,
} from 'lucide-react';

const STEPS = [
  { id: 'niche', title: 'Escolha seu nicho', description: 'Tudo será pré-configurado para você', icon: <Sparkles className="h-8 w-8" /> },
  { id: 'location', title: 'Onde você prospecta?', description: 'Cidades alvo para captura de leads', icon: <MapPin className="h-8 w-8" /> },
  { id: 'agent', title: 'Seu Agente IA', description: 'Personalize a identidade do agente', icon: <Bot className="h-8 w-8" /> },
  { id: 'whatsapp', title: 'Conectar WhatsApp', description: 'Vincule seu número para enviar mensagens', icon: <Phone className="h-8 w-8" /> },
  { id: 'automations', title: 'Automações', description: 'Ative o que quiser com 1 clique', icon: <Zap className="h-8 w-8" /> },
  { id: 'complete', title: 'Tudo Pronto! 🎉', description: 'Suas automações estão ativas', icon: <PartyPopper className="h-8 w-8" /> },
];

const DEFAULT_AUTOMATIONS: Record<string, boolean> = {
  weekly_prospecting: true,
  auto_first_message: true,
  auto_followup: true,
  ai_auto_reply: false,
  intent_pipeline: true,
  cold_reactivation: false,
  lead_scoring: true,
  daily_report: false,
  weekly_report: true,
};

const AUTOMATION_LABELS: Record<string, string> = {
  weekly_prospecting: '🎯 Prospecção semanal automática',
  auto_first_message: '📩 Primeira mensagem automática',
  auto_followup: '🔄 Follow-up automático',
  ai_auto_reply: '🤖 Resposta automática da IA',
  intent_pipeline: '📋 Pipeline automático por intenção',
  cold_reactivation: '🔥 Reativação de leads frios',
  lead_scoring: '⭐ Pontuação automática de leads',
  daily_report: '📧 Relatório diário por email',
  weekly_report: '📊 Relatório semanal',
};

function ConfettiEffect() {
  const [particles] = useState(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 2 + Math.random() * 1.5,
      color: ['#7B2FF2', '#F7941D', '#00B4D8', '#E91E8C', '#10B981', '#F59E0B'][i % 6],
      size: 6 + Math.random() * 6,
      rotation: Math.random() * 360,
    }))
  );

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ opacity: 1, y: -20, x: `${p.x}vw`, rotate: 0 }}
          animate={{ opacity: 0, y: '100vh', rotate: p.rotation + 360 }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'easeIn' }}
          className="absolute rounded-sm"
          style={{ width: p.size, height: p.size, backgroundColor: p.color }}
        />
      ))}
    </div>
  );
}

export function OnboardingWizard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { settings, updateSettings, isUpdating } = useUserSettings();

  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [selectedNiche, setSelectedNiche] = useState<string | null>(null);
  const [locations, setLocations] = useState<string[]>([]);
  const [locationInput, setLocationInput] = useState('');
  const [agentName, setAgentName] = useState('');
  const [agentKnowledge, setAgentKnowledge] = useState('');
  const [automations, setAutomations] = useState(DEFAULT_AUTOMATIONS);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    if (settings && !settings.onboarding_completed) {
      const hasSeenOnboarding = localStorage.getItem(`onboarding_${user?.id}`);
      if (!hasSeenOnboarding) setIsOpen(true);
    }
  }, [settings, user?.id]);

  useEffect(() => {
    if (selectedNiche && NICHE_CONFIGS[selectedNiche]) {
      const config = NICHE_CONFIGS[selectedNiche];
      setLocations(config.defaultLocations.slice(0, 3));
      setAgentName(config.agentPersonality.name);
      setAgentKnowledge(config.agentPersonality.knowledge_base);
    }
  }, [selectedNiche]);

  // Trigger confetti on complete step
  useEffect(() => {
    if (step === 5) {
      setShowConfetti(true);
      const t = setTimeout(() => setShowConfetti(false), 3500);
      return () => clearTimeout(t);
    }
  }, [step]);

  const progress = ((step) / (STEPS.length - 1)) * 100;
  const currentStep = STEPS[step];

  const addLocation = () => {
    const trimmed = locationInput.trim();
    if (trimmed && locations.length < 3 && !locations.includes(trimmed)) {
      setLocations([...locations, trimmed]);
      setLocationInput('');
    }
  };

  const handleComplete = async () => {
    if (!selectedNiche || !user) return;
    const config = NICHE_CONFIGS[selectedNiche];
    if (!config) return;

    await updateSettings({
      agent_name: agentName || 'Assistente',
      knowledge_base: agentKnowledge,
      agent_type: config.agentPersonality.tone as any,
      services_offered: config.agentPersonality.services,
      target_niches: [config.label],
      target_locations: locations,
      auto_start_hour: config.bestHours.start,
      auto_end_hour: config.bestHours.end,
      work_days_only: true,
      auto_prospecting_enabled: automations.weekly_prospecting,
      daily_report_enabled: automations.daily_report,
    } as any);

    await supabase.from('user_settings').update({
      auto_first_message_enabled: automations.auto_first_message,
      auto_followup_enabled: automations.auto_followup,
      auto_pipeline_enabled: automations.intent_pipeline,
      auto_reactivation_enabled: automations.cold_reactivation,
      auto_lead_scoring: automations.lead_scoring,
      sdr_agent_enabled: automations.ai_auto_reply,
      weekly_report_enabled: automations.weekly_report,
      onboarding_completed: true,
      onboarding_niche: selectedNiche,
    }).eq('user_id', user.id);

    const templates = [
      { name: `1º Contato — ${config.label}`, content: config.messageTemplates.first_contact },
      { name: `Follow-up 1 — ${config.label}`, content: config.messageTemplates.followup_1 },
      { name: `Follow-up 2 — ${config.label}`, content: config.messageTemplates.followup_2 },
      { name: `Reativação — ${config.label}`, content: config.messageTemplates.reactivation },
    ];
    for (const t of templates) {
      await supabase.from('message_templates').insert({
        user_id: user.id,
        name: t.name,
        niche: config.label,
        content: t.content,
        variables: ['nome_empresa'],
        is_default: true,
      });
    }

    localStorage.setItem(`onboarding_${user.id}`, 'true');
    setIsOpen(false);
  };

  const handleSkip = () => {
    localStorage.setItem(`onboarding_${user?.id}`, 'true');
    setIsOpen(false);
  };

  const canProceed = () => {
    if (step === 0) return !!selectedNiche;
    if (step === 1) return locations.length > 0;
    return true;
  };

  return (
    <>
      {showConfetti && <ConfettiEffect />}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">{currentStep.icon}</div>
                <div>
                  <DialogTitle>{currentStep.title}</DialogTitle>
                  <DialogDescription>{currentStep.description}</DialogDescription>
                </div>
              </div>
              <Badge variant="secondary">{step + 1}/{STEPS.length}</Badge>
            </div>
          </DialogHeader>

          {/* Progress bar with gradient */}
          <div className="relative h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-primary via-primary/80 to-violet-400 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>

          {/* Step dots */}
          <div className="flex items-center justify-center gap-2 mt-1">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={cn(
                  "transition-all duration-300 rounded-full",
                  i < step ? 'h-2 w-2 bg-primary' :
                  i === step ? 'h-2 w-6 bg-primary' :
                  'h-2 w-2 bg-muted'
                )}
              />
            ))}
          </div>

          {/* Step content with AnimatePresence */}
          <div className="py-4 min-h-[200px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={step}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -30 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                {/* Step 0: Niche selection */}
                {step === 0 && (
                  <div className="grid grid-cols-2 gap-3">
                    {NICHE_LIST.map((niche) => (
                      <button
                        key={niche.id}
                        onClick={() => setSelectedNiche(niche.id)}
                        aria-label={`Selecionar nicho ${niche.label}`}
                        className={cn(
                          "flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-all",
                          selectedNiche === niche.id
                            ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                            : "border-border hover:border-primary/50"
                        )}
                      >
                        <span className="text-3xl">{niche.emoji}</span>
                        <span className="text-sm font-medium leading-tight">{niche.label}</span>
                        <span className="text-[11px] text-muted-foreground">{niche.weeklyLeadTarget} leads/semana</span>
                        {selectedNiche === niche.id && <CheckCircle2 className="h-4 w-4 text-primary" />}
                      </button>
                    ))}
                  </div>
                )}

                {/* Step 1: Locations */}
                {step === 1 && (
                  <div className="space-y-4">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Ex: São Paulo, SP"
                        value={locationInput}
                        onChange={(e) => setLocationInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addLocation()}
                        aria-label="Cidade para prospecção"
                        autoFocus
                      />
                      <Button onClick={addLocation} disabled={locations.length >= 3} size="sm">Adicionar</Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {locations.map((loc) => (
                        <Badge key={loc} variant="secondary" className="gap-1 px-3 py-1.5">
                          <MapPin className="h-3 w-3" /> {loc}
                          <button onClick={() => setLocations(locations.filter(l => l !== loc))} aria-label={`Remover ${loc}`}>
                            <X className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <p className="text-xs text-muted-foreground">Máximo 3 cidades</p>
                  </div>
                )}

                {/* Step 2: Agent */}
                {step === 2 && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Nome do Agente</Label>
                      <Input value={agentName} onChange={(e) => setAgentName(e.target.value)} placeholder="Ex: Ana, Carlos..." autoFocus />
                    </div>
                    <div className="space-y-2">
                      <Label>Sobre seus serviços</Label>
                      <textarea
                        className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={agentKnowledge}
                        onChange={(e) => setAgentKnowledge(e.target.value)}
                      />
                    </div>
                  </div>
                )}

                {/* Step 3: WhatsApp */}
                {step === 3 && (
                  <div className="text-center space-y-6">
                    <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                      <Phone className="h-12 w-12 mx-auto mb-4 text-emerald-500" />
                      <h3 className="font-bold mb-2">Conecte seu WhatsApp</h3>
                      <p className="text-sm text-muted-foreground mb-4">Para enviar mensagens automáticas</p>
                      <Button
                        onClick={() => { handleSkip(); navigate('/settings/connections'); }}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        <Phone className="h-4 w-4 mr-2" /> Conectar Agora
                      </Button>
                    </div>
                    <Button variant="ghost" onClick={() => setStep(step + 1)} className="text-muted-foreground">
                      Configurar depois →
                    </Button>
                  </div>
                )}

                {/* Step 4: Automations */}
                {step === 4 && (
                  <div className="space-y-3">
                    <p className="text-sm text-muted-foreground mb-4">
                      Ative as automações que deseja. Você pode mudar a qualquer momento em <strong>Automações</strong>.
                    </p>
                    {Object.entries(AUTOMATION_LABELS).map(([key, label]) => (
                      <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-primary/20 transition-colors">
                        <span className="text-sm">{label}</span>
                        <Switch
                          checked={automations[key]}
                          onCheckedChange={(v) => setAutomations({ ...automations, [key]: v })}
                          aria-label={label}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Step 5: Complete */}
                {step === 5 && (
                  <div className="text-center space-y-6">
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                      className="p-6 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20"
                    >
                      <PartyPopper className="h-16 w-16 mx-auto mb-4 text-primary" />
                      <h3 className="text-xl font-bold mb-2">Parabéns! 🎊</h3>
                      <p className="text-muted-foreground">
                        {Object.values(automations).filter(Boolean).length} automações ativas. O NexaProspect já está trabalhando por você!
                      </p>
                    </motion.div>
                    <div className="grid grid-cols-2 gap-4">
                      <Button variant="outline" onClick={() => setIsOpen(false)}>Explorar Dashboard</Button>
                      <Button onClick={() => { setIsOpen(false); navigate('/automations'); }}>
                        <Zap className="h-4 w-4 mr-2" /> Ver Automações
                      </Button>
                    </div>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Navigation */}
          {step < 5 && step !== 3 && (
            <div className="flex justify-between pt-4 border-t">
              <Button variant="ghost" onClick={step === 0 ? handleSkip : () => setStep(step - 1)}>
                {step === 0 ? 'Pular' : <><ArrowLeft className="h-4 w-4 mr-2" /> Voltar</>}
              </Button>
              <motion.div whileTap={{ scale: 0.95 }}>
                <Button
                  onClick={step === 4 ? handleComplete : () => setStep(step + 1)}
                  disabled={!canProceed() || isUpdating}
                  className="gradient-primary"
                >
                  {step === 4 ? 'Finalizar' : 'Próximo'}
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </motion.div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

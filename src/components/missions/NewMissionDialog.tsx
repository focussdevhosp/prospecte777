import { useEffect, useState } from 'react';
import { Loader2, Rocket, AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AUTONOMY_LABELS, GOAL_LABELS, useOffers, useMissions,
  type AutonomyLevel, type CampaignGoal,
} from '@/hooks/use-missions';
import { useIcpProfiles } from '@/hooks/use-icp-profiles';
import { cn } from '@/lib/utils';

/**
 * Nova Missão.
 *
 * O usuário responde quatro perguntas: quem prospectar, o que pode ser
 * oferecido, qual o objetivo e quais os limites. O resto é decisão da
 * esteira — que é justamente o ponto: escolher a oferta lead a lead é
 * trabalho que a máquina faz melhor que um `<select>` aplicado a 300 leads.
 */

/** "clínica, estética" -> ["clínica", "estética"]. Vírgula ou quebra de linha. */
function listaDe(texto: string): string[] {
  return texto.split(/[,\n]/).map((t) => t.trim()).filter(Boolean);
}

function numeroOuNulo(texto: string): number | null {
  const n = Number(texto.replace(',', '.'));
  return Number.isFinite(n) && texto.trim() !== '' ? n : null;
}

export function NewMissionDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (missionId: string) => void;
}) {
  const { offers, isLoading: loadingOffers } = useOffers();
  const { profiles, defaultProfile } = useIcpProfiles();
  const { createMission } = useMissions();

  const [name, setName] = useState('');
  const [niche, setNiche] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [selectedOffers, setSelectedOffers] = useState<string[]>([]);
  const [goal, setGoal] = useState<CampaignGoal>('agendar_demonstracao');
  const [autonomy, setAutonomy] = useState<AutonomyLevel>('assistido');
  const [targetCount, setTargetCount] = useState(50);
  const [dailyLimit, setDailyLimit] = useState(30);
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(18);
  const [workDaysOnly, setWorkDaysOnly] = useState(true);
  const [exclusions, setExclusions] = useState('');
  // ICP: os critérios que o `qualifier` usa para dar nota. Seis dos sete
  // eram aceitos por `create_mission` e não tinham campo nenhum na tela — a
  // nota que decide quem é abordado saía de um alvo que ninguém conseguia
  // configurar.
  const [icpSignals, setIcpSignals] = useState('');
  const [minRating, setMinRating] = useState('');
  const [minReviews, setMinReviews] = useState('');
  const [perfilId, setPerfilId] = useState<string | null>(null);

  // Aplicar um perfil COPIA os valores para os campos, em vez de só guardar
  // a referência. Assim o usuário vê o que vai valer e pode ajustar para esta
  // missão sem alterar o perfil — e a missão guarda a régua com que rodou,
  // que é o que permite auditar a nota dos leads dela depois.
  const aplicarPerfil = (id: string) => {
    const p = profiles.find((x) => x.id === id);
    if (!p) return;
    setPerfilId(p.id);
    setIcpSignals(p.signals.join(', '));
    setExclusions(p.exclusions.join(', '));
    setMinRating(p.min_rating != null ? String(p.min_rating) : '');
    setMinReviews(p.min_reviews != null ? String(p.min_reviews) : '');
  };

  // O perfil padrão entra sozinho na primeira abertura. Quem configurou um
  // perfil não deveria precisar escolhê-lo toda vez.
  useEffect(() => {
    if (open && !perfilId && defaultProfile) aplicarPerfil(defaultProfile.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultProfile?.id]);

  const reset = () => {
    setName(''); setNiche(''); setCity(''); setState('');
    setSelectedOffers([]); setGoal('agendar_demonstracao'); setAutonomy('assistido');
    setTargetCount(50); setDailyLimit(30); setStartHour(9); setEndHour(18);
    setWorkDaysOnly(true); setExclusions('');
    setIcpSignals(''); setMinRating(''); setMinReviews(''); setPerfilId(null);
  };

  // O nome se preenche sozinho a partir do que já foi digitado, mas continua
  // editável — quem tem duas missões no mesmo nicho precisa diferenciar.
  const suggestedName = niche && city ? `${niche} — ${city}${state ? `/${state}` : ''}` : '';
  const effectiveName = name || suggestedName;

  const canSubmit =
    effectiveName.trim().length >= 3 &&
    niche.trim().length >= 2 &&
    city.trim().length >= 2 &&
    endHour > startHour &&
    !createMission.isPending;

  const handleSubmit = async () => {
    const result = await createMission.mutateAsync({
      name: effectiveName.trim(),
      niche: niche.trim(),
      city: city.trim(),
      state: state.trim() || null,
      offer_ids: selectedOffers,
      goal,
      autonomy_level: autonomy,
      target_count: targetCount,
      daily_limit: dailyLimit,
      start_hour: startHour,
      end_hour: endHour,
      work_days_only: workDaysOnly,
      // O ICP inteiro vai no corpo. `create_mission` aceita os sete critérios
      // desde sempre; o que faltava era a tela mandá-los.
      icp_exclusions: listaDe(exclusions),
      icp_signals: listaDe(icpSignals),
      icp_min_rating: numeroOuNulo(minRating),
      icp_min_reviews: numeroOuNulo(minReviews),
      icp_profile_id: perfilId,
    });

    reset();
    onOpenChange(false);
    if (result?.mission?.id) onCreated?.(result.mission.id);
  };

  const toggleOffer = (id: string) => {
    setSelectedOffers((prev) =>
      prev.includes(id) ? prev.filter((o) => o !== id) : [...prev, id],
    );
  };

  const willSend = autonomy === 'semiautonomo' || autonomy === 'autonomo';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-primary" />
            Nova missão de prospecção
          </DialogTitle>
          <DialogDescription>
            Diga quem prospectar e o que você pode oferecer. A IA pesquisa, qualifica,
            escolhe a melhor oferta para cada empresa e escreve a abordagem.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          {/* ---- ALVO ---- */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Quem prospectar</h3>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="mission-niche">Nicho ou segmento *</Label>
                <Input
                  id="mission-niche"
                  value={niche}
                  onChange={(e) => setNiche(e.target.value)}
                  placeholder="Clínicas de estética"
                />
              </div>

              <div>
                <Label htmlFor="mission-city">Cidade *</Label>
                <Input
                  id="mission-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Itu"
                />
              </div>

              <div>
                <Label htmlFor="mission-state">Estado</Label>
                <Input
                  id="mission-state"
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))}
                  placeholder="SP"
                  maxLength={2}
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="mission-name">Nome da missão</Label>
                <Input
                  id="mission-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={suggestedName || 'Clínicas de estética — Itu/SP'}
                />
              </div>

              <div className="sm:col-span-2">
                <Label htmlFor="mission-exclusions">
                  Excluir empresas que contenham (opcional)
                </Label>
                <Input
                  id="mission-exclusions"
                  value={exclusions}
                  onChange={(e) => setExclusions(e.target.value)}
                  placeholder="franquia, rede, hospital"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Separe por vírgula. Quem bater com um destes termos é descartado antes de gastar IA.
                </p>
              </div>

              {profiles.length > 0 && (
                <div className="sm:col-span-2">
                  <Label>Perfil de cliente ideal</Label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {profiles.map((p) => (
                      <Button
                        key={p.id}
                        type="button"
                        size="sm"
                        variant={perfilId === p.id ? 'default' : 'outline'}
                        onClick={() => aplicarPerfil(p.id)}
                      >
                        {p.name}
                      </Button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Preenche os critérios abaixo. Você pode ajustar para esta
                    missão sem alterar o perfil salvo.
                  </p>
                </div>
              )}

              <div className="sm:col-span-2">
                <Label htmlFor="mission-signals">
                  O que torna um lead bom para você (opcional)
                </Label>
                <Input
                  id="mission-signals"
                  value={icpSignals}
                  onChange={(e) => setIcpSignals(e.target.value)}
                  placeholder="sem site, atende por WhatsApp, agenda cheia"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Cada sinal encontrado soma pontos na qualificação. É o que
                  separa "empresa do nicho certo" de "empresa que precisa do que
                  você vende".
                </p>
              </div>

              <div>
                <Label htmlFor="mission-min-rating">Nota mínima no Google</Label>
                <Input
                  id="mission-min-rating"
                  inputMode="decimal"
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                  placeholder="ex.: 3.5"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Abaixo disso perde pontos — não é corte.
                </p>
              </div>

              <div>
                <Label htmlFor="mission-min-reviews">Avaliações mínimas</Label>
                <Input
                  id="mission-min-reviews"
                  inputMode="numeric"
                  value={minReviews}
                  onChange={(e) => setMinReviews(e.target.value)}
                  placeholder="ex.: 10"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Negócio sem histórico costuma ser mais difícil de fechar.
                </p>
              </div>
            </div>

            <div>
              <Label>Quantas empresas buscar: {targetCount}</Label>
              <Slider
                value={[targetCount]}
                onValueChange={([v]) => setTargetCount(v)}
                min={10} max={500} step={10}
                className="mt-2"
              />
            </div>
          </section>

          {/* ---- OFERTAS ---- */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">O que você pode oferecer</h3>

            {loadingOffers ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando catálogo...
              </div>
            ) : offers.length === 0 ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Nenhum serviço cadastrado. Sem catálogo a IA não tem o que oferecer e
                  as mensagens só conseguem abrir conversa. Cadastre em{' '}
                  <strong>Configurações → Agente → Inteligência de Serviços</strong>.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-2">
                  {offers.map((offer) => (
                    <label
                      key={offer.id}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                        selectedOffers.includes(offer.id)
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-muted/50',
                      )}
                    >
                      <Checkbox
                        checked={selectedOffers.includes(offer.id)}
                        onCheckedChange={() => toggleOffer(offer.id)}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{offer.service_name}</p>
                        {offer.description && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            {offer.description}
                          </p>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Marque tudo que pode ser vendido. A IA escolhe <strong>uma</strong> oferta por
                  empresa — a que resolve o problema que ela realmente tem — e registra o porquê.
                  Nenhuma seleção significa "qualquer serviço do catálogo".
                </p>
              </>
            )}
          </section>

          {/* ---- OBJETIVO E AUTONOMIA ---- */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Objetivo e autonomia</h3>

            <div>
              <Label>Objetivo da missão</Label>
              <Select value={goal} onValueChange={(v) => setGoal(v as CampaignGoal)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(GOAL_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Nível de autonomia</Label>
              {(Object.keys(AUTONOMY_LABELS) as AutonomyLevel[]).map((level) => (
                <label
                  key={level}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                    autonomy === level ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50',
                  )}
                >
                  <input
                    type="radio"
                    name="autonomy"
                    className="mt-1"
                    checked={autonomy === level}
                    onChange={() => setAutonomy(level)}
                  />
                  <div>
                    <p className="text-sm font-medium">
                      {AUTONOMY_LABELS[level].label}
                      {level === 'assistido' && (
                        <Badge variant="secondary" className="ml-2 text-[10px]">recomendado</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {AUTONOMY_LABELS[level].description}
                    </p>
                  </div>
                </label>
              ))}
            </div>

            {willSend && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="text-sm">
                  Nesta autonomia a IA envia sozinha. Toda mensagem ainda passa pelo Quality
                  Gate, pelo opt-out e pelos limites abaixo — mas você não vê antes.
                  Em campanha nova, comece por <strong>Assistido</strong> até confiar no resultado.
                </AlertDescription>
              </Alert>
            )}
          </section>

          {/* ---- LIMITES ---- */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Limites</h3>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="daily-limit">Envios por dia</Label>
                <Input
                  id="daily-limit"
                  type="number" min={1} max={1000}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="start-hour">Início</Label>
                <Input
                  id="start-hour"
                  type="number" min={0} max={23}
                  value={startHour}
                  onChange={(e) => setStartHour(Number(e.target.value))}
                />
              </div>
              <div>
                <Label htmlFor="end-hour">Fim</Label>
                <Input
                  id="end-hour"
                  type="number" min={1} max={24}
                  value={endHour}
                  onChange={(e) => setEndHour(Number(e.target.value))}
                />
              </div>
            </div>

            {endHour <= startHour && (
              <p className="text-xs text-destructive">
                O horário final precisa ser maior que o inicial.
              </p>
            )}

            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={workDaysOnly}
                onCheckedChange={(v) => setWorkDaysOnly(v === true)}
              />
              Somente em dias úteis
            </label>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {createMission.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Criar missão
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

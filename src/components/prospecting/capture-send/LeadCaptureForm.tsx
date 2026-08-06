import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { NicheAutocomplete } from '../NicheAutocomplete';
import { LocationAutocomplete } from '../LocationAutocomplete';
import { LeadQuantitySlider } from '../LeadQuantitySlider';
import {
  Search,
  Target,
  Filter,
  Briefcase,
  ChevronDown,
  SlidersHorizontal,
  MapPin,
  Building2,
  Zap,
  StopCircle,
  Clock,
  TrendingUp,
  Sparkles,
  Star,
  ArrowUpDown,
  ShieldCheck,
  X,
  RotateCcw,
} from 'lucide-react';
import { ProgressInfo, AVAILABLE_SERVICES, CAPTURE_FILTERS, SORT_OPTIONS } from './types';

interface LeadCaptureFormProps {
  selectedNiches: string[];
  setSelectedNiches: (v: string[]) => void;
  selectedLocations: string[];
  setSelectedLocations: (v: string[]) => void;
  showFilters: boolean;
  setShowFilters: (v: boolean) => void;
  selectedService: string;
  setSelectedService: (v: string) => void;
  captureFilter: string;
  setCaptureFilter: (v: string) => void;
  isSearching: boolean;
  progress: ProgressInfo;
  onSearch: () => void;
  onStop?: () => void;
  leadQuantity: number;
  setLeadQuantity: (v: number) => void;
  elapsedTime?: number;
  foundCount?: number;
}

export function LeadCaptureForm({
  selectedNiches,
  setSelectedNiches,
  selectedLocations,
  setSelectedLocations,
  showFilters,
  setShowFilters,
  selectedService,
  setSelectedService,
  captureFilter,
  setCaptureFilter,
  isSearching,
  progress,
  onSearch,
  onStop,
  leadQuantity,
  setLeadQuantity,
  elapsedTime = 0,
  foundCount = 0,
}: LeadCaptureFormProps) {
  const totalCombinations = selectedNiches.length * selectedLocations.length;
  const canSearch = selectedNiches.length > 0 && selectedLocations.length > 0;

  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState('relevance');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [onlyWithPhone, setOnlyWithPhone] = useState(true);

  const hasActiveFilters = captureFilter !== 'all' || selectedService !== 'auto' || minRating > 0 || sortBy !== 'relevance' || !skipDuplicates || !onlyWithPhone;
  const activeFilterCount = [
    captureFilter !== 'all',
    selectedService !== 'auto',
    minRating > 0,
    sortBy !== 'relevance',
    !skipDuplicates,
    !onlyWithPhone,
  ].filter(Boolean).length;

  const resetFilters = () => {
    setCaptureFilter('all');
    setSelectedService('auto');
    setMinRating(0);
    setSortBy('relevance');
    setSkipDuplicates(true);
    setOnlyWithPhone(true);
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const estimatedTime = totalCombinations * 8;

  return (
    <Card className="border-0 shadow-xl shadow-primary/5 bg-card overflow-hidden rounded-2xl">
      <CardContent className="p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-5">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="p-2.5 rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5 ring-1 ring-primary/10">
                <Target className="h-5 w-5 text-primary" />
              </div>
              {isSearching && (
                <div className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-card animate-pulse" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-base text-foreground">Capturar Leads</h3>
              <p className="text-xs text-muted-foreground">Busque empresas por nicho e localização</p>
            </div>
            {canSearch && !isSearching && (
              <div className="ml-auto hidden sm:flex items-center gap-1.5 text-[11px] text-muted-foreground/70 bg-muted/40 px-2.5 py-1 rounded-full">
                <Clock className="h-3 w-3" />
                ~{formatTime(estimatedTime)}
              </div>
            )}
          </div>
        </div>

        {/* Form Fields */}
        <div className="px-6 pb-6 space-y-6">
          {/* Niche + Location */}
          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                <Building2 className="h-3.5 w-3.5" />
                Tipo de Negócio
              </Label>
              <NicheAutocomplete
                value={selectedNiches}
                onChange={setSelectedNiches}
                placeholder="Digite ou selecione nichos..."
                disabled={isSearching}
                maxSelections={10}
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">
                <MapPin className="h-3.5 w-3.5" />
                Localização
              </Label>
              <LocationAutocomplete
                value={selectedLocations}
                onChange={setSelectedLocations}
                placeholder="Cidade, estado ou CEP..."
                disabled={isSearching}
                maxSelections={10}
              />
            </div>
          </div>

          {/* Quantity Slider */}
          <div className="p-4 rounded-xl bg-muted/20 border border-border/30">
            <LeadQuantitySlider
              value={leadQuantity}
              onChange={setLeadQuantity}
              disabled={isSearching}
            />
          </div>

          {/* Advanced Filters Collapsible */}
          <Collapsible open={showFilters} onOpenChange={setShowFilters}>
            <CollapsibleTrigger asChild>
              <button className={cn(
                "group w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-sm font-semibold transition-all duration-200 border",
                showFilters
                  ? "bg-primary/5 border-primary/20 text-foreground shadow-sm"
                  : "bg-muted/20 border-border/40 text-foreground/80 hover:bg-muted/30 hover:border-border/60"
              )}>
                <span className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                  showFilters ? "bg-primary/15 text-primary" : "bg-muted/60 text-muted-foreground group-hover:text-foreground"
                )}>
                  <SlidersHorizontal className="h-4 w-4" />
                </span>
                <span className="flex-1 text-left">Filtros Avançados</span>
                {hasActiveFilters && (
                  <Badge className="h-5 min-w-[20px] px-1.5 text-[10px] bg-primary text-primary-foreground border-0 rounded-full">
                    {activeFilterCount}
                  </Badge>
                )}
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform duration-200",
                  showFilters && "rotate-180 text-primary"
                )} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 rounded-2xl border border-border/50 bg-gradient-to-b from-muted/10 to-transparent animate-fade-in overflow-hidden">
              {/* Filter Header */}
              {hasActiveFilters && (
                <div className="flex items-center justify-between px-5 pt-4">
                  <span className="inline-flex items-center gap-2 text-[11px] font-semibold text-primary uppercase tracking-widest">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                    {activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''} ativo{activeFilterCount > 1 ? 's' : ''}
                  </span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground hover:text-destructive" onClick={resetFilters}>
                    <RotateCcw className="h-3 w-3" />
                    Resetar
                  </Button>
                </div>
              )}

              <div className="p-5 space-y-4">
                {/* Row 1: Tipo de Empresa + Serviço */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="group space-y-2 p-3.5 rounded-xl bg-background border border-border/40 hover:border-primary/30 transition-colors">
                    <Label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <Filter className="h-3.5 w-3.5 text-primary/70" />
                      Tipo de Empresa
                    </Label>
                    <Select value={captureFilter} onValueChange={setCaptureFilter}>
                      <SelectTrigger className="h-11 rounded-lg bg-muted/20 border-border/40 font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CAPTURE_FILTERS.map((filter) => (
                          <SelectItem key={filter.id} value={filter.id}>
                            <div className="flex items-center gap-2">
                              <span>{filter.icon}</span>
                              <div className="flex flex-col">
                                <span className="font-medium">{filter.label}</span>
                                <span className="text-xs text-muted-foreground">{filter.description}</span>
                              </div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="group space-y-2 p-3.5 rounded-xl bg-background border border-border/40 hover:border-primary/30 transition-colors">
                    <Label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <Briefcase className="h-3.5 w-3.5 text-primary/70" />
                      Serviço a Oferecer
                    </Label>
                    <Select value={selectedService} onValueChange={setSelectedService}>
                      <SelectTrigger className="h-11 rounded-lg bg-muted/20 border-border/40 font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {AVAILABLE_SERVICES.map((service) => (
                          <SelectItem key={service.id} value={service.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{service.label}</span>
                              <span className="text-xs text-muted-foreground">{service.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row 2: Rating Slider + Sort */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-3 p-3.5 rounded-xl bg-background border border-border/40">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                        <Star className="h-3.5 w-3.5 text-warning" />
                        Avaliação Mínima
                      </Label>
                      <span className="inline-flex items-center gap-1 text-xs font-bold tabular-nums text-foreground bg-warning/10 text-warning dark:text-warning px-2 py-0.5 rounded-md">
                        {minRating === 0 ? 'Todas' : (<><Star className="h-3 w-3 fill-current" />{minRating}+</>)}
                      </span>
                    </div>
                    <Slider
                      value={[minRating]}
                      onValueChange={([val]) => setMinRating(val)}
                      min={0}
                      max={5}
                      step={0.5}
                      disabled={isSearching}
                      className="w-full"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground/60 font-medium">
                      <span>0</span>
                      <span>2.5</span>
                      <span>5.0</span>
                    </div>
                  </div>
                  <div className="space-y-2 p-3.5 rounded-xl bg-background border border-border/40">
                    <Label className="flex items-center gap-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      <ArrowUpDown className="h-3.5 w-3.5 text-primary/70" />
                      Ordenar Por
                    </Label>
                    <Select value={sortBy} onValueChange={setSortBy}>
                      <SelectTrigger className="h-11 rounded-lg bg-muted/20 border-border/40 font-medium">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SORT_OPTIONS.map((opt) => (
                          <SelectItem key={opt.id} value={opt.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{opt.label}</span>
                              <span className="text-xs text-muted-foreground">{opt.description}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Row 3: Toggles */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className={cn(
                    "flex items-center justify-between gap-3 p-3.5 rounded-xl bg-background border cursor-pointer transition-colors",
                    skipDuplicates ? "border-success/30 bg-success/[0.03]" : "border-border/40 hover:border-border/60"
                  )}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                        skipDuplicates ? "bg-success/15 text-success dark:text-success" : "bg-muted/50 text-muted-foreground"
                      )}>
                        <ShieldCheck className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">Ignorar duplicados</p>
                        <p className="text-[10px] text-muted-foreground truncate">Pula leads já salvos</p>
                      </div>
                    </div>
                    <Switch checked={skipDuplicates} onCheckedChange={setSkipDuplicates} disabled={isSearching} />
                  </label>
                  <label className={cn(
                    "flex items-center justify-between gap-3 p-3.5 rounded-xl bg-background border cursor-pointer transition-colors",
                    onlyWithPhone ? "border-primary/30 bg-primary/[0.03]" : "border-border/40 hover:border-border/60"
                  )}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={cn(
                        "flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                        onlyWithPhone ? "bg-primary/15 text-primary" : "bg-muted/50 text-muted-foreground"
                      )}>
                        <Zap className="h-4 w-4" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">Apenas com telefone</p>
                        <p className="text-[10px] text-muted-foreground truncate">Filtra leads sem número</p>
                      </div>
                    </div>
                    <Switch checked={onlyWithPhone} onCheckedChange={setOnlyWithPhone} disabled={isSearching} />
                  </label>
                </div>

                {/* Active Filter Chips */}
                {hasActiveFilters && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {captureFilter !== 'all' && (
                      <Badge variant="outline" className="text-[10px] gap-1 h-6 bg-primary/5 border-primary/20 text-primary cursor-pointer hover:bg-primary/10" onClick={() => setCaptureFilter('all')}>
                        {CAPTURE_FILTERS.find(f => f.id === captureFilter)?.icon} {CAPTURE_FILTERS.find(f => f.id === captureFilter)?.label}
                        <X className="h-2.5 w-2.5" />
                      </Badge>
                    )}
                    {selectedService !== 'auto' && selectedService !== 'all' && (
                      <Badge variant="outline" className="text-[10px] gap-1 h-6 bg-accent/30 border-accent/50 cursor-pointer hover:bg-accent/50" onClick={() => setSelectedService('auto')}>
                        <Briefcase className="h-2.5 w-2.5" />
                        {AVAILABLE_SERVICES.find(s => s.id === selectedService)?.label}
                        <X className="h-2.5 w-2.5" />
                      </Badge>
                    )}
                    {minRating > 0 && (
                      <Badge variant="outline" className="text-[10px] gap-1 h-6 bg-warning/10 border-warning/20 text-warning cursor-pointer hover:bg-warning/20" onClick={() => setMinRating(0)}>
                        ⭐ {minRating}+
                        <X className="h-2.5 w-2.5" />
                      </Badge>
                    )}
                    {sortBy !== 'relevance' && (
                      <Badge variant="outline" className="text-[10px] gap-1 h-6 cursor-pointer hover:bg-muted" onClick={() => setSortBy('relevance')}>
                        <ArrowUpDown className="h-2.5 w-2.5" />
                        {SORT_OPTIONS.find(s => s.id === sortBy)?.label}
                        <X className="h-2.5 w-2.5" />
                      </Badge>
                    )}
                  </div>
                )}

                {/* Smart Tip */}
                {captureFilter === 'no_website' && selectedService === 'auto' && (
                  <div className="flex items-start gap-2.5 p-3 rounded-lg bg-primary/5 border border-primary/15">
                    <Sparkles className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold text-primary">Dica inteligente</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Para empresas sem site, selecione "Sites e Landing Pages" como serviço
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* CTA Button */}
          <Button
            onClick={isSearching ? onStop : onSearch}
            disabled={!isSearching && !canSearch}
            className={cn(
              "w-full h-12 gap-2.5 text-sm font-semibold rounded-xl transition-all duration-300",
              isSearching
                ? "bg-destructive hover:bg-destructive/90 text-destructive-foreground"
                : canSearch
                  ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:scale-[1.01] active:scale-[0.99]"
                  : "bg-muted text-muted-foreground"
            )}
          >
            {isSearching ? (
              <>
                <StopCircle className="h-5 w-5" />
                Parar Busca
              </>
            ) : (
              <>
                <Search className="h-5 w-5" />
                Selecione nicho e localização
              </>
            )}
          </Button>

          {/* Progress */}
          {isSearching && progress.total > 0 && (
            <div className="p-4 rounded-xl bg-gradient-to-r from-primary/5 to-transparent border border-primary/10 space-y-3 animate-fade-in">
              <div className="flex justify-between items-center text-sm">
                <span className="font-medium text-foreground truncate mr-2">{progress.phase}</span>
                <span className="text-muted-foreground tabular-nums whitespace-nowrap font-mono text-xs">
                  {progress.current}/{progress.total}
                </span>
              </div>
              <Progress value={(progress.current / progress.total) * 100} className="h-1.5" />
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatTime(elapsedTime)}
                  </span>
                  {foundCount > 0 && (
                    <span className="flex items-center gap-1 text-primary font-semibold">
                      <TrendingUp className="h-3 w-3" />
                      {foundCount} encontrados
                    </span>
                  )}
                </div>
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 tabular-nums border-primary/20 text-primary">
                  {Math.round((progress.current / progress.total) * 100)}%
                </Badge>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

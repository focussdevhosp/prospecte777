import { useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  MapPin,
  Building2,
  Phone,
  Star,
  Globe,
  Send,
  CheckCircle2,
  AlertCircle,
  Users,
  Sparkles,
  Loader2,
  Search,
  Download,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  X,
  ExternalLink,
} from 'lucide-react';
import { CapturedLead } from './types';

interface LeadResultsTableProps {
  capturedLeads: CapturedLead[];
  selectedLeadIds: string[];
  toggleLeadSelection: (id: string) => void;
  selectAllNew: () => void;
  onSaveLeads: () => void;
  onSendMessages: () => void;
  newCount: number;
  totalResults: number;
  duplicateCount: number;
  isCreating: boolean;
  hasActiveJob: boolean;
  activeJobPayload?: any;
  activeJobCurrentIndex?: number;
  activeJobStatus?: string;
  processStatus?: 'idle' | 'capturing' | 'completed' | 'stopped';
  onScrollToForm?: () => void;
}

const ITEMS_PER_PAGE = 24;

export function LeadResultsTable({
  capturedLeads,
  selectedLeadIds,
  toggleLeadSelection,
  selectAllNew,
  onSaveLeads,
  onSendMessages,
  newCount,
  totalResults,
  duplicateCount,
  isCreating,
  hasActiveJob,
  activeJobPayload,
  activeJobCurrentIndex,
  activeJobStatus,
  processStatus = 'idle',
  onScrollToForm,
}: LeadResultsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'quality' | 'name' | 'rating'>('quality');
  const [currentPage, setCurrentPage] = useState(1);
  const [showDuplicates, setShowDuplicates] = useState(true);
  const [minScore, setMinScore] = useState(0);

  // Get unique groups for filter
  const availableGroups = useMemo(() => {
    const groups = new Set(capturedLeads.map(l => l.lead_group).filter(Boolean));
    return Array.from(groups) as string[];
  }, [capturedLeads]);

  // Filter and sort
  const filteredLeads = useMemo(() => {
    let leads = [...capturedLeads];

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      leads = leads.filter(l =>
        l.business_name.toLowerCase().includes(term) ||
        l.phone.includes(term) ||
        l.address?.toLowerCase().includes(term) ||
        l.niche.toLowerCase().includes(term) ||
        l.location.toLowerCase().includes(term)
      );
    }

    // Group filter
    if (groupFilter !== 'all') {
      leads = leads.filter(l => l.lead_group === groupFilter);
    }

    // Duplicates filter
    if (!showDuplicates) {
      leads = leads.filter(l => !l.isDuplicate);
    }

    // Min score filter
    if (minScore > 0) {
      leads = leads.filter(l => (l.qualityScore || 0) >= minScore);
    }

    // Sort
    leads.sort((a, b) => {
      if (sortBy === 'quality') return (b.qualityScore || 0) - (a.qualityScore || 0);
      if (sortBy === 'name') return a.business_name.localeCompare(b.business_name);
      if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
      return 0;
    });

    return leads;
  }, [capturedLeads, searchTerm, groupFilter, sortBy, showDuplicates, minScore]);

  // Pagination
  const totalPages = Math.ceil(filteredLeads.length / ITEMS_PER_PAGE);
  const paginatedLeads = filteredLeads.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset page on filter change
  const handleFilterChange = (setter: (v: any) => void, value: any) => {
    setter(value);
    setCurrentPage(1);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Nome', 'Telefone', 'Endereço', 'Nicho', 'Localização', 'Nota', 'Avaliações', 'Website', 'Grupo', 'Score'];
    const rows = filteredLeads.map(l => [
      l.business_name,
      l.phone,
      l.address || '',
      l.niche,
      l.location,
      l.rating?.toString() || '',
      l.reviews_count?.toString() || '',
      l.website || '',
      l.lead_group || '',
      l.qualityScore?.toString() || '',
    ]);

    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Empty state: skeleton during capturing, friendly message when idle
  if (capturedLeads.length === 0 && processStatus === 'capturing') {
    return (
      <div className="space-y-4 animate-fade-in">
        <div className="p-4 rounded-xl bg-muted/50 border flex items-center gap-3">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Buscando leads...</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-0">
                <Skeleton className="h-20 w-full" />
                <div className="p-3 space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-3 w-2/3" />
                  <div className="flex gap-1 mt-2">
                    <Skeleton className="h-5 w-16 rounded-full" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (capturedLeads.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 animate-fade-in">
        <div className="p-4 rounded-full bg-muted">
          <Search className="h-8 w-8 text-muted-foreground" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Nenhum lead encontrado</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Busque leads pelo nicho e localização acima para começar
          </p>
        </div>
        {onScrollToForm && (
          <Button variant="outline" onClick={onScrollToForm} className="gap-2">
            <Search className="h-4 w-4" />
            Começar Busca
          </Button>
        )}
      </div>
    );
  }

  const hasActiveFilters = searchTerm || groupFilter !== 'all' || !showDuplicates || minScore > 0;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Stats Bar */}
      <div className="flex flex-wrap items-center gap-4 p-4 rounded-xl bg-muted/50 border">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <span className="text-2xl font-bold">{totalResults}</span>
          <span className="text-sm text-muted-foreground">resultados</span>
        </div>

        <div className="h-6 w-px bg-border hidden sm:block" />

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-success" />
            <span className="font-medium">{newCount}</span>
            <span className="text-sm text-muted-foreground">novos</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-warning" />
            <span className="font-medium">{duplicateCount}</span>
            <span className="text-sm text-muted-foreground">existentes</span>
          </div>
        </div>

        {/* Group breakdown */}
        {availableGroups.length > 0 && (
          <>
            <div className="h-6 w-px bg-border hidden lg:block" />
            <div className="hidden lg:flex items-center gap-1.5 flex-wrap">
              {availableGroups.slice(0, 4).map(group => {
                const count = capturedLeads.filter(l => l.lead_group === group && !l.isDuplicate).length;
                return (
                  <Badge key={group} variant="outline" className="text-xs">
                    {group} ({count})
                  </Badge>
                );
              })}
            </div>
          </>
        )}

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleExportCSV} className="gap-1.5">
            <Download className="h-3.5 w-3.5" />
            CSV
          </Button>
          <Button variant="outline" size="sm" onClick={selectAllNew} disabled={newCount === 0}>
            Selecionar Novos ({newCount})
          </Button>
          <Button
            size="sm"
            onClick={onSendMessages}
            disabled={selectedLeadIds.length === 0 || isCreating || hasActiveJob}
            className="gap-2 gradient-primary"
          >
            {isCreating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Enviar ({selectedLeadIds.length})
          </Button>
        </div>
      </div>

      {/* Search & Filters Bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(e) => handleFilterChange(setSearchTerm, e.target.value)}
            placeholder="Buscar nos resultados..."
            className="pl-9 h-9"
          />
          {searchTerm && (
            <button
              onClick={() => handleFilterChange(setSearchTerm, '')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {availableGroups.length > 0 && (
          <Select value={groupFilter} onValueChange={(v) => handleFilterChange(setGroupFilter, v)}>
            <SelectTrigger className="w-[160px] h-9">
              <SlidersHorizontal className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              <SelectValue placeholder="Grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os grupos</SelectItem>
              {availableGroups.map(group => (
                <SelectItem key={group} value={group}>{group}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={sortBy} onValueChange={(v) => handleFilterChange(setSortBy, v as any)}>
          <SelectTrigger className="w-[140px] h-9">
            <SelectValue placeholder="Ordenar" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="quality">Maior Score</SelectItem>
            <SelectItem value="rating">Maior Nota</SelectItem>
            <SelectItem value="name">Nome A-Z</SelectItem>
          </SelectContent>
        </Select>

        <Button
          variant={showDuplicates ? 'outline' : 'secondary'}
          size="sm"
          className="h-9 text-xs gap-1.5"
          onClick={() => handleFilterChange(setShowDuplicates, !showDuplicates)}
        >
          <AlertCircle className="h-3.5 w-3.5" />
          {showDuplicates ? 'Ocultar duplicados' : 'Mostrar duplicados'}
        </Button>

        {/* Min Score Slider */}
        <div className="flex items-center gap-2 min-w-[180px]">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Score ≥ {minScore}</span>
          <Slider
            value={[minScore]}
            onValueChange={([v]) => handleFilterChange(setMinScore, v)}
            min={0}
            max={100}
            step={10}
            className="w-24"
          />
        </div>

        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs text-muted-foreground"
            onClick={() => {
              setSearchTerm('');
              setGroupFilter('all');
              setShowDuplicates(true);
              setMinScore(0);
              setCurrentPage(1);
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Filtered count */}
      {hasActiveFilters && (
        <p className="text-xs text-muted-foreground">
          Mostrando {filteredLeads.length} de {totalResults} resultados
        </p>
      )}

      {/* Leads Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {paginatedLeads.map((lead, index) => {
          const isCurrentlySending =
            activeJobStatus === 'running' &&
            activeJobPayload?.leads?.[activeJobCurrentIndex || 0]?.phone === lead.phone;

          return (
            <Card
              key={lead.id}
              className={cn(
                'group cursor-pointer transition-all duration-200 animate-fade-in overflow-hidden hover:shadow-md',
                selectedLeadIds.includes(lead.id) && 'ring-2 ring-primary border-primary',
                lead.isDuplicate && 'opacity-50',
                isCurrentlySending && 'ring-2 ring-success border-success animate-pulse'
              )}
              style={{ animationDelay: `${index * 20}ms` }}
              onClick={() => !lead.isDuplicate && toggleLeadSelection(lead.id)}
            >
              <CardContent className="p-0">
                {/* Photo Header */}
                <div className="relative h-20 bg-gradient-to-br from-muted to-muted/50 overflow-hidden">
                  {lead.photo_url ? (
                    <img
                      src={lead.photo_url}
                      alt={lead.business_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      loading="lazy"
                      width={300}
                      height={80}
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Building2 className="h-8 w-8 text-muted-foreground/30" />
                    </div>
                  )}

                  {isCurrentlySending && (
                    <div className="absolute inset-0 bg-success/20 flex items-center justify-center">
                      <div className="bg-success text-success-foreground px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 shadow-lg">
                        <Send className="h-3 w-3 animate-bounce" />
                        Enviando...
                      </div>
                    </div>
                  )}

                  <div className="absolute top-1.5 right-1.5 flex gap-1">
                    {lead.qualityScore != null && (
                      <Badge
                        className={cn(
                          "text-[10px] px-1.5 py-0 h-5 shadow-sm border",
                          lead.qualityScore >= 71
                            ? 'bg-success/90 text-white border-success'
                            : lead.qualityScore >= 41
                            ? 'bg-warning/90 text-white border-warning'
                            : 'bg-destructive/90 text-white border-destructive'
                        )}
                      >
                        {lead.qualityScore}%
                      </Badge>
                    )}
                  </div>

                  {lead.rating && (
                    <div className="absolute top-1.5 left-1.5 bg-background/90 rounded-full px-1.5 py-0.5 flex items-center gap-0.5 text-[10px] shadow-sm">
                      <Star className="h-2.5 w-2.5 text-warning fill-warning" />
                      <span className="font-semibold">{lead.rating}</span>
                      {lead.reviews_count && (
                        <span className="text-muted-foreground">({lead.reviews_count})</span>
                      )}
                    </div>
                  )}

                  {/* Checkbox overlay */}
                  <div className="absolute bottom-1.5 left-1.5">
                    <Checkbox
                      checked={selectedLeadIds.includes(lead.id)}
                      disabled={lead.isDuplicate}
                      className="bg-background/80 border-2"
                    />
                  </div>
                </div>

                {/* Content */}
                <div className="p-3">
                  <h4 className="font-semibold text-sm truncate leading-tight">{lead.business_name}</h4>

                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3 shrink-0" />
                      <span className="truncate">{lead.phone}</span>
                    </div>

                    {lead.address && (
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{lead.address}</span>
                      </div>
                    )}

                    {lead.website && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <Globe className="h-3 w-3 text-muted-foreground shrink-0" />
                        <a
                          href={lead.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-primary hover:underline truncate flex items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {lead.website.replace(/^https?:\/\//, '').slice(0, 22)}
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1 mt-2">
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                      {lead.niche}
                    </Badge>
                    {lead.lead_group && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">
                        {lead.lead_group}
                      </Badge>
                    )}
                    {lead.isDuplicate && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5 bg-warning/10 text-warning border-warning/20">
                        <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                        Existente
                      </Badge>
                    )}
                  </div>

                  {lead.service_opportunities && lead.service_opportunities.length > 0 && (
                    <div className="mt-2 pt-2 border-t border-border/50">
                      <div className="flex flex-wrap gap-1">
                        {lead.service_opportunities.slice(0, 2).map((opp, i) => (
                          <Badge key={i} variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-primary/5 border-primary/20 text-primary">
                            <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                            {opp}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Página {currentPage} de {totalPages} ({filteredLeads.length} leads)
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let page: number;
              if (totalPages <= 5) {
                page = i + 1;
              } else if (currentPage <= 3) {
                page = i + 1;
              } else if (currentPage >= totalPages - 2) {
                page = totalPages - 4 + i;
              } else {
                page = currentPage - 2 + i;
              }
              return (
                <Button
                  key={page}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                  className="h-8 w-8 p-0 text-xs"
                >
                  {page}
                </Button>
              );
            })}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

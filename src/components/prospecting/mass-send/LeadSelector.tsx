import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Users,
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle,
  History,
  Database,
  Search,
  MapPin,
  Star,
  Eye,
} from 'lucide-react';
import { Lead } from '@/types/database';
import { ProspectingHistoryLead } from '@/hooks/use-prospecting-history';

type ViewMode = 'pending' | 'sent' | 'history';

interface LeadSelectorProps {
  pendingLeads: Lead[];
  sentLeads: Lead[];
  selectedLeads: string[];
  setSelectedLeads: (leads: string[]) => void;
  selectedHistoryLeads: ProspectingHistoryLead[];
  setSelectedHistoryLeads: (leads: ProspectingHistoryLead[]) => void;
  historyLeadsByNiche: Record<string, { leads: ProspectingHistoryLead[]; sessionId: string; location: string | null }[]>;
  totalHistoryLeads: number;
  isImported: boolean;
  isRemarketing: boolean;
  onPreview: (leadId: string) => void;
  canPreview: boolean;
}

export function LeadSelector({
  pendingLeads,
  sentLeads,
  selectedLeads,
  setSelectedLeads,
  selectedHistoryLeads,
  setSelectedHistoryLeads,
  historyLeadsByNiche,
  totalHistoryLeads,
  isImported,
  isRemarketing,
  onPreview,
  canPreview,
}: LeadSelectorProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('pending');
  const [expandedNiches, setExpandedNiches] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const displayLeads = viewMode === 'pending' ? pendingLeads : sentLeads;

  const filteredLeads = searchQuery
    ? displayLeads.filter(l =>
        l.business_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        l.phone.includes(searchQuery) ||
        (l.niche || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (l.location || '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : displayLeads;

  const leadsByNiche = filteredLeads.reduce((acc, lead) => {
    const niche = lead.niche || 'Sem nicho';
    if (!acc[niche]) acc[niche] = [];
    acc[niche].push(lead);
    return acc;
  }, {} as Record<string, Lead[]>);

  const sortedNiches = Object.entries(leadsByNiche).sort((a, b) => b[1].length - a[1].length);

  const toggleNicheExpand = (niche: string) => {
    setExpandedNiches(prev => {
      const next = new Set(prev);
      if (next.has(niche)) next.delete(niche);
      else next.add(niche);
      return next;
    });
  };

  const tabs = [
    { mode: 'pending' as ViewMode, label: 'Pendentes', count: pendingLeads.length, icon: Clock },
    { mode: 'sent' as ViewMode, label: 'Enviados', count: sentLeads.length, icon: CheckCircle },
    { mode: 'history' as ViewMode, label: 'Histórico', count: totalHistoryLeads, icon: History },
  ];

  return (
    <Card className="border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/40 bg-muted/30 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-foreground">
              {isRemarketing ? 'Leads para Remarketing' : 'Selecionar Leads'}
            </h3>
            <p className="text-sm text-muted-foreground">Escolha os leads para envio em massa</p>
          </div>
        </div>
      </div>

      <CardContent className="p-5 space-y-4">
        {/* Tabs */}
        {!isImported && (
          <div className="flex gap-1 p-1 bg-muted/50 rounded-lg">
            {tabs.map(tab => (
              <button
                key={tab.mode}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-md text-xs font-medium transition-all ${
                  viewMode === tab.mode
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setViewMode(tab.mode);
                  setSelectedLeads([]);
                  setSelectedHistoryLeads([]);
                  setSearchQuery('');
                }}
              >
                <tab.icon className="h-3.5 w-3.5" />
                {tab.label}
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-0.5 font-mono">
                  {tab.count}
                </Badge>
              </button>
            ))}
          </div>
        )}

        {/* Search */}
        {viewMode !== 'history' && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, telefone, nicho..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm bg-background/60 border-border/50"
            />
          </div>
        )}

        {/* Select controls */}
        {viewMode !== 'history' && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {selectedLeads.length} de {filteredLeads.length} selecionados
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                if (selectedLeads.length === filteredLeads.length) {
                  setSelectedLeads([]);
                } else {
                  setSelectedLeads(filteredLeads.map(l => l.id));
                }
              }}
            >
              {selectedLeads.length === filteredLeads.length ? 'Desmarcar' : 'Selecionar todos'}
            </Button>
          </div>
        )}

        {/* Content */}
        {viewMode === 'history' ? (
          <HistoryLeadsList
            historyLeadsByNiche={historyLeadsByNiche}
            totalHistoryLeads={totalHistoryLeads}
            selectedHistoryLeads={selectedHistoryLeads}
            setSelectedHistoryLeads={setSelectedHistoryLeads}
            expandedNiches={expandedNiches}
            toggleNicheExpand={toggleNicheExpand}
          />
        ) : filteredLeads.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-muted/50 mx-auto mb-3">
              <Users className="h-7 w-7 opacity-40" />
            </div>
            <p className="font-medium text-foreground/70">
              {searchQuery ? 'Nenhum lead encontrado' : viewMode === 'pending' ? 'Nenhum lead pendente' : 'Nenhum lead enviado'}
            </p>
            <p className="text-xs mt-1">
              {searchQuery ? 'Tente outro termo de busca' : 'Capture leads primeiro ou veja o Histórico'}
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[420px] pr-1">
            <div className="space-y-1.5">
              {sortedNiches.map(([niche, nicheLeads]) => {
                const isExpanded = expandedNiches.has(niche);
                const nicheLeadIds = nicheLeads.map(l => l.id);
                const selectedInNiche = nicheLeadIds.filter(id => selectedLeads.includes(id)).length;
                const allNicheSelected = selectedInNiche === nicheLeads.length;

                return (
                  <div key={niche} className="border border-border/40 rounded-lg overflow-hidden">
                    <div
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                        allNicheSelected ? 'bg-primary/10' : 'hover:bg-muted/40'
                      }`}
                      onClick={() => toggleNicheExpand(niche)}
                    >
                      <Checkbox
                        checked={allNicheSelected}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedLeads([...new Set([...selectedLeads, ...nicheLeadIds])]);
                          } else {
                            setSelectedLeads(selectedLeads.filter(id => !nicheLeadIds.includes(id)));
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">{niche}</span>
                          <Badge variant="secondary" className="text-[10px] px-1.5 h-4 font-mono">
                            {nicheLeads.length}
                          </Badge>
                          {selectedInNiche > 0 && selectedInNiche < nicheLeads.length && (
                            <span className="text-[10px] text-primary font-medium">{selectedInNiche} sel.</span>
                          )}
                        </div>
                      </div>
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                    </div>

                    {isExpanded && (
                      <div className="border-t border-border/30 divide-y divide-border/20">
                        {nicheLeads.map((lead) => (
                          <div
                            key={lead.id}
                            className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                              selectedLeads.includes(lead.id) ? 'bg-primary/5' : 'hover:bg-muted/30'
                            }`}
                            onClick={() => {
                              setSelectedLeads(
                                selectedLeads.includes(lead.id)
                                  ? selectedLeads.filter(id => id !== lead.id)
                                  : [...selectedLeads, lead.id]
                              );
                            }}
                          >
                            <div className="w-5" />
                            <Checkbox checked={selectedLeads.includes(lead.id)} />
                            <div className="flex-1 min-w-0">
                              <p className="font-medium truncate text-sm">{lead.business_name}</p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <span className="font-mono">{lead.phone}</span>
                                {lead.location && (
                                  <span className="flex items-center gap-0.5">
                                    <MapPin className="h-3 w-3" />
                                    {lead.location}
                                  </span>
                                )}
                                {lead.rating && (
                                  <span className="flex items-center gap-0.5 text-warning">
                                    <Star className="h-3 w-3 fill-current" />
                                    {lead.rating}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-[10px] px-2 gap-1 text-muted-foreground hover:text-primary"
                              onClick={(e) => {
                                e.stopPropagation();
                                onPreview(lead.id);
                              }}
                              disabled={!canPreview}
                            >
                              <Eye className="h-3 w-3" />
                              Prévia
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

function HistoryLeadsList({
  historyLeadsByNiche,
  totalHistoryLeads,
  selectedHistoryLeads,
  setSelectedHistoryLeads,
  expandedNiches,
  toggleNicheExpand,
}: {
  historyLeadsByNiche: Record<string, { leads: ProspectingHistoryLead[]; sessionId: string; location: string | null }[]>;
  totalHistoryLeads: number;
  selectedHistoryLeads: ProspectingHistoryLead[];
  setSelectedHistoryLeads: (leads: ProspectingHistoryLead[]) => void;
  expandedNiches: Set<string>;
  toggleNicheExpand: (niche: string) => void;
}) {
  if (totalHistoryLeads === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-muted/50 mx-auto mb-3">
          <Database className="h-7 w-7 opacity-40" />
        </div>
        <p className="font-medium text-foreground/70">Nenhum lead no histórico</p>
        <p className="text-xs mt-1">Capture leads para popular o histórico</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {selectedHistoryLeads.length} leads selecionados
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={() => {
            if (selectedHistoryLeads.length > 0) {
              setSelectedHistoryLeads([]);
            } else {
              const all: ProspectingHistoryLead[] = [];
              Object.values(historyLeadsByNiche).forEach(sessions =>
                sessions.forEach(session => all.push(...session.leads))
              );
              setSelectedHistoryLeads(all);
            }
          }}
        >
          {selectedHistoryLeads.length > 0 ? 'Desmarcar' : 'Selecionar todos'}
        </Button>
      </div>

      <ScrollArea className="h-[420px]">
        <div className="space-y-1.5">
          {Object.entries(historyLeadsByNiche).map(([niche, sessions]) => {
            const isExpanded = expandedNiches.has(`history-${niche}`);
            const allNicheLeads = sessions.flatMap(s => s.leads);
            const selectedInNiche = allNicheLeads.filter(l =>
              selectedHistoryLeads.some(sl => sl.id === l.id)
            ).length;
            const allSelected = selectedInNiche === allNicheLeads.length && allNicheLeads.length > 0;

            return (
              <div key={niche} className="border border-border/40 rounded-lg overflow-hidden">
                <div
                  className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                    allSelected ? 'bg-primary/10' : 'hover:bg-muted/40'
                  }`}
                  onClick={() => toggleNicheExpand(`history-${niche}`)}
                >
                  <Checkbox
                    checked={allSelected}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        setSelectedHistoryLeads([
                          ...selectedHistoryLeads,
                          ...allNicheLeads.filter(l => !selectedHistoryLeads.some(sl => sl.id === l.id)),
                        ]);
                      } else {
                        setSelectedHistoryLeads(
                          selectedHistoryLeads.filter(sl => !allNicheLeads.some(l => l.id === sl.id))
                        );
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate">{niche}</span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 h-4 font-mono">
                        {allNicheLeads.length}
                      </Badge>
                    </div>
                  </div>
                  {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                </div>
                {isExpanded && (
                  <div className="border-t border-border/30 divide-y divide-border/20">
                    {allNicheLeads.map((lead) => (
                      <div
                        key={lead.id}
                        className={`flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors ${
                          selectedHistoryLeads.some(sl => sl.id === lead.id) ? 'bg-primary/5' : 'hover:bg-muted/30'
                        }`}
                        onClick={() => {
                          const isSelected = selectedHistoryLeads.some(sl => sl.id === lead.id);
                          setSelectedHistoryLeads(
                            isSelected
                              ? selectedHistoryLeads.filter(sl => sl.id !== lead.id)
                              : [...selectedHistoryLeads, lead]
                          );
                        }}
                      >
                        <div className="w-5" />
                        <Checkbox checked={selectedHistoryLeads.some(sl => sl.id === lead.id)} />
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate text-sm">{lead.business_name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{lead.phone}</p>
                        </div>
                        <Badge
                          variant={lead.status === 'sent' ? 'default' : lead.status === 'error' ? 'destructive' : 'secondary'}
                          className="text-[10px] shrink-0"
                        >
                          {lead.status === 'pending' ? 'Pendente' : lead.status === 'sent' ? 'Enviado' : lead.status === 'error' ? 'Erro' : lead.status === 'duplicate' ? 'Duplicado' : 'Salvo'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </>
  );
}

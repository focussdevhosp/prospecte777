import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useLeads } from '@/hooks/use-leads';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useToast } from '@/hooks/use-toast';
import {
  Facebook,
  Search,
  Loader2,
  Plus,
  ExternalLink,
  Phone,
  Mail,
  Globe,
  Info,
  AlertTriangle,
  Users,
  Download,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';

interface FBPage {
  name: string;
  facebook_url: string;
  phone: string;
  email: string;
  address: string;
  category: string;
  followers: number;
  has_contact: boolean;
  enriched: boolean;
}

export function FacebookExtractorTab() {
  const { createLead } = useLeads();
  const { settings } = useUserSettings();
  const { toast } = useToast();

  const [niche, setNiche] = useState('');
  const [location, setLocation] = useState('');
  const [limit, setLimit] = useState([20]);
  const [isLoading, setIsLoading] = useState(false);
  const [pages, setPages] = useState<FBPage[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [imported, setImported] = useState<Set<number>>(new Set());

  const canSearch = true; // Uses free DuckDuckGo search

  const handleSearch = async () => {
    if (!niche.trim() || !location.trim()) return;
    setIsLoading(true);
    setPages([]);
    setSelected(new Set());
    setImported(new Set());
    try {
      const { data, error } = await supabase.functions.invoke('facebook-scraper', {
        body: { action: 'search_by_niche', niche: niche.trim(), location: location.trim(), limit: limit[0] },
      });
      if (error) throw error;
      setPages(data?.pages || []);
      if ((data?.pages || []).length === 0) {
        toast({ title: 'Nenhuma página encontrada', description: 'Tente outro nicho ou cidade' });
      }
    } catch (err: any) {
      toast({ title: 'Erro na busca', description: err.message || 'Tente novamente', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportOne = (page: FBPage, index: number) => {
    createLead({
      business_name: page.name || 'Lead Facebook',
      phone: page.phone || '0',
      email: page.email || null,
      website: page.facebook_url,
      niche: niche,
      location: location,
      source: 'facebook',
      facebook_url: page.facebook_url,
    } as any);
    setImported(prev => new Set(prev).add(index));
    toast({ title: `${page.name} importado como lead!` });
  };

  const handleImportSelected = () => {
    const toImport = pages.filter((_, i) => selected.has(i) && !imported.has(i));
    toImport.forEach(page => {
      createLead({
        business_name: page.name || 'Lead Facebook',
        phone: page.phone || '0',
        email: page.email || null,
        website: page.facebook_url,
        niche: niche,
        location: location,
        source: 'facebook',
        facebook_url: page.facebook_url,
      } as any);
    });
    const newImported = new Set(imported);
    pages.forEach((_, i) => { if (selected.has(i)) newImported.add(i); });
    setImported(newImported);
    toast({ title: `${toImport.length} leads importados com sucesso!` });
    setSelected(new Set());
  };

  const toggleSelect = (i: number) => {
    const next = new Set(selected);
    next.has(i) ? next.delete(i) : next.add(i);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === pages.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(pages.map((_, i) => i)));
    }
  };

  const contactCount = pages.filter(p => p.phone || p.email).length;
  const enrichedCount = pages.filter(p => p.enriched).length;

  return (
    <div className="space-y-6">

      {/* Search Form */}
      <Card className="border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden">
        <div className="border-b border-border/40 bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary">
              <Facebook className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Buscar Páginas do Facebook</h3>
              <p className="text-sm text-muted-foreground">Encontre páginas de negócios por nicho e cidade via Google Search</p>
            </div>
          </div>
        </div>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nicho *</Label>
              <Input
                value={niche}
                onChange={e => setNiche(e.target.value)}
                placeholder="Ex: Pizzaria, Academia, Salão de beleza"
                className="bg-background/60 border-border/50 focus:border-primary/60"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cidade *</Label>
              <Input
                value={location}
                onChange={e => setLocation(e.target.value)}
                placeholder="Ex: São Paulo SP, Campinas SP"
                className="bg-background/60 border-border/50 focus:border-primary/60"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quantidade</Label>
              <Badge variant="secondary" className="text-xs font-mono tabular-nums px-2.5">
                {limit[0]} páginas
              </Badge>
            </div>
            <Slider
              value={limit}
              onValueChange={setLimit}
              min={5}
              max={50}
              step={5}
              className="py-1"
            />
            <div className="flex justify-between text-[10px] text-muted-foreground/60 px-0.5">
              <span>5</span>
              <span>25</span>
              <span>50</span>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <Button
              onClick={handleSearch}
              disabled={isLoading || !niche.trim() || !location.trim()}
              className="gap-2 px-5"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Buscar páginas
            </Button>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span>Funciona via Google Search — mais estável que scraping direto</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && (
        <Card className="border-border/60">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Buscando páginas do Facebook...</span>
            </div>
            <div className="space-y-2.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {!isLoading && pages.length > 0 && (
        <Card className="border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden">
          {/* Results Header */}
          <div className="border-b border-border/40 bg-muted/30 px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <h3 className="font-semibold text-foreground">
                  {pages.length} páginas encontradas
                </h3>
                <div className="flex items-center gap-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Phone className="h-3 w-3" />
                          {contactCount} com contato
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>Páginas com telefone ou email</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <Badge variant="outline" className="gap-1 text-xs">
                          <Sparkles className="h-3 w-3" />
                          {enrichedCount} enriquecidos
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent>Páginas com dados enriquecidos via Apify</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selected.size > 0 && (
                  <Button size="sm" onClick={handleImportSelected} className="gap-1.5">
                    <Download className="h-3.5 w-3.5" />
                    Importar selecionados ({selected.size})
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Results Table */}
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-border/40">
                    <TableHead className="w-10 pl-6">
                      <Checkbox
                        checked={selected.size === pages.length && pages.length > 0}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Nome</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Categoria</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Telefone</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Email</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Seguidores</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider">Status</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wider text-right pr-6">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pages.map((page, i) => (
                    <TableRow
                      key={i}
                      className={`border-border/30 transition-colors ${imported.has(i) ? 'bg-primary/5' : ''}`}
                    >
                      <TableCell className="pl-6">
                        <Checkbox checked={selected.has(i)} onCheckedChange={() => toggleSelect(i)} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary shrink-0">
                            <Facebook className="h-4 w-4" />
                          </div>
                          <span className="font-medium text-sm max-w-[180px] truncate">{page.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">{page.category || '-'}</span>
                      </TableCell>
                      <TableCell>
                        {page.phone ? (
                          <a href={`tel:${page.phone}`} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {page.phone}
                          </a>
                        ) : (
                          <span className="text-muted-foreground/50 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {page.email ? (
                          <a href={`mailto:${page.email}`} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            <span className="max-w-[140px] truncate">{page.email}</span>
                          </a>
                        ) : (
                          <span className="text-muted-foreground/50 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {page.followers > 0 ? (
                          <div className="inline-flex items-center gap-1 text-sm">
                            <Users className="h-3 w-3 text-muted-foreground" />
                            {page.followers.toLocaleString('pt-BR')}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/50 text-sm">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {imported.has(i) ? (
                          <Badge className="bg-success/10 text-success border-success/20 gap-1 text-xs">
                            <CheckCircle2 className="h-3 w-3" />
                            Importado
                          </Badge>
                        ) : page.enriched ? (
                          <Badge variant="default" className="text-xs gap-1">
                            <Sparkles className="h-3 w-3" />
                            Enriquecido
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">URL</Badge>
                        )}
                      </TableCell>
                      <TableCell className="pr-6">
                        <div className="flex items-center justify-end gap-1">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-foreground" asChild>
                                  <a href={page.facebook_url} target="_blank" rel="noopener noreferrer">
                                    <ExternalLink className="h-3.5 w-3.5" />
                                  </a>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Abrir no Facebook</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-primary"
                                  onClick={() => handleImportOne(page, i)}
                                  disabled={imported.has(i)}
                                >
                                  {imported.has(i) ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                                  ) : (
                                    <Plus className="h-3.5 w-3.5" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{imported.has(i) ? 'Já importado' : 'Importar como lead'}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!isLoading && pages.length === 0 && niche && (
        <Card className="border-border/60">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-muted/50 mb-4">
              <Globe className="h-8 w-8 opacity-40" />
            </div>
            <p className="font-medium text-foreground/70">Nenhuma página encontrada</p>
            <p className="text-sm mt-1">Tente outro nicho ou cidade para encontrar resultados</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

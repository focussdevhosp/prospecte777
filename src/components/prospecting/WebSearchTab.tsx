import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';

import { useToast } from '@/hooks/use-toast';
import { firecrawlApi, webSearchApi } from '@/lib/api/firecrawl';
import { supabase } from '@/integrations/supabase/client';
import {
  Search,
  Globe,
  Flame,
  Phone,
  Mail,
  ExternalLink,
  Loader2,
  Plus,
  CheckCircle2,
  Building2,
  Newspaper,
  Image,
  Sparkles,
  Target,
  Brain,
  Send,
  AlertCircle,
} from 'lucide-react';

interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  phone?: string;
  email?: string;
  position: number;
  // Analysis fields
  analyzed?: boolean;
  painPoints?: string[];
  opportunities?: string[];
  approach?: string;
  personalizedMessage?: string;
  summary?: string;
}

interface FirecrawlResult {
  url: string;
  title?: string;
  description?: string;
  markdown?: string;
}

export function WebSearchTab() {
  const { toast } = useToast();
  const [searchSource, setSearchSource] = useState<'google' | 'firecrawl' | 'directories'>('google');
  const [searchType, setSearchType] = useState<'google' | 'news' | 'images'>('google');
  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [firecrawlResults, setFirecrawlResults] = useState<FirecrawlResult[]>([]);
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [expandedResult, setExpandedResult] = useState<number | null>(null);

  const handleGoogleSearch = async () => {
    if (!query.trim()) {
      toast({ title: 'Digite uma busca', variant: 'destructive' });
      return;
    }

    setIsSearching(true);
    setResults([]);

    try {
      const response = await webSearchApi.search(query, location, { search_type: searchType });
      
      if (response.success && response.results) {
        setResults(response.results);
        toast({ title: `${response.results.length} resultados encontrados` });
      } else {
        toast({ 
          title: 'Erro na busca', 
          description: response.error || 'Tente novamente',
          variant: 'destructive' 
        });
      }
    } catch (error) {
      console.error('Search error:', error);
      toast({ title: 'Erro na busca', variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleFirecrawlSearch = async () => {
    if (!query.trim()) {
      toast({ title: 'Digite uma busca', variant: 'destructive' });
      return;
    }

    setIsSearching(true);
    setFirecrawlResults([]);

    try {
      const searchQuery = location ? `${query} ${location}` : query;
      const response = await firecrawlApi.search(searchQuery, { limit: 20 });
      
      if (response.success && response.data) {
        const formattedResults = response.data.map((item: any) => ({
          url: item.url,
          title: item.title || item.metadata?.title,
          description: item.description || item.metadata?.description,
          markdown: item.markdown,
        }));
        setFirecrawlResults(formattedResults);
        toast({ title: `${formattedResults.length} resultados encontrados` });
      } else {
        toast({ 
          title: 'Erro na busca', 
          description: response.error || 'Tente novamente',
          variant: 'destructive' 
        });
      }
    } catch (error) {
      console.error('Firecrawl search error:', error);
      toast({ title: 'Erro na busca', variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleDirectoriesSearch = async () => {
    if (!query.trim()) {
      toast({ title: 'Digite uma busca', variant: 'destructive' });
      return;
    }

    setIsSearching(true);
    setResults([]);

    try {
      // Search in Brazilian directories via web search
      const directories = [
        `site:telelistas.net ${query} ${location}`,
        `site:guiamais.com.br ${query} ${location}`,
        `site:apontador.com.br ${query} ${location}`,
      ];

      const allResults: SearchResult[] = [];

      for (const dirQuery of directories) {
        const response = await webSearchApi.search(dirQuery, '', { num_results: 10 });
        if (response.success && response.results) {
          allResults.push(...response.results);
        }
      }

      setResults(allResults);
      toast({ title: `${allResults.length} resultados encontrados em diretórios` });
    } catch (error) {
      console.error('Directories search error:', error);
      toast({ title: 'Erro na busca', variant: 'destructive' });
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearch = () => {
    switch (searchSource) {
      case 'google':
        handleGoogleSearch();
        break;
      case 'firecrawl':
        handleFirecrawlSearch();
        break;
      case 'directories':
        handleDirectoriesSearch();
        break;
    }
  };

  const toggleResultSelection = (index: number) => {
    const newSelected = new Set(selectedResults);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedResults(newSelected);
  };

  // Analyze selected results to find pain points
  const analyzeSelectedResults = async () => {
    if (selectedResults.size === 0) {
      toast({ title: 'Selecione resultados para analisar', variant: 'destructive' });
      return;
    }

    setIsAnalyzing(true);
    setAnalyzeProgress(0);

    const selectedIndices = Array.from(selectedResults);
    const total = selectedIndices.length;

    try {
      for (let i = 0; i < selectedIndices.length; i++) {
        const index = selectedIndices[i];
        const result = results[index];

        setAnalyzeProgress(((i + 1) / total) * 100);

        // Call AI to analyze the website
        const { data, error } = await supabase.functions.invoke('ai-prospecting', {
          body: {
            action: 'analyze_website',
            data: {
              url: result.link,
              business_name: result.title,
              niche: query,
            }
          }
        });

        if (!error && data?.success) {
          // Update result with analysis
          setResults(prev => prev.map((r, idx) => 
            idx === index ? {
              ...r,
              analyzed: true,
              painPoints: data.painPoints,
              opportunities: data.opportunities,
              approach: data.approach,
              personalizedMessage: data.personalizedMessage,
              summary: data.summary,
            } : r
          ));
        }

        // Small delay between analyses
        if (i < selectedIndices.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      toast({ 
        title: 'Análise concluída!', 
        description: `${total} leads analisados com sucesso` 
      });
    } catch (error) {
      console.error('Analysis error:', error);
      toast({ title: 'Erro na análise', variant: 'destructive' });
    } finally {
      setIsAnalyzing(false);
      setAnalyzeProgress(0);
    }
  };

  const saveSelectedAsLeads = async () => {
    if (selectedResults.size === 0) {
      toast({ title: 'Selecione resultados para salvar', variant: 'destructive' });
      return;
    }

    setIsSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({ title: 'Usuário não autenticado', variant: 'destructive' });
        return;
      }

      const leadsToSave = Array.from(selectedResults).map(index => {
        const result = results[index];
        return {
          user_id: user.id,
          business_name: result.title,
          phone: result.phone || 'A buscar',
          email: result.email,
          website: result.link,
          source: searchSource === 'directories' ? 'directories' : 'web_search',
          niche: query,
          location: location || null,
          notes: result.snippet,
          pain_points: result.painPoints || null,
          analyzed_needs: result.analyzed ? {
            painPoints: result.painPoints,
            opportunities: result.opportunities,
            approach: result.approach,
            summary: result.summary,
          } : null,
        };
      });

      const { error } = await supabase.from('leads').insert(leadsToSave);

      if (error) throw error;

      toast({ 
        title: 'Leads salvos!', 
        description: `${leadsToSave.length} leads adicionados ao seu CRM` 
      });
      setSelectedResults(new Set());
    } catch (error) {
      console.error('Error saving leads:', error);
      toast({ title: 'Erro ao salvar leads', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Busca Avançada na Web
          </CardTitle>
          <CardDescription>
            Encontre leads em diferentes fontes e analise dores com IA
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Source Selection */}
          <div className="grid gap-4 md:grid-cols-3">
            <Card 
              className={`cursor-pointer transition-all ${searchSource === 'google' ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/50'}`}
              onClick={() => setSearchSource('google')}
            >
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <Search className="h-8 w-8 text-primary" />
                <p className="font-medium">Google Search</p>
                <p className="text-xs text-muted-foreground text-center">Busca web geral via SerpAPI</p>
              </CardContent>
            </Card>

            <Card 
              className={`cursor-pointer transition-all ${searchSource === 'firecrawl' ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/50'}`}
              onClick={() => setSearchSource('firecrawl')}
            >
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <Flame className="h-8 w-8 text-brand" />
                <p className="font-medium">Firecrawl</p>
                <p className="text-xs text-muted-foreground text-center">Scraping inteligente com IA</p>
              </CardContent>
            </Card>

            <Card 
              className={`cursor-pointer transition-all ${searchSource === 'directories' ? 'border-primary ring-2 ring-primary/20' : 'hover:border-primary/50'}`}
              onClick={() => setSearchSource('directories')}
            >
              <CardContent className="p-4 flex flex-col items-center gap-2">
                <Building2 className="h-8 w-8 text-success" />
                <p className="font-medium">Diretórios BR</p>
                <p className="text-xs text-muted-foreground text-center">TeleListas, GuiaMais, Apontador</p>
              </CardContent>
            </Card>
          </div>

          {/* Search Type (for Google) */}
          {searchSource === 'google' && (
            <div className="flex gap-2">
              <Button 
                variant={searchType === 'google' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setSearchType('google')}
              >
                <Search className="h-4 w-4 mr-1" />
                Web
              </Button>
              <Button 
                variant={searchType === 'news' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setSearchType('news')}
              >
                <Newspaper className="h-4 w-4 mr-1" />
                Notícias
              </Button>
              <Button 
                variant={searchType === 'images' ? 'default' : 'outline'} 
                size="sm"
                onClick={() => setSearchType('images')}
              >
                <Image className="h-4 w-4 mr-1" />
                Imagens
              </Button>
            </div>
          )}

          {/* Search Inputs */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>Busca (nicho ou tipo de empresa)</Label>
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Ex: clínicas odontológicas, restaurantes, academias..."
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <div className="space-y-2">
              <Label>Localização (opcional)</Label>
              <Input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Ex: São Paulo, Campinas, Rio de Janeiro..."
              />
            </div>
          </div>

          <Button 
            onClick={handleSearch} 
            disabled={isSearching}
            className="w-full"
          >
            {isSearching ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Buscando...
              </>
            ) : (
              <>
                <Search className="h-4 w-4 mr-2" />
                Buscar {searchSource === 'google' ? 'no Google' : searchSource === 'firecrawl' ? 'com Firecrawl' : 'em Diretórios'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Analysis Progress */}
      {isAnalyzing && (
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-center gap-3 mb-2">
              <Brain className="h-5 w-5 text-primary animate-pulse" />
              <span className="font-medium">Analisando leads com IA...</span>
            </div>
            <Progress value={analyzeProgress} className="h-2" />
            <p className="text-sm text-muted-foreground mt-2">
              Extraindo dores, oportunidades e criando mensagens personalizadas
            </p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {(results.length > 0 || firecrawlResults.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="flex items-center gap-2">
                Resultados
                <Badge variant="secondary">
                  {searchSource === 'firecrawl' ? firecrawlResults.length : results.length}
                </Badge>
              </CardTitle>
              <div className="flex gap-2">
                {selectedResults.size > 0 && searchSource !== 'firecrawl' && (
                  <>
                    <Button 
                      variant="outline" 
                      onClick={analyzeSelectedResults} 
                      disabled={isAnalyzing}
                    >
                      {isAnalyzing ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Brain className="h-4 w-4 mr-2" />
                      )}
                      Analisar Dores ({selectedResults.size})
                    </Button>
                    <Button onClick={saveSelectedAsLeads} disabled={isSaving}>
                      {isSaving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4 mr-2" />
                      )}
                      Salvar como Leads
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              <div className="space-y-3">
                {searchSource === 'firecrawl' ? (
                  firecrawlResults.map((result, idx) => (
                    <Card key={idx} className="p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start gap-3">
                        <div className="flex-1 min-w-0">
                          <a 
                            href={result.url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="font-medium text-primary hover:underline flex items-center gap-1"
                          >
                            {result.title || result.url}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {result.description || result.markdown?.slice(0, 200)}
                          </p>
                        </div>
                      </div>
                    </Card>
                  ))
                ) : (
                  results.map((result, idx) => (
                    <Card 
                      key={idx} 
                      className={`p-4 transition-all ${selectedResults.has(idx) ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'} ${result.analyzed ? 'border-l-4 border-l-emerald-500' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div 
                          className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 cursor-pointer ${selectedResults.has(idx) ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground'}`}
                          onClick={() => toggleResultSelection(idx)}
                        >
                          {selectedResults.has(idx) && <CheckCircle2 className="h-4 w-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <a 
                              href={result.link} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="font-medium text-primary hover:underline flex items-center gap-1"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {result.title}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                            {result.analyzed && (
                              <Badge variant="secondary" className="text-xs bg-success text-success">
                                <Sparkles className="h-3 w-3 mr-1" />
                                Analisado
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {result.snippet}
                          </p>
                          
                          {/* Contact Info */}
                          <div className="flex items-center gap-4 mt-2">
                            {result.phone && (
                              <span className="text-xs flex items-center gap-1 text-success">
                                <Phone className="h-3 w-3" />
                                {result.phone}
                              </span>
                            )}
                            {result.email && (
                              <span className="text-xs flex items-center gap-1 text-primary">
                                <Mail className="h-3 w-3" />
                                {result.email}
                              </span>
                            )}
                          </div>

                          {/* Analysis Results */}
                          {result.analyzed && (
                            <div className="mt-3 space-y-3 pt-3 border-t">
                              {/* Pain Points */}
                              {result.painPoints && result.painPoints.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Dores Identificadas:
                                  </p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {result.painPoints.map((pain, i) => (
                                      <Badge key={i} variant="outline" className="text-xs">
                                        {pain}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Opportunities */}
                              {result.opportunities && result.opportunities.length > 0 && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                                    <Target className="h-3 w-3" />
                                    Oportunidades:
                                  </p>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {result.opportunities.map((opp, i) => (
                                      <Badge key={i} variant="outline" className="text-xs bg-success text-success border-success">
                                        {opp}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Approach */}
                              {result.approach && (
                                <div>
                                  <p className="text-xs font-medium text-muted-foreground">Abordagem sugerida:</p>
                                  <p className="text-sm mt-1">{result.approach}</p>
                                </div>
                              )}

                              {/* Personalized Message */}
                              {result.personalizedMessage && (
                                <div className="bg-muted/50 p-3 rounded-lg">
                                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1">
                                    <Send className="h-3 w-3" />
                                    Mensagem personalizada:
                                  </p>
                                  <p className="text-sm whitespace-pre-wrap">{result.personalizedMessage}</p>
                                </div>
                              )}

                              {/* Summary */}
                              {result.summary && (
                                <p className="text-xs text-muted-foreground italic">
                                  {result.summary}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>
                  ))
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

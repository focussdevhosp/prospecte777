import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { useEmailFinder } from '@/hooks/use-email-finder';
import { useLeads } from '@/hooks/use-leads';
import {
  Mail,
  Search,
  Loader2,
  CheckCircle2,
  XCircle,
  Globe,
  Building2,
  Linkedin,
  Twitter,
  Facebook,
  Instagram,
  Sparkles,
} from 'lucide-react';

export function EmailFinderTab() {
  const { findEmail, enrichLead, bulkEnrich } = useEmailFinder();
  const { leads } = useLeads();
  const [searchDomain, setSearchDomain] = useState('');
  const [searchCompany, setSearchCompany] = useState('');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [emailResults, setEmailResults] = useState<any>(null);

  // Get leads that can be enriched (have website but no email)
  const enrichableLeads = leads?.filter(l => l.website && !l.email) || [];

  const handleSearch = async () => {
    if (!searchDomain && !searchCompany) return;

    const result = await findEmail.mutateAsync({
      domain: searchDomain || undefined,
      company_name: searchCompany || undefined,
    });

    setEmailResults(result);
  };

  const handleBulkEnrich = async () => {
    if (selectedLeadIds.length === 0) return;
    await bulkEnrich.mutateAsync(selectedLeadIds);
    setSelectedLeadIds([]);
  };

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds(prev =>
      prev.includes(leadId)
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const selectAll = () => {
    if (selectedLeadIds.length === enrichableLeads.length) {
      setSelectedLeadIds([]);
    } else {
      setSelectedLeadIds(enrichableLeads.map(l => l.id));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-medium">Localizador de E-mails & Enriquecimento</h3>
        <p className="text-sm text-muted-foreground">
          Encontre e-mails profissionais por domínio ou empresa e enriqueça seus leads com dados adicionais.
        </p>
      </div>

      {/* Quick Search */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="h-4 w-4" />
            Busca Rápida
          </CardTitle>
          <CardDescription>
            Busque emails por domínio ou nome da empresa
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Domínio</Label>
              <div className="flex gap-2">
                <Globe className="h-4 w-4 text-muted-foreground mt-3" />
                <Input
                  placeholder="exemplo.com.br"
                  value={searchDomain}
                  onChange={e => setSearchDomain(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Ou Nome da Empresa</Label>
              <div className="flex gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground mt-3" />
                <Input
                  placeholder="Nome da Empresa"
                  value={searchCompany}
                  onChange={e => setSearchCompany(e.target.value)}
                />
              </div>
            </div>
          </div>
          <Button 
            onClick={handleSearch} 
            disabled={(!searchDomain && !searchCompany) || findEmail.isPending}
          >
            {findEmail.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Buscar Emails
          </Button>

          {/* Search Results */}
          {emailResults && (
            <div className="mt-4 p-4 rounded-lg border bg-muted/50">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-medium">{emailResults.organization || emailResults.domain}</h4>
                  {emailResults.pattern && (
                    <p className="text-xs text-muted-foreground">
                      Padrão de email: {emailResults.pattern}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  {emailResults.linkedin && (
                    <a href={emailResults.linkedin} target="_blank" rel="noopener noreferrer">
                      <Badge variant="outline" className="cursor-pointer">
                        <Linkedin className="h-3 w-3" />
                      </Badge>
                    </a>
                  )}
                  {emailResults.facebook && (
                    <a href={emailResults.facebook} target="_blank" rel="noopener noreferrer">
                      <Badge variant="outline" className="cursor-pointer">
                        <Facebook className="h-3 w-3" />
                      </Badge>
                    </a>
                  )}
                  {emailResults.twitter && (
                    <a href={`https://twitter.com/${emailResults.twitter}`} target="_blank" rel="noopener noreferrer">
                      <Badge variant="outline" className="cursor-pointer">
                        <Twitter className="h-3 w-3" />
                      </Badge>
                    </a>
                  )}
                  {emailResults.instagram && (
                    <a href={`https://instagram.com/${emailResults.instagram}`} target="_blank" rel="noopener noreferrer">
                      <Badge variant="outline" className="cursor-pointer">
                        <Instagram className="h-3 w-3" />
                      </Badge>
                    </a>
                  )}
                </div>
              </div>

              {emailResults.emails?.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">{emailResults.emails.length} emails encontrados:</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {emailResults.emails.map((email: any, i: number) => (
                      <div key={i} className="flex items-center justify-between p-2 rounded bg-background">
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm">{email.email}</span>
                          {email.first_name && email.last_name && (
                            <span className="text-xs text-muted-foreground">
                              ({email.first_name} {email.last_name})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {email.position && (
                            <Badge variant="outline" className="text-xs">
                              {email.position}
                            </Badge>
                          )}
                          <Badge 
                            variant={email.confidence >= 80 ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {email.confidence}%
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum email encontrado.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk Enrichment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Enriquecimento em Massa
          </CardTitle>
          <CardDescription>
            Enriqueça múltiplos leads de uma vez (requer que o lead tenha website)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {enrichableLeads.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Mail className="h-10 w-10 mx-auto mb-2 opacity-50" />
              <p>Nenhum lead disponível para enriquecimento.</p>
              <p className="text-sm">Leads precisam ter website e não ter email cadastrado.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Checkbox
                    checked={selectedLeadIds.length === enrichableLeads.length}
                    onCheckedChange={selectAll}
                  />
                  <Label className="text-sm">
                    Selecionar todos ({enrichableLeads.length} leads)
                  </Label>
                </div>
                <Button
                  onClick={handleBulkEnrich}
                  disabled={selectedLeadIds.length === 0 || bulkEnrich.isPending}
                >
                  {bulkEnrich.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : (
                    <Sparkles className="h-4 w-4 mr-2" />
                  )}
                  Enriquecer {selectedLeadIds.length} Leads
                </Button>
              </div>

              {bulkEnrich.isPending && (
                <div className="space-y-2">
                  <Progress value={50} className="h-2" />
                  <p className="text-xs text-muted-foreground text-center">
                    Enriquecendo leads... isso pode levar alguns minutos.
                  </p>
                </div>
              )}

              <div className="space-y-2 max-h-80 overflow-y-auto">
                {enrichableLeads.slice(0, 20).map(lead => (
                  <div 
                    key={lead.id} 
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                    onClick={() => toggleLeadSelection(lead.id)}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={selectedLeadIds.includes(lead.id)}
                        onCheckedChange={() => toggleLeadSelection(lead.id)}
                      />
                      <div>
                        <p className="font-medium">{lead.business_name}</p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          {lead.website}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline">{lead.niche}</Badge>
                  </div>
                ))}
                {enrichableLeads.length > 20 && (
                  <p className="text-center text-sm text-muted-foreground py-2">
                    + {enrichableLeads.length - 20} leads adicionais
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

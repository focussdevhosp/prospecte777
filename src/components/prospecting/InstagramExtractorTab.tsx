import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';

import { useLeads } from '@/hooks/use-leads';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  Globe,
  Search,
  Loader2,
  Plus,
  ExternalLink,
  Phone,
  Mail,
  Link as LinkIcon,
  Users,
  Save,
  CheckCircle2,
  Sparkles,
  Download,
  Instagram,
} from 'lucide-react';

interface InstagramProfile {
  username: string;
  fullName: string;
  biography: string;
  followersCount: number;
  profilePicUrl: string;
  externalUrl: string | null;
  phone: string | null;
  email: string | null;
  isBusinessAccount: boolean;
}

function formatFollowers(count: number): string {
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

export function InstagramExtractorTab() {
  const { createLead } = useLeads();
  const { toast } = useToast();

  const [niche, setNiche] = useState('');
  const [location, setLocation] = useState('');
  const [quantity, setQuantity] = useState([30]);
  const [contactOnly, setContactOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [profiles, setProfiles] = useState<InstagramProfile[]>([]);
  const [imported, setImported] = useState<Set<string>>(new Set());

  const handleSearch = async () => {
    if (!niche.trim()) {
      toast({ title: 'Digite um nicho ou hashtag', variant: 'destructive' });
      return;
    }

    setLoading(true);
    setProfiles([]);
    setImported(new Set());
    try {
      const { data, error } = await supabase.functions.invoke('instagram-scraper', {
        body: {
          niche: niche.trim(),
          location: location.trim(),
          quantity: quantity[0],
          contactOnly,
        },
      });

      if (error) throw error;

      const results: InstagramProfile[] = (data?.profiles || []).map((p: any) => ({
        username: p.username || p.ownerUsername || '',
        fullName: p.fullName || p.ownerFullName || '',
        biography: p.biography || p.caption || '',
        followersCount: p.followersCount || p.likesCount || 0,
        profilePicUrl: p.profilePicUrl || p.displayUrl || '',
        externalUrl: p.externalUrl || null,
        phone: p.businessPhoneNumber || p.phone || null,
        email: p.businessEmail || p.email || null,
        isBusinessAccount: p.isBusinessAccount || false,
      }));

      setProfiles(results);
      if (results.length === 0) {
        toast({ title: 'Nenhum perfil encontrado', description: 'Tente outro nicho ou localização.' });
      }
    } catch (err: any) {
      toast({ title: 'Erro na extração', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const addProfileAsLead = (profile: InstagramProfile) => {
    createLead({
      business_name: profile.fullName || `@${profile.username}`,
      phone: profile.phone || '',
      email: profile.email || null,
      website: profile.externalUrl || `https://instagram.com/${profile.username}`,
      notes: profile.biography,
      niche: niche,
      source: 'instagram',
      stage: 'Contato',
      temperature: 'morno',
      message_sent: false,
      follow_up_count: 0,
      lead_score: 0,
      score_factors: {},
      analyzed_needs: {},
      tags: ['instagram'],
      quality_score: 0,
      reviews_count: 0,
      total_messages_exchanged: 0,
    } as any);
    setImported(prev => new Set(prev).add(profile.username));
    toast({ title: `@${profile.username} importado como lead!` });
  };

  const importAllWithContact = () => {
    const withContact = profiles.filter(p => (p.phone || p.email || p.externalUrl) && !imported.has(p.username));
    withContact.forEach(p => {
      createLead({
        business_name: p.fullName || `@${p.username}`,
        phone: p.phone || '',
        email: p.email || null,
        website: p.externalUrl || `https://instagram.com/${p.username}`,
        notes: p.biography,
        niche: niche,
        source: 'instagram',
        stage: 'Contato',
        temperature: 'morno',
        message_sent: false,
        follow_up_count: 0,
        lead_score: 0,
        score_factors: {},
        analyzed_needs: {},
        tags: ['instagram'],
        quality_score: 0,
        reviews_count: 0,
        total_messages_exchanged: 0,
      } as any);
    });
    const newImported = new Set(imported);
    withContact.forEach(p => newImported.add(p.username));
    setImported(newImported);
    toast({ title: `${withContact.length} perfis importados como leads!` });
  };

  const contactCount = profiles.filter(p => p.phone || p.email).length;
  const businessCount = profiles.filter(p => p.isBusinessAccount).length;

  return (
    <div className="space-y-6">

      {/* Search Form */}
      <Card className="border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden">
        <div className="border-b border-border/40 bg-muted/30 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-gradient-to-br from-primary/20 to-brand/20 text-primary">
              <Instagram className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Buscar perfis no Instagram</h3>
              <p className="text-sm text-muted-foreground">Encontre negócios por hashtag, nicho ou localização</p>
            </div>
          </div>
        </div>
        <CardContent className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Hashtag ou nicho</Label>
              <Input
                placeholder="Ex: restaurante, pizzaria, academia"
                value={niche}
                onChange={e => setNiche(e.target.value)}
                className="bg-background/60 border-border/50 focus:border-primary/60"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Cidade/Região (opcional)</Label>
              <Input
                placeholder="Ex: São Paulo, Campinas"
                value={location}
                onChange={e => setLocation(e.target.value)}
                className="bg-background/60 border-border/50 focus:border-primary/60"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Quantidade de perfis</Label>
              <Badge variant="secondary" className="text-xs font-mono tabular-nums px-2.5">
                {quantity[0]} perfis
              </Badge>
            </div>
            <Slider value={quantity} onValueChange={setQuantity} min={10} max={100} step={5} className="py-1" />
            <div className="flex justify-between text-[10px] text-muted-foreground/60 px-0.5">
              <span>10</span>
              <span>50</span>
              <span>100</span>
            </div>
          </div>

          <div className="flex items-center gap-3 py-1">
            <Switch checked={contactOnly} onCheckedChange={setContactOnly} />
            <Label className="text-sm">Apenas perfis com contato (telefone/email/link)</Label>
          </div>

          <Button
            onClick={handleSearch}
            disabled={loading || !niche.trim()}
            className="w-full gap-2 h-11"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Extrair perfis do Instagram
          </Button>

        </CardContent>
      </Card>

      {/* Loading */}
      {loading && (
        <Card className="border-border/60">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-sm text-muted-foreground">Extraindo perfis do Instagram...</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 p-4 rounded-xl border border-border/30 bg-muted/20">
                  <Skeleton className="h-11 w-11 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-3 w-44" />
                    <Skeleton className="h-3 w-36" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {!loading && profiles.length === 0 && niche && (
        <Card className="border-border/60">
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-muted/50 mb-4">
              <Globe className="h-8 w-8 opacity-40" />
            </div>
            <p className="font-medium text-foreground/70">Nenhum perfil encontrado</p>
            <p className="text-sm mt-1">Tente outro nicho ou localização para encontrar resultados</p>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {profiles.length > 0 && (
        <Card className="border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden">
          {/* Results Header */}
          <div className="border-b border-border/40 bg-muted/30 px-6 py-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-4">
                <h3 className="font-semibold text-foreground">
                  {profiles.length} perfis encontrados
                </h3>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Phone className="h-3 w-3" />
                    {contactCount} com contato
                  </Badge>
                  <Badge variant="outline" className="gap-1 text-xs">
                    <Sparkles className="h-3 w-3" />
                    {businessCount} business
                  </Badge>
                </div>
              </div>
              <Button size="sm" onClick={importAllWithContact} className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Importar todos com contato
              </Button>
            </div>
          </div>

          {/* Results Grid */}
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {profiles.map((profile) => {
                const isImported = imported.has(profile.username);
                return (
                  <div
                    key={profile.username}
                    className={`relative p-4 rounded-xl border transition-all ${
                      isImported
                        ? 'border-primary/30 bg-primary/5'
                        : 'border-border/40 bg-background/40 hover:border-border/60 hover:bg-background/60'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar className="h-11 w-11 ring-2 ring-border/30">
                        <AvatarImage src={profile.profilePicUrl} />
                        <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
                          {(profile.fullName || profile.username)[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <a
                            href={`https://instagram.com/${profile.username}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm font-semibold text-primary hover:underline truncate"
                          >
                            @{profile.username}
                          </a>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                            <Users className="h-3 w-3" />
                            {formatFollowers(profile.followersCount)}
                          </div>
                        </div>
                        {profile.fullName && (
                          <p className="text-sm font-medium text-foreground/90 truncate">{profile.fullName}</p>
                        )}
                        {profile.biography && (
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">{profile.biography}</p>
                        )}

                        {/* Contact badges */}
                        <div className="flex gap-1.5 mt-2.5 flex-wrap">
                          {profile.phone && (
                            <Badge variant="secondary" className="text-[10px] gap-0.5 px-1.5 py-0 h-5">
                              <Phone className="h-2.5 w-2.5" />
                              Telefone
                            </Badge>
                          )}
                          {profile.email && (
                            <Badge variant="secondary" className="text-[10px] gap-0.5 px-1.5 py-0 h-5">
                              <Mail className="h-2.5 w-2.5" />
                              Email
                            </Badge>
                          )}
                          {profile.externalUrl && (
                            <Badge variant="secondary" className="text-[10px] gap-0.5 px-1.5 py-0 h-5">
                              <LinkIcon className="h-2.5 w-2.5" />
                              Link
                            </Badge>
                          )}
                          {profile.isBusinessAccount && (
                            <Badge variant="secondary" className="text-[10px] gap-0.5 px-1.5 py-0 h-5">
                              <Sparkles className="h-2.5 w-2.5" />
                              Business
                            </Badge>
                          )}
                        </div>

                        {/* Action */}
                        <div className="mt-3">
                          {isImported ? (
                            <div className="flex items-center gap-1.5 text-xs text-primary">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span className="font-medium">Importado como lead</span>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full h-8 text-xs gap-1"
                              onClick={() => addProfileAsLead(profile)}
                            >
                              <Plus className="h-3 w-3" />
                              Adicionar como Lead
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

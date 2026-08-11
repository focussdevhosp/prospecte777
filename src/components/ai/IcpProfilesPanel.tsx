import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Star, Trash2, Target } from 'lucide-react';
import { useIcpProfiles, type IcpProfile } from '@/hooks/use-icp-profiles';

/** "a, b" -> ["a","b"] */
const lista = (texto: string) => texto.split(/[,\n]/).map(t => t.trim()).filter(Boolean);
const numero = (texto: string) => {
  const n = Number(texto.replace(',', '.'));
  return texto.trim() !== '' && Number.isFinite(n) ? n : null;
};

/**
 * Perfis de cliente ideal, reutilizáveis entre missões.
 *
 * O ICP morava só dentro da missão, num JSONB. Funciona para uma missão e
 * falha para uma operação: quem roda cinco campanhas parecidas redigita o
 * mesmo perfil cinco vezes — e é assim que o campo passa a ficar sempre
 * vazio, levando junto a parte da qualificação que era específica do negócio.
 */
export function IcpProfilesPanel() {
  const { profiles, isLoading, createProfile, updateProfile, removeProfile, isSaving } =
    useIcpProfiles();

  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [niches, setNiches] = useState('');
  const [signals, setSignals] = useState('');
  const [exclusions, setExclusions] = useState('');
  const [minRating, setMinRating] = useState('');
  const [minReviews, setMinReviews] = useState('');

  const limpar = () => {
    setNome(''); setNiches(''); setSignals(''); setExclusions('');
    setMinRating(''); setMinReviews(''); setCriando(false);
  };

  const salvar = async () => {
    if (nome.trim().length < 2) return;
    await createProfile({
      name: nome.trim(),
      description: null,
      niches: lista(niches),
      locations: [],
      signals: lista(signals),
      exclusions: lista(exclusions),
      min_rating: numero(minRating),
      max_rating: null,
      min_reviews: numero(minReviews),
      // O primeiro perfil vira padrão sozinho: quem criou um só não deveria
      // precisar marcar nada para ele ser usado.
      is_default: profiles.length === 0,
    });
    limpar();
  };

  if (isLoading) {
    return <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-28" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-4 w-4" />
            O que é um cliente bom para você
          </CardTitle>
          <CardDescription>
            É a régua que dá nota a cada empresa capturada e define a ordem da
            fila. Sem perfil, a nota sai só dos sinais de oportunidade
            encontrados — o que é bem menos específico do seu negócio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {profiles.length === 0 && !criando && (
            <p className="text-sm text-muted-foreground mb-4">
              Nenhum perfil salvo. Sem um, cada missão precisa ter os critérios
              digitados de novo.
            </p>
          )}

          <div className="space-y-3">
            {profiles.map(p => (
              <PerfilCard
                key={p.id}
                perfil={p}
                onDefault={() => updateProfile({ id: p.id, is_default: true })}
                onRemove={() => removeProfile(p.id)}
              />
            ))}
          </div>

          {!criando ? (
            <Button variant="outline" className="mt-4" onClick={() => setCriando(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Novo perfil
            </Button>
          ) : (
            <div className="mt-4 space-y-4 rounded-lg border p-4">
              <div>
                <Label htmlFor="icp-nome">Nome do perfil</Label>
                <Input
                  id="icp-nome"
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Clínicas de estética sem site"
                />
              </div>

              <div>
                <Label htmlFor="icp-niches">Nichos que servem</Label>
                <Input
                  id="icp-niches"
                  value={niches}
                  onChange={e => setNiches(e.target.value)}
                  placeholder="clínica de estética, salão de beleza"
                />
              </div>

              <div>
                <Label htmlFor="icp-signals">O que torna o lead bom</Label>
                <Input
                  id="icp-signals"
                  value={signals}
                  onChange={e => setSignals(e.target.value)}
                  placeholder="sem site, atende por WhatsApp, agenda cheia"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Cada sinal encontrado soma pontos. É o que separa "empresa do
                  nicho certo" de "empresa que precisa do que você vende".
                </p>
              </div>

              <div>
                <Label htmlFor="icp-exclusions">Descartar quem contenha</Label>
                <Input
                  id="icp-exclusions"
                  value={exclusions}
                  onChange={e => setExclusions(e.target.value)}
                  placeholder="franquia, rede, hospital"
                />
                <p className="mt-1 text-xs text-muted-foreground">
                  Único critério que é corte duro — descarta antes de gastar IA.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="icp-rating">Nota mínima no Google</Label>
                  <Input
                    id="icp-rating"
                    inputMode="decimal"
                    value={minRating}
                    onChange={e => setMinRating(e.target.value)}
                    placeholder="3.5"
                  />
                </div>
                <div>
                  <Label htmlFor="icp-reviews">Avaliações mínimas</Label>
                  <Input
                    id="icp-reviews"
                    inputMode="numeric"
                    value={minReviews}
                    onChange={e => setMinReviews(e.target.value)}
                    placeholder="10"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Nota e avaliações abaixo do mínimo tiram pontos, não descartam.
              </p>

              <div className="flex gap-2">
                <Button onClick={salvar} disabled={isSaving || nome.trim().length < 2}>
                  {isSaving ? 'Salvando...' : 'Salvar perfil'}
                </Button>
                <Button variant="ghost" onClick={limpar}>Cancelar</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PerfilCard({
  perfil,
  onDefault,
  onRemove,
}: {
  perfil: IcpProfile;
  onDefault: () => void;
  onRemove: () => void;
}) {
  const linhas: string[] = [];
  if (perfil.niches.length) linhas.push(`nichos: ${perfil.niches.join(', ')}`);
  if (perfil.signals.length) linhas.push(`soma por: ${perfil.signals.join(', ')}`);
  if (perfil.min_rating != null) linhas.push(`nota mínima ${perfil.min_rating}★`);
  if (perfil.min_reviews != null) linhas.push(`mínimo ${perfil.min_reviews} avaliações`);
  if (perfil.exclusions.length) linhas.push(`descarta: ${perfil.exclusions.join(', ')}`);

  return (
    <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-sm">{perfil.name}</p>
          {perfil.is_default && (
            <Badge variant="secondary" className="text-[10px]">padrão</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {linhas.length ? linhas.join(' · ') : 'Sem critério nenhum — não muda a nota de ninguém.'}
        </p>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2">
          <Switch
            id={`padrao-${perfil.id}`}
            checked={perfil.is_default}
            onCheckedChange={(v) => v && onDefault()}
            aria-label="Usar como padrão"
          />
          <Label htmlFor={`padrao-${perfil.id}`} className="text-xs text-muted-foreground">
            <Star className="h-3 w-3" />
          </Label>
        </div>
        <Button variant="ghost" size="sm" onClick={onRemove}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

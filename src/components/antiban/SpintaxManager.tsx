import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Trash2, 
  Zap,
  Loader2,
  HelpCircle,
} from 'lucide-react';
import { useAntiBan } from '@/hooks/use-antiban';
import { useToast } from '@/hooks/use-toast';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const SUGGESTED_CATEGORIES = [
  { category: 'greeting', label: 'Saudação', example: 'Olá, Oi, Bom dia, E aí' },
  { category: 'closing', label: 'Fechamento', example: 'Abraço, Até mais, Aguardo seu retorno' },
  { category: 'question', label: 'Pergunta', example: 'posso ajudar, precisa de algo, como vai' },
  { category: 'call_to_action', label: 'CTA', example: 'me chama, vamos conversar, me avisa' },
];

export function SpintaxManager() {
  const { variations, addVariation, deleteVariation, variationsLoading } = useAntiBan();
  const { toast } = useToast();

  const [newCategory, setNewCategory] = useState('');
  const [newVariations, setNewVariations] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (!newCategory.trim() || !newVariations.trim()) {
      toast({
        title: 'Preencha todos os campos',
        variant: 'destructive',
      });
      return;
    }

    const vars = newVariations
      .split('\n')
      .map(v => v.trim())
      .filter(v => v.length > 0);

    if (vars.length < 2) {
      toast({
        title: 'Adicione pelo menos 2 variações',
        variant: 'destructive',
      });
      return;
    }

    setIsAdding(true);
    try {
      addVariation({ 
        category: newCategory.toLowerCase().replace(/\s+/g, '_'), 
        variations: vars 
      });
      setNewCategory('');
      setNewVariations('');
      toast({
        title: '✓ Variação adicionada',
        description: `${vars.length} variações para {${newCategory}}`,
      });
    } catch (error) {
      toast({
        title: 'Erro ao adicionar',
        variant: 'destructive',
      });
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    deleteVariation(id);
    toast({
      title: '✓ Variação removida',
    });
  };

  // Não é hook — é um handler. O nome anterior (`useSuggestion`) disparava a
  // regra `rules-of-hooks` do ESLint, que vai por convenção de nome. Um
  // falso positivo permanente é pior que um erro: ensina a ignorar a regra
  // que existe para pegar hook chamado dentro de callback de verdade.
  const aplicarSugestao = (category: string, example: string) => {
    setNewCategory(category);
    setNewVariations(example.split(', ').join('\n'));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Add New Variation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Nova Variação (Spintax)
          </CardTitle>
          <CardDescription>
            Crie variações para randomizar suas mensagens
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label>Nome da Categoria</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Use {'{'}categoria{'}'} no template para substituir</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <Input
              placeholder="Ex: greeting, closing, question"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label>Variações (uma por linha)</Label>
            <Textarea
              placeholder={`Olá\nOi\nBom dia\nE aí`}
              value={newVariations}
              onChange={(e) => setNewVariations(e.target.value)}
              rows={5}
            />
          </div>

          <Button onClick={handleAdd} disabled={isAdding} className="w-full">
            {isAdding ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Plus className="h-4 w-4 mr-2" />
            )}
            Adicionar Variação
          </Button>

          {/* Suggestions */}
          <div className="pt-4 border-t">
            <p className="text-sm text-muted-foreground mb-2">Sugestões rápidas:</p>
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_CATEGORIES.map((s) => (
                <Button
                  key={s.category}
                  variant="outline"
                  size="sm"
                  onClick={() => aplicarSugestao(s.category, s.example)}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Existing Variations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Variações Ativas
          </CardTitle>
          <CardDescription>
            Use {'{'}categoria{'}'} no template para substituir automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent>
          {variationsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : variations?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Zap className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>Nenhuma variação configurada</p>
              <p className="text-sm">Adicione variações para randomizar mensagens</p>
            </div>
          ) : (
            <div className="space-y-4">
              {variations?.map((v) => (
                <div 
                  key={v.id} 
                  className="p-4 rounded-lg border bg-muted/30"
                >
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="secondary" className="font-mono">
                      {'{' + v.category + '}'}
                    </Badge>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(v.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {v.variations.map((text, i) => (
                      <span 
                        key={i}
                        className="px-2 py-0.5 rounded bg-background text-xs"
                      >
                        {text}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* How to Use */}
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Como usar Spintax</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <p className="text-sm font-medium mb-2">Template:</p>
              <div className="p-3 rounded-lg bg-muted font-mono text-sm">
                {'{greeting}'}, tudo bem? Vi que você tem um negócio em {'{cidade}'}. 
                {'{question}'} sobre marketing digital? {'{call_to_action}'} para conversarmos!
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">Resultado (exemplo):</p>
              <div className="p-3 rounded-lg bg-primary/10 text-sm">
                <strong>Olá</strong>, tudo bem? Vi que você tem um negócio em São Paulo. 
                <strong>Posso ajudar</strong> sobre marketing digital? <strong>Me chama</strong> para conversarmos!
              </div>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-4">
            💡 <strong>Dica:</strong> Quanto mais variações, menor a chance de detecção. 
            O sistema escolhe uma variação aleatória para cada envio.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

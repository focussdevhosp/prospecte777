import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/ui/empty-state';
import { useTemplates, DEFAULT_TEMPLATES, MessageTemplate } from '@/hooks/use-templates';
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  MessageSquareText,
  Sparkles,
  TrendingUp,
  Search,
  Copy,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const NICHES = Object.keys(DEFAULT_TEMPLATES);

export function TemplatesTab() {
  const { templates, isLoading, createTemplate, updateTemplate, deleteTemplate, initializeDefaultTemplates, isCreating } = useTemplates();
  const { toast } = useToast();
  const [selectedNiche, setSelectedNiche] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [isNewTemplateOpen, setIsNewTemplateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<MessageTemplate | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    niche: '',
    content: '',
    variables: [] as string[],
    is_default: false,
  });

  const filteredTemplates = templates.filter(t => {
    if (selectedNiche !== 'all' && t.niche !== selectedNiche) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!t.name.toLowerCase().includes(s) && !t.content.toLowerCase().includes(s)) return false;
    }
    return true;
  });

  const avgResponseRate = templates.length > 0
    ? templates.reduce((s, t) => s + (t.response_rate || 0), 0) / templates.length
    : 0;

  const handleCreate = () => {
    createTemplate({
      ...formData,
      variables: formData.content.match(/\{(\w+)\}/g)?.map(v => v.slice(1, -1)) || [],
    });
    setFormData({ name: '', niche: '', content: '', variables: [], is_default: false });
    setIsNewTemplateOpen(false);
  };

  const handleUpdate = () => {
    if (!editingTemplate) return;
    updateTemplate({
      id: editingTemplate.id,
      ...formData,
      variables: formData.content.match(/\{(\w+)\}/g)?.map(v => v.slice(1, -1)) || [],
    });
    setEditingTemplate(null);
    setFormData({ name: '', niche: '', content: '', variables: [], is_default: false });
  };

  const openEditDialog = (template: MessageTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      niche: template.niche,
      content: template.content,
      variables: template.variables,
      is_default: template.is_default,
    });
  };

  const copyTemplate = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: '✓ Template copiado!' });
  };

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Templates', value: templates.length, icon: MessageSquareText, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Nichos', value: new Set(templates.map(t => t.niche)).size, icon: Sparkles, color: 'text-primary', bg: 'bg-primary/10' },
          { label: 'Taxa Média', value: `${avgResponseRate.toFixed(1)}%`, icon: TrendingUp, color: 'text-success', bg: 'bg-success/10' },
          { label: 'Total Usos', value: templates.reduce((s, t) => s + (t.usage_count || 0), 0), icon: BarChart3, color: 'text-warning', bg: 'bg-warning/10' },
        ].map(stat => (
          <div key={stat.label} className="flex items-center gap-2.5 p-3 rounded-xl bg-muted/30 border border-border/30">
            <div className={cn("p-2 rounded-lg", stat.bg)}>
              <stat.icon className={cn("h-4 w-4", stat.color)} />
            </div>
            <div>
              <p className="text-sm font-bold">{stat.value}</p>
              <p className="text-[10px] text-muted-foreground">{stat.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar template..." className="pl-9 rounded-xl h-9 text-sm" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <Select value={selectedNiche} onValueChange={setSelectedNiche}>
          <SelectTrigger className="w-[160px] h-9 text-xs rounded-xl">
            <SelectValue placeholder="Filtrar por nicho" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os nichos</SelectItem>
            {NICHES.map((niche) => (
              <SelectItem key={niche} value={niche}>{niche}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {templates.length === 0 && (
          <Button variant="outline" size="sm" className="h-9 rounded-xl text-xs" onClick={() => initializeDefaultTemplates()}>
            <Sparkles className="h-3.5 w-3.5 mr-1" />
            Carregar Padrão
          </Button>
        )}
        <Dialog open={isNewTemplateOpen} onOpenChange={setIsNewTemplateOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="h-9 rounded-xl text-xs gradient-primary shadow-md shadow-primary/20">
              <Plus className="h-3.5 w-3.5 mr-1" />
              Novo Template
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Criar Novo Template</DialogTitle>
              <DialogDescription>
                Crie um template de mensagem para usar em suas campanhas
              </DialogDescription>
            </DialogHeader>
            <TemplateForm formData={formData} setFormData={setFormData} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewTemplateOpen(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={isCreating}>
                {isCreating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Criar Template
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Templates list */}
      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="border-border/40">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-3/5" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-7 w-20" />
                </div>
                <Skeleton className="h-12 w-full" />
                <div className="flex items-center justify-between pt-2">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3 w-12" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredTemplates.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title="Nenhum template encontrado"
          description={search ? 'Tente buscar por outro termo' : 'Crie templates ou carregue os padrões para começar'}
          action={!search ? { label: 'Criar Template', onClick: () => setIsNewTemplateOpen(true), icon: Plus } : undefined}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {filteredTemplates.map((template, i) => (
            <Card
              key={template.id}
              className="group relative border-border/50 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 transition-all duration-300 animate-fade-in"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">{template.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge variant="secondary" className="text-[10px] h-5">{template.niche}</Badge>
                      {template.is_default && (
                        <Badge variant="outline" className="text-[10px] h-5">Padrão</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copyTemplate(template.content)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditDialog(template)}>
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteTemplate(template.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap leading-relaxed mb-4 min-h-[3.5rem]">
                  {template.content}
                </p>

                {/* Variables */}
                {template.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {template.variables.map(v => (
                      <code key={v} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/5 text-primary font-mono">
                        {`{${v}}`}
                      </code>
                    ))}
                  </div>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-border/30">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3 w-3 text-success" />
                    <span className="text-[11px] text-muted-foreground font-medium">
                      {template.response_rate?.toFixed(1) || 0}% resposta
                    </span>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {template.usage_count || 0} usos
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar Template</DialogTitle>
          </DialogHeader>
          <TemplateForm formData={formData} setFormData={setFormData} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingTemplate(null)}>Cancelar</Button>
            <Button onClick={handleUpdate}>Salvar Alterações</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TemplateForm({ formData, setFormData }: { 
  formData: { name: string; niche: string; content: string; variables: string[]; is_default: boolean };
  setFormData: React.Dispatch<React.SetStateAction<typeof formData>>;
}) {
  const detectedVars = formData.content.match(/\{(\w+)\}/g) || [];

  return (
    <div className="space-y-4 py-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Nome do Template</Label>
          <Input
            placeholder="Ex: Apresentação Digital"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>Nicho</Label>
          <Select
            value={formData.niche}
            onValueChange={(v) => setFormData({ ...formData, niche: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Selecione o nicho" />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(DEFAULT_TEMPLATES).map((niche) => (
                <SelectItem key={niche} value={niche}>{niche}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Conteúdo da Mensagem</Label>
        <Textarea
          placeholder="Olá! Vi o {nome_empresa} e..."
          value={formData.content}
          onChange={(e) => setFormData({ ...formData, content: e.target.value })}
          rows={6}
          className="font-mono text-sm"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Use variáveis como {'{nome_empresa}'}, {'{localização}'}, {'{nicho}'}
          </p>
          {detectedVars.length > 0 && (
            <div className="flex items-center gap-1">
              {detectedVars.map((v, i) => (
                <code key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-mono">{v}</code>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

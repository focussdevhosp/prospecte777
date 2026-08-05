import { useState } from "react";
import { useObjections, type ObjectionResponse } from "@/hooks/use-objections";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Copy, Plus, Search, Sparkles, Trash2, Shield, TestTube2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { DashboardLayout } from "@/components/DashboardLayout";
import { GroupNav, libraryGroup } from "@/components/GroupNav";

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  preco: { label: "💰 Preço", color: "bg-warning/10 text-warning border-warning/30" },
  tempo: { label: "⏰ Vou pensar", color: "bg-info/10 text-info border-info/30" },
  email: { label: "✉️ Manda no email", color: "bg-primary/10 text-primary border-primary/30" },
  concorrente: { label: "🥊 Já tenho fornecedor", color: "bg-destructive/10 text-destructive border-destructive/30" },
  autoridade: { label: "👥 Preciso consultar", color: "bg-info/10 text-info border-info/30" },
  urgencia: { label: "📅 Agora não", color: "bg-brand/10 text-brand border-brand/30" },
  ceticismo: { label: "🤨 Não acredito", color: "bg-slate-500/10 text-slate-600 border-slate-500/30" },
  resultado: { label: "🎯 Meu caso é único", color: "bg-success/10 text-success border-success/30" },
  compromisso: { label: "📝 Contrato longo", color: "bg-warning/10 text-warning border-warning/30" },
  suporte: { label: "🛟 E depois?", color: "bg-info/10 text-info border-info/30" },
  complexidade: { label: "🧩 Complicado", color: "bg-brand/10 text-brand border-brand/30" },
  silencio: { label: "🔇 Sumiu", color: "bg-gray-500/10 text-gray-600 border-gray-500/30" },
  reuniao: { label: "🗓️ Sem tempo", color: "bg-success/10 text-success border-success/30" },
  tentou: { label: "❌ Já tentei", color: "bg-destructive/10 text-destructive border-destructive/30" },
  crise: { label: "📉 Crise", color: "bg-destructive/10 text-destructive border-destructive/40" },
};

export default function Objections() {
  const { objections, isLoading, create, remove, detect } = useObjections();
  const [search, setSearch] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [testResults, setTestResults] = useState<ObjectionResponse[]>([]);
  const [testing, setTesting] = useState(false);
  const [openCreate, setOpenCreate] = useState(false);
  const [form, setForm] = useState({
    category: "preco",
    objection_example: "",
    response_template: "",
    objection_keywords: "",
    angle: "",
  });

  const filtered = objections.filter(
    (o) =>
      o.objection_example.toLowerCase().includes(search.toLowerCase()) ||
      o.response_template.toLowerCase().includes(search.toLowerCase()) ||
      o.category.toLowerCase().includes(search.toLowerCase())
  );

  const templates = filtered.filter((o) => o.is_template);
  const mine = filtered.filter((o) => !o.is_template);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Resposta copiada!");
  };

  const handleTest = async () => {
    if (!testMessage.trim()) return;
    setTesting(true);
    try {
      const matches = await detect(testMessage);
      setTestResults(matches);
      if (matches.length === 0) toast.info("Nenhuma objeção detectada nessa mensagem");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const handleCreate = () => {
    create.mutate(
      {
        category: form.category,
        objection_example: form.objection_example,
        response_template: form.response_template,
        objection_keywords: form.objection_keywords.split(",").map((k) => k.trim()).filter(Boolean),
        angle: form.angle,
      },
      {
        onSuccess: () => {
          setOpenCreate(false);
          setForm({ category: "preco", objection_example: "", response_template: "", objection_keywords: "", angle: "" });
        },
      }
    );
  };

  return (
    <DashboardLayout title="Biblioteca" description="Templates, quebra de objeções e proteções anti-ban">
      <GroupNav items={libraryGroup} />
      <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Quebra de Objeções</h1>
              <p className="text-sm text-muted-foreground">
                Respostas prontas para as objeções mais comuns. IA detecta e sugere na hora certa.
              </p>
            </div>
          </div>
        </div>
        <Dialog open={openCreate} onOpenChange={setOpenCreate}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Nova Objeção
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Nova quebra de objeção</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Categoria</label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(CATEGORY_META).map(([k, m]) => (
                      <SelectItem key={k} value={k}>{m.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Exemplo da objeção</label>
                <Input value={form.objection_example} onChange={(e) => setForm({ ...form, objection_example: e.target.value })} placeholder="Ex: Tá muito caro pra mim agora" />
              </div>
              <div>
                <label className="text-sm font-medium">Palavras-chave (separadas por vírgula)</label>
                <Input value={form.objection_keywords} onChange={(e) => setForm({ ...form, objection_keywords: e.target.value })} placeholder="caro, preço, dinheiro" />
              </div>
              <div>
                <label className="text-sm font-medium">Resposta pronta</label>
                <Textarea rows={5} value={form.response_template} onChange={(e) => setForm({ ...form, response_template: e.target.value })} placeholder="Sua resposta consultiva aqui..." />
              </div>
              <div>
                <label className="text-sm font-medium">Ângulo (opcional)</label>
                <Input value={form.angle} onChange={(e) => setForm({ ...form, angle: e.target.value })} placeholder="ROI, prova social, urgência..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpenCreate(false)}>Cancelar</Button>
              <Button onClick={handleCreate} disabled={!form.objection_example || !form.response_template || create.isPending}>
                {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Test lab */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TestTube2 className="h-4 w-4 text-primary" />
            Simular resposta do lead
          </CardTitle>
          <CardDescription>Cole ou digite algo que um lead escreveria — a IA detecta a objeção e sugere a resposta certa.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={testMessage}
              onChange={(e) => setTestMessage(e.target.value)}
              placeholder='Ex: "tá caro, vou pensar melhor"'
              onKeyDown={(e) => e.key === "Enter" && handleTest()}
            />
            <Button onClick={handleTest} disabled={testing || !testMessage.trim()}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              <span className="ml-2">Detectar</span>
            </Button>
          </div>
          {testResults.length > 0 && (
            <div className="space-y-2">
              {testResults.map((r) => (
                <div key={r.id} className="p-3 rounded-lg bg-background border">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="outline" className={CATEGORY_META[r.category]?.color}>
                      {CATEGORY_META[r.category]?.label || r.category}
                    </Badge>
                    <Button size="sm" variant="ghost" onClick={() => handleCopy(r.response_template)}>
                      <Copy className="h-3 w-3 mr-1" /> Copiar
                    </Button>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{r.response_template}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar objeção ou resposta..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Biblioteca ({templates.length})</TabsTrigger>
          <TabsTrigger value="mine">Minhas ({mine.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="templates" className="mt-4">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {templates.map((o) => <ObjectionCard key={o.id} obj={o} onCopy={handleCopy} />)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="mine" className="mt-4">
          {mine.length === 0 ? (
            <Card><CardContent className="py-12 text-center text-muted-foreground">
              Você ainda não criou objeções personalizadas. Clique em "Nova Objeção" acima.
            </CardContent></Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {mine.map((o) => <ObjectionCard key={o.id} obj={o} onCopy={handleCopy} onDelete={() => remove.mutate(o.id)} />)}
            </div>
          )}
        </TabsContent>
      </Tabs>
      </div>
    </DashboardLayout>
  );
}

function ObjectionCard({ obj, onCopy, onDelete }: { obj: ObjectionResponse; onCopy: (t: string) => void; onDelete?: () => void }) {
  const meta = CATEGORY_META[obj.category];
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <Badge variant="outline" className={cn(meta?.color)}>{meta?.label || obj.category}</Badge>
          <div className="flex items-center gap-1">
            {obj.angle && <Badge variant="secondary" className="text-[10px]">{obj.angle}</Badge>}
            {onDelete && (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            )}
          </div>
        </div>
        <CardTitle className="text-sm font-medium text-muted-foreground italic">
          "{obj.objection_example}"
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm whitespace-pre-wrap leading-relaxed mb-3">{obj.response_template}</p>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{obj.usage_count > 0 ? `Usada ${obj.usage_count}x` : "Ainda não usada"}</span>
          <Button size="sm" variant="outline" onClick={() => onCopy(obj.response_template)}>
            <Copy className="h-3 w-3 mr-1" /> Copiar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useLeads } from '@/hooks/use-leads';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Search,
  Loader2,
  Download,
  Plus,
  CheckCircle2,
  MapPin,
  Phone,
  Mail,
  Calendar,
  Users,
  Globe,
  Briefcase,
  Hash,
  Radar,
  FileSpreadsheet,
  ArrowRight,
  Sparkles,
  AlertCircle,
} from 'lucide-react';

const ESTADOS_BR = [
  'AC','AL','AM','AP','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA',
  'PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'
];

const PORTES = [
  { value: 'MEI', label: 'MEI' },
  { value: 'ME', label: 'ME — Microempresa' },
  { value: 'EPP', label: 'EPP — Pequeno Porte' },
  { value: 'DEMAIS', label: 'Demais' },
];

interface CNPJResult {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string;
  situacao_cadastral: string;
  cnae_fiscal_descricao: string;
  cnae_fiscal: number;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  ddd_telefone_1: string;
  email: string;
  data_inicio_atividade: string;
  porte: string;
  descricao_tipo_de_logradouro: string;
}

function formatCNPJ(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function cleanPhone(ddd_phone: string): string {
  if (!ddd_phone) return '';
  const digits = ddd_phone.replace(/\D/g, '');
  if (digits.length >= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }
  return digits;
}

type TabType = 'individual' | 'massa';

const fadeSlide = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
};

export function CNPJRadarTab() {
  const { createLead, leads } = useLeads();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<TabType>('individual');

  // Single lookup
  const [cnpjInput, setCnpjInput] = useState('');
  const [singleResult, setSingleResult] = useState<CNPJResult | null>(null);
  const [singleLoading, setSingleLoading] = useState(false);

  // Mass search
  const [estado, setEstado] = useState('');
  const [cidade, setCidade] = useState('');
  const [cnae, setCnae] = useState('');
  const [porte, setPorte] = useState('');
  const [quantidade, setQuantidade] = useState([50]);
  const [massResults, setMassResults] = useState<CNPJResult[]>([]);
  const [massLoading, setMassLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const existingPhones = new Set(leads.map(l => l.phone.replace(/\D/g, '')));

  const handleSingleLookup = async () => {
    const digits = cnpjInput.replace(/\D/g, '');
    if (digits.length !== 14) {
      toast({ title: 'CNPJ inválido', description: 'Digite um CNPJ com 14 dígitos.', variant: 'destructive' });
      return;
    }
    setSingleLoading(true);
    setSingleResult(null);
    try {
      // Também pela edge function: ela consulta cache primeiro (cnpj_cache),
      // tem fallback para a BrasilAPI e não gasta o limite público a cada
      // clique do usuário.
      const { data, error } = await supabase.functions.invoke('cnpj-radar', {
        body: { action: 'lookup', cnpj: digits },
      });

      if (error) throw error;
      if (!data || data.error) throw new Error(data?.error || 'CNPJ não encontrado');

      const est = data.estabelecimento ?? {};
      const mapped: CNPJResult = {
        cnpj: digits,
        razao_social: data.razao_social || '',
        nome_fantasia: est.nome_fantasia || data.nome_fantasia || '',
        situacao_cadastral: est.situacao_cadastral || data.situacao_cadastral || '',
        cnae_fiscal_descricao: est.atividade_principal?.descricao || data.cnae_fiscal_descricao || '',
        cnae_fiscal: est.atividade_principal?.id || data.cnae_fiscal || 0,
        logradouro: est.logradouro || data.logradouro || '',
        numero: est.numero || data.numero || '',
        complemento: est.complemento || data.complemento || '',
        bairro: est.bairro || data.bairro || '',
        municipio: est.cidade?.nome || data.municipio || '',
        uf: est.estado?.sigla || data.uf || '',
        cep: est.cep || data.cep || '',
        ddd_telefone_1: est.ddd1 && est.telefone1
          ? `${est.ddd1}${est.telefone1}`
          : data.ddd_telefone_1 || '',
        email: est.email || data.email || '',
        data_inicio_atividade: est.data_inicio_atividade || data.data_inicio_atividade || '',
        porte: data.porte?.descricao || data.porte || '',
        descricao_tipo_de_logradouro: est.tipo_logradouro || '',
      };
      setSingleResult(mapped);
    } catch (err: any) {
      toast({ title: 'Erro', description: err.message || 'Erro ao consultar CNPJ', variant: 'destructive' });
    } finally {
      setSingleLoading(false);
    }
  };

  const handleMassSearch = async () => {
    if (!estado) {
      toast({ title: 'Selecione um estado', variant: 'destructive' });
      return;
    }
    setMassLoading(true);
    setMassResults([]);
    setSelectedIds(new Set());
    try {
      // A busca era feita direto do navegador contra a API pública de CNPJ:
      // sem chave, batendo o limite público em minutos, sem cache e refém do
      // CORS — que, quando bloqueia, falha silenciosamente no cliente. Agora
      // vai pela edge function, que tem retry, duas fontes com fallback e
      // valida o telefone antes de devolver.
      const { data, error } = await supabase.functions.invoke('cnpj-radar', {
        body: {
          action: 'search',
          filters: {
            uf: estado,
            municipio: cidade || undefined,
            cnae: cnae || undefined,
            porte: porte || undefined,
            limit: quantidade[0],
            only_with_phone: true,
          },
        },
      });

      if (error) throw error;

      const results: CNPJResult[] = data?.results ?? [];
      setMassResults(results);
      if (results.length === 0) {
        toast({ title: 'Nenhuma empresa encontrada', description: 'Tente outros filtros.' });
      } else {
        toast({ title: `${results.length} empresas encontradas` });
      }
    } catch (err: any) {
      toast({ title: 'Erro na busca', description: err.message, variant: 'destructive' });
    } finally {
      setMassLoading(false);
    }
  };

  const addAsLead = (item: CNPJResult) => {
    const phone = item.ddd_telefone_1.replace(/\D/g, '');
    if (!phone) {
      toast({ title: 'Sem telefone', description: 'Esta empresa não possui telefone cadastrado.', variant: 'destructive' });
      return;
    }
    createLead({
      business_name: item.nome_fantasia || item.razao_social,
      phone,
      email: item.email || null,
      address: `${item.descricao_tipo_de_logradouro} ${item.logradouro}, ${item.numero} ${item.complemento} - ${item.bairro}`.trim(),
      niche: item.cnae_fiscal_descricao,
      location: `${item.municipio} - ${item.uf}`,
      source: 'cnpj_radar',
      stage: 'Contato',
      temperature: 'morno',
      message_sent: false,
      follow_up_count: 0,
      lead_score: 0,
      score_factors: {},
      analyzed_needs: {},
      tags: [],
      quality_score: 0,
      reviews_count: 0,
      total_messages_exchanged: 0,
    } as any);
  };

  const importSelected = () => {
    const items = massResults.filter(r => selectedIds.has(r.cnpj));
    items.forEach(addAsLead);
    toast({ title: `${items.length} leads importados` });
    setSelectedIds(new Set());
  };

  const toggleSelect = (cnpj: string) => {
    const next = new Set(selectedIds);
    if (next.has(cnpj)) next.delete(cnpj);
    else next.add(cnpj);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === massResults.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(massResults.map(r => r.cnpj)));
    }
  };

  const exportCSV = () => {
    const headers = ['CNPJ','Razão Social','Nome Fantasia','CNAE','Município','UF','Telefone','Email','Situação'];
    const rows = massResults.map(r => [
      r.cnpj, r.razao_social, r.nome_fantasia, r.cnae_fiscal_descricao,
      r.municipio, r.uf, cleanPhone(r.ddd_telefone_1), r.email, r.situacao_cadastral
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${(c||'').replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cnpj_radar_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const isAlreadyImported = (item: CNPJResult) => {
    const phone = item.ddd_telefone_1.replace(/\D/g, '');
    return existingPhones.has(phone);
  };

  const withPhone = massResults.filter(r => r.ddd_telefone_1?.replace(/\D/g, ''));
  const withEmail = massResults.filter(r => r.email);
  const alreadyImported = massResults.filter(isAlreadyImported);

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div {...fadeSlide} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20">
            <Radar className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-bold tracking-tight">Radar CNPJ</h2>
            <p className="text-xs text-muted-foreground">Encontre e importe empresas brasileiras direto para seu CRM</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabType)} className="w-full sm:w-auto">
          <TabsList className="grid grid-cols-2 h-9 w-full sm:w-[280px]">
            <TabsTrigger value="individual" className="text-xs gap-1.5">
              <Search className="h-3.5 w-3.5" />
              Consulta CNPJ
            </TabsTrigger>
            <TabsTrigger value="massa" className="text-xs gap-1.5">
              <Users className="h-3.5 w-3.5" />
              Busca em Massa
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </motion.div>

      <AnimatePresence mode="wait">
        {/* ─── Individual Lookup ─── */}
        {activeTab === 'individual' && (
          <motion.div key="individual" {...fadeSlide} className="space-y-5">
            <Card className="border-border/40 shadow-sm">
              <CardContent className="p-5 sm:p-6">
                <div className="flex items-center gap-2.5 mb-5">
                  <Building2 className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Consultar CNPJ</h3>
                </div>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Input
                    placeholder="00.000.000/0000-00"
                    value={cnpjInput}
                    onChange={(e) => setCnpjInput(formatCNPJ(e.target.value))}
                    className="sm:max-w-xs h-10 font-mono text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && handleSingleLookup()}
                  />
                  <Button
                    onClick={handleSingleLookup}
                    disabled={singleLoading}
                    className="h-10 gap-2 px-5"
                  >
                    {singleLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Consultar
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Single Result */}
            {singleResult && (
              <motion.div {...fadeSlide}>
                <Card className="border-primary/20 shadow-md overflow-hidden">
                  <div className="h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
                  <CardContent className="p-5 sm:p-6 space-y-5">
                    {/* Company header */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-base font-bold leading-tight truncate">
                          {singleResult.nome_fantasia || singleResult.razao_social}
                        </h3>
                        {singleResult.nome_fantasia && (
                          <p className="text-xs text-muted-foreground truncate">{singleResult.razao_social}</p>
                        )}
                        <p className="text-[11px] text-muted-foreground font-mono">
                          CNPJ {formatCNPJ(singleResult.cnpj)}
                        </p>
                      </div>
                      <Badge
                        variant={singleResult.situacao_cadastral?.toLowerCase().includes('ativa') ? 'default' : 'destructive'}
                        className="shrink-0 text-[10px]"
                      >
                        {singleResult.situacao_cadastral || 'Desconhecido'}
                      </Badge>
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      <InfoRow icon={Briefcase} label="Atividade" value={singleResult.cnae_fiscal_descricao} />
                      <InfoRow icon={MapPin} label="Cidade" value={`${singleResult.municipio} — ${singleResult.uf}`} />
                      <InfoRow icon={Phone} label="Telefone" value={cleanPhone(singleResult.ddd_telefone_1) || 'Não informado'} />
                      <InfoRow icon={Mail} label="Email" value={singleResult.email || 'Não informado'} />
                      <InfoRow icon={Calendar} label="Abertura" value={singleResult.data_inicio_atividade || '—'} />
                      <InfoRow icon={Building2} label="Porte" value={singleResult.porte || '—'} />
                    </div>

                    {/* Address */}
                    <div className="p-3 rounded-lg bg-muted/30 border border-border/40">
                      <p className="text-xs text-muted-foreground flex items-start gap-2 leading-relaxed">
                        <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary/60" />
                        {`${singleResult.descricao_tipo_de_logradouro} ${singleResult.logradouro}, ${singleResult.numero} ${singleResult.complemento} — ${singleResult.bairro}, ${singleResult.municipio}/${singleResult.uf} — CEP ${singleResult.cep}`}
                      </p>
                    </div>

                    <Button onClick={() => addAsLead(singleResult)} className="w-full h-10 gap-2">
                      <Plus className="h-4 w-4" />
                      Adicionar como Lead
                    </Button>
                  </CardContent>
                </Card>
              </motion.div>
            )}

            {/* Empty */}
            {!singleResult && !singleLoading && (
              <EmptyPlaceholder
                icon={Search}
                text="Digite um CNPJ acima para consultar os dados da empresa"
              />
            )}

            {singleLoading && <LoadingSkeleton rows={1} height="h-48" />}
          </motion.div>
        )}

        {/* ─── Mass Search ─── */}
        {activeTab === 'massa' && (
          <motion.div key="massa" {...fadeSlide} className="space-y-5">
            {/* Filters */}
            <Card className="border-border/40 shadow-sm">
              <CardContent className="p-5 sm:p-6 space-y-5">
                <div className="flex items-center gap-2.5">
                  <Globe className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Filtros de Busca</h3>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <FilterField label="Estado" icon={MapPin} required>
                    <Select value={estado} onValueChange={setEstado}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Selecione" />
                      </SelectTrigger>
                      <SelectContent>
                        {ESTADOS_BR.map(uf => (
                          <SelectItem key={uf} value={uf}>{uf}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>

                  <FilterField label="Cidade" icon={Building2}>
                    <Input
                      placeholder="Ex: São Paulo"
                      value={cidade}
                      onChange={e => setCidade(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </FilterField>

                  <FilterField label="CNAE" icon={Hash}>
                    <Input
                      placeholder="Ex: 4712100"
                      value={cnae}
                      onChange={e => setCnae(e.target.value)}
                      className="h-9 text-sm"
                    />
                  </FilterField>

                  <FilterField label="Porte" icon={Briefcase}>
                    <Select value={porte} onValueChange={setPorte}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        {PORTES.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FilterField>
                </div>

                {/* Quantity slider */}
                <div className="p-4 rounded-xl bg-muted/20 border border-border/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Quantidade de empresas</Label>
                    <span className="text-sm font-bold text-primary tabular-nums">{quantidade[0]}</span>
                  </div>
                  <Slider value={quantidade} onValueChange={setQuantidade} min={10} max={200} step={10} />
                  <div className="flex justify-between text-[10px] text-muted-foreground/60">
                    <span>10</span><span>50</span><span>100</span><span>150</span><span>200</span>
                  </div>
                </div>

                <Button
                  onClick={handleMassSearch}
                  disabled={massLoading || !estado}
                  className="w-full h-11 gap-2 text-sm font-semibold"
                  size="lg"
                >
                  {massLoading ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Buscando empresas...</>
                  ) : (
                    <><Search className="h-4 w-4" /> Buscar Empresas <ArrowRight className="h-4 w-4 ml-1" /></>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* KPI Stats (shown when results exist) */}
            {massResults.length > 0 && (
              <motion.div {...fadeSlide} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <MiniKPI icon={Building2} label="Empresas" value={massResults.length} color="text-primary" />
                <MiniKPI icon={Phone} label="Com Telefone" value={withPhone.length} color="text-emerald-500" />
                <MiniKPI icon={Mail} label="Com Email" value={withEmail.length} color="text-blue-500" />
                <MiniKPI icon={CheckCircle2} label="Já Importados" value={alreadyImported.length} color="text-amber-500" />
              </motion.div>
            )}

            {/* Loading */}
            {massLoading && <LoadingSkeleton rows={6} />}

            {/* Empty */}
            {!massLoading && massResults.length === 0 && (
              <EmptyPlaceholder
                icon={Radar}
                text={estado ? 'Nenhuma empresa encontrada com esses filtros' : 'Configure os filtros acima e clique em Buscar'}
              />
            )}

            {/* Results Table */}
            {massResults.length > 0 && (
              <motion.div {...fadeSlide}>
                <Card className="border-border/40 shadow-sm overflow-hidden">
                  {/* Toolbar */}
                  <div className="px-5 py-3 border-b border-border/40 bg-muted/10 flex items-center justify-between flex-wrap gap-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary" className="tabular-nums font-bold">
                        {massResults.length}
                      </Badge>
                      <span className="text-muted-foreground">empresas encontradas</span>
                      {selectedIds.size > 0 && (
                        <span className="text-primary font-medium">
                          · {selectedIds.size} selecionadas
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={exportCSV} className="gap-1.5 h-8 text-xs">
                        <FileSpreadsheet className="h-3.5 w-3.5" />
                        Exportar CSV
                      </Button>
                      {selectedIds.size > 0 && (
                        <Button size="sm" onClick={importSelected} className="gap-1.5 h-8 text-xs">
                          <Sparkles className="h-3.5 w-3.5" />
                          Importar {selectedIds.size} leads
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Table */}
                  <ScrollArea className="h-[480px]">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent bg-muted/5">
                          <TableHead className="w-10 pl-4">
                            <Checkbox
                              checked={selectedIds.size === massResults.length && massResults.length > 0}
                              onCheckedChange={toggleAll}
                            />
                          </TableHead>
                          <TableHead className="text-xs font-semibold">Empresa</TableHead>
                          <TableHead className="text-xs font-semibold hidden lg:table-cell">CNAE</TableHead>
                          <TableHead className="text-xs font-semibold">Cidade/UF</TableHead>
                          <TableHead className="text-xs font-semibold hidden sm:table-cell">Situação</TableHead>
                          <TableHead className="text-xs font-semibold">Telefone</TableHead>
                          <TableHead className="text-xs font-semibold hidden md:table-cell">Email</TableHead>
                          <TableHead className="text-xs font-semibold text-right pr-4">Ação</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {massResults.map((item, idx) => {
                          const imported = isAlreadyImported(item);
                          const hasPhone = !!item.ddd_telefone_1?.replace(/\D/g, '');
                          return (
                            <TableRow
                              key={item.cnpj}
                              className={cn(
                                "transition-colors",
                                imported && "opacity-50",
                                selectedIds.has(item.cnpj) && "bg-primary/5"
                              )}
                            >
                              <TableCell className="pl-4">
                                <Checkbox
                                  checked={selectedIds.has(item.cnpj)}
                                  onCheckedChange={() => toggleSelect(item.cnpj)}
                                  disabled={imported}
                                />
                              </TableCell>
                              <TableCell>
                                <div className="space-y-0.5">
                                  <p className="text-sm font-medium leading-tight truncate max-w-[200px]">
                                    {item.nome_fantasia || item.razao_social}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground font-mono">
                                    {formatCNPJ(item.cnpj)}
                                  </p>
                                </div>
                              </TableCell>
                              <TableCell className="hidden lg:table-cell">
                                <p className="text-xs text-muted-foreground truncate max-w-[160px]">
                                  {item.cnae_fiscal_descricao || '—'}
                                </p>
                              </TableCell>
                              <TableCell>
                                <p className="text-xs whitespace-nowrap">{item.municipio}/{item.uf}</p>
                              </TableCell>
                              <TableCell className="hidden sm:table-cell">
                                <Badge
                                  variant={item.situacao_cadastral?.toLowerCase().includes('ativa') ? 'default' : 'secondary'}
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {item.situacao_cadastral || '—'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <span className={cn(
                                  "text-xs tabular-nums",
                                  !hasPhone && "text-muted-foreground/50"
                                )}>
                                  {cleanPhone(item.ddd_telefone_1) || '—'}
                                </span>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <p className="text-xs truncate max-w-[130px] text-muted-foreground">
                                  {item.email || '—'}
                                </p>
                              </TableCell>
                              <TableCell className="text-right pr-4">
                                {imported ? (
                                  <Badge variant="secondary" className="text-[10px] gap-1">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Importado
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => addAsLead(item)}
                                    className="h-7 px-2 text-xs gap-1 hover:text-primary"
                                    disabled={!hasPhone}
                                  >
                                    <Plus className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Importar</span>
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </Card>
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ─── Sub-components ─── */

function InfoRow({ icon: Icon, label, value }: { icon: typeof Building2; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-muted/15 border border-border/30">
      <Icon className="h-3.5 w-3.5 text-muted-foreground/70 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wider leading-none mb-0.5">{label}</p>
        <p className="text-xs font-medium truncate leading-tight">{value}</p>
      </div>
    </div>
  );
}

function FilterField({
  label,
  icon: Icon,
  required,
  children,
}: {
  label: string;
  icon: typeof MapPin;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function MiniKPI({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Building2;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <Card className="border-border/30 shadow-sm">
      <CardContent className="p-3 flex items-center gap-3">
        <div className={cn("p-2 rounded-lg bg-muted/30", color)}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <p className="text-lg font-bold tabular-nums leading-none">{value}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyPlaceholder({ icon: Icon, text }: { icon: typeof Search; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 rounded-2xl bg-muted/20 mb-4">
        <Icon className="h-8 w-8 text-muted-foreground/30" />
      </div>
      <p className="text-sm text-muted-foreground max-w-xs">{text}</p>
    </div>
  );
}

function LoadingSkeleton({ rows = 5, height = 'h-12' }: { rows?: number; height?: string }) {
  return (
    <Card className="border-border/30">
      <CardContent className="p-5 space-y-2.5">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={cn(height, 'w-full rounded-lg')} />
        ))}
      </CardContent>
    </Card>
  );
}

import { useState, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { useLeads } from '@/hooks/use-leads';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import {
  Upload,
  Download,
  FileSpreadsheet,
  Check,
  X,
  AlertCircle,
  Loader2,
  FileText,
  ChevronRight,
  Info,
} from 'lucide-react';

interface ImportedLead {
  business_name: string;
  phone: string;
  email?: string;
  niche?: string;
  location?: string;
  notes?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  duplicates: number;
  errors: string[];
}

const REQUIRED_COLUMNS = ['business_name', 'phone'];
const OPTIONAL_COLUMNS = ['email', 'niche', 'location', 'notes', 'website', 'address'];

export function ImportExportLeads() {
  const { leads, refetch } = useLeads();
  const { user } = useAuth();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [isImportDialogOpen, setIsImportDialogOpen] = useState(false);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportedLead[]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exportFilter, setExportFilter] = useState<string>('all');
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<string[][]>([]);

  const parseCSV = (content: string): { headers: string[], rows: string[][] } => {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    
    const headers = lines[0].split(/[,;]/).map(h => h.trim().replace(/"/g, ''));
    const rows = lines.slice(1).map(line => 
      line.split(/[,;]/).map(cell => cell.trim().replace(/"/g, ''))
    );
    
    return { headers, rows };
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setImportFile(file);
    setImportResult(null);
    
    try {
      const content = await file.text();
      
      if (file.name.endsWith('.json')) {
        const data = JSON.parse(content);
        const leads = Array.isArray(data) ? data : data.leads || [data];
        setImportPreview(leads.slice(0, 5));
        setParsedHeaders(Object.keys(leads[0] || {}));
        setParsedRows(leads.map(l => Object.values(l).map(String)));
      } else {
        const { headers, rows } = parseCSV(content);
        setParsedHeaders(headers);
        setParsedRows(rows);
        
        // Auto-map columns
        const autoMapping: Record<string, string> = {};
        headers.forEach(header => {
          const lowerHeader = header.toLowerCase();
          if (lowerHeader.includes('nome') || lowerHeader.includes('empresa') || lowerHeader === 'name') {
            autoMapping.business_name = header;
          } else if (lowerHeader.includes('telefone') || lowerHeader.includes('phone') || lowerHeader.includes('celular')) {
            autoMapping.phone = header;
          } else if (lowerHeader.includes('email') || lowerHeader.includes('e-mail')) {
            autoMapping.email = header;
          } else if (lowerHeader.includes('nicho') || lowerHeader.includes('segmento') || lowerHeader.includes('categoria')) {
            autoMapping.niche = header;
          } else if (lowerHeader.includes('cidade') || lowerHeader.includes('local') || lowerHeader.includes('location')) {
            autoMapping.location = header;
          } else if (lowerHeader.includes('nota') || lowerHeader.includes('observ')) {
            autoMapping.notes = header;
          }
        });
        setColumnMapping(autoMapping);
        
        // Preview first 5 rows
        const preview = rows.slice(0, 5).map(row => {
          const lead: ImportedLead = {
            business_name: row[headers.indexOf(autoMapping.business_name)] || '',
            phone: row[headers.indexOf(autoMapping.phone)] || '',
          };
          if (autoMapping.email) lead.email = row[headers.indexOf(autoMapping.email)];
          if (autoMapping.niche) lead.niche = row[headers.indexOf(autoMapping.niche)];
          if (autoMapping.location) lead.location = row[headers.indexOf(autoMapping.location)];
          if (autoMapping.notes) lead.notes = row[headers.indexOf(autoMapping.notes)];
          return lead;
        });
        setImportPreview(preview);
      }
    } catch (error) {
      toast({
        title: 'Erro ao ler arquivo',
        description: 'O arquivo não pôde ser processado. Verifique o formato.',
        variant: 'destructive',
      });
    }
  };

  const handleImport = async () => {
    if (!user || parsedRows.length === 0) return;
    
    setIsImporting(true);
    setImportProgress(0);
    
    const result: ImportResult = {
      success: 0,
      failed: 0,
      duplicates: 0,
      errors: [],
    };
    
    const existingPhones = new Set(leads.map(l => l.phone.replace(/\D/g, '')));
    
    for (let i = 0; i < parsedRows.length; i++) {
      const row = parsedRows[i];
      
      try {
        const businessNameIdx = parsedHeaders.indexOf(columnMapping.business_name);
        const phoneIdx = parsedHeaders.indexOf(columnMapping.phone);
        
        const businessName = row[businessNameIdx]?.trim();
        const phone = row[phoneIdx]?.trim().replace(/\D/g, '');
        
        if (!businessName || !phone) {
          result.failed++;
          result.errors.push(`Linha ${i + 2}: Nome ou telefone ausente`);
          continue;
        }
        
        if (existingPhones.has(phone)) {
          result.duplicates++;
          continue;
        }
        
        const lead = {
          user_id: user.id,
          business_name: businessName,
          phone: phone,
          stage: 'Contato' as const,
          temperature: 'frio' as const,
          source: 'import',
        };
        
        // Build lead object with optional fields
        const leadData: any = {
          ...lead,
        };
        
        // Add optional fields
        if (columnMapping.email) {
          const idx = parsedHeaders.indexOf(columnMapping.email);
          if (row[idx]) leadData.email = row[idx].trim();
        }
        if (columnMapping.niche) {
          const idx = parsedHeaders.indexOf(columnMapping.niche);
          if (row[idx]) leadData.niche = row[idx].trim();
        }
        if (columnMapping.location) {
          const idx = parsedHeaders.indexOf(columnMapping.location);
          if (row[idx]) leadData.location = row[idx].trim();
        }
        if (columnMapping.notes) {
          const idx = parsedHeaders.indexOf(columnMapping.notes);
          if (row[idx]) leadData.notes = row[idx].trim();
        }
        
        const { error } = await supabase.from('leads').insert(leadData);
        
        if (error) {
          result.failed++;
          result.errors.push(`Linha ${i + 2}: ${error.message}`);
        } else {
          result.success++;
          existingPhones.add(phone);
        }
      } catch (error: any) {
        result.failed++;
        result.errors.push(`Linha ${i + 2}: ${error.message}`);
      }
      
      setImportProgress(((i + 1) / parsedRows.length) * 100);
    }
    
    setImportResult(result);
    setIsImporting(false);
    refetch();
    
    toast({
      title: '✓ Importação concluída',
      description: `${result.success} leads importados, ${result.duplicates} duplicatas ignoradas`,
    });
  };

  const handleExport = () => {
    let leadsToExport = leads;
    
    // Apply filter
    if (exportFilter !== 'all') {
      leadsToExport = leads.filter(l => l.stage === exportFilter);
    }
    
    if (leadsToExport.length === 0) {
      toast({
        title: 'Nenhum lead para exportar',
        description: 'Não há leads que correspondam ao filtro selecionado.',
        variant: 'destructive',
      });
      return;
    }
    
    let content: string;
    let filename: string;
    let mimeType: string;
    
    if (exportFormat === 'json') {
      content = JSON.stringify(leadsToExport, null, 2);
      filename = `leads_${new Date().toISOString().split('T')[0]}.json`;
      mimeType = 'application/json';
    } else {
      // CSV export
      const headers = [
        'Nome da Empresa',
        'Telefone',
        'Email',
        'Nicho',
        'Localização',
        'Estágio',
        'Temperatura',
        'Avaliação',
        'Endereço',
        'Website',
        'Notas',
        'Criado em',
        'Último Contato',
      ];
      
      const rows = leadsToExport.map(lead => [
        lead.business_name,
        lead.phone,
        lead.email || '',
        lead.niche || '',
        lead.location || '',
        lead.stage,
        lead.temperature || '',
        (lead as any).rating?.toString() || '',
        lead.address || '',
        lead.website || '',
        (lead as any).notes || '',
        lead.created_at,
        lead.last_contact_at || '',
      ]);
      
      content = [
        headers.join(';'),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(';')),
      ].join('\n');
      
      filename = `leads_${new Date().toISOString().split('T')[0]}.csv`;
      mimeType = 'text/csv;charset=utf-8';
    }
    
    // Download file
    const blob = new Blob(['\ufeff' + content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    toast({
      title: '✓ Exportação concluída',
      description: `${leadsToExport.length} leads exportados em ${exportFormat.toUpperCase()}`,
    });
    
    setIsExportDialogOpen(false);
  };

  const resetImport = () => {
    setImportFile(null);
    setImportPreview([]);
    setColumnMapping({});
    setParsedHeaders([]);
    setParsedRows([]);
    setImportResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="flex gap-2">
      {/* Import Dialog */}
      <Dialog open={isImportDialogOpen} onOpenChange={(open) => {
        setIsImportDialogOpen(open);
        if (!open) resetImport();
      }}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Importar
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5" />
              Importar Leads
            </DialogTitle>
            <DialogDescription>
              Importe leads de um arquivo CSV ou JSON
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6">
            {/* File Upload */}
            <div className="space-y-2">
              <Label>Selecionar Arquivo</Label>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json,.txt"
                onChange={handleFileSelect}
                disabled={isImporting}
              />
              <p className="text-xs text-muted-foreground">
                Formatos aceitos: CSV, JSON. Máximo: 10MB
              </p>
            </div>
            
            {/* Column Mapping */}
            {parsedHeaders.length > 0 && !importResult && (
              <div className="space-y-4">
                <div>
                  <Label>Mapeamento de Colunas</Label>
                  <p className="text-xs text-muted-foreground mb-3">
                    Associe as colunas do seu arquivo aos campos do sistema
                  </p>
                </div>
                
                <div className="grid gap-3">
                  {REQUIRED_COLUMNS.map(col => (
                    <div key={col} className="flex items-center gap-2">
                      <span className="w-32 text-sm font-medium flex items-center gap-1">
                        {col === 'business_name' ? 'Nome*' : 'Telefone*'}
                        <Badge variant="destructive" className="text-xs">Obrigatório</Badge>
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      <Select
                        value={columnMapping[col] || ''}
                        onValueChange={(value) => setColumnMapping(prev => ({ ...prev, [col]: value }))}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Selecione a coluna" />
                        </SelectTrigger>
                        <SelectContent>
                          {parsedHeaders.map(header => (
                            <SelectItem key={header} value={header}>{header}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                  
                  {OPTIONAL_COLUMNS.slice(0, 4).map(col => (
                    <div key={col} className="flex items-center gap-2">
                      <span className="w-32 text-sm font-medium capitalize">{col}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      <Select
                        value={columnMapping[col] || ''}
                        onValueChange={(value) => setColumnMapping(prev => ({ ...prev, [col]: value }))}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="Selecione (opcional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">-- Não importar --</SelectItem>
                          {parsedHeaders.map(header => (
                            <SelectItem key={header} value={header}>{header}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Preview */}
            {importPreview.length > 0 && !importResult && (
              <div className="space-y-2">
                <Label>Prévia ({parsedRows.length} linhas total)</Label>
                <ScrollArea className="h-[150px] border rounded-lg p-3">
                  <div className="space-y-2">
                    {importPreview.map((lead, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-sm p-2 bg-muted/50 rounded">
                        <Badge variant="outline">{idx + 1}</Badge>
                        <span className="font-medium">{lead.business_name || '-'}</span>
                        <span className="text-muted-foreground">{lead.phone || '-'}</span>
                        {lead.niche && <Badge variant="secondary">{lead.niche}</Badge>}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
            
            {/* Progress */}
            {isImporting && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Importando leads...</span>
                  <span>{Math.round(importProgress)}%</span>
                </div>
                <Progress value={importProgress} />
              </div>
            )}
            
            {/* Result */}
            {importResult && (
              <Alert className={importResult.success > 0 ? 'border-success/50 bg-success/10' : 'border-destructive/50'}>
                <Check className="h-4 w-4" />
                <AlertTitle>Importação Concluída</AlertTitle>
                <AlertDescription>
                  <div className="mt-2 space-y-1 text-sm">
                    <p className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-success" />
                      {importResult.success} leads importados com sucesso
                    </p>
                    {importResult.duplicates > 0 && (
                      <p className="flex items-center gap-2">
                        <Info className="h-4 w-4 text-warning" />
                        {importResult.duplicates} duplicatas ignoradas
                      </p>
                    )}
                    {importResult.failed > 0 && (
                      <p className="flex items-center gap-2">
                        <X className="h-4 w-4 text-destructive" />
                        {importResult.failed} falharam
                      </p>
                    )}
                  </div>
                  {importResult.errors.length > 0 && (
                    <ScrollArea className="h-[80px] mt-2 p-2 bg-destructive/10 rounded text-xs">
                      {importResult.errors.slice(0, 10).map((err, idx) => (
                        <p key={idx}>{err}</p>
                      ))}
                      {importResult.errors.length > 10 && (
                        <p>... e mais {importResult.errors.length - 10} erros</p>
                      )}
                    </ScrollArea>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsImportDialogOpen(false)}>
              {importResult ? 'Fechar' : 'Cancelar'}
            </Button>
            {!importResult && (
              <Button 
                onClick={handleImport}
                disabled={isImporting || !columnMapping.business_name || !columnMapping.phone}
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Importar {parsedRows.length} Leads
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Export Dialog */}
      <Dialog open={isExportDialogOpen} onOpenChange={setIsExportDialogOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Exportar Leads
            </DialogTitle>
            <DialogDescription>
              Exporte seus leads para CSV ou JSON
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Formato</Label>
              <Select value={exportFormat} onValueChange={(v: 'csv' | 'json') => setExportFormat(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="csv">CSV (Excel, Google Sheets)</SelectItem>
                  <SelectItem value="json">JSON (Programação)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Filtro</Label>
              <Select value={exportFilter} onValueChange={setExportFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os leads ({leads.length})</SelectItem>
                  <SelectItem value="Contato">Apenas Contato</SelectItem>
                  <SelectItem value="Qualificado">Apenas Qualificado</SelectItem>
                  <SelectItem value="Proposta">Apenas Proposta</SelectItem>
                  <SelectItem value="Negociação">Apenas Negociação</SelectItem>
                  <SelectItem value="Ganho">Apenas Ganho</SelectItem>
                  <SelectItem value="Perdido">Apenas Perdido</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                Serão exportados {exportFilter === 'all' ? leads.length : leads.filter(l => l.stage === exportFilter).length} leads
              </AlertDescription>
            </Alert>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsExportDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Exportar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

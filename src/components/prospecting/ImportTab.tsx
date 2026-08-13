import { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useUserSettings } from '@/hooks/use-user-settings';
import { fetchWhatsAppGroups, fetchGroupParticipants, WhatsAppGroup } from '@/lib/whatsapp';
import {
  Upload,
  Loader2,
  FileSpreadsheet,
  MessageCircle,
  Users,
  AlertCircle,
} from 'lucide-react';

export function ImportTab() {
  const { toast } = useToast();
  const { settings } = useUserSettings();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  
  // WhatsApp import state
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [groups, setGroups] = useState<WhatsAppGroup[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [customNiche, setCustomNiche] = useState('');
  const [isImportingWhatsApp, setIsImportingWhatsApp] = useState(false);
  const [whatsAppProgress, setWhatsAppProgress] = useState(0);

  const isWhatsAppConnected = settings?.whatsapp_connected && settings?.whatsapp_instance_id;

  const handleCSVImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    setImportProgress(0);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      const nameIdx = headers.findIndex(h => h.includes('nome') || h.includes('empresa') || h.includes('name') || h.includes('business'));
      const phoneIdx = headers.findIndex(h => h.includes('telefone') || h.includes('phone') || h.includes('celular'));
      const nicheIdx = headers.findIndex(h => h.includes('nicho') || h.includes('niche') || h.includes('segmento'));
      const locationIdx = headers.findIndex(h => h.includes('cidade') || h.includes('local') || h.includes('city'));

      if (phoneIdx === -1) {
        throw new Error('CSV deve conter uma coluna de telefone');
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      const dataLines = lines.slice(1);
      let imported = 0;

      for (let i = 0; i < dataLines.length; i++) {
        const values = dataLines[i].split(',').map(v => v.trim().replace(/"/g, ''));
        
        const phone = values[phoneIdx];
        if (!phone) continue;

        const leadData = {
          user_id: user.id,
          business_name: nameIdx !== -1 ? values[nameIdx] : 'Lead Importado',
          phone: phone.replace(/\D/g, ''),
          niche: nicheIdx !== -1 ? values[nicheIdx] : null,
          location: locationIdx !== -1 ? values[locationIdx] : null,
          stage: 'Contato' as const,
          temperature: 'frio' as const,
          source: 'csv_import',
        };

        const { error } = await supabase.from('leads').insert(leadData);
        if (!error) imported++;

        setImportProgress(Math.round(((i + 1) / dataLines.length) * 100));
      }

      toast({
        title: 'Importação concluída',
        description: `${imported} leads importados com sucesso!`,
      });
    } catch (error: any) {
      toast({
        title: 'Erro na importação',
        description: error.message || 'Erro ao processar arquivo CSV',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      setImportProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleOpenWhatsAppModal = async () => {
    if (!isWhatsAppConnected) {
      toast({
        title: 'WhatsApp não conectado',
        description: 'Conecte seu WhatsApp nas configurações para importar contatos de grupos.',
        variant: 'destructive',
      });
      return;
    }

    setShowWhatsAppModal(true);
    setIsLoadingGroups(true);
    setGroups([]);
    setSelectedGroups([]);

    try {
      const fetchedGroups = await fetchWhatsAppGroups(settings!.whatsapp_instance_id!);
      setGroups(fetchedGroups);
    } catch (error: any) {
      toast({
        title: 'Erro ao buscar grupos',
        description: error.message || 'Não foi possível listar os grupos do WhatsApp',
        variant: 'destructive',
      });
      setShowWhatsAppModal(false);
    } finally {
      setIsLoadingGroups(false);
    }
  };

  const toggleGroupSelection = (groupId: string) => {
    setSelectedGroups(prev => 
      prev.includes(groupId) 
        ? prev.filter(id => id !== groupId)
        : [...prev, groupId]
    );
  };

  const getTotalSelectedMembers = () => {
    return groups
      .filter(g => selectedGroups.includes(g.id))
      .reduce((sum, g) => sum + g.memberCount, 0);
  };

  const handleWhatsAppImport = async () => {
    if (selectedGroups.length === 0) {
      toast({
        title: 'Nenhum grupo selecionado',
        description: 'Selecione pelo menos um grupo para importar contatos.',
        variant: 'destructive',
      });
      return;
    }

    setIsImportingWhatsApp(true);
    setWhatsAppProgress(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');

      // Fetch participants from selected groups
      setWhatsAppProgress(20);
      const participants = await fetchGroupParticipants(
        settings!.whatsapp_instance_id!,
        selectedGroups
      );

      if (participants.length === 0) {
        toast({
          title: 'Nenhum contato encontrado',
          description: 'Os grupos selecionados não contêm participantes válidos.',
          variant: 'destructive',
        });
        return;
      }

      setWhatsAppProgress(40);

      // Duplicata pelos telefones DESTA importação, comparados pela forma
      // canônica no banco.
      //
      // A versão anterior tinha dois furos: baixava a carteira inteira (que o
      // PostgREST corta em 1000) e comparava o telefone COMO ESTÁ GRAVADO —
      // "(11) 98765-4321" e "5511987654321" são o mesmo número e não batiam.
      const { data: repetidos, error: erroDup } = await supabase.rpc('leads_ja_existentes', {
        p_user_id: user.id,
        p_phones: participants.map(p => p.phone),
      });

      if (erroDup) throw erroDup;

      const existingPhones = new Set(
        (repetidos ?? []).map((r: { phone_consultado: string }) => r.phone_consultado),
      );

      // Filter out duplicates
      const newParticipants = participants.filter(p => !existingPhones.has(p.phone));

      if (newParticipants.length === 0) {
        toast({
          title: 'Todos já importados',
          description: 'Todos os contatos dos grupos selecionados já estão na sua lista de leads.',
        });
        setShowWhatsAppModal(false);
        return;
      }

      setWhatsAppProgress(60);

      // Import leads in batches
      const batchSize = 50;
      let imported = 0;

      for (let i = 0; i < newParticipants.length; i += batchSize) {
        const batch = newParticipants.slice(i, i + batchSize);
        
        const leadsToInsert = batch.map(p => ({
          user_id: user.id,
          business_name: p.name,
          phone: p.phone,
          niche: customNiche || p.groupName,
          stage: 'Contato' as const,
          temperature: 'frio' as const,
          source: 'whatsapp_group',
          tags: [p.groupName],
        }));

        const { error } = await supabase.from('leads').insert(leadsToInsert);
        if (!error) imported += batch.length;

        setWhatsAppProgress(60 + Math.round((i / newParticipants.length) * 40));
      }

      toast({
        title: 'Importação concluída!',
        description: `${imported} contatos importados de ${selectedGroups.length} grupo(s).`,
      });

      setShowWhatsAppModal(false);
    } catch (error: any) {
      toast({
        title: 'Erro na importação',
        description: error.message || 'Erro ao importar contatos do WhatsApp',
        variant: 'destructive',
      });
    } finally {
      setIsImportingWhatsApp(false);
      setWhatsAppProgress(0);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Importar Leads</CardTitle>
          <CardDescription>
            Importe leads de diferentes fontes para sua base de prospecção.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            {/* CSV Import */}
            <div className="border-2 border-dashed rounded-xl p-6 text-center hover:border-primary/50 transition-colors">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Arquivo CSV</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Importe leads de uma planilha
              </p>
              
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleCSVImport}
                className="hidden"
                id="csv-upload"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Selecionar CSV
              </Button>

              {isImporting && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Importando...</span>
                    <span>{importProgress}%</span>
                  </div>
                  <Progress value={importProgress} />
                </div>
              )}
            </div>

            {/* WhatsApp Import */}
            <div 
              className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                isWhatsAppConnected 
                  ? 'hover:border-primary/50 cursor-pointer' 
                  : 'opacity-60'
              }`}
              onClick={isWhatsAppConnected ? handleOpenWhatsAppModal : undefined}
            >
              <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Grupos WhatsApp</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Importe contatos de seus grupos
              </p>
              
              {isWhatsAppConnected ? (
                <Button variant="outline" onClick={handleOpenWhatsAppModal}>
                  <Users className="h-4 w-4 mr-2" />
                  Selecionar Grupos
                </Button>
              ) : (
                <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4" />
                  <span>Conecte o WhatsApp primeiro</span>
                </div>
              )}
            </div>
          </div>

          {/* CSV Format Help */}
          <div className="mt-6 bg-muted/50 rounded-lg p-4">
            <h4 className="font-medium mb-2">Formato esperado do CSV:</h4>
            <code className="text-sm text-muted-foreground block whitespace-pre-wrap">
              Nome,Telefone,Nicho,Cidade{'\n'}
              "Restaurante do João","11999998888","Restaurantes","São Paulo"{'\n'}
              "Clínica Saúde","11988887777","Clínicas","São Paulo"
            </code>
          </div>
        </CardContent>
      </Card>

      {/* WhatsApp Groups Modal */}
      <Dialog open={showWhatsAppModal} onOpenChange={setShowWhatsAppModal}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              Importar Contatos do WhatsApp
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto py-4 space-y-4">
            {isLoadingGroups ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                <p className="text-muted-foreground">Buscando grupos...</p>
              </div>
            ) : groups.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Nenhum grupo encontrado</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  Selecione os grupos para importar os participantes como leads:
                </p>

                <div className="space-y-2">
                  {groups.map((group) => (
                    <div
                      key={group.id}
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedGroups.includes(group.id)
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => toggleGroupSelection(group.id)}
                    >
                      <Checkbox
                        checked={selectedGroups.includes(group.id)}
                        onCheckedChange={() => toggleGroupSelection(group.id)}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{group.name}</p>
                        {group.description && (
                          <p className="text-xs text-muted-foreground truncate">
                            {group.description}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Users className="h-4 w-4" />
                        <span>{group.memberCount}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">
                    Nicho/Tag (opcional)
                  </label>
                  <Input
                    placeholder="Ex: Marketing Digital"
                    value={customNiche}
                    onChange={(e) => setCustomNiche(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Se não definido, usará o nome do grupo como nicho
                  </p>
                </div>
              </>
            )}

            {isImportingWhatsApp && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Importando contatos...</span>
                  <span>{whatsAppProgress}%</span>
                </div>
                <Progress value={whatsAppProgress} />
              </div>
            )}
          </div>

          <DialogFooter className="border-t pt-4">
            <div className="flex items-center justify-between w-full">
              <div className="text-sm text-muted-foreground">
                {selectedGroups.length > 0 && (
                  <span>
                    {selectedGroups.length} grupo(s) · ~{getTotalSelectedMembers()} contatos
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowWhatsAppModal(false)}
                  disabled={isImportingWhatsApp}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={handleWhatsAppImport}
                  disabled={selectedGroups.length === 0 || isImportingWhatsApp}
                >
                  {isImportingWhatsApp ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Importar Contatos
                </Button>
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

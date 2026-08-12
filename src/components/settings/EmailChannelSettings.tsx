import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useToast } from '@/hooks/use-toast';
import { Mail, Info } from 'lucide-react';

/**
 * Remetente do canal de e-mail.
 *
 * Sem isto o envio sai do domínio de teste do provedor. Funciona para
 * conferir se a integração está de pé e não funciona para prospectar: e-mail
 * frio saindo de um domínio compartilhado de sandbox vai para spam, e leva
 * junto a reputação de quem manda.
 *
 * O domínio precisa estar verificado no provedor — a verificação é lá, não
 * aqui, e é o que autoriza este endereço a existir.
 */
export function EmailChannelSettings() {
  const { settings, updateSettings, isUpdating } = useUserSettings();
  const { toast } = useToast();

  const [from, setFrom] = useState('');
  const [replyTo, setReplyTo] = useState('');

  useEffect(() => {
    if (!settings) return;
    const s = settings as { email_from?: string | null; email_reply_to?: string | null };
    setFrom(s.email_from ?? '');
    setReplyTo(s.email_reply_to ?? '');
  }, [settings]);

  const salvar = () => {
    updateSettings({
      email_from: from.trim() || null,
      email_reply_to: replyTo.trim() || null,
    } as never);
    toast({ title: 'Remetente salvo' });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Mail className="h-4 w-4 text-primary" />
          Canal de e-mail
        </CardTitle>
        <CardDescription>
          De qual endereço as missões por e-mail saem, e para onde a resposta volta.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="email_from" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Remetente
            </Label>
            <Input
              id="email_from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              placeholder="Ana da Nexa <ana@suaempresa.com.br>"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email_reply_to" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Responder para
            </Label>
            <Input
              id="email_reply_to"
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="comercial@suaempresa.com.br"
            />
          </div>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs leading-relaxed">
            O domínio precisa estar verificado no provedor de envio. Sem remetente próprio, a
            mensagem sai do domínio de teste — dá para conferir se a integração funciona, mas não
            para prospectar: e-mail frio de domínio compartilhado vai para spam e leva junto a
            reputação de quem manda. O endereço de "responder para" também é o que aparece no
            cabeçalho de descadastro em um clique.
          </AlertDescription>
        </Alert>

        <Button onClick={salvar} disabled={isUpdating}>Salvar remetente</Button>
      </CardContent>
    </Card>
  );
}

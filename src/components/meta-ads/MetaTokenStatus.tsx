import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  accessToken: string | null | undefined;
  onReconnect: () => void;
}

interface TokenInfo {
  is_valid: boolean;
  expires_at: number | null;
  scopes: string[];
}

export function MetaTokenStatus({ accessToken, onReconnect }: Props) {
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const check = async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('meta-ads', {
        body: { action: 'debug_token', access_token: accessToken },
      });
      if (error) throw error;
      setInfo(data);
    } catch {
      setInfo({ is_valid: false, expires_at: null, scopes: [] });
    }
    setLoading(false);
  };

  useEffect(() => { void check(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [accessToken]);

  if (!accessToken) return null;
  if (!info) {
    return (
      <Alert>
        <RefreshCw className="h-4 w-4 animate-spin" />
        <AlertDescription>Verificando validade do token...</AlertDescription>
      </Alert>
    );
  }

  const now = Date.now();
  const daysLeft = info.expires_at ? Math.floor((info.expires_at - now) / 86400000) : null;
  const neverExpires = info.expires_at === null && info.is_valid;

  // Invalid token
  if (!info.is_valid) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Token expirado ou inválido</AlertTitle>
        <AlertDescription className="flex items-center gap-3 flex-wrap">
          <span>O token do Meta Ads não está mais válido. Gere um novo em business.facebook.com.</span>
          <Button size="sm" variant="outline" onClick={onReconnect}>Reconectar</Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Expiring soon (< 7 days)
  if (daysLeft !== null && daysLeft < 7) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Token expira em {daysLeft} dia{daysLeft === 1 ? '' : 's'}</AlertTitle>
        <AlertDescription className="flex items-center gap-3 flex-wrap">
          <span>Renove agora para evitar interrupção nas campanhas.</span>
          <Button size="sm" variant="outline" onClick={onReconnect}>Renovar token</Button>
          <Button size="sm" variant="ghost" onClick={check} disabled={loading}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Verificar
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  // Valid, > 7 days or never expires
  return (
    <Alert className="border-success/30 bg-success/5">
      <CheckCircle2 className="h-4 w-4 text-success" />
      <AlertTitle className="text-success dark:text-success">Token válido</AlertTitle>
      <AlertDescription>
        {neverExpires
          ? 'Este token não expira automaticamente.'
          : `Expira em ${daysLeft} dias. ${info.scopes?.length || 0} permissões concedidas.`}
      </AlertDescription>
    </Alert>
  );
}

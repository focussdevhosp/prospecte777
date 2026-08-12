import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, Loader2, ShieldOff } from 'lucide-react';
import logoImg from '@/assets/logo.webp';

// ============================================================
// SAIR DA LISTA SEM PEDIR LICENÇA A NINGUÉM
// ============================================================
// Esta é a única tela do produto que funciona SEM LOGIN, e isso é o ponto:
// se sair da lista exigisse que a empresa atendesse um pedido, quem quer sair
// ficaria preso ao interesse de quem não quer perdê-lo.
//
// Duas decisões que parecem descuido e não são:
//
// 1. A resposta é a MESMA achando ou não o contato. Dizer "esse número não
//    está na nossa base" para quem não fez login transformaria o descadastro
//    numa forma de descobrir quem está cadastrado — e aí a tela vira
//    ferramenta de quem quer justamente o contrário dela.
//
// 2. O bloqueio vale para TODOS OS CANAIS. Do lado de quem recebe não existe
//    diferença entre WhatsApp e e-mail: é a mesma empresa insistindo.

export default function UnsubscribePage() {
  const [identificador, setIdentificador] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async () => {
    const valor = identificador.trim();
    if (valor.length < 5) {
      setErro('Digite o telefone completo com DDD, ou o e-mail.');
      return;
    }

    setEnviando(true);
    setErro(null);

    const { error } = await supabase.rpc('public_unsubscribe', {
      p_identifier: valor,
      p_source: 'página pública de descadastro',
    });

    setEnviando(false);

    if (error) {
      setErro('Não foi possível concluir agora. Tente de novo em alguns minutos.');
      return;
    }

    setPronto(true);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <img src={logoImg} alt="" className="h-8 w-8 rounded-xl object-contain" width={32} height={32} />
          <span className="text-base font-bold tracking-tight">NexaProspect</span>
        </div>

        <Card className="page-enter">
          <CardContent className="p-6 sm:p-8">
            {pronto ? (
              <div className="text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-success/15">
                  <CheckCircle2 className="h-6 w-6 text-success" />
                </div>
                <h1 className="text-xl font-bold tracking-tight">Pedido registrado</h1>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                  Esse contato não vai mais receber mensagens nossas — em nenhum canal, nem por
                  WhatsApp, nem por e-mail.
                </p>
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  Se ainda chegar alguma mensagem já em fila nos próximos minutos, ela para logo
                  em seguida. Não é preciso fazer nada além disto.
                </p>
              </div>
            ) : (
              <>
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
                  <ShieldOff className="h-6 w-6 text-muted-foreground" />
                </div>

                <h1 className="text-xl font-bold tracking-tight">Não quero mais receber mensagens</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Informe o telefone ou o e-mail que recebe as mensagens. O bloqueio vale para
                  todos os canais e não tem prazo.
                </p>

                <div className="mt-6 space-y-2">
                  <Label htmlFor="identificador" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Telefone ou e-mail
                  </Label>
                  <Input
                    id="identificador"
                    value={identificador}
                    onChange={(e) => { setIdentificador(e.target.value); setErro(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && enviar()}
                    placeholder="(11) 99999-9999 ou voce@empresa.com.br"
                    autoComplete="off"
                    aria-invalid={!!erro}
                    aria-describedby={erro ? 'erro-descadastro' : undefined}
                  />
                  {erro && (
                    <p id="erro-descadastro" className="text-xs text-destructive">{erro}</p>
                  )}
                </div>

                <Button className="mt-5 w-full" onClick={enviar} disabled={enviando}>
                  {enviando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Descadastrar
                </Button>

                <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
                  Não pedimos login nem confirmação por e-mail. Quem quer sair não deveria precisar
                  provar nada para conseguir.
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

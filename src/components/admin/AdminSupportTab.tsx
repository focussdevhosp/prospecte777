import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAdminSupport } from '@/hooks/use-admin';
import { useToast } from '@/hooks/use-toast';
import {
  Headphones, MessageSquare, Loader2, Send, CheckCircle2,
  Clock, User, ShieldCheck, ChevronRight, XCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function AdminSupportTab() {
  const { tickets, loadingTickets, replyToTicket, isReplying, closeTicket, isClosingTicket } = useAdminSupport();
  const { toast } = useToast();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const selectedTicket = tickets.find(t => t.id === selectedTicketId);
  const openTickets = tickets.filter(t => t.status === 'open');
  const closedTickets = tickets.filter(t => t.status === 'closed');

  const handleReply = () => {
    if (!selectedTicketId || !replyText.trim()) return;
    replyToTicket({ ticketId: selectedTicketId, content: replyText }, {
      onSuccess: () => {
        toast({ title: '✓ Resposta enviada' });
        setReplyText('');
      },
      onError: (err: any) => {
        toast({ title: 'Erro', description: err.message, variant: 'destructive' });
      },
    });
  };

  const handleClose = (ticketId: string) => {
    closeTicket(ticketId, {
      onSuccess: () => {
        toast({ title: '✓ Ticket fechado' });
        setSelectedTicketId(null);
      },
      onError: (err: any) => {
        toast({ title: 'Erro', description: err.message, variant: 'destructive' });
      },
    });
  };

  if (loadingTickets) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando tickets...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-warning/10">
                <Clock className="h-4 w-4 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tickets Abertos</p>
                <p className="text-xl font-bold">{openTickets.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-success/10">
                <CheckCircle2 className="h-4 w-4 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Tickets Fechados</p>
                <p className="text-xl font-bold">{closedTickets.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Ticket List */}
        <Card className="border-border/50 lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Headphones className="h-4 w-4 text-primary" />
              Tickets de Suporte
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[500px]">
              {tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2 px-4">
                  <Headphones className="h-8 w-8 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">Nenhum ticket ainda</p>
                </div>
              ) : (
                <div className="divide-y divide-border/50">
                  {tickets.map((ticket) => (
                    <button
                      key={ticket.id}
                      className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
                        selectedTicketId === ticket.id ? 'bg-primary/5 border-l-2 border-primary' : ''
                      }`}
                      onClick={() => setSelectedTicketId(ticket.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{ticket.subject}</p>
                          <p className="text-xs text-muted-foreground truncate">{ticket.user_name || ticket.user_email || 'Usuário'}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true, locale: ptBR })}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          {ticket.status === 'open' ? (
                            <Badge variant="outline" className="text-[10px] text-warning border-warning/30">Aberto</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">Fechado</Badge>
                          )}
                          <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Ticket Detail / Chat */}
        <Card className="border-border/50 lg:col-span-2">
          {selectedTicket ? (
            <>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">{selectedTicket.subject}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedTicket.user_name || selectedTicket.user_email} • {selectedTicket.status === 'open' ? 'Aberto' : 'Fechado'}
                    </p>
                  </div>
                  {selectedTicket.status === 'open' && (
                    <Button variant="outline" size="sm" onClick={() => handleClose(selectedTicket.id)} disabled={isClosingTicket} className="gap-1 text-xs">
                      <XCircle className="h-3.5 w-3.5" />
                      Fechar Ticket
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[350px] px-4">
                  <div className="space-y-3 py-3">
                    {(selectedTicket.support_messages || [])
                      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
                      .map((msg) => (
                        <div
                          key={msg.id}
                          className={`flex ${msg.sender_type === 'admin' ? 'justify-end' : 'justify-start'}`}
                        >
                          <div className={`max-w-[75%] rounded-xl px-4 py-2.5 ${
                            msg.sender_type === 'admin'
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-muted'
                          }`}>
                            <div className="flex items-center gap-1.5 mb-1">
                              {msg.sender_type === 'admin' ? (
                                <ShieldCheck className="h-3 w-3" />
                              ) : (
                                <User className="h-3 w-3" />
                              )}
                              <span className="text-[10px] font-medium opacity-75">
                                {msg.sender_type === 'admin' ? 'Admin' : 'Usuário'}
                              </span>
                            </div>
                            <p className="text-sm">{msg.content}</p>
                            <p className={`text-[10px] mt-1 ${msg.sender_type === 'admin' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                              {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ptBR })}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </ScrollArea>

                {selectedTicket.status === 'open' && (
                  <div className="p-4 border-t border-border/50">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Digite sua resposta..."
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleReply()}
                        className="flex-1"
                      />
                      <Button onClick={handleReply} disabled={isReplying || !replyText.trim()} size="icon">
                        {isReplying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </>
          ) : (
            <CardContent className="flex flex-col items-center justify-center py-20 gap-3">
              <MessageSquare className="h-10 w-10 text-muted-foreground/20" />
              <p className="text-sm text-muted-foreground">Selecione um ticket para ver a conversa</p>
            </CardContent>
          )}
        </Card>
      </div>
    </div>
  );
}

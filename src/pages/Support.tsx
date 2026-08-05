import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useUserSupport, useTicketMessages } from '@/hooks/use-support';
import { useToast } from '@/hooks/use-toast';
import {
  Headphones, Plus, Send, Loader2, MessageSquare, Clock, CheckCircle2,
  Bell, ChevronRight, User, ShieldCheck, Inbox,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function SupportPage() {
  const { tickets, notifications, loadingTickets, loadingNotifications, createTicket, isCreatingTicket, sendMessage, isSendingMessage, markNotificationRead } = useUserSupport();
  const { toast } = useToast();
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  const { data: messages, isLoading: loadingMessages } = useTicketMessages(selectedTicketId);

  const unreadNotifications = notifications.filter(n => !n.is_read);

  const handleCreateTicket = () => {
    if (!subject.trim() || !message.trim()) return;
    createTicket({ subject, message }, {
      onSuccess: () => {
        toast({ title: '✓ Ticket criado', description: 'Sua mensagem foi enviada ao suporte.' });
        setShowNewTicket(false);
        setSubject('');
        setMessage('');
      },
      onError: (err: any) => {
        toast({ title: 'Erro', description: err.message, variant: 'destructive' });
      },
    });
  };

  const handleSendReply = () => {
    if (!selectedTicketId || !replyText.trim()) return;
    sendMessage({ ticketId: selectedTicketId, content: replyText }, {
      onSuccess: () => {
        setReplyText('');
      },
      onError: (err: any) => {
        toast({ title: 'Erro', description: err.message, variant: 'destructive' });
      },
    });
  };

  return (
    <DashboardLayout title="Suporte" description="Fale com nossa equipe de suporte">
      <div className="space-y-6 animate-fade-in">
        {/* Admin notifications */}
        {unreadNotifications.length > 0 && (
          <div className="space-y-3">
            {unreadNotifications.map((notif) => (
              <Card key={notif.id} className="border-primary/20 bg-primary/5">
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-primary/10 mt-0.5">
                        <Bell className="h-4 w-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{notif.title}</p>
                        <p className="text-sm text-muted-foreground mt-0.5">{notif.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: ptBR })}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" className="text-xs" onClick={() => markNotificationRead(notif.id)}>
                      Marcar como lida
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/20">
              <Headphones className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">Suporte</h2>
              <p className="text-xs text-muted-foreground">{tickets.length} tickets</p>
            </div>
          </div>
          <Button onClick={() => setShowNewTicket(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            Novo Ticket
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Ticket List */}
          <Card className="border-border/50 lg:col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Inbox className="h-4 w-4 text-primary" />
                Meus Tickets
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ScrollArea className="h-[450px]">
                {loadingTickets ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : tickets.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 gap-2 px-4">
                    <MessageSquare className="h-8 w-8 text-muted-foreground/30" />
                    <p className="text-sm text-muted-foreground">Nenhum ticket ainda</p>
                    <p className="text-xs text-muted-foreground">Crie um ticket para falar com o suporte</p>
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
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(ticket.updated_at), { addSuffix: true, locale: ptBR })}
                            </p>
                          </div>
                          <div className="flex items-center gap-1">
                            {ticket.status === 'open' ? (
                              <Badge variant="outline" className="text-[10px] text-warning border-warning/30">
                                <Clock className="h-3 w-3 mr-0.5" />
                                Aberto
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] text-success border-success/30">
                                <CheckCircle2 className="h-3 w-3 mr-0.5" />
                                Resolvido
                              </Badge>
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

          {/* Chat */}
          <Card className="border-border/50 lg:col-span-2">
            {selectedTicketId ? (
              <>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">
                    {tickets.find(t => t.id === selectedTicketId)?.subject || 'Ticket'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <ScrollArea className="h-[350px] px-4">
                    {loadingMessages ? (
                      <div className="flex items-center justify-center py-12">
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      </div>
                    ) : (
                      <div className="space-y-3 py-3">
                        {(messages || []).map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex ${msg.sender_type === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div className={`max-w-[75%] rounded-xl px-4 py-2.5 ${
                              msg.sender_type === 'user'
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
                                  {msg.sender_type === 'admin' ? 'Suporte' : 'Você'}
                                </span>
                              </div>
                              <p className="text-sm">{msg.content}</p>
                              <p className={`text-[10px] mt-1 ${msg.sender_type === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground'}`}>
                                {formatDistanceToNow(new Date(msg.created_at), { addSuffix: true, locale: ptBR })}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </ScrollArea>

                  {tickets.find(t => t.id === selectedTicketId)?.status === 'open' && (
                    <div className="p-4 border-t border-border/50">
                      <div className="flex gap-2">
                        <Input
                          placeholder="Digite sua mensagem..."
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendReply()}
                          className="flex-1"
                        />
                        <Button onClick={handleSendReply} disabled={isSendingMessage || !replyText.trim()} size="icon">
                          {isSendingMessage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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

      {/* New Ticket Dialog */}
      <Dialog open={showNewTicket} onOpenChange={setShowNewTicket}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5 text-primary" />
              Novo Ticket de Suporte
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-foreground">Assunto</label>
              <Input
                placeholder="Qual é o problema?"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-foreground">Mensagem</label>
              <Textarea
                placeholder="Descreva o problema em detalhes..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={5}
                className="mt-1"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewTicket(false)}>Cancelar</Button>
            <Button onClick={handleCreateTicket} disabled={isCreatingTicket || !subject.trim() || !message.trim()}>
              {isCreatingTicket ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

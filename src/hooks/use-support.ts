import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/hooks/use-toast';

export interface UserSupportTicket {
  id: string;
  subject: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface UserSupportMessage {
  id: string;
  ticket_id: string;
  sender_type: string;
  sender_id: string;
  content: string;
  created_at: string;
}

export function useUserSupport() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tickets, isLoading: loadingTickets } = useQuery({
    queryKey: ['user-support-tickets', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_tickets')
        .select('*')
        .eq('user_id', user!.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data as UserSupportTicket[];
    },
    enabled: !!user?.id,
  });

  const { data: notifications, isLoading: loadingNotifications } = useQuery({
    queryKey: ['user-admin-notifications', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('admin_notifications')
        .select('*')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const createTicketMutation = useMutation({
    mutationFn: async ({ subject, message }: { subject: string; message: string }) => {
      // Create ticket
      const { data: ticket, error: ticketError } = await supabase
        .from('support_tickets')
        .insert({ user_id: user!.id, subject })
        .select()
        .single();
      if (ticketError) throw ticketError;

      // Create first message
      const { error: msgError } = await supabase
        .from('support_messages')
        .insert({
          ticket_id: ticket.id,
          sender_id: user!.id,
          sender_type: 'user',
          content: message,
        });
      if (msgError) throw msgError;

      return ticket;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-support-tickets'] });
    },
    // Falhar calado aqui e o pior caso do produto inteiro: a pessoa acha que
    // pediu ajuda e fica esperando uma resposta que nunca vai chegar, porque
    // o chamado nao existe.
    onError: (e: Error) =>
      toast({
        title: 'O chamado nao foi aberto',
        description: `${e.message} — tente de novo, ou fale pelo WhatsApp se persistir.`,
        variant: 'destructive',
      }),
  });

  const sendMessageMutation = useMutation({
    mutationFn: async ({ ticketId, content }: { ticketId: string; content: string }) => {
      const { error } = await supabase
        .from('support_messages')
        .insert({
          ticket_id: ticketId,
          sender_id: user!.id,
          sender_type: 'user',
          content,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-messages'] });
    },
    // Mesma logica: a mensagem some do campo e a pessoa assume que foi.
    onError: (e: Error) =>
      toast({
        title: 'A mensagem nao foi enviada',
        description: e.message,
        variant: 'destructive',
      }),
  });

  const markNotificationRead = useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('admin_notifications')
        .update({ is_read: true })
        .eq('id', notificationId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-admin-notifications'] });
    },
  });

  return {
    tickets: tickets || [],
    notifications: notifications || [],
    loadingTickets,
    loadingNotifications,
    createTicket: createTicketMutation.mutate,
    isCreatingTicket: createTicketMutation.isPending,
    sendMessage: sendMessageMutation.mutate,
    isSendingMessage: sendMessageMutation.isPending,
    markNotificationRead: markNotificationRead.mutate,
  };
}

export function useTicketMessages(ticketId: string | null) {
  return useQuery({
    queryKey: ['support-messages', ticketId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('support_messages')
        .select('*')
        .eq('ticket_id', ticketId!)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data as UserSupportMessage[];
    },
    enabled: !!ticketId,
    refetchInterval: 10000,
  });
}

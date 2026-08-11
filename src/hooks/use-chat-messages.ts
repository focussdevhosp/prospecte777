import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ChatMessage, MessageSenderType } from '@/types/database';
import { useToast } from '@/hooks/use-toast';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useLead } from '@/hooks/use-leads';
import { useEffect, useCallback } from 'react';

export function useChatMessages(leadId: string | null) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { settings } = useUserSettings();
  const { data: lead } = useLead(leadId);

  const { data: messages, isLoading, error, refetch } = useQuery({
    queryKey: ['chat-messages', leadId],
    queryFn: async () => {
      if (!leadId) throw new Error('Lead ID required');

      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('lead_id', leadId)
        .order('sent_at', { ascending: true });

      if (error) throw error;
      return data as ChatMessage[];
    },
    enabled: !!leadId,
    staleTime: 1000, // Consider data stale after 1 second
    refetchInterval: 3000, // Backup polling every 3 seconds
  });

  // Handle realtime updates
  const handleRealtimeUpdate = useCallback((payload: any) => {
    console.log('💬 Chat message realtime:', payload.eventType, payload.new?.id);
    
    // Immediately refetch for this lead
    queryClient.invalidateQueries({ queryKey: ['chat-messages', leadId] });
    refetch();
    
    // Also update conversations list
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [leadId, queryClient, refetch]);

  // Subscribe to realtime updates for chat messages
  useEffect(() => {
    if (!leadId) return;

    console.log('📡 Setting up chat realtime for lead:', leadId);

    const channel = supabase
      .channel(`chat-messages-realtime-${leadId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'chat_messages',
          filter: `lead_id=eq.${leadId}`,
        },
        handleRealtimeUpdate
      )
      .subscribe((status) => {
        console.log(`📡 Chat realtime subscription status for ${leadId}:`, status);
      });

    return () => {
      console.log('📡 Cleaning up chat realtime for lead:', leadId);
      supabase.removeChannel(channel);
    };
  }, [leadId, handleRealtimeUpdate]);

  const sendMessage = useMutation({
    mutationFn: async ({ content, senderType }: { content: string; senderType: MessageSenderType }) => {
      if (!leadId) throw new Error('Lead ID required');
      if (!lead) throw new Error('Lead not found');

      // If it's a user/agent message and WhatsApp is connected, send via WhatsApp first
      if ((senderType === 'user' || senderType === 'agent') && settings?.whatsapp_connected && settings?.whatsapp_instance_id) {
        console.log('📤 Sending message via WhatsApp to:', lead.phone);
        
        const whatsappResponse = await supabase.functions.invoke('whatsapp-send', {
          body: {
            phone: lead.phone,
            message: content,
            instance_id: settings.whatsapp_instance_id,
            // Uma pessoa escreveu esta mensagem e clicou em enviar agora. A
            // parada de emergência existe para a máquina parar de agir
            // sozinha, não para impedir alguém de responder um cliente que
            // está do outro lado esperando.
            initiated_by: 'human',
          },
        });

        if (whatsappResponse.error) {
          console.error('WhatsApp send error:', whatsappResponse.error);
          throw new Error(`Erro ao enviar WhatsApp: ${whatsappResponse.error.message}`);
        }

        console.log('✅ WhatsApp response:', whatsappResponse.data);
      } else if (senderType === 'user' || senderType === 'agent') {
        console.warn('⚠️ WhatsApp not connected - message will only be saved locally');
        toast({
          title: 'Atenção',
          description: 'WhatsApp não conectado. A mensagem foi salva mas não enviada.',
          variant: 'destructive',
        });
      }

      // Save message to database
      const { data, error } = await supabase
        .from('chat_messages')
        .insert({
          lead_id: leadId,
          content,
          sender_type: senderType,
          status: settings?.whatsapp_connected ? 'sent' : 'pending',
        })
        .select()
        .single();

      if (error) throw error;

      // Update lead's last_contact_at
      await supabase
        .from('leads')
        .update({ last_contact_at: new Date().toISOString() })
        .eq('id', leadId);

      return data as ChatMessage;
    },
    onMutate: async ({ content, senderType }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['chat-messages', leadId] });

      // Snapshot previous value
      const previousMessages = queryClient.getQueryData(['chat-messages', leadId]);

      // Optimistically update to the new value
      queryClient.setQueryData(['chat-messages', leadId], (old: ChatMessage[] = []) => [
        ...old,
        {
          id: `temp-${Date.now()}`,
          lead_id: leadId,
          content,
          sender_type: senderType,
          sent_at: new Date().toISOString(),
          status: 'sending',
          created_at: new Date().toISOString(),
        },
      ]);

      return { previousMessages };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', leadId] });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      
      toast({
        title: '✓ Mensagem enviada',
        description: 'A mensagem foi enviada com sucesso.',
      });
    },
    onError: (error, _, context) => {
      // Rollback on error
      if (context?.previousMessages) {
        queryClient.setQueryData(['chat-messages', leadId], context.previousMessages);
      }
      
      toast({
        title: 'Erro ao enviar mensagem',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return {
    messages: messages || [],
    isLoading,
    error,
    sendMessage: sendMessage.mutate,
    isSending: sendMessage.isPending,
    refetch,
  };
}

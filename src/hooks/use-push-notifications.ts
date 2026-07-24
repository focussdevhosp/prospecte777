import { useState, useEffect, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface NotificationData {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  data?: Record<string, any>;
  actions?: { action: string; title: string }[];
  requireInteraction?: boolean;
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) out[i] = raw.charCodeAt(i);
  return out;
}

export function usePushNotifications() {
  const { toast } = useToast();
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSupported, setIsSupported] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const registerServiceWorker = useCallback(async () => {
    if (!('serviceWorker' in navigator)) return null;
    if (swRegistration) return swRegistration;
    try {
      const registration = await navigator.serviceWorker.register('/sw-notifications.js');
      setSwRegistration(registration);
      const existing = await registration.pushManager.getSubscription();
      setIsSubscribed(!!existing);
      return registration;
    } catch {
      return null;
    }
  }, [swRegistration]);

  useEffect(() => {
    const supported = 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
    setIsSupported(supported);
    if (!supported) return;
    setPermission(Notification.permission);
    if (Notification.permission === 'granted') void registerServiceWorker();
  }, [registerServiceWorker]);

  const subscribeToPush = useCallback(async (registration: ServiceWorkerRegistration) => {
    try {
      // fetch VAPID public key from edge function
      const { data: keyRes, error: keyErr } = await supabase.functions.invoke('save-push-subscription', {
        body: { action: 'get_public_key' },
      });
      if (keyErr || !keyRes?.publicKey) throw new Error('VAPID key indisponível');

      let sub = await registration.pushManager.getSubscription();
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyRes.publicKey),
        });
      }

      const subJson = sub.toJSON();
      const { error: saveErr } = await supabase.functions.invoke('save-push-subscription', {
        body: {
          action: 'subscribe',
          subscription: {
            endpoint: subJson.endpoint,
            keys: subJson.keys,
          },
        },
      });
      if (saveErr) throw saveErr;
      setIsSubscribed(true);
      return true;
    } catch (e) {
      console.error('Push subscribe failed:', e);
      return false;
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      toast({ title: 'Não suportado', description: 'Seu navegador não suporta push.', variant: 'destructive' });
      return false;
    }
    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result === 'granted') {
        const reg = await registerServiceWorker();
        if (reg) {
          const ok = await subscribeToPush(reg);
          toast({
            title: ok ? '✓ Notificações ativadas' : '⚠ Permissão OK, mas falha ao inscrever',
            description: ok
              ? 'Você receberá alertas mesmo com o app fechado.'
              : 'Tente novamente em instantes.',
            variant: ok ? 'default' : 'destructive',
          });
          return ok;
        }
        return true;
      }
      if (result === 'denied') {
        toast({ title: 'Notificações bloqueadas', description: 'Reative nas configs do navegador.', variant: 'destructive' });
      }
      return false;
    } catch {
      return false;
    }
  }, [isSupported, registerServiceWorker, subscribeToPush, toast]);

  const sendNotification = useCallback((data: NotificationData) => {
    if (permission !== 'granted') return;
    if (swRegistration) {
      swRegistration.showNotification(data.title, {
        body: data.body,
        icon: data.icon || '/logo.png',
        badge: '/logo.png',
        tag: data.tag || 'prospecte-notification',
        data: data.data,
        requireInteraction: data.requireInteraction,
      });
      return;
    }
    new Notification(data.title, {
      body: data.body,
      icon: data.icon || '/logo.png',
      tag: data.tag,
      data: data.data,
    });
  }, [permission, swRegistration]);

  const notifyJobComplete = useCallback((jobType: string, result: { processed: number; failed: number }) => {
    sendNotification({
      title: '✓ Tarefa concluída',
      body: `${jobType}: ${result.processed} processados, ${result.failed} falhas`,
      tag: 'job-complete',
    });
  }, [sendNotification]);

  const notifyLeadResponse = useCallback((leadName: string, leadId: string) => {
    sendNotification({
      title: '💬 Nova resposta!',
      body: `${leadName} respondeu sua mensagem`,
      tag: `lead-${leadId}`,
      data: { type: 'lead_response', leadId },
      requireInteraction: true,
    });
  }, [sendNotification]);

  const notifyFollowUpDue = useCallback((leadName: string, leadId: string) => {
    sendNotification({
      title: '⏰ Follow-up pendente',
      body: `Hora de entrar em contato com ${leadName}`,
      tag: `followup-${leadId}`,
      data: { type: 'followup_due', leadId },
    });
  }, [sendNotification]);

  return {
    isSupported,
    isSubscribed,
    permission,
    requestPermission,
    sendNotification,
    notifyJobComplete,
    notifyLeadResponse,
    notifyFollowUpDue,
  };
}

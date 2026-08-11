import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// ============================================================
// CLIENTE SUPABASE
// ============================================================
// A URL e a chave vinham fixas neste arquivo, e o `.env` do repositório —
// que parecia ser a configuração — não tinha efeito nenhum. Quem editasse o
// `.env` esperando apontar para outro banco continuava batendo no mesmo.
//
// Agora valem as variáveis de ambiente, e os valores abaixo são só reserva:
// o mesmo projeto de sempre, para o app subir em desenvolvimento sem `.env`.
// Apontar para outro banco passou a ser configuração, não edição de código.
//
// Só entra aqui chave PUBLICÁVEL (anon). Em projeto Vite, tudo que começa
// com VITE_ é embutido no bundle que vai para o navegador — a chave
// `service_role` jamais pode passar por este arquivo. Ela vive só nos
// secrets das edge functions.

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://oeztpxyprifabkvysroh.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9lenRweHlwcmlmYWJrdnlzcm9oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMTIyODAsImV4cCI6MjA4NTg4ODI4MH0.rGGWHPQTpMsyFPnSBw9XkaDEdmHlcaJJo8tJtfg3IaA';

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
  throw new Error(
    'Supabase não configurado. Defina VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.',
  );
}

/**
 * Falha cedo se alguém colar aqui uma chave `service_role`: ela ignora RLS
 * e, num bundle Vite, iria para o navegador de todo visitante do site.
 *
 * O payload do JWT é base64url (usa `-` e `_`), que o `atob` rejeita — daí
 * a troca antes de decodificar. Qualquer erro de formato é ignorado: esta
 * checagem é uma rede de proteção, não pode ser o motivo de o app não subir.
 */
function isServiceRoleKey(key: string): boolean {
  const payload = key.split('.')[1];
  if (!payload) return false; // formato sb_publishable_..., não é JWT

  try {
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded)?.role === 'service_role';
  } catch {
    return false;
  }
}

if (isServiceRoleKey(SUPABASE_PUBLISHABLE_KEY)) {
  throw new Error(
    'A chave configurada é service_role, que nunca pode ir para o frontend. ' +
      'Use a chave publicável (anon).',
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

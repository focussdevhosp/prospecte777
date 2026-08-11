import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// ============================================================
// CLIENTE SUPABASE
// ============================================================
// A URL e a chave vinham fixas neste arquivo. Trocar de projeto exigia
// editar código e refazer o build — e o `.env` do repositório, que parecia
// ser a configuração, não tinha efeito nenhum.
//
// Agora valem as variáveis de ambiente. Os valores abaixo são apenas
// reserva para desenvolvimento local sem `.env`.
//
// Só entra aqui chave PUBLICÁVEL (anon). Em projeto Vite, tudo que começa
// com VITE_ é embutido no bundle que vai para o navegador — a chave
// `service_role` jamais pode passar por este arquivo. Ela vive só nos
// secrets das edge functions.

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? 'https://sciphxtbxvbpiypbcxub.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  'sb_publishable_RLg7_0prleJlR7tgiffUOQ_YyB6wy5O';

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

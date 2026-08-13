import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { anunciarVersao } from '@/lib/build-info';

// ============================================================
// CLIENTE SUPABASE
// ============================================================
// QUEM MANDA AQUI É O CÓDIGO, E A VARIÁVEL DE AMBIENTE CONFERE
//
// A versão anterior fazia o contrário: a variável mandava, e havia uma LISTA
// DE PROJETOS ABANDONADOS para desviar do caso conhecido. Isso tinha três
// problemas, e o terceiro é o que dói:
//
//   1. era lista para alguém manter — cada migração de banco exigia lembrar
//      de acrescentar o ref antigo, e esquecer significava quebra silenciosa;
//   2. só pegava o UM endereço já conhecido. Se a plataforma de deploy
//      apontasse para um terceiro projeto (outro produto, um typo), passava
//      direto e o app quebrava inteiro sem pista;
//   3. parecia código morto. Um `PROJETOS_ABANDONADOS` com um item lá dentro
//      é exatamente o tipo de coisa que alguém apaga numa limpeza — e aí o
//      app volta a apontar para o banco errado, em silêncio.
//
// A regra agora é outra e não precisa de lista: ESTE CÓDIGO SÓ FUNCIONA
// CONTRA O PROJETO PARA O QUAL FOI GERADO. O `types.ts` deste repositório é
// gerado a partir de um projeto específico; as migrações foram aplicadas
// nele; as functions estão publicadas nele. Apontar para outro banco sem
// regerar tudo isso não é configuração — é defeito.
//
// Então o ref mora aqui, e `VITE_SUPABASE_URL` vira CONFERÊNCIA: se
// discordar, o app avisa alto e usa o do código. Trocar de projeto continua
// possível e passa a ser o que sempre foi de verdade: uma mudança de código,
// junto com o `types.ts` novo.
//
// Só entra aqui chave PUBLICÁVEL (anon). Em projeto Vite, tudo que começa
// com VITE_ é embutido no bundle que vai para o navegador — a chave
// `service_role` jamais pode passar por este arquivo. Ela vive só nos
// secrets das edge functions.

/** Projeto para o qual este schema, estes tipos e estas functions existem. */
const PROJETO = 'sciphxtbxvbpiypbcxub';

const SUPABASE_URL = `https://${PROJETO}.supabase.co`;
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_RLg7_0prleJlR7tgiffUOQ_YyB6wy5O';

/** Extrai `abcdefgh` de `https://abcdefgh.supabase.co`. */
export function refDoProjeto(url: string | undefined | null): string | null {
  const m = String(url ?? '').match(/https:\/\/([a-z0-9]+)\.supabase\.co/i);
  return m ? m[1] : null;
}

const refDoAmbiente = refDoProjeto(import.meta.env.VITE_SUPABASE_URL as string | undefined);

if (refDoAmbiente && refDoAmbiente !== PROJETO) {
  // `error`, não `warn`: o app segue funcionando por causa desta linha, mas a
  // configuração do deploy está errada e alguém precisa consertar na origem.
  // Aviso discreto some no meio do console e a divergência atravessa meses.
  console.error(
    `[supabase] A plataforma de deploy manda VITE_SUPABASE_URL para o projeto ` +
      `"${refDoAmbiente}", mas este código foi gerado para "${PROJETO}". ` +
      `Usando "${PROJETO}", que é onde as tabelas e as functions estão. ` +
      `Corrija VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY na plataforma ` +
      `para o app parar de depender desta correção.`,
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

// Anuncia antes de conectar: se a conexão falhar, a linha já saiu, e ela é
// justamente a que diz contra qual banco a tentativa foi feita.
anunciarVersao(SUPABASE_URL);

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});

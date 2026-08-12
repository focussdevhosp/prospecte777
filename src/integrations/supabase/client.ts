import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// ============================================================
// CLIENTE SUPABASE
// ============================================================
// A URL e a chave vinham fixas neste arquivo, e o `.env` do repositório —
// que parecia ser a configuração — não tinha efeito nenhum. Quem editasse o
// `.env` esperando apontar para outro banco continuava batendo no mesmo.
//
// Agora valem as variáveis de ambiente, e os valores abaixo são a reserva.
//
// Só entra aqui chave PUBLICÁVEL (anon). Em projeto Vite, tudo que começa
// com VITE_ é embutido no bundle que vai para o navegador — a chave
// `service_role` jamais pode passar por este arquivo. Ela vive só nos
// secrets das edge functions.

/** Projeto para o qual este schema foi construído e aplicado. */
const PROJETO_ATUAL = 'sciphxtbxvbpiypbcxub';
const URL_ATUAL = `https://${PROJETO_ATUAL}.supabase.co`;
const CHAVE_ATUAL = 'sb_publishable_RLg7_0prleJlR7tgiffUOQ_YyB6wy5O';

/**
 * Projetos que este app JÁ usou e não usa mais.
 *
 * A plataforma de deploy injeta `VITE_SUPABASE_*` a partir da configuração
 * dela, que é editada em outro lugar e pode ficar para trás. Quando isso
 * acontece, a variável — que existe para dar flexibilidade — passa a apontar
 * para um banco onde as tabelas deste código não existem, e o app quebra
 * inteiro sem nenhuma pista de por quê.
 *
 * Foi exatamente o que houve: o build continuou mandando o endereço antigo
 * depois da migração, e a tela de login morreu com um erro de cota de um
 * projeto que nem é mais o nosso.
 *
 * Variável de ambiente continua tendo a palavra final para qualquer destino
 * NOVO — trocar de banco segue sendo configuração. O que ela não pode mais
 * fazer é ressuscitar um destino que já foi abandonado.
 */
const PROJETOS_ABANDONADOS = ['oeztpxyprifabkvysroh'];

function ehAbandonado(url: string | undefined): boolean {
  if (!url) return false;
  return PROJETOS_ABANDONADOS.some((ref) => url.includes(ref));
}

const urlDoAmbiente = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const ambienteEstaVelho = ehAbandonado(urlDoAmbiente);

if (ambienteEstaVelho) {
  // Aviso alto e específico: quem abrir o console precisa saber que a
  // configuração do deploy está desatualizada, mesmo com o app funcionando.
  console.warn(
    `[supabase] VITE_SUPABASE_URL aponta para ${urlDoAmbiente}, que é um ` +
      `projeto abandonado. Usando ${URL_ATUAL}. Atualize as variáveis na ` +
      `plataforma de deploy para remover este aviso.`,
  );
}

const SUPABASE_URL = ambienteEstaVelho ? URL_ATUAL : (urlDoAmbiente ?? URL_ATUAL);

// A chave acompanha a URL: chave de um projeto não abre outro. Se o endereço
// do ambiente foi descartado, a chave dele também precisa ser.
const SUPABASE_PUBLISHABLE_KEY = ambienteEstaVelho
  ? CHAVE_ATUAL
  : ((import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? CHAVE_ATUAL);

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

// ============================================================
// QUAL VERSÃO ESTÁ RODANDO, E CONTRA QUAL BANCO
// ============================================================
// Duas perguntas custaram horas nesta operação, e as duas não tinham como ser
// respondidas olhando a tela:
//
//   "o app está com o código novo ou é cache antigo?"
//   "ele está falando com qual projeto do Supabase?"
//
// A primeira só se respondia comparando hash de arquivo; a segunda, abrindo a
// aba Network e lendo o host das requisições. As duas exigem alguém que saiba
// onde procurar — e o resultado foi um erro de cota de um banco que nem era
// mais o nosso, sem ninguém conseguir dizer por quê.
//
// Uma linha no console resolve as duas para sempre.

declare const __BUILD_ID__: string;

/** Quando este bundle foi construído. Injetado pelo Vite. */
export const BUILD_ID: string =
  typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'desenvolvimento';

/**
 * Anuncia versão e destino no console, uma vez, na abertura.
 *
 * Não é log de depuração para ser removido depois: é o que transforma
 * "não está funcionando" em um diagnóstico de dez segundos.
 */
export function anunciarVersao(supabaseUrl: string): void {
  const host = supabaseUrl.replace(/^https?:\/\//, '').replace(/\.supabase\.co.*$/, '');

  console.info(
    `%c Nexa Prospect %c build ${BUILD_ID} %c banco ${host} `,
    'background:#7c3aed;color:#fff;border-radius:3px 0 0 3px;padding:2px 6px',
    'background:#1f2937;color:#e5e7eb;padding:2px 6px',
    'background:#065f46;color:#d1fae5;border-radius:0 3px 3px 0;padding:2px 6px',
  );
}

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ------------------------------------------------------------
// O app precisa falar com o banco onde o schema dele existe
// ------------------------------------------------------------
// A plataforma de deploy injeta `VITE_SUPABASE_*` a partir da configuração
// dela, editada em outro lugar. Quando essa configuração fica para trás, o
// app aponta para um banco onde as tabelas deste código não existem — e
// quebra inteiro, sem pista de por quê.
//
// Aconteceu: o build continuou mandando o endereço antigo depois da
// migração, e a tela de login morreu com erro de cota de um projeto que nem
// era mais o nosso.
//
// Estes testes leem o arquivo em vez de importá-lo porque `client.ts` cria a
// conexão na importação — carregá-lo aqui abriria um cliente de verdade.

const fonte = readFileSync(
  resolve(__dirname, '../integrations/supabase/client.ts'),
  'utf8',
);

const PROJETO_ATUAL = 'sciphxtbxvbpiypbcxub';
const PROJETO_ANTIGO = 'oeztpxyprifabkvysroh';

describe('destino do cliente Supabase', () => {
  it('a reserva aponta para o projeto onde o schema foi aplicado', () => {
    expect(fonte).toContain(`const PROJETO_ATUAL = '${PROJETO_ATUAL}'`);
  });

  it('o projeto antigo está marcado como abandonado, não como destino', () => {
    // Ele ainda aparece no arquivo — precisa aparecer, é o que a guarda
    // reconhece. O que não pode é ser o valor de `PROJETO_ATUAL`.
    expect(fonte).toContain(`PROJETOS_ABANDONADOS = ['${PROJETO_ANTIGO}']`);
    expect(fonte).not.toContain(`const PROJETO_ATUAL = '${PROJETO_ANTIGO}'`);
  });

  it('a variável de ambiente é ignorada quando aponta para abandonado', () => {
    expect(fonte).toContain('ambienteEstaVelho');
    expect(fonte).toMatch(/ambienteEstaVelho \? URL_ATUAL/);
  });

  it('a chave é descartada junto com a URL', () => {
    // Chave de um projeto não abre outro. Descartar só o endereço deixaria o
    // app tentando entrar no banco certo com a credencial do errado.
    expect(fonte).toMatch(/ambienteEstaVelho\s*\?\s*CHAVE_ATUAL/);
  });

  it('avisa no console em vez de corrigir em silêncio', () => {
    // O app funciona, mas a configuração do deploy continua errada. Quem
    // abrir o console precisa poder descobrir isso.
    expect(fonte).toContain('console.warn');
    expect(fonte).toContain('projeto abandonado');
  });

  it('um destino novo e legítimo continua tendo a palavra final', () => {
    // A guarda é contra ressuscitar o que foi abandonado, não contra trocar
    // de banco — trocar segue sendo configuração, não edição de código.
    expect(fonte).toContain('urlDoAmbiente ?? URL_ATUAL');
  });

  it('nenhuma chave service_role pode passar por aqui', () => {
    expect(fonte).toContain('isServiceRoleKey');
    expect(fonte).not.toMatch(/service_role["']\s*[,)]/);
  });
});

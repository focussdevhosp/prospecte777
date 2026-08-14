import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Nem toda falha precisa aparecer.
 *
 * Telemetria — registrar uma estatística, marcar notificação como lida — deve
 * falhar aberta e calada: interromper o usuário por causa de um contador que
 * não subiu é pior que o contador não subir.
 *
 * O que NÃO pode falhar em silêncio é a ação em que a pessoa acredita ter
 * conseguido alguma coisa. Ela fecha a tela, segue a vida, e o efeito nunca
 * aconteceu.
 *
 * A lista abaixo é dessas. Cada linha traz o estrago concreto de falhar
 * calada, porque é isso que justifica o aviso — e é o que faz alguém pensar
 * duas vezes antes de remover.
 */
const CRITICAS: { arquivo: string; mutation: string; estrago: string }[] = [
  {
    arquivo: 'src/hooks/use-support.ts',
    mutation: 'createTicketMutation',
    estrago: 'a pessoa acha que pediu ajuda e espera resposta de um chamado que não existe',
  },
  {
    arquivo: 'src/hooks/use-support.ts',
    mutation: 'sendMessageMutation',
    estrago: 'a mensagem some do campo e ela assume que foi entregue',
  },
  {
    arquivo: 'src/hooks/use-antiban.ts',
    mutation: 'updateConfigMutation',
    estrago: 'opera com limite de proteção diferente do que vê na tela',
  },
  {
    arquivo: 'src/hooks/use-admin.ts',
    mutation: 'deleteUserMutation',
    estrago: 'a conta continua existindo',
  },
  {
    arquivo: 'src/hooks/use-admin.ts',
    mutation: 'blockUserMutation',
    estrago: 'alguém segue com acesso enquanto o admin acredita ter cortado',
  },
  {
    arquivo: 'src/hooks/use-admin.ts',
    mutation: 'unblockUserMutation',
    estrago: 'o usuário continua sem acesso e ninguém sabe por quê',
  },
];

/** Corpo da mutation: do nome dela até o fechamento `  });`. */
function corpoDaMutation(fonte: string, nome: string): string | null {
  const i = fonte.indexOf(`const ${nome} =`);
  if (i < 0) return null;
  const fim = fonte.indexOf('\n  });', i);
  return fim < 0 ? fonte.slice(i) : fonte.slice(i, fim);
}

describe('falha que engana o usuário tem que aparecer', () => {
  for (const { arquivo, mutation, estrago } of CRITICAS) {
    it(`${mutation}: sem aviso, ${estrago}`, () => {
      const fonte = readFileSync(arquivo, 'utf-8');
      const corpo = corpoDaMutation(fonte, mutation);

      expect(corpo, `${mutation} não foi encontrada em ${arquivo}`).not.toBeNull();
      expect(corpo).toContain('onError');
      expect(corpo).toContain('toast');
      // Aviso destrutivo: falha não pode passar por confirmação.
      expect(corpo).toContain("variant: 'destructive'");
    });
  }

  it('não duplica handler na mesma mutation', () => {
    // Uma tentativa anterior inseriu dois `onError` no mesmo objeto, o que o
    // TypeScript recusa — mas só depois de o arquivo já estar gravado.
    for (const arquivo of [...new Set(CRITICAS.map((c) => c.arquivo))]) {
      const fonte = readFileSync(arquivo, 'utf-8');
      for (const { mutation } of CRITICAS.filter((c) => c.arquivo === arquivo)) {
        const corpo = corpoDaMutation(fonte, mutation) ?? '';
        const quantos = [...corpo.matchAll(/onError:/g)].length;
        expect(quantos, `${mutation} tem ${quantos} handlers`).toBe(1);
      }
    }
  });
});

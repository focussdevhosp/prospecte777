import { describe, it, expect } from 'vitest';
import {
  initiatorOf,
  outboundBlockReason,
} from '../../supabase/functions/_shared/outbound-gate';

describe('initiatorOf — falha fechada', () => {
  it('só a palavra exata "human" conta como pessoa', () => {
    expect(initiatorOf('human')).toBe('human');
  });

  it('campo ausente é automação', () => {
    // Este é o caso que sustenta tudo: um chamador novo que esqueça o campo
    // precisa ser tratado como robô. O erro nesse sentido segura uma
    // mensagem a mais; no outro sentido, fura a parada de emergência.
    expect(initiatorOf(undefined)).toBe('automation');
    expect(initiatorOf(null)).toBe('automation');
  });

  it('variações e valores estranhos são automação', () => {
    expect(initiatorOf('Human')).toBe('automation');
    expect(initiatorOf('HUMAN')).toBe('automation');
    expect(initiatorOf(' human ')).toBe('automation');
    expect(initiatorOf(true)).toBe('automation');
    expect(initiatorOf(1)).toBe('automation');
    expect(initiatorOf({ initiated_by: 'human' })).toBe('automation');
  });
});

describe('outboundBlockReason', () => {
  it('automação não sai com a parada de emergência puxada', () => {
    expect(outboundBlockReason({ initiatedBy: 'automation', outboundPaused: true }))
      .toBe('outbound_paused');
  });

  it('automação sai normalmente com o freio solto', () => {
    expect(outboundBlockReason({ initiatedBy: 'automation', outboundPaused: false }))
      .toBeNull();
  });

  it('pessoa continua conseguindo responder um cliente durante a parada', () => {
    // A parada de emergência existe para a máquina parar de agir sozinha.
    // Travar a resposta manual deixaria um cliente falando sozinho por causa
    // de um freio que foi puxado por outro motivo.
    expect(outboundBlockReason({ initiatedBy: 'human', outboundPaused: true })).toBeNull();
  });

  it('o motivo volta nomeado, para a tela poder explicar', () => {
    // "Não foi possível enviar" manda a pessoa procurar defeito onde não tem.
    const reason = outboundBlockReason({ initiatedBy: 'automation', outboundPaused: true });
    expect(reason).toBe('outbound_paused');
  });
});

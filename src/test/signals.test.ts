import { describe, it, expect } from 'vitest';
import {
  detectSignals,
  isSignalActive,
  snapshotOf,
  SIGNAL_WINDOWS,
  type LeadSnapshot,
} from '../../supabase/functions/_shared/agents/signals';

const base: LeadSnapshot = {
  hasWebsite: true,
  siteReachable: true,
  siteScore: 60,
  findingIds: ['not_responsive'],
  rating: 4.5,
  reviewsCount: 40,
};

const s = (p: Partial<LeadSnapshot>): LeadSnapshot => ({ ...base, ...p });
const tipos = (arr: { type: string }[]) => arr.map(x => x.type);

describe('detectSignals — sem os dois lados não há sinal', () => {
  it('primeira conferência não emite nada', () => {
    // Emitir "site novo" só porque é a primeira vez que olhamos seria afirmar
    // uma novidade que não observamos. O estado atual já é fato no dossiê.
    expect(detectSignals(null, base)).toEqual([]);
    expect(detectSignals(undefined, base)).toEqual([]);
  });

  it('nada mudou, nada é emitido', () => {
    expect(detectSignals(base, base)).toEqual([]);
  });

  it('todo sinal carrega evidência dos dois lados', () => {
    const sinais = detectSignals(s({ siteScore: 80 }), s({ siteScore: 40 }));
    expect(sinais.length).toBeGreaterThan(0);
    for (const sinal of sinais) {
      expect(Object.keys(sinal.evidence).length).toBeGreaterThan(0);
      expect(sinal.summary.length).toBeGreaterThan(20);
    }
  });
});

describe('detectSignals — site', () => {
  it('passou a ter site', () => {
    const r = detectSignals(s({ hasWebsite: false }), s({ hasWebsite: true }));
    expect(tipos(r)).toContain('site_novo');
  });

  it('site saiu do ar é o gatilho mais forte', () => {
    // Dá para conferir em dez segundos, e quem está perdendo contato agora
    // sabe disso.
    const r = detectSignals(s({ siteReachable: true }), s({ siteReachable: false }));
    expect(r[0].type).toBe('site_fora_do_ar');
    expect(r[0].strength).toBeGreaterThan(90);
  });

  it('oscilação pequena de nota não vira sinal', () => {
    // Variação de medição não é mudança do negócio.
    expect(detectSignals(s({ siteScore: 60 }), s({ siteScore: 55 }))).toEqual([]);
    expect(detectSignals(s({ siteScore: 60 }), s({ siteScore: 66 }))).toEqual([]);
  });

  it('queda relevante de nota vira sinal', () => {
    const r = detectSignals(s({ siteScore: 70 }), s({ siteScore: 45 }));
    expect(tipos(r)).toContain('site_piorou');
    expect(r.find(x => x.type === 'site_piorou')!.summary).toContain('70');
    expect(r.find(x => x.type === 'site_piorou')!.summary).toContain('45');
  });

  it('site melhorando é aviso, não oportunidade — e a força reflete isso', () => {
    // Alguém está mexendo no site, e provavelmente não é você.
    const r = detectSignals(s({ siteScore: 40 }), s({ siteScore: 75 }));
    const sinal = r.find(x => x.type === 'site_melhorou')!;
    expect(sinal).toBeDefined();
    expect(sinal.strength).toBeLessThan(50);
  });

  it('não acusa piora quando o site apenas saiu do ar', () => {
    // Nota 0 porque não respondeu não é "o site piorou": é outro sinal, e
    // emitir os dois faria a mensagem citar uma queda que não aconteceu.
    const r = detectSignals(
      s({ siteReachable: true, siteScore: 70 }),
      s({ siteReachable: false, siteScore: 0 }),
    );
    expect(tipos(r)).toContain('site_fora_do_ar');
    expect(tipos(r)).not.toContain('site_piorou');
  });
});

describe('detectSignals — achados da auditoria', () => {
  it('problema novo é sinal forte', () => {
    const r = detectSignals(
      s({ findingIds: ['not_responsive'] }),
      s({ findingIds: ['not_responsive', 'no_whatsapp'] }),
    );
    const sinal = r.find(x => x.type === 'problema_novo')!;
    expect(sinal).toBeDefined();
    expect(sinal.evidence.novos).toEqual(['no_whatsapp']);
  });

  it('problema resolvido tem força baixa de propósito', () => {
    // Pode significar que contrataram outra pessoa. Insistir na mesma oferta
    // aqui é chegar tarde e mostrar isso.
    const r = detectSignals(
      s({ findingIds: ['not_responsive', 'no_whatsapp'] }),
      s({ findingIds: ['no_whatsapp'] }),
    );
    const sinal = r.find(x => x.type === 'problema_resolvido')!;
    expect(sinal).toBeDefined();
    expect(sinal.strength).toBeLessThan(50);
  });
});

describe('detectSignals — Google', () => {
  it('primeiras avaliações', () => {
    const r = detectSignals(s({ reviewsCount: 0 }), s({ reviewsCount: 12 }));
    expect(tipos(r)).toContain('primeira_avaliacao');
  });

  it('salto de avaliações exige percentual E volume', () => {
    // De 2 para 4 é +100%, e não é notícia nenhuma.
    expect(tipos(detectSignals(s({ reviewsCount: 2 }), s({ reviewsCount: 4 }))))
      .not.toContain('avaliacoes_dispararam');

    expect(tipos(detectSignals(s({ reviewsCount: 40 }), s({ reviewsCount: 90 }))))
      .toContain('avaliacoes_dispararam');
  });

  it('queda de nota é dor aguda e tem a janela mais curta', () => {
    const r = detectSignals(s({ rating: 4.8 }), s({ rating: 4.1 }));
    const sinal = r.find(x => x.type === 'avaliacao_caiu')!;
    expect(sinal.strength).toBeGreaterThan(80);
    expect(sinal.windowDays).toBeLessThanOrEqual(21);
  });

  it('variação mínima de nota não vira sinal', () => {
    expect(tipos(detectSignals(s({ rating: 4.5 }), s({ rating: 4.4 }))))
      .not.toContain('avaliacao_caiu');
  });

  it('nota subindo não é sinal de venda', () => {
    expect(tipos(detectSignals(s({ rating: 4.0 }), s({ rating: 4.9 }))))
      .not.toContain('avaliacao_caiu');
  });
});

describe('detectSignals — ordenação', () => {
  it('o mais forte vem primeiro, para escolher um só', () => {
    const r = detectSignals(
      s({ siteReachable: true, rating: 4.8, reviewsCount: 40 }),
      s({ siteReachable: false, rating: 4.1, reviewsCount: 40 }),
    );
    expect(r[0].type).toBe('site_fora_do_ar');
    expect(r.length).toBeGreaterThan(1);
  });
});

describe('isSignalActive — todo sinal expira', () => {
  const detectado = new Date('2026-08-01T12:00:00');

  it('vale dentro da janela', () => {
    expect(isSignalActive(detectado, 30, new Date('2026-08-20T12:00:00'))).toBe(true);
  });

  it('não vale depois', () => {
    // Falar de uma queda de seis meses atrás não soa atento, soa automatizado.
    expect(isSignalActive(detectado, 30, new Date('2026-10-01T12:00:00'))).toBe(false);
  });

  it('o limite é inclusivo', () => {
    expect(isSignalActive(detectado, 30, new Date('2026-08-31T12:00:00'))).toBe(true);
  });

  it('toda janela está entre 15 e 45 dias', () => {
    // É a faixa em que o evento continua sendo assunto. Fora dela, ou não deu
    // tempo de ninguém notar, ou já passou.
    for (const [tipo, dias] of Object.entries(SIGNAL_WINDOWS)) {
      expect(dias, tipo).toBeGreaterThanOrEqual(15);
      expect(dias, tipo).toBeLessThanOrEqual(45);
    }
  });
});

describe('snapshotOf', () => {
  it('extrai o que interessa da linha do lead', () => {
    const snap = snapshotOf({
      website: 'https://x.com.br',
      rating: 4.2,
      reviews_count: 30,
      site_audit: {
        reachable: true,
        score: 55,
        findings: [{ id: 'b' }, { id: 'a' }],
      },
    });

    expect(snap.hasWebsite).toBe(true);
    expect(snap.siteScore).toBe(55);
    // Ordenado: a comparação é por conjunto, e ordem instável geraria
    // "problema novo" toda vez que a auditoria devolvesse em outra sequência.
    expect(snap.findingIds).toEqual(['a', 'b']);
  });

  it('site vazio conta como sem site', () => {
    expect(snapshotOf({ website: '   ' }).hasWebsite).toBe(false);
    expect(snapshotOf({ website: null }).hasWebsite).toBe(false);
  });
});

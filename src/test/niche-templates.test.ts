import { describe, it, expect } from 'vitest';
import { NICHE_CONFIGS } from '../constants/niche-configs';
import { checkFactuality } from '../../supabase/functions/_shared/agents/quality-gate';

// ------------------------------------------------------------
// Os textos que o produto entrega prontos precisam passar no
// crivo que o próprio produto aplica na IA.
// ------------------------------------------------------------
// Um usuário que assina hoje recebe esta biblioteca no onboarding e dispara
// no primeiro dia. Se o sistema barra a IA por afirmar resultado inventado,
// não pode entregar exatamente isso escrito à mão.
//
// A evidência é vazia de propósito: representa o usuário recém-cadastrado,
// que ainda não tem catálogo, preço nem portfólio. É o pior caso e é também
// o caso mais comum.

const USUARIO_NOVO = {
  allowedNumbers: [],
  factValues: [],
  hasPricing: false,
  hasCaseStudies: false,
};

const nichos = Object.entries(NICHE_CONFIGS);

describe('templates entregues no onboarding', () => {
  it('existem os oito nichos com os quatro textos cada', () => {
    expect(nichos.length).toBe(8);
    for (const [, config] of nichos) {
      expect(config.messageTemplates.first_contact.length).toBeGreaterThan(40);
      expect(config.messageTemplates.followup_1.length).toBeGreaterThan(40);
      expect(config.messageTemplates.followup_2.length).toBeGreaterThan(40);
      expect(config.messageTemplates.reactivation.length).toBeGreaterThan(40);
    }
  });

  for (const [id, config] of nichos) {
    for (const [tipo, texto] of Object.entries(config.messageTemplates)) {
      it(`${id}/${tipo} passa na conferência de factualidade`, () => {
        const veredito = checkFactuality(texto, USUARIO_NOVO);

        if (!veredito.approved) {
          const problemas = veredito.issues
            .filter((i) => i.severity === 'block')
            .map((i) => `${i.code}: ${i.message}${i.excerpt ? ` — "${i.excerpt}"` : ''}`)
            .join('\n');
          throw new Error(`Template ${id}/${tipo} afirma o que não pode:\n${problemas}\n\n${texto}`);
        }

        expect(veredito.approved).toBe(true);
      });
    }
  }
});

describe('padrões que não podem voltar', () => {
  const todos = nichos.flatMap(([id, c]) =>
    Object.entries(c.messageTemplates).map(([tipo, texto]) => ({ id, tipo, texto })),
  );

  it('nenhum percentual ou valor em reais', () => {
    // Percentual e dinheiro em texto fixo são sempre inventados: o arquivo
    // não sabe nada sobre o negócio de quem vai mandar.
    for (const t of todos) {
      expect(t.texto, `${t.id}/${t.tipo}`).not.toMatch(/\d\s*%|R\$\s*\d/);
    }
  });

  it('nenhum caso de sucesso ou cliente anterior', () => {
    for (const t of todos) {
      expect(t.texto, `${t.id}/${t.tipo}`).not.toMatch(
        /caso de|estudo de caso|cliente(s)? (parceir|similar)|parceir[oa]s? (reduzir|aumentar|captam)|triplic|dobrar(am)?/i,
      );
    }
  });

  it('nenhum anúncio de lançamento', () => {
    // "Lançamos X" é o pior deles: o lead que responde "legal, me manda"
    // descobre que não existe. E quem mente, na cabeça dele, é a empresa que
    // assinou a mensagem — não o software.
    for (const t of todos) {
      expect(t.texto, `${t.id}/${t.tipo}`).not.toMatch(/\blan[çc]amos\b|\bnovidades? que\b/i);
    }
  });

  it('a variável de personalização continua lá', () => {
    // O texto ficou mais honesto; não pode ter ficado impessoal.
    for (const t of todos) {
      expect(t.texto, `${t.id}/${t.tipo}`).toContain('{nome_empresa}');
    }
  });
});

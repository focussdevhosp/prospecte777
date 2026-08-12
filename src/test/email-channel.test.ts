import { describe, it, expect } from 'vitest';
import { splitEmail } from '../../supabase/functions/_shared/agents/copywriter';
import { buildDossier } from '../../supabase/functions/_shared/agents/dossier';
import { qualify } from '../../supabase/functions/_shared/agents/qualifier';
import { matchOffer } from '../../supabase/functions/_shared/agents/offer-matcher';
import { buildStrategy } from '../../supabase/functions/_shared/agents/strategist';

const lead = {
  id: 'lead-1',
  business_name: 'Clínica Bella Itu',
  phone: '5511987654321',
  niche: 'Clínicas de Estética',
  location: 'Itu - SP',
  website: null,
  stage: 'Contato',
  rating: 4.1,
  reviews_count: 12,
  source: 'openstreetmap',
};

function estrategia(channel?: 'whatsapp' | 'email') {
  const dossier = buildDossier({ lead: lead as never });
  return buildStrategy({
    dossier,
    qualification: qualify(dossier),
    match: matchOffer(dossier, []),
    goal: 'agendar_demonstracao',
    channel,
  });
}

describe('canal na estratégia', () => {
  it('sem escolha, continua WhatsApp', () => {
    // Era o único canal até agora. Mudar o padrão em silêncio faria toda
    // missão existente trocar de canal sem ninguém pedir.
    expect(estrategia().channel).toBe('whatsapp');
  });

  it('e-mail aceita mensagem mais longa que WhatsApp', () => {
    // No WhatsApp a mensagem aparece inteira na notificação: passar de meia
    // dúzia de linhas é pedir para ser fechada antes de ser lida. No e-mail,
    // a mesma brevidade parece recado sem contexto — e recado sem contexto de
    // remetente desconhecido vira spam na cabeça de quem recebe.
    expect(estrategia('email').maxWords).toBeGreaterThan(estrategia('whatsapp').maxWords);
  });

  it('o canal escolhido chega na estratégia', () => {
    expect(estrategia('email').channel).toBe('email');
  });
});

describe('splitEmail — assunto e corpo', () => {
  it('separa quando o modelo obedece o rótulo', () => {
    const r = splitEmail('ASSUNTO: Site da Bella fora do ar\n\nOi! Passei no site de vocês e ele não abre.');
    expect(r.subject).toBe('Site da Bella fora do ar');
    expect(r.body).toBe('Oi! Passei no site de vocês e ele não abre.');
  });

  it('aceita o rótulo em qualquer caixa', () => {
    expect(splitEmail('assunto: Teste\n\nCorpo aqui.').subject).toBe('Teste');
  });

  it('sem rótulo, usa a primeira frase e NÃO a remove do corpo', () => {
    // Remover deixaria o corpo começando no meio de um raciocínio.
    const r = splitEmail('Reparei que o site de vocês saiu do ar. Posso ver o que houve?');
    expect(r.subject).toBe('Reparei que o site de vocês saiu do ar.');
    expect(r.body).toContain('Posso ver o que houve?');
    expect(r.body).toContain('Reparei que o site');
  });

  it('nunca inventa assunto genérico', () => {
    // "Oportunidade para sua empresa" seria pior que nenhum assunto: é a
    // linha que treina o destinatário a arquivar sem abrir.
    const r = splitEmail('Oi! Tudo bem?');
    expect(r.subject.toLowerCase()).not.toContain('oportunidade');
    expect(r.subject.toLowerCase()).not.toContain('proposta');
    expect(r.subject).toContain('Oi');
  });

  it('assunto muito longo é cortado, não descartado', () => {
    const longo = 'ASSUNTO: ' + 'palavra '.repeat(40) + '\n\ncorpo';
    expect(splitEmail(longo).subject.length).toBeLessThanOrEqual(120);
    expect(splitEmail(longo).subject.length).toBeGreaterThan(10);
  });

  it('texto vazio não quebra', () => {
    const r = splitEmail('   ');
    expect(typeof r.subject).toBe('string');
    expect(typeof r.body).toBe('string');
  });
});

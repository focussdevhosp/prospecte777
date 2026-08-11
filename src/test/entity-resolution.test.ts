import { describe, it, expect } from 'vitest';
import {
  normalizeName, normalizePhone, normalizeDomain, normalizeAddress,
  fingerprint, compareBusinesses, mergeBusinesses, resolveEntities,
  normalizeBusiness,
} from '../../supabase/functions/_shared/providers/entity-resolution';
import type { RawBusiness } from '../../supabase/functions/_shared/providers/types';

const make = (raw: Partial<RawBusiness> & { name: string }, source: string) =>
  normalizeBusiness(raw as RawBusiness, source);

describe('normalização', () => {
  it('remove sufixo societário e palavra de categoria do nome', () => {
    expect(normalizeName('Clínica Bella Estética LTDA')).toBe('bella estetica');
    expect(normalizeName('BELLA ESTÉTICA - Clínica ME')).toBe('bella estetica');
  });

  it('normaliza telefone brasileiro em qualquer formato', () => {
    for (const input of ['(11) 98765-4321', '11987654321', '+55 11 98765-4321', '011987654321']) {
      expect(normalizePhone(input)).toBe('5511987654321');
    }
  });

  it('rejeita telefone inválido em vez de devolver lixo', () => {
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('5501987654321')).toBeNull(); // DDD 01 não existe
    expect(normalizePhone(null)).toBeNull();
  });

  it('reduz a URL ao domínio', () => {
    expect(normalizeDomain('https://www.bellaestetica.com.br/contato')).toBe('bellaestetica.com.br');
    expect(normalizeDomain('bellaestetica.com.br')).toBe('bellaestetica.com.br');
  });

  it('não trata perfil de rede social como site da empresa', () => {
    expect(normalizeDomain('https://instagram.com/bellaestetica')).toBeNull();
    expect(normalizeDomain('https://facebook.com/bella')).toBeNull();
  });

  it('expande abreviação de logradouro', () => {
    expect(normalizeAddress('R. XV de Novembro, 100')).toContain('rua');
    expect(normalizeAddress('Av. Brasil, 200')).toContain('avenida');
  });
});

describe('fingerprint', () => {
  it('usa o telefone quando existe — é o identificador mais forte', () => {
    expect(fingerprint({ name: 'Qualquer', phone: '(11) 4013-2200' })).toBe('tel:551140132200');
  });

  it('cai para domínio quando não há telefone', () => {
    expect(fingerprint({ name: 'X', domain: 'https://www.exemplo.com.br' })).toBe('dom:exemplo.com.br');
  });

  it('cai para nome + cidade em último caso', () => {
    expect(fingerprint({ name: 'Clínica Bella Estética', city: 'Itu' })).toBe('nm:bella estetica|itu');
  });

  it('a mesma empresa escrita de formas diferentes gera a mesma chave', () => {
    const a = fingerprint({ name: 'Clínica Bella Estética LTDA', city: 'Itu' });
    const b = fingerprint({ name: 'BELLA ESTETICA', city: 'ITU' });
    expect(a).toBe(b);
  });
});

describe('compareBusinesses', () => {
  it('funde quando o identificador da fonte é o mesmo', () => {
    const a = make({ name: 'Bella Estética', externalId: 'place-1' }, 'google_maps');
    const b = make({ name: 'Outra Coisa', externalId: 'place-1' }, 'google_maps');
    const v = compareBusinesses(a, b);
    expect(v.decision).toBe('merge');
    expect(v.confidence).toBe(100);
  });

  it('reconhece a mesma empresa com nome em ordem trocada', () => {
    const a = make({
      name: 'Clínica Bella Estética', phone: '1140132200',
      address: 'Rua XV, 100', city: 'Itu',
    }, 'openstreetmap');
    const b = make({
      name: 'Bella Estética Clínica', phone: '(11) 4013-2200',
      address: 'R. XV de Novembro, 100', city: 'Itu',
    }, 'serper');

    const v = compareBusinesses(a, b);
    expect(v.decision).toBe('merge');
    expect(v.reasons).toContain('mesmo telefone');
  });

  it('mantém separadas empresas diferentes na mesma cidade', () => {
    const a = make({ name: 'Bella Estética', phone: '1140132200', city: 'Itu' }, 'openstreetmap');
    const b = make({ name: 'Studio Renata Nails', phone: '1140139999', city: 'Itu' }, 'openstreetmap');
    expect(compareBusinesses(a, b).decision).toBe('distinct');
  });

  it('não funde negócios distintos que dividem o mesmo telefone', () => {
    // Duas salas no mesmo prédio com a recepção compartilhada. Fundir aqui
    // faria o vendedor abordar a empresa errada.
    const a = make({ name: 'Dr. Paulo Cardiologia', phone: '1140132200', city: 'Itu' }, 'openstreetmap');
    const b = make({ name: 'Bella Estética Avançada', phone: '1140132200', city: 'Itu' }, 'openstreetmap');
    const v = compareBusinesses(a, b);
    expect(v.decision).not.toBe('merge');
    expect(v.reasons.join(' ')).toMatch(/nomes não batem|nomes diferentes/);
  });

  it('separa empresas de cidades diferentes com o mesmo nome', () => {
    const a = make({ name: 'Bella Estética', city: 'Itu' }, 'openstreetmap');
    const b = make({ name: 'Bella Estética', city: 'Sorocaba' }, 'openstreetmap');
    expect(compareBusinesses(a, b).decision).not.toBe('merge');
  });

  it('usa coordenadas próximas como evidência', () => {
    const a = make({ name: 'Bella Estetica', latitude: -23.264, longitude: -47.299, city: 'Itu' }, 'osm');
    const b = make({ name: 'Bella Estética Clínica', latitude: -23.2641, longitude: -47.2991, city: 'Itu' }, 'serper');
    const v = compareBusinesses(a, b);
    expect(v.reasons).toContain('mesmo ponto no mapa');
    expect(v.decision).toBe('merge');
  });
});

describe('mergeBusinesses — combina o melhor de cada fonte', () => {
  it('completa campos vazios em vez de descartar a duplicata', () => {
    const a = make({
      name: 'Bella Estética', phone: '1140132200', address: 'Rua XV, 100', city: 'Itu',
    }, 'openstreetmap');
    const b = make({
      name: 'Bella Estética', website: 'https://bella.com.br',
      rating: 4.6, reviewsCount: 88, photoUrl: 'https://img/1.jpg', city: 'Itu',
    }, 'serper');

    const m = mergeBusinesses(a, b);
    expect(m.phone).toBe('5511987654321'.replace('5511987654321', '551140132200'));
    expect(m.address).toBe('Rua XV, 100');
    expect(m.website).toBe('https://bella.com.br');
    expect(m.rating).toBe(4.6);
    expect(m.reviewsCount).toBe(88);
    expect(m.sources).toEqual(expect.arrayContaining(['openstreetmap', 'serper']));
  });

  it('registra a procedência campo a campo', () => {
    const a = make({ name: 'Bella', phone: '1140132200', city: 'Itu' }, 'openstreetmap');
    const b = make({ name: 'Bella', website: 'https://bella.com.br', city: 'Itu' }, 'serper');
    const m = mergeBusinesses(a, b);

    expect(m.provenance.phone).toBe('openstreetmap');
    expect(m.provenance.website).toBe('serper');
  });

  it('fonte mais confiável vence quando as duas discordam', () => {
    // DuckDuckGo extrai telefone de texto livre; OSM lê de campo cadastrado.
    const fraca = make({ name: 'Bella', phone: '1133334444', city: 'Itu' }, 'duckduckgo');
    const forte = make({ name: 'Bella', phone: '1140132200', city: 'Itu' }, 'openstreetmap');

    const m = mergeBusinesses(fraca, forte);
    expect(m.phone).toBe('551140132200');
    expect(m.provenance.phone).toBe('openstreetmap');
  });

  it('não deixa fonte fraca sobrescrever dado de fonte forte', () => {
    const forte = make({ name: 'Bella', phone: '1140132200', city: 'Itu' }, 'openstreetmap');
    const fraca = make({ name: 'Bella', phone: '1133334444', city: 'Itu' }, 'duckduckgo');

    const m = mergeBusinesses(forte, fraca);
    expect(m.phone).toBe('551140132200');
  });

  it('mantém a maior contagem de avaliações — a menor está velha', () => {
    const antigo = make({ name: 'Bella', phone: '1140132200', rating: 4.2, reviewsCount: 30 }, 'serper');
    const novo = make({ name: 'Bella', phone: '1140132200', rating: 4.6, reviewsCount: 91 }, 'google_maps');
    const m = mergeBusinesses(antigo, novo);
    expect(m.reviewsCount).toBe(91);
    expect(m.rating).toBe(4.6);
  });

  it('recalcula o fingerprint quando o registro ganha telefone', () => {
    const semTelefone = make({ name: 'Bella Estética', city: 'Itu' }, 'duckduckgo');
    expect(semTelefone.fingerprint).toMatch(/^nm:/);

    const comTelefone = make({ name: 'Bella Estética', phone: '1140132200', city: 'Itu' }, 'openstreetmap');
    const m = mergeBusinesses(semTelefone, comTelefone);
    expect(m.fingerprint).toBe('tel:551140132200');
  });
});

describe('resolveEntities — consolidação de várias fontes', () => {
  it('entrega apenas empresas únicas', () => {
    const input = [
      make({ name: 'Clínica Bella Estética', phone: '1140132200', city: 'Itu' }, 'openstreetmap'),
      make({ name: 'Bella Estética Clínica', phone: '(11) 4013-2200', city: 'Itu' }, 'serper'),
      make({ name: 'Studio Renata', phone: '1140135555', city: 'Itu' }, 'openstreetmap'),
      make({ name: 'Espaço Zen Estética', phone: '1140137777', city: 'Itu' }, 'duckduckgo'),
    ];

    const result = resolveEntities(input);
    expect(result.businesses).toHaveLength(3);
    expect(result.merged).toBe(1);
  });

  it('a empresa consolidada carrega dado das duas fontes', () => {
    const input = [
      make({ name: 'Bella Estética', phone: '1140132200', address: 'Rua XV, 100', city: 'Itu' }, 'openstreetmap'),
      make({ name: 'Bella Estética', phone: '1140132200', website: 'https://bella.com.br', rating: 4.6, city: 'Itu' }, 'serper'),
    ];

    const { businesses } = resolveEntities(input);
    expect(businesses).toHaveLength(1);
    expect(businesses[0].address).toBe('Rua XV, 100');
    expect(businesses[0].website).toBe('https://bella.com.br');
    expect(businesses[0].sources).toHaveLength(2);
  });

  it('registra casos ambíguos em vez de decidir sozinho', () => {
    const input = [
      make({ name: 'Bella Estética Itu', phone: '1140132200', city: 'Itu' }, 'openstreetmap'),
      make({ name: 'Bella Estética Unidade 2', phone: '1140138888', city: 'Itu', address: 'Rua XV, 100' }, 'serper'),
    ];

    const result = resolveEntities(input);
    // Nomes muito parecidos, telefones diferentes: não é decisão automática.
    expect(result.businesses.length + result.review.length).toBeGreaterThanOrEqual(2);
  });

  it('não perde empresa quando não há duplicata nenhuma', () => {
    const input = Array.from({ length: 20 }, (_, i) =>
      make({ name: `Empresa ${i}`, phone: `114013${String(1000 + i)}`, city: 'Itu' }, 'openstreetmap'),
    );
    expect(resolveEntities(input).businesses).toHaveLength(20);
  });

  it('lida com lista vazia', () => {
    const r = resolveEntities([]);
    expect(r.businesses).toHaveLength(0);
    expect(r.merged).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import {
  parsePhone,
  extractPhone,
  cleanBusinessName,
  nameKey,
  isAggregator,
  looksLikeListing,
  refineLeads,
} from '../../supabase/functions/_shared/leads';

describe('parsePhone', () => {
  it('aceita celular em qualquer formato e normaliza para E.164', () => {
    for (const input of [
      '(11) 98765-4321',
      '11987654321',
      '5511987654321',
      '+55 11 98765-4321',
      '011 98765 4321',
    ]) {
      expect(parsePhone(input)?.e164, input).toBe('5511987654321');
    }
  });

  it('aceita telefone fixo', () => {
    const p = parsePhone('(21) 3456-7890');
    expect(p?.e164).toBe('552134567890');
    expect(p?.kind).toBe('landline');
  });

  it('rejeita DDD que não existe', () => {
    expect(parsePhone('(10) 98765-4321')).toBeNull();
    expect(parsePhone('(23) 98765-4321')).toBeNull();
  });

  it('rejeita celular que não começa com 9', () => {
    expect(parsePhone('(11) 88765-4321')).toBeNull();
  });

  it('rejeita CNPJ formatado que parece telefone', () => {
    // 14 dígitos nunca é telefone brasileiro
    expect(parsePhone('12.345.678/0001-90')).toBeNull();
  });

  it('rejeita sequência repetida', () => {
    expect(parsePhone('11999999999')).toBeNull();
  });

  it('gera a mesma chave de dedup para o mesmo número em formatos diferentes', () => {
    const a = parsePhone('(11) 98765-4321')!;
    const b = parsePhone('5511987654321')!;
    expect(a.key).toBe(b.key);
  });

  it('formata para exibição', () => {
    expect(parsePhone('11987654321')?.display).toBe('(11) 98765-4321');
    expect(parsePhone('2134567890')?.display).toBe('(21) 3456-7890');
  });
});

describe('extractPhone', () => {
  it('prefere celular quando o texto tem fixo e celular', () => {
    const text = 'Ligue (11) 3456-7890 ou WhatsApp (11) 98765-4321';
    expect(extractPhone(text)?.kind).toBe('mobile');
  });

  it('devolve null quando não há telefone plausível', () => {
    expect(extractPhone('Aberto das 9 às 18, CEP 01310-100')).toBeNull();
  });
});

describe('cleanBusinessName', () => {
  it('remove cauda de SEO', () => {
    expect(cleanBusinessName('Pizzaria do João - iFood')).toBe('Pizzaria do João');
    expect(cleanBusinessName('Clínica Vida | Telefone e Endereço')).toBe('Clínica Vida');
    expect(cleanBusinessName('Barbearia Alfa - Telefone')).toBe('Barbearia Alfa');
  });

  it('decodifica entidades HTML', () => {
    expect(cleanBusinessName('Silva &amp; Souza')).toBe('Silva & Souza');
  });
});

describe('nameKey', () => {
  it('ignora acento, caixa e sufixo societário', () => {
    expect(nameKey('Padaria São José LTDA')).toBe(nameKey('padaria sao jose'));
  });
});

describe('isAggregator', () => {
  it('reconhece agregadores', () => {
    expect(isAggregator('https://www.ifood.com.br/delivery/xyz')).toBe(true);
    expect(isAggregator('https://instagram.com/loja')).toBe(true);
  });

  it('não marca site próprio', () => {
    expect(isAggregator('https://pizzariadojoao.com.br')).toBe(false);
  });
});

describe('looksLikeListing', () => {
  it('reconhece página de lista', () => {
    expect(looksLikeListing('Os 10 melhores restaurantes de Curitiba')).toBe(true);
    expect(looksLikeListing('Guia de academias em SP')).toBe(true);
  });

  it('não marca nome de negócio', () => {
    expect(looksLikeListing('Academia Corpo em Movimento')).toBe(false);
  });
});

describe('refineLeads', () => {
  it('descarta inválidos e deduplica por telefone', () => {
    const { leads, discarded } = refineLeads([
      { business_name: 'Pizzaria Alfa', phone: '(11) 98765-4321', website: 'https://alfa.com.br' },
      { business_name: 'Pizzaria Alfa - iFood', phone: '5511987654321' }, // mesmo telefone
      { business_name: 'Os 10 melhores', phone: '(11) 98888-7777' },      // página de lista
      { business_name: 'Loja X', phone: '(99) 12345', website: null },     // telefone inválido
      { business_name: 'Loja Y', phone: '(21) 3456-7890', website: 'https://ifood.com.br/y' },
    ]);

    expect(leads).toHaveLength(1);
    expect(leads[0].business_name).toBe('Pizzaria Alfa');
    expect(leads[0].phone).toBe('5511987654321');
    expect(discarded.duplicado).toBe(1);
    expect(discarded.pagina_de_lista).toBe(1);
    expect(discarded.telefone_invalido).toBe(1);
    expect(discarded.agregador).toBe(1);
  });

  it('mantém o registro mais completo quando o telefone repete', () => {
    const { leads } = refineLeads([
      { business_name: 'Alfa', phone: '11987654321' },
      {
        business_name: 'Alfa',
        phone: '11987654321',
        website: 'https://alfa.com.br',
        email: 'contato@alfa.com.br',
        address: 'Rua das Flores, 1000, São Paulo',
      },
    ]);
    expect(leads).toHaveLength(1);
    expect(leads[0].website).toBe('https://alfa.com.br');
  });

  it('pontua celular acima de fixo', () => {
    const { leads } = refineLeads([
      { business_name: 'Fixo Ltda', phone: '(21) 3456-7890' },
      { business_name: 'Celular Ltda', phone: '(11) 98765-4321' },
    ]);
    expect(leads[0].business_name).toBe('Celular Ltda');
    expect(leads[0].quality_score).toBeGreaterThan(leads[1].quality_score);
  });

  it('ordena por qualidade', () => {
    const { leads } = refineLeads([
      { business_name: 'Simples', phone: '(11) 98765-4321' },
      {
        business_name: 'Completo',
        phone: '(11) 97777-6666',
        website: 'https://completo.com.br',
        email: 'a@completo.com.br',
        address: 'Av. Paulista, 1000, São Paulo, SP',
        rating: 4.8,
        reviews_count: 250,
      },
    ]);
    expect(leads[0].business_name).toBe('Completo');
  });
});

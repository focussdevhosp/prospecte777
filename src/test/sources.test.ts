import { describe, it, expect } from 'vitest';
import {
  normalizarTermo,
  osmTagsFor,
  separarLocal,
} from '../../supabase/functions/_shared/sources';

describe('osmTagsFor — o nicho é texto livre', () => {
  it('acha o nicho que quebrou a primeira missão real', () => {
    // "clinica de estetica", sem acento, não casava com nada na tabela
    // antiga. A missão rodava inteira, terminava "concluída" e trazia ZERO
    // empresas — e nenhuma mensagem dizia por quê.
    expect(osmTagsFor('clinica de estetica').length).toBeGreaterThan(0);
  });

  it('acento não muda o resultado', () => {
    expect(osmTagsFor('clínica de estética')).toEqual(osmTagsFor('clinica de estetica'));
    expect(osmTagsFor('salões de beleza')).toEqual(osmTagsFor('saloes de beleza'));
    expect(osmTagsFor('farmácia')).toEqual(osmTagsFor('farmacia'));
  });

  it('singular e plural dão o mesmo', () => {
    expect(osmTagsFor('restaurante')).toEqual(osmTagsFor('restaurantes'));
    expect(osmTagsFor('academia')).toEqual(osmTagsFor('academias'));
  });

  it('maiúsculas e pontuação não atrapalham', () => {
    expect(osmTagsFor('PIZZARIA')).toEqual(osmTagsFor('pizzaria'));
    expect(osmTagsFor('Pet-Shop!')).toEqual(osmTagsFor('pet shop'));
  });

  it('cobre os nichos que o app oferece no onboarding', () => {
    const doProduto = [
      'Restaurantes e Alimentação',
      'Clínicas e Saúde',
      'Academias e Fitness',
      'Salões de Beleza',
      'Escritórios de Advocacia',
      'Imobiliárias',
      'Escritórios de Contabilidade',
    ];
    for (const n of doProduto) {
      expect(osmTagsFor(n).length, n).toBeGreaterThan(0);
    }
  });

  it('cobre como as pessoas realmente escrevem', () => {
    const digitados = [
      'barbearia', 'pet shop', 'oficina mecanica', 'dentista', 'petshop',
      'clinica odontologica', 'hamburgueria', 'lanchonete', 'autoescola',
      'material de construcao', 'loja de roupas', 'agencia de marketing',
      'escritorio de advocacia', 'consultorio medico', 'estudio de tatuagem',
    ];
    for (const n of digitados) {
      expect(osmTagsFor(n).length, n).toBeGreaterThan(0);
    }
  });

  it('escolhe o mapeamento mais específico quando dois batem', () => {
    // "barbearia" e "salao" caem em hairdresser; "pizzaria" tem que ir para
    // cuisine=pizza, e não para o restaurante genérico.
    expect(osmTagsFor('pizzaria')).toContain('"cuisine"="pizza"');
    expect(osmTagsFor('hamburgueria')).toContain('"cuisine"="burger"');
  });

  it('nicho desconhecido devolve vazio em vez de chutar', () => {
    // Vazio vira mensagem explícita para o usuário. Chutar uma tag traria a
    // lista errada, que é pior: ele aborda quem não é o público dele.
    expect(osmTagsFor('fabrica de turbina aeronautica')).toEqual([]);
    expect(osmTagsFor('')).toEqual([]);
    expect(osmTagsFor('   ')).toEqual([]);
  });
});

describe('separarLocal — a cidade e o estado', () => {
  it('separa os formatos que o app monta', () => {
    expect(separarLocal('Itu - SP')).toEqual({ cidade: 'Itu', estado: 'SP' });
    expect(separarLocal('São Paulo, SP')).toEqual({ cidade: 'São Paulo', estado: 'SP' });
    expect(separarLocal('Belo Horizonte/MG')).toEqual({ cidade: 'Belo Horizonte', estado: 'MG' });
  });

  it('cidade com hífen no nome não vira estado', () => {
    expect(separarLocal('Santa Bárbara d\'Oeste - SP').cidade).toBe('Santa Bárbara d\'Oeste');
    expect(separarLocal('Mogi-Guaçu - SP')).toEqual({ cidade: 'Mogi-Guaçu', estado: 'SP' });
  });

  it('sem estado devolve a cidade inteira', () => {
    expect(separarLocal('Curitiba')).toEqual({ cidade: 'Curitiba', estado: null });
  });

  it('normaliza a sigla para maiúscula', () => {
    expect(separarLocal('Itu - sp').estado).toBe('SP');
  });
});

describe('normalizarTermo', () => {
  it('tira acento e pontuação', () => {
    expect(normalizarTermo('Clínicas & Estética!')).toBe('clinicas estetica');
    expect(normalizarTermo('  AÇOUGUE  ')).toBe('acougue');
  });
});

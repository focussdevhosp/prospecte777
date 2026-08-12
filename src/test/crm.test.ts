import { describe, it, expect } from 'vitest';
import {
  descricaoParaCrm,
  naoConfigurado,
  type CrmLead,
} from '../../supabase/functions/_shared/crm/contract';
import {
  CRM_ADAPTERS,
  adapterPara,
} from '../../supabase/functions/_shared/crm/adapters';

const lead: CrmLead = {
  name: 'Clínica Bella Itu',
  email: 'contato@bellaitu.com.br',
  phone: '5511987654321',
  niche: 'Clínicas de Estética',
  location: 'Itu - SP',
  website: 'https://bellaitu.com.br',
  score: 78,
  reason: 'O site não abre no celular.',
  origin: 'Google Maps em 12/08/2026',
};

describe('descricaoParaCrm — o CRM do cliente não tem dossiê', () => {
  it('leva o motivo da abordagem, não só os dados', () => {
    // É o que faz o vendedor de lá confiar num lead que ele não capturou.
    const d = descricaoParaCrm(lead);
    expect(d).toContain('não abre no celular');
    expect(d).toContain('78/100');
    expect(d).toContain('Google Maps');
  });

  it('funciona com lead pobre, sem inventar', () => {
    const d = descricaoParaCrm({ name: 'Empresa X' });
    expect(d.length).toBeGreaterThan(20);
    expect(d).not.toContain('undefined');
    expect(d).not.toContain('null');
  });

  it('sempre diz que veio da prospecção automática', () => {
    // Quem abrir o CRM daqui a três meses precisa saber a origem sem
    // perguntar a ninguém.
    expect(descricaoParaCrm({ name: 'X' })).toContain('prospecção automática');
  });
});

describe('adaptadores', () => {
  it('existe um destino para quem usa qualquer outro CRM', () => {
    // É o que impede "vocês integram com o meu?" de virar não.
    expect(adapterPara('webhook')).not.toBeNull();
  });

  it('cobre os CRMs que a PME brasileira usa', () => {
    for (const p of ['rd_station', 'pipedrive', 'hubspot']) {
      expect(adapterPara(p), p).not.toBeNull();
    }
  });

  it('provedor desconhecido devolve nulo em vez de escolher um', () => {
    // Escolher "o mais parecido" mandaria o lead para o CRM errado.
    expect(adapterPara('salesforce')).toBeNull();
    expect(adapterPara('')).toBeNull();
  });

  it('todo adaptador declara qual secret o habilita', () => {
    for (const a of CRM_ADAPTERS) {
      expect(a.credentialEnv.length, a.provider).toBeGreaterThan(3);
      expect(a.label.length, a.provider).toBeGreaterThan(2);
    }
  });

  it('"não configurado" diz o nome do secret que falta', () => {
    // Sem isso alguém passa a tarde procurando defeito onde só falta
    // preencher um campo.
    const r = naoConfigurado(adapterPara('rd_station')!);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('RD_STATION_TOKEN');
  });

  it('nenhum adaptador promete puxar dado do CRM', () => {
    // Só empurra. Sincronização nos dois sentidos é onde nasce o conflito
    // que ninguém resolve: dois sistemas discordando sobre o mesmo negócio.
    for (const a of CRM_ADAPTERS) {
      expect(typeof a.push, a.provider).toBe('function');
      expect((a as unknown as Record<string, unknown>).pull, a.provider).toBeUndefined();
    }
  });
});

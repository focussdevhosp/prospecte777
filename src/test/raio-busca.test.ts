import { describe, it, expect } from 'vitest';
import { bboxDoRaio, RAIO_MAX_KM } from '../../supabase/functions/_shared/sources';

/** Distância aproximada em km entre dois pontos, para conferir a caixa. */
function km(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const ITU = { lat: -23.2637, lng: -47.2992 };
const PORTO_ALEGRE = { lat: -30.0346, lng: -51.2177 };
const BELEM = { lat: -1.4558, lng: -48.4902 };

describe('bboxDoRaio — a caixa cobre o raio pedido', () => {
  it('a borda fica à distância pedida, nos dois eixos', () => {
    const raioKm = 10;
    const [sul, oeste, norte, leste] = bboxDoRaio({ ...ITU, raioKm });

    const dNorte = km(ITU.lat, ITU.lng, norte, ITU.lng);
    const dLeste = km(ITU.lat, ITU.lng, ITU.lat, leste);

    // 3% de folga: a conversão é aproximação de esfera, não geodésia exata.
    expect(dNorte).toBeGreaterThan(raioKm * 0.97);
    expect(dNorte).toBeLessThan(raioKm * 1.03);
    expect(dLeste).toBeGreaterThan(raioKm * 0.97);
    expect(dLeste).toBeLessThan(raioKm * 1.03);

    // E a caixa é simétrica em volta do ponto.
    expect(km(ITU.lat, ITU.lng, sul, ITU.lng)).toBeCloseTo(dNorte, 1);
    expect(km(ITU.lat, ITU.lng, ITU.lat, oeste)).toBeCloseTo(dLeste, 1);
  });

  it('longitude ENCOLHE longe do equador — é o erro clássico', () => {
    // Um grau de latitude vale ~111 km em qualquer lugar. Um de longitude
    // encolhe conforme os meridianos se fecham. Tratar os dois com o mesmo
    // divisor faria a caixa ficar estreita no leste-oeste, e a busca perderia
    // negócios que estão dentro do raio pedido.
    const raioKm = 50;

    const [, oestePA, , lestePA] = bboxDoRaio({ ...PORTO_ALEGRE, raioKm });
    const [, oesteBE, , lesteBE] = bboxDoRaio({ ...BELEM, raioKm });

    const grausPA = lestePA - oestePA;
    const grausBE = lesteBE - oesteBE;

    // Porto Alegre (30°S) precisa de MAIS graus de longitude que Belém (1°S)
    // para cobrir os mesmos 50 km.
    expect(grausPA).toBeGreaterThan(grausBE);

    // E ambos cobrem de fato os 50 km.
    for (const [p, leste] of [[PORTO_ALEGRE, lestePA], [BELEM, lesteBE]] as const) {
      const d = km(p.lat, p.lng, p.lat, leste);
      expect(d).toBeGreaterThan(raioKm * 0.97);
      expect(d).toBeLessThan(raioKm * 1.03);
    }
  });

  it('aceita até 300 km, que é o que a tela oferece', () => {
    const [, , norte] = bboxDoRaio({ ...ITU, raioKm: RAIO_MAX_KM });
    const d = km(ITU.lat, ITU.lng, norte, ITU.lng);
    expect(RAIO_MAX_KM).toBe(300);
    expect(d).toBeGreaterThan(290);
  });

  it('corta acima do teto em vez de montar caixa gigante', () => {
    const noTeto = bboxDoRaio({ ...ITU, raioKm: RAIO_MAX_KM });
    const absurdo = bboxDoRaio({ ...ITU, raioKm: 99_999 });
    expect(absurdo).toEqual(noTeto);
  });

  it('raio zero não vira caixa degenerada', () => {
    // Caixa de área zero não devolve nada e pareceria "não há empresas aqui".
    const [sul, oeste, norte, leste] = bboxDoRaio({ ...ITU, raioKm: 0 });
    expect(norte).toBeGreaterThan(sul);
    expect(leste).toBeGreaterThan(oeste);
  });

  it('a ordem é [sul, oeste, norte, leste], que é o que o Overpass espera', () => {
    const [sul, oeste, norte, leste] = bboxDoRaio({ ...ITU, raioKm: 5 });
    expect(sul).toBeLessThan(norte);
    expect(oeste).toBeLessThan(leste);
    expect(sul).toBeLessThan(ITU.lat);
    expect(norte).toBeGreaterThan(ITU.lat);
  });
});

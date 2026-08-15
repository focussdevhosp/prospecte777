import { useCallback, useState } from 'react';

// ============================================================
// ONDE VOCÊ ESTÁ
// ============================================================
// A API de geolocalização do navegador tem mais desfechos do que "deu certo"
// e "deu errado", e cada um exige uma frase diferente — porque a ação que
// resolve é diferente:
//
//   negado      → o usuário precisa liberar na barra de endereço; insistir
//                 pelo código não funciona, o navegador nem pergunta de novo
//   indisponível→ o aparelho não conseguiu se localizar agora. Tentar de novo
//                 costuma resolver
//   demorou     → GPS frio, dentro de prédio. Tentar de novo resolve
//   sem suporte → contexto sem HTTPS ou navegador antigo. Nada a fazer
//
// Um "não foi possível obter sua localização" genérico manda a pessoa tentar
// de novo justamente no caso em que tentar de novo nunca vai funcionar.

export type EstadoLocalizacao =
  | 'ocioso'
  | 'buscando'
  | 'pronto'
  | 'negado'
  | 'indisponivel'
  | 'demorou'
  | 'sem_suporte';

export interface MinhaLocalizacao {
  lat: number;
  lng: number;
  /** Precisão da leitura, em metros, conforme o navegador. */
  precisaoM: number;
  /** Nome legível: "Itu, SP". Vem do reverso; pode faltar. */
  nome: string | null;
}

/** Mensagem por estado. Cada uma diz o que fazer, não só o que houve. */
export const MENSAGEM_LOCALIZACAO: Record<EstadoLocalizacao, string> = {
  ocioso: '',
  buscando: 'Localizando você...',
  pronto: '',
  negado:
    'Você bloqueou o acesso à localização. Para liberar, clique no cadeado ' +
    'ao lado do endereço e permita "Localização" — o navegador não pergunta ' +
    'de novo sozinho.',
  indisponivel:
    'O aparelho não conseguiu se localizar agora. Tente de novo, ou digite a ' +
    'cidade no campo ao lado.',
  demorou:
    'A localização demorou demais para responder. Perto de uma janela ou com ' +
    'o GPS ligado costuma resolver.',
  sem_suporte:
    'Este navegador não oferece localização. Digite a cidade no campo ao lado.',
};

/**
 * Nome do lugar a partir das coordenadas.
 *
 * Serve para a tela dizer "Itu, SP" em vez de despejar dois números, e para
 * o lead ser gravado com um local legível. Se falhar, a busca continua —
 * ela usa as COORDENADAS, não o nome. Por isso este erro é engolido de
 * propósito: perder o rótulo não pode impedir a prospecção.
 */
async function nomeDoLugar(lat: number, lng: number): Promise<string | null> {
  try {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}` +
      `&zoom=10&addressdetails=1&accept-language=pt-BR`;

    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) return null;

    const d = await res.json();
    const a = d?.address ?? {};
    const cidade = a.city || a.town || a.village || a.municipality || a.county;
    const uf = a['ISO3166-2-lvl4']?.split('-')?.[1] ?? a.state;

    if (!cidade) return null;
    return uf ? `${cidade}, ${uf}` : String(cidade);
  } catch {
    return null;
  }
}

export function useMinhaLocalizacao() {
  const [estado, setEstado] = useState<EstadoLocalizacao>('ocioso');
  const [local, setLocal] = useState<MinhaLocalizacao | null>(null);

  const localizar = useCallback(async (): Promise<MinhaLocalizacao | null> => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setEstado('sem_suporte');
      return null;
    }

    setEstado('buscando');

    const posicao = await new Promise<GeolocationPosition | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p),
        (erro) => {
          // Os códigos são 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE,
          // 3 = TIMEOUT. Distinguir importa: só o primeiro é definitivo.
          setEstado(erro.code === 1 ? 'negado' : erro.code === 3 ? 'demorou' : 'indisponivel');
          resolve(null);
        },
        {
          enableHighAccuracy: false,
          // Precisão de rua basta para um raio em quilômetros, e alta
          // precisão acorda o GPS: mais lento e mais bateria, sem ganho aqui.
          timeout: 12_000,
          maximumAge: 5 * 60_000,
        },
      );
    });

    if (!posicao) return null;

    const { latitude, longitude, accuracy } = posicao.coords;

    // (0,0) é o que aparece quando a leitura falha e vem travestida de
    // coordenada válida. Fica no Golfo da Guiné — a busca "perto de você"
    // varreria o oceano.
    if (latitude === 0 && longitude === 0) {
      setEstado('indisponivel');
      return null;
    }

    const encontrado: MinhaLocalizacao = {
      lat: latitude,
      lng: longitude,
      precisaoM: Math.round(accuracy ?? 0),
      nome: await nomeDoLugar(latitude, longitude),
    };

    setLocal(encontrado);
    setEstado('pronto');
    return encontrado;
  }, []);

  const limpar = useCallback(() => {
    setLocal(null);
    setEstado('ocioso');
  }, []);

  return {
    estado,
    local,
    localizar,
    limpar,
    mensagem: MENSAGEM_LOCALIZACAO[estado],
    buscando: estado === 'buscando',
    /** `true` quando insistir não adianta: só o usuário resolve. */
    definitivo: estado === 'negado' || estado === 'sem_suporte',
  };
}

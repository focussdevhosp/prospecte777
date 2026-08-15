import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { Crosshair, Loader2, MapPin, X } from 'lucide-react';
import { useMinhaLocalizacao, type MinhaLocalizacao } from '@/hooks/use-minha-localizacao';
import { cn } from '@/lib/utils';

/**
 * Prospectar em volta de onde a pessoa está.
 *
 * A diferença para digitar a cidade não é comodidade: com coordenadas a busca
 * vira um RAIO de verdade em volta do ponto, em vez do contorno do município.
 * Quem está numa divisa alcança as duas cidades; quem está numa capital não
 * recebe o outro extremo dela como se fosse perto.
 */
export const RAIOS_KM = [1, 3, 5, 10, 25, 50, 100, 200, 300];

interface PertoDeMimProps {
  /** Definido quando o modo está ativo. */
  centro: (MinhaLocalizacao & { raioKm: number }) | null;
  onChange: (centro: (MinhaLocalizacao & { raioKm: number }) | null) => void;
  disabled?: boolean;
}

export function PertoDeMim({ centro, onChange, disabled }: PertoDeMimProps) {
  const { estado, localizar, buscando, mensagem, definitivo } = useMinhaLocalizacao();

  const ativar = async () => {
    const local = await localizar();
    if (local) onChange({ ...local, raioKm: 10 });
  };

  const raioIndice = centro ? Math.max(0, RAIOS_KM.indexOf(centro.raioKm)) : 3;

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-colors',
        centro ? 'border-primary/40 bg-primary/5' : 'border-border/60 bg-muted/20',
      )}
    >
      {!centro ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Crosshair className="h-4 w-4 text-primary" />
                Perto de mim
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Busca num raio em volta de onde você está, em vez da cidade inteira.
              </p>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={ativar}
              // `definitivo` é negado ou sem suporte: insistir não resolve,
              // e um botão que não funciona ensina a pessoa a desconfiar dos
              // outros.
              disabled={disabled || buscando || definitivo}
            >
              {buscando ? (
                <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Localizando</>
              ) : (
                <><MapPin className="mr-2 h-3.5 w-3.5" />Usar minha localização</>
              )}
            </Button>
          </div>

          {mensagem && estado !== 'buscando' && (
            <p
              className={cn(
                'text-xs leading-relaxed',
                definitivo ? 'text-destructive' : 'text-warning',
              )}
            >
              {mensagem}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Crosshair className="h-4 w-4 text-primary" />
                {centro.nome ?? 'Sua posição atual'}
                <Badge variant="secondary" className="text-[10px]">
                  {centro.raioKm} km
                </Badge>
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {/* Precisão importa: a 2 km de erro, um raio de 1 km é
                    promessa que o aparelho não tem como cumprir. */}
                {centro.precisaoM > 0 && centro.precisaoM / 1000 > centro.raioKm / 2
                  ? `Sua posição tem precisão de ~${(centro.precisaoM / 1000).toFixed(1)} km — para um raio tão curto, considere aumentar.`
                  : `Posição obtida com precisão de ~${centro.precisaoM} m.`}
              </p>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange(null)}
              disabled={disabled}
            >
              <X className="mr-1 h-3.5 w-3.5" />
              Remover
            </Button>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">Raio da busca</span>
              <span className="font-semibold tabular-nums">{centro.raioKm} km</span>
            </div>

            {/* Passos fixos em vez de contínuo: 1 a 300 num arrastão faz
                escolher 7 km parecer diferente de 8, quando não é. */}
            <Slider
              value={[raioIndice]}
              onValueChange={([i]) => onChange({ ...centro, raioKm: RAIOS_KM[i] })}
              min={0}
              max={RAIOS_KM.length - 1}
              step={1}
              disabled={disabled}
            />

            <div className="flex justify-between text-[10px] text-muted-foreground">
              <span>{RAIOS_KM[0]} km</span>
              <span>{RAIOS_KM[RAIOS_KM.length - 1]} km</span>
            </div>

            {centro.raioKm >= 100 && (
              <p className="text-xs leading-relaxed text-warning">
                Raio grande cobre muita área e a busca demora mais — a fonte
                precisa varrer o equivalente a boa parte de um estado. Vale
                quando o seu público não está só na sua cidade.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

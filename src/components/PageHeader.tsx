import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * O cabeçalho de página que faltava.
 *
 * Antes o título de cada tela vivia dentro da barra fixa do topo, em
 * `text-sm`, do mesmo tamanho de um botão de ícone e menor que o rótulo de
 * qualquer cartão da página. A descrição ficava solta acima do conteúdo, sem
 * relação visual com o título. O efeito é o que o usuário chamou de
 * desorganizado: 33 telas sem um ponto de partida para o olho, cada uma
 * começando de um jeito.
 *
 * Aqui existe uma entrada só, com hierarquia explícita:
 *
 *   seção     onde estou dentro do produto
 *   TÍTULO    o que é esta tela
 *   descrição o que dá para fazer nela
 *   ações     o que fazer agora
 *
 * A barra do topo passa a mostrar o título só depois que este rola para
 * fora — repetir a mesma frase duas vezes na tela não organiza nada.
 */
export interface PageHeaderProps {
  title: string;
  description?: string;
  /** Onde a tela mora no produto: "Prospectar", "Vender", "Ajustes". */
  eyebrow?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  /** Faixa opcional logo abaixo — abas, filtros, resumo. */
  children?: ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  eyebrow,
  icon,
  actions,
  children,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('mb-6 sm:mb-8', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          {eyebrow && (
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground/80">
              {eyebrow}
            </p>
          )}

          <div className="flex items-center gap-3">
            {icon && (
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
                aria-hidden="true"
              >
                {icon}
              </span>
            )}
            {/* text-balance vem do reset tipográfico: título de duas linhas
                quebra em partes de tamanho parecido em vez de deixar uma
                palavra órfã embaixo. */}
            <h1 className="truncate text-2xl font-bold tracking-tight sm:text-[28px]">
              {title}
            </h1>
          </div>

          {description && (
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
              {description}
            </p>
          )}
        </div>

        {actions && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      {children && <div className="mt-5">{children}</div>}
    </header>
  );
}

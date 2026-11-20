import type { ReactNode } from 'react'

/**
 * Une des trois sections de l'accueil (design #52) : le titre, sa mesure en
 * gris à côté, une action à droite, un filet dessous.
 */
export function HomeSection({
  title,
  meta,
  action,
  children,
}: {
  title: string
  meta?: ReactNode
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="group/section flex flex-col gap-4">
      <div className="flex min-h-[43px] items-center gap-2.5 border-b pb-2.5">
        {/* Titre et mesure n'ont ni la même police ni la même taille :
            alignés sur leur ligne de base, pas sur leur milieu. */}
        <div className="flex items-baseline gap-2.5">
          <h2 className="font-heading text-xl font-semibold tracking-[-0.01em]">
            {title}
          </h2>
          {meta && (
            <span className="text-[13px] text-muted-foreground">{meta}</span>
          )}
        </div>
        {action && <div className="ml-auto min-w-0">{action}</div>}
      </div>
      {children}
    </section>
  )
}

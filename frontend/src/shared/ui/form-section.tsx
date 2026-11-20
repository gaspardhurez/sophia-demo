import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'

interface FormSectionProps {
  title: ReactNode
  /** Une phrase, pas un paragraphe : ce que la section règle, et pourquoi. */
  hint?: ReactNode
  children: ReactNode
  className?: string
}

/**
 * Un bloc de formulaire : titre puis phrase d'explication en gris.
 *
 * Un formulaire long qui n'aligne que des `Label` se lit comme une liste de
 * champs sans hiérarchie — on ne sait plus ce qui va ensemble ni pourquoi la
 * question est posée. Le titre regroupe, la phrase répond au « pourquoi » sans
 * qu'on ait à le déduire des libellés.
 */
export function FormSection({
  title,
  hint,
  children,
  className,
}: FormSectionProps) {
  return (
    <section className={cn('grid gap-3', className)}>
      <div className="grid gap-0.5">
        <h3 className="font-heading text-sm font-semibold text-foreground">
          {title}
        </h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

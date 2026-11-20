import { Plus } from 'lucide-react'
import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
} from 'react'

import { cn } from '@/shared/lib/utils'

/**
 * Le `+` discret d'une section. Exporté pour les cas où le déclencheur doit
 * être un composant tiers (`DialogTrigger asChild`), qui ne peut pas passer
 * par `onAdd`. `forwardRef` + spread : Radix clone son enfant.
 */
export const SectionAddButton = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<'button'> & { label?: string }
>(function SectionAddButton({ label = 'Ajouter', className, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      title={label}
      aria-label={label}
      className={cn(
        'grid size-5 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground',
        className,
      )}
      {...props}
    >
      <Plus className="size-4" />
    </button>
  )
})

interface SectionTitleProps {
  children: ReactNode
  /** Contenu aligné à droite sur la même ligne (bouton, lien). */
  action?: ReactNode
  /**
   * Ajout d'un élément à la section : rendu en `+` discret **collé au titre**,
   * pas en bouton libellé à droite. Une page qui empile trois « + Ajouter » les
   * fait concurrencer son contenu ; le `+` reste là où l'œil est déjà.
   */
  onAdd?: () => void
  /** Infobulle du `+` (« Nouvelle métrique »…). */
  addLabel?: string
  /** Variante de `onAdd` quand le déclencheur est un composant (modale Radix). */
  addSlot?: ReactNode
  /** Niveau du titre — `h2` par défaut, `h3` dans un panneau imbriqué. */
  as?: 'h2' | 'h3'
  className?: string
}

/**
 * Titre de section.
 *
 * Sur `foreground` et en semi-gras, pas en gris : quand tous les repères d'une
 * page sont au même niveau de gris et à la même taille, l'œil n'a plus de point
 * d'entrée et la page se lit comme un wireframe.
 */
export function SectionTitle({
  children,
  action,
  onAdd,
  addLabel = 'Ajouter',
  addSlot,
  as: Tag = 'h2',
  className,
}: SectionTitleProps) {
  return (
    <div
      className={cn('mb-4 flex items-center justify-between gap-3', className)}
    >
      <Tag className="flex min-w-0 items-center gap-1 font-heading text-sm font-semibold text-foreground">
        <span className="min-w-0 truncate">{children}</span>
        {onAdd && <SectionAddButton onClick={onAdd} label={addLabel} />}
        {addSlot}
      </Tag>
      {action}
    </div>
  )
}

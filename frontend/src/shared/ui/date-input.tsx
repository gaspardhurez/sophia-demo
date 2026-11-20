import * as React from 'react'
import { CalendarDays } from 'lucide-react'

import { cn } from '@/shared/lib/utils'
import { Input } from './input'

/**
 * Champ de date.
 *
 * Un `<input type="date">` brut pose trois problèmes que shadcn
 * ignore :
 *
 * 1. Chrome dessine son propre glyphe de calendrier, dans son propre gris —
 *    seul élément non stylisé du formulaire. On le masque et on pose l'icône
 *    de l'app à gauche.
 * 2. Le glyphe masqué, il n'y a plus de zone pour ouvrir le sélecteur : on
 *    l'ouvre au clic sur le champ entier (`showPicker`).
 * 3. Un champ vide affiche « jj/mm/aaaa » dans la couleur du texte, donc se lit
 *    comme un champ rempli. Les `::placeholder` ne s'appliquent pas aux dates :
 *    on grise le champ tant qu'il n'a pas de valeur.
 */
export const DateInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentProps<'input'>
>(function DateInput({ className, onChange, onClick, ...props }, forwardedRef) {
  // Contrôlé : la vacuité se lit sur la prop. Non contrôlé (react-hook-form) :
  // on la relève au montage, une fois que RHF a posé la valeur via le ref.
  const controlled = props.value !== undefined
  const [mountedEmpty, setMountedEmpty] = React.useState(true)
  const empty = controlled ? !props.value : mountedEmpty

  const setRef = React.useCallback(
    (node: HTMLInputElement | null) => {
      if (typeof forwardedRef === 'function') forwardedRef(node)
      else if (forwardedRef) forwardedRef.current = node
      // Après `forwardedRef` : c'est lui qui renseigne la valeur par défaut.
      if (node) setMountedEmpty(!node.value)
    },
    [forwardedRef],
  )

  return (
    <div className="relative">
      <CalendarDays
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        {...props}
        ref={setRef}
        type="date"
        onChange={(e) => {
          setMountedEmpty(!e.currentTarget.value)
          onChange?.(e)
        }}
        onClick={(e) => {
          // Indisponible ou refusé dans certains contextes (iframe, Safari) :
          // le champ reste saisissable au clavier de toute façon.
          try {
            e.currentTarget.showPicker?.()
          } catch {
            /* ignore */
          }
          onClick?.(e)
        }}
        className={cn(
          'pl-9 [&::-webkit-calendar-picker-indicator]:hidden',
          empty && 'text-muted-foreground',
          className,
        )}
      />
    </div>
  )
})

import type { LucideIcon } from 'lucide-react'
import { Plus, Search } from 'lucide-react'
import {
  type ReactNode,
  forwardRef,
  useEffect,
  useEffectEvent,
  useRef,
} from 'react'

import { cn } from '@/shared/lib/utils'

/*
 * Les pièces des panneaux flottants du calendrier (`kit/Panneau activite`,
 * `kit/Panneau indispo`) : filet, section et son geste, menus en ligne. Le
 * panneau d'une indisponibilité est bâti sur le gabarit de celui d'une
 * activité (#105) — d'où ces pièces ici plutôt que dans l'une des deux
 * features.
 */

/** Le filet entre deux sections **visibles** du panneau (#46). */
export function Rule() {
  return <div className="my-1.5 border-t border-border/60" />
}

/**
 * Une section d'un panneau : un titre — Dates, Projets,
 * Apprentissage, Totaux, Résultats, Notes — et, à droite, son geste (crayon,
 * « OK »). Le geste ne paraît qu'au survol de la section, et reste visible tant
 * que ce qu'il a ouvert l'est (`open`) ; `always` le montre toujours (le « OK »
 * d'une édition en cours).
 *
 * `onDismiss` : la section a une saisie ouverte par le « + » de l'en-tête
 * (#46) ; un clic hors d'elle, ou Échap, la quitte.
 */
export function PanelSection({
  icon: Icon,
  title,
  action,
  open = false,
  always = false,
  large = false,
  className,
  onDismiss,
  children,
}: {
  icon: LucideIcon
  title: string
  action?: ReactNode
  open?: boolean
  always?: boolean
  /** Le titre au corps du texte (Dates) plutôt qu'en petit. */
  large?: boolean
  className?: string
  onDismiss?: () => void
  children?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss(ref, onDismiss)
  return (
    <div ref={ref} className={cn('group/section flex flex-col', className)}>
      <div
        className={cn(
          'flex items-center gap-2.5 px-2 py-1 text-muted-foreground',
          large ? 'text-sm' : 'text-xs',
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="flex-1">{title}</span>
        {action && (
          <span
            className={cn(
              'flex',
              !open &&
                !always &&
                // Un menu radix ouvert par le geste (`data-state=open`) le
                // garde visible, comme `open`.
                'invisible group-hover/section:visible has-[[data-state=open]]:visible',
            )}
          >
            {action}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

/**
 * Quitte une saisie ouverte au clic hors de `ref` ou à Échap — tant que
 * `onDismiss` est fourni.
 */
function useDismiss(
  ref: React.RefObject<HTMLElement | null>,
  onDismiss: (() => void) | undefined,
) {
  const active = Boolean(onDismiss)
  const dismiss = useEffectEvent(() => onDismiss?.())
  useEffect(() => {
    if (!active) return
    function onDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) dismiss()
    }
    // En capture et marqué : Échap ferme la saisie, pas aussi le panneau
    // qui la porte (il écoute plus tard et cède à `defaultPrevented`).
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      e.preventDefault()
      dismiss()
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [active, ref])
}

/** Le bouton carré (22 px) d'un en-tête de section : « + » ou crayon. */
export const SectionIconButton = forwardRef<
  HTMLButtonElement,
  {
    label: string
    onClick?: () => void
    active?: boolean
    icon?: LucideIcon
  }
>(function SectionIconButton(
  { label, onClick, active = false, icon: Icon = Plus, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      {...rest}
      className={cn(
        'grid size-[22px] place-items-center rounded-[5px] text-muted-foreground hover:bg-muted hover:text-foreground',
        active && 'bg-muted text-foreground',
      )}
    >
      <Icon className="size-3.5" />
    </button>
  )
})

/** Le « OK » qui clôt une édition de section. */
export function SectionOk({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-[22px] rounded-[5px] px-1.5 text-xs font-medium text-foreground hover:bg-muted"
    >
      OK
    </button>
  )
}

/** Un menu déplié dans le flux du panneau (étapes, projets, savoirs…). */
export function InlineMenu({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'mx-2 mt-0.5 mb-1.5 overflow-hidden rounded-lg border border-border bg-popover shadow-sm',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** La recherche en tête d'un menu. */
export function MenuSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (next: string) => void
  placeholder: string
}) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-2.5">
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}

/** Le petit titre en capitales d'un groupe de menu. */
export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pt-1.5 pb-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </div>
  )
}

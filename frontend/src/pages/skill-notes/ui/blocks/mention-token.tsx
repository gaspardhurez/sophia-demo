import { ArrowUpRight } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'

/**
 * Une mention en ligne, telle que Notion dessine la mention d'une page
 * (relevé du 28/10/2026) : l'icône dans une case de 1,25 em, calée en haut
 * du texte, une petite flèche ↗ en bas à droite détourée du fond ; à 0,5 em,
 * le nom en demi-gras, souligné d'un trait discret (0,05 em, à 10 %). Au survol, un fond gris
 * léger (0,1 s). Sert au lien vers un savoir et à la mention d'une ressource.
 *
 * `data-mention` la sort du dessin des liens du texte et de leur bulle.
 *
 * `muted` : pas encore choisie, ou disparue (`struck` : barrée).
 */
export function MentionToken({
  icon,
  label,
  href,
  newTab = false,
  title,
  onClick,
  muted = false,
  struck = false,
  selected = false,
}: {
  icon: ReactNode
  label: string
  href?: string
  newTab?: boolean
  title?: string
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void
  muted?: boolean
  struck?: boolean
  selected?: boolean
}) {
  return (
    <a
      data-mention
      href={href}
      title={title}
      {...(newTab && { target: '_blank', rel: 'noreferrer' })}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-[1px] transition-colors duration-100 ease-in hover:bg-[rgb(148_148_148/0.15)]',
        muted && 'text-muted-foreground',
        selected && 'bg-ring/15',
      )}
    >
      <span
        aria-hidden
        className="relative mr-[0.5em] inline-grid size-[1.25em] place-items-center align-text-top leading-none"
      >
        {icon}
        <span className="absolute -right-[0.25em] -bottom-[0.2em] size-[1em]">
          {/* Le détour, à la couleur du fond, puis la flèche. */}
          <ArrowUpRight
            className="absolute inset-0 size-full text-background"
            strokeWidth={6}
          />
          <ArrowUpRight
            className="absolute inset-0 size-full text-foreground/85"
            strokeWidth={2.75}
          />
        </span>
      </span>
      <span
        className={cn(
          'font-medium underline decoration-foreground/20 decoration-[length:0.05em] underline-offset-[10%]',
          struck && 'line-through',
        )}
      >
        {label}
      </span>
    </a>
  )
}

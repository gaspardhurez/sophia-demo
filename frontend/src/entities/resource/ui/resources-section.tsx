import { ArrowUpRight, Pencil, Plus } from 'lucide-react'
import { type ReactNode, useState } from 'react'

import { resourceEmoji, resourceHref } from '../model/emoji'
import type { Resource } from '../model/types'
import { cn } from '@/shared/lib/utils'

/** Un exercice qui cite une référence (son champ `reference`). */
export interface ExerciseReference {
  id: string
  emoji: string
  title: string
  reference: string
}

/**
 * Les ressources (design #81, `kit/Ressources`) : « Ressources n », « + »
 * collé au titre au survol ; d'abord « Des notes » (tuile, titre, « partie ·
 * référence » en gris, ↗ s'il y a un lien), puis « Des exercices », en
 * second : l'exercice en titre, sa référence en gris. Le compte dit les deux
 * (#160). Les sous-titres de groupe ne paraissent que si les deux groupes
 * sont visibles. (Le choix par cycle, des cases en Modifier, est retiré le
 * 26/10.)
 *
 * `collapseAfter` (#160, page savoir) : au-delà de ce nombre de lignes, les
 * premières seulement — les notes d'abord, les exercices dans la place qui
 * reste — puis « Voir les n autres » / « Réduire » ; sans ressource, « Ajouter
 * une ressource » en pointillé. Absent : tout, toujours.
 *
 * `onEdit` (#85) : au survol d'une ressource de l'étude, un crayon à gauche du
 * ↗ ouvre « Modifier la ressource » — en lecture comme en Modifier. Les
 * références des exercices n'en ont pas.
 *
 * Dans l'entité pour servir aux deux vues de la page savoir. (Les notes ont
 * leur propre liste, celle du cycle, dans leur colonne — #173.)
 */
export function ResourcesSection({
  resources,
  exercises,
  onAdd,
  onEdit,
  collapseAfter,
}: {
  resources: Resource[]
  exercises: ExerciseReference[]
  onAdd: () => void
  onEdit: (resource: Resource) => void
  collapseAfter?: number
}) {
  const [expanded, setExpanded] = useState(false)
  const total = resources.length + exercises.length
  const limit = collapseAfter ?? Infinity
  const hidden = Math.max(0, total - limit)
  const collapsed = hidden > 0 && !expanded
  const shownResources = collapsed ? resources.slice(0, limit) : resources
  const shownExercises = collapsed
    ? exercises.slice(0, Math.max(0, limit - resources.length))
    : exercises
  const both = shownResources.length > 0 && shownExercises.length > 0
  return (
    <section className="group/resources flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 pb-1.5">
        <h4 className="flex items-baseline gap-2 font-heading text-sm leading-6 font-semibold">
          Ressources
          {/* Sans ressource, le titre seul (#110). */}
          {total > 0 && (
            <span className="text-xs font-medium text-muted-foreground">
              {total}
            </span>
          )}
        </h4>
        <button
          type="button"
          aria-label="Nouvelle ressource"
          title="Nouvelle ressource"
          onClick={onAdd}
          className="grid size-6 cursor-pointer place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/resources:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      {both && <GroupLabel>Notes</GroupLabel>}
      {shownResources.map((r) => (
        <Row
          key={r.id}
          emoji={resourceEmoji(r)}
          title={r.title}
          // En infobulle : la partie, puis la référence.
          sub={[r.part, r.reference].filter(Boolean).join(' · ')}
          href={resourceHref(r.reference)}
          onEdit={() => onEdit(r)}
        />
      ))}
      {shownExercises.length > 0 && (
        <>
          {both && <GroupLabel>Exercices</GroupLabel>}
          {shownExercises.map((e) => (
            <Row
              key={e.id}
              emoji={e.emoji}
              // Comme une ressource des notes : le nom, la référence en
              // infobulle.
              title={e.title}
              sub={e.reference}
              href={resourceHref(e.reference)}
            />
          ))}
        </>
      )}
      {total === 0 && collapseAfter != null && (
        <button
          type="button"
          onClick={onAdd}
          className="flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border px-2.5 text-[12.5px] font-medium text-foreground/70 hover:border-muted-foreground/60 hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Ajouter une ressource
        </button>
      )}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-0.5 h-7 cursor-pointer self-start rounded-md px-2 text-[12.5px] font-medium text-foreground/80 hover:bg-muted"
        >
          {expanded
            ? 'Réduire'
            : hidden === 1
              ? "Voir l'autre"
              : `Voir les ${hidden} autres`}
        </button>
      )}
    </section>
  )
}

/** Le sous-titre d'un groupe (« Notes », « Exercices »). */
function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <span className="px-2 pt-2 pb-0.5 text-[10px] font-semibold tracking-[.05em] text-muted-foreground uppercase first:pt-0">
      {children}
    </span>
  )
}

/**
 * Une ressource, sur une ligne : la tuile, le nom — le reste (partie,
 * référence) en infobulle. Modifier et Ouvrir n'apparaissent qu'au survol (ou
 * au focus) : le nom glisse pour leur faire place et se tronque alors, pas
 * avant.
 */
function Row({
  emoji,
  title,
  sub,
  href,
  onEdit,
}: {
  emoji: string
  title: string
  sub: string
  href: string | null
  onEdit?: () => void
}) {
  const body = (
    <>
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded-[5px] border bg-muted text-[11px]"
      >
        {emoji}
      </span>
      <span
        className={cn(
          'min-w-0 flex-1 truncate text-[13px] font-medium transition-[padding] duration-150',
          // La place des gestes, au survol seulement.
          onEdit && href
            ? 'group-hover/row:pr-12 group-focus-within/row:pr-12'
            : (onEdit || href) &&
                'group-hover/row:pr-6 group-focus-within/row:pr-6',
        )}
      >
        {title}
      </span>
    </>
  )
  const main = 'flex min-w-0 flex-1 items-center gap-2'
  const icon =
    'grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-[5px] text-muted-foreground hover:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_5%)] hover:text-foreground'
  const tip = sub ? `${title}\n${sub}` : title
  return (
    <div
      className={cn(
        'group/row relative flex items-center rounded-md px-1.5 py-1',
        (href || onEdit) && 'hover:bg-muted',
      )}
    >
      {href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          title={tip}
          className={main}
        >
          {body}
        </a>
      ) : (
        <div title={tip} className={main}>
          {body}
        </div>
      )}
      {(onEdit || href) && (
        <span className="absolute right-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-focus-within/row:opacity-100 group-hover/row:opacity-100">
          {onEdit && (
            <button
              type="button"
              aria-label="Modifier la ressource"
              title="Modifier"
              onClick={onEdit}
              className={icon}
            >
              <Pencil className="size-3" />
            </button>
          )}
          {href && (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              aria-label="Ouvrir"
              title="Ouvrir"
              className={icon}
            >
              <ArrowUpRight className="size-3" />
            </a>
          )}
        </span>
      )}
    </div>
  )
}

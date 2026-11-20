import { useState } from 'react'

import {
  type ActivityTypeLink,
  LinkCard,
  type LinkColors,
} from '@/entities/activity-type'
import type { Domain } from '@/entities/domain'
import type { Total } from '@/entities/project'

import type { LinkHandlers } from '../model/link-handlers'
import { AddActivityTypeMenu } from './add-activity-type-menu'
import { LinkPopover } from './link-popover'
import { RemoveLinkDialog } from './remove-link-dialog'

/**
 * Les activités types d'un projet, **en édition** (#38, `kit/Activites
 * types`) : les cartes, cliquables vers leur popover, « Ajouter une activité
 * type », et la modale « Retirer ».
 *
 * Contrôlé : rien n'est écrit ici. La page projet écrit en base
 * (`useServerLinkHandlers`) ; le formulaire de création garde un brouillon tant
 * que le projet n'existe pas.
 */
export function ActivityTypesEditor({
  links,
  totals,
  domains,
  colors,
  inkClassName,
  handlers,
}: {
  links: ActivityTypeLink[]
  totals: Total[]
  /** Les domaines du projet, le principal en tête : on pioche dans leurs
   *  catalogues (#203). */
  domains: Domain[]
  colors: LinkColors
  inkClassName?: string
  handlers: LinkHandlers
}) {
  const [open, setOpen] = useState<{ id: string; rect: DOMRect } | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  const openLink = links.find((l) => l.activity_type_id === open?.id)
  const removingLink =
    links.find((l) => l.activity_type_id === removing) ?? null

  return (
    <>
      {links.length > 0 && (
        <div className="grid gap-1.5">
          {links.map((link) => (
            <LinkCard
              key={link.activity_type_id}
              link={link}
              colors={colors}
              open={open?.id === link.activity_type_id}
              onSelect={(rect) => setOpen({ id: link.activity_type_id, rect })}
            />
          ))}
        </div>
      )}

      <AddActivityTypeMenu
        domains={domains}
        linkedIds={links.map((l) => l.activity_type_id)}
        onPick={async (activityType) => {
          const id = activityType.id
          await handlers.onAdd(activityType)
          // Le lien neuf ouvre aussitôt son popover, à côté de sa carte.
          requestAnimationFrame(() => {
            const card = document.querySelector<HTMLElement>(
              `[data-card-id="${id}"]`,
            )
            if (card) setOpen({ id, rect: card.getBoundingClientRect() })
          })
        }}
      />

      {openLink && open && (
        <LinkPopover
          key={openLink.activity_type_id}
          link={openLink}
          anchor={open.rect}
          soft={colors.soft}
          inkClassName={inkClassName}
          onClose={() => setOpen(null)}
          onRemove={() => {
            setRemoving(openLink.activity_type_id)
            setOpen(null)
          }}
          onChange={(body, reset) =>
            handlers.onChange(openLink.activity_type_id, body, reset)
          }
        />
      )}
      <RemoveLinkDialog
        totals={totals}
        link={removingLink}
        onClose={() => setRemoving(null)}
        onConfirm={(choice) =>
          removingLink
            ? handlers.onRemove(removingLink.activity_type_id, choice)
            : Promise.resolve()
        }
      />
    </>
  )
}

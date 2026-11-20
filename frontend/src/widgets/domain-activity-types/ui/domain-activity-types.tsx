import { useEffect, useRef, useState } from 'react'

import {
  type ActivityType,
  CardPopover,
  fallbackPlanning,
  LinkCard,
  type LinkColors,
  PLANNING_LABELS,
  PlanningCard,
  useActivityTypes,
} from '@/entities/activity-type'
import { type Domain, domainColorValues } from '@/entities/domain'
import type { Project } from '@/entities/project'
import { DeleteActivityTypeDialog } from '@/features/activity-type/delete'
import { ActivityTypePopover } from '@/features/activity-type/edit'
import { NewActivityTypeForm } from '@/features/activity-type-link'
import { ItemCard, SectionTitle, Skeleton, SkeletonRegion } from '@/shared/ui'

import { groupByProject } from '../model/groups'

/**
 * « Activités » de la page domaine (colonne de droite), alignée le 18/11 sur
 * la section « Activités types » du projet (#38) : les activités types du
 * domaine **groupées par projet ouvert** — la carte de leur lien, comme sur
 * la page projet —, puis « Hors projet » : celles qu'aucun projet ouvert ne
 * porte, avec leur repli. Une activité type de deux projets est dans les
 * deux groupes. Un clic ouvre son popover ; le « + » en crée une sur place
 * (emoji, titre), dont le popover s'ouvre aussitôt.
 */
export function DomainActivityTypes({
  domain,
  projects,
}: {
  domain: Domain
  projects: Project[]
}) {
  const { data: types, isPending } = useActivityTypes(domain.id)
  const values = domainColorValues(domain.color)
  const colors: LinkColors = {
    soft: values.soft,
    bord: values.bord,
    ink: values.ink,
  }

  const [creating, setCreating] = useState<DOMRect | null>(null)
  const [open, setOpen] = useState<{ id: string; rect: DOMRect } | null>(null)
  const [pendingDelete, setPendingDelete] = useState<ActivityType | null>(null)
  // L'activité type tout juste créée : son popover s'ouvre dès que sa carte
  // paraît (la liste se recharge après la création).
  const [fresh, setFresh] = useState<string | null>(null)
  const section = useRef<HTMLElement>(null)
  const openType = types?.find((t) => t.id === open?.id)
  const { groups, outside } = groupByProject(types ?? [], projects)

  useEffect(() => {
    if (!fresh) return
    const card = document.querySelector<HTMLElement>(
      `[data-card-id="${fresh}"]`,
    )
    if (!card) return
    setFresh(null)
    setOpen({ id: fresh, rect: card.getBoundingClientRect() })
  }, [fresh, types])

  const select = (id: string) => (rect: DOMRect) => setOpen({ id, rect })

  return (
    <section ref={section} className="flex min-w-0 flex-col gap-2.5">
      <SectionTitle
        as="h3"
        className="mb-0"
        onAdd={() =>
          setCreating(section.current?.getBoundingClientRect() ?? null)
        }
        addLabel="Nouvelle activité type"
      >
        Activités
      </SectionTitle>

      {isPending && (
        <SkeletonRegion className="flex flex-col gap-1.5 rounded-[10px] bg-muted/70 px-3.5 py-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[46px] rounded-lg" />
          ))}
        </SkeletonRegion>
      )}

      {types && types.length === 0 && (
        <ItemCard.Empty>Aucune activité type</ItemCard.Empty>
      )}

      {types && types.length > 0 && (
        <div className="flex min-w-0 flex-col gap-3.5 rounded-[10px] bg-muted/70 px-3.5 py-3">
          {groups.map(({ project, links }) => (
            <Group
              key={project.id}
              label={`${project.emoji ? `${project.emoji} ` : ''}${project.title}`}
            >
              {links.map((link) => (
                <LinkCard
                  key={link.activity_type_id}
                  link={link}
                  colors={colors}
                  open={open?.id === link.activity_type_id}
                  onSelect={select(link.activity_type_id)}
                />
              ))}
            </Group>
          ))}
          {outside.length > 0 && (
            <Group label="Hors projet">
              {outside.map((type) => {
                const planning = fallbackPlanning(type)
                return (
                  <PlanningCard
                    key={type.id}
                    id={type.id}
                    emoji={type.emoji}
                    title={type.title}
                    label={PLANNING_LABELS[planning]}
                    planning={planning}
                    weekdays={type.fallback_weekdays}
                    colors={colors}
                    open={open?.id === type.id}
                    onSelect={select(type.id)}
                  />
                )
              })}
            </Group>
          )}
        </div>
      )}

      {creating && (
        <CardPopover anchor={creating} onClose={() => setCreating(null)}>
          <NewActivityTypeForm
            domains={[domain]}
            onCreated={async (created) => {
              setCreating(null)
              setFresh(created.id)
            }}
            onCancel={() => setCreating(null)}
          />
        </CardPopover>
      )}

      {openType && open && (
        <ActivityTypePopover
          key={openType.id}
          activityType={openType}
          carriedBy={groups
            .filter((g) =>
              g.links.some((l) => l.activity_type_id === openType.id),
            )
            .map((g) => g.project.title)}
          anchor={open.rect}
          soft={colors.soft}
          onClose={() => setOpen(null)}
          onDelete={() => {
            setOpen(null)
            setPendingDelete(openType)
          }}
        />
      )}

      <DeleteActivityTypeDialog
        activityType={pendingDelete}
        onClose={() => setPendingDelete(null)}
      />
    </section>
  )
}

/** Un groupe : son nom, puis ses cartes. `minmax(0, 1fr)` : un titre long
 *  se tronque au lieu d'élargir la colonne. */
function Group({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-1.5">
      <span className="truncate text-[11px] font-semibold text-muted-foreground">
        {label}
      </span>
      {children}
    </div>
  )
}

import { useCallback, useState } from 'react'

import {
  type ActivityTypeLink,
  type ActivityTypeLinkSet,
  useDeleteActivityType,
  useSetProjectActivityType,
  useUpdateActivityType,
} from '@/entities/activity-type'
import {
  useCreateProject,
  useDeleteProject,
  useUpdateProject,
} from '@/entities/project'
import { type LinkHandlers, NEW_LINK } from '@/features/activity-type-link'

/** La planification d'un lien, tous champs posés (le contrat les laisse
 *  facultatifs à l'écriture). */
function planningOf(body: ActivityTypeLinkSet) {
  return {
    planning: body.planning,
    weekdays: body.weekdays ?? [],
    slot_start: body.slot_start ?? null,
    slot_minutes: body.slot_minutes ?? null,
    preserve_after: body.preserve_after,
    off_step_ids: body.off_step_ids ?? [],
  }
}

/** Ce que porte l'étape 1 : les champs de l'en-tête, plus les domaines. */
export interface ProjectFields {
  /** Les domaines, le principal en tête (#203). */
  domainIds: string[]
  /** Nul : celui du domaine principal. */
  emoji: string | null
  title: string
  description: string
  start: string | null
  end: string | null
}

/**
 * Le projet en cours de création (design #33). Il naît **en base** en quittant
 * l'étape 1 : les étapes suivantes l'éditent avec les pièces de la page. Revenir
 * à l'étape 1 puis continuer le met à jour. Ses domaines (#203) se choisissent
 * en brouillon ; une fois le projet créé, ils s'éditent en base, comme sur la
 * page (retirer confirme ce qui se délie).
 *
 * Les activités types se déclarent aussi à l'étape 1 (#38), avant que
 * le projet existe : elles vivent dans un **brouillon** (`links`,
 * `localHandlers`), écrit en base à la création. Une fois le projet créé, le
 * formulaire les édite en base, comme la page.
 */
export function useProjectDraft(initialDomainId: string | null) {
  const [fields, setFields] = useState<ProjectFields>({
    domainIds: initialDomainId ? [initialDomainId] : [],
    emoji: null,
    title: '',
    description: '',
    start: null,
    end: null,
  })
  // Ce qui a été écrit en base, pour ne patcher que ce qui a changé.
  const [saved, setSaved] = useState<(ProjectFields & { id: string }) | null>(
    null,
  )
  const [links, setLinks] = useState<ActivityTypeLink[]>([])
  // Le domaine de chaque activité type du brouillon : retirer un domaine
  // retire les siennes.
  const [linkDomains, setLinkDomains] = useState<Record<string, string>>({})
  const setLink = useSetProjectActivityType()
  const updateType = useUpdateActivityType()
  const deleteType = useDeleteActivityType()
  const create = useCreateProject()
  const update = useUpdateProject()
  const remove = useDeleteProject()

  const complete =
    fields.domainIds.length > 0 &&
    fields.title.trim() !== '' &&
    // Le sélecteur ne rend qu'une plage choisie : un début sans fin, c'est
    // « Pas de fin » (#196).
    Boolean(fields.start)
  const dirty =
    saved !== null ||
    fields.title.trim() !== '' ||
    fields.description.trim() !== '' ||
    Boolean(fields.start || fields.end)

  const patch = useCallback(
    (next: Partial<ProjectFields>) => {
      // Les activités types appartiennent à un domaine : en retirer un retire
      // les siennes du brouillon.
      const kept = next.domainIds
      if (kept)
        setLinks((current) =>
          current.filter((l) => kept.includes(linkDomains[l.activity_type_id])),
        )
      setFields((f) => ({ ...f, ...next }))
    },
    [linkDomains],
  )

  /** L'éditeur branché sur le brouillon, tant que le projet n'existe pas. */
  const localHandlers: LinkHandlers = {
    onAdd: async (activityType) => {
      setLinkDomains((current) => ({
        ...current,
        [activityType.id]: activityType.domain_id,
      }))
      setLinks((current) => [
        ...current,
        {
          activity_type_id: activityType.id,
          title: activityType.title,
          emoji: activityType.emoji,
          description: activityType.description,
          ...planningOf(NEW_LINK),
          posed_until: null,
        },
      ])
    },
    onChange: async (activityTypeId, body) => {
      setLinks((current) =>
        current.map((link) =>
          link.activity_type_id === activityTypeId
            ? { ...link, ...planningOf(body) }
            : link,
        ),
      )
    },
    onRemove: async (activityTypeId, choice) => {
      const link = links.find((l) => l.activity_type_id === activityTypeId)
      if (choice === 'delete') await deleteType.mutateAsync(activityTypeId)
      if (choice === 'domain' && link)
        await updateType.mutateAsync({
          id: activityTypeId,
          body: {
            fallback_active: true,
            fallback_planning: link.planning,
            fallback_weekdays: link.weekdays,
          },
        })
      setLinks((current) =>
        current.filter((l) => l.activity_type_id !== activityTypeId),
      )
    },
  }

  /**
   * Supprime le projet créé, avec ce que ses liens ont posé au calendrier
   * sans qu'on y touche. La suppression délie ses savoirs d'elle-même, et
   * remporte ainsi leurs brouillons de cycle vierges.
   */
  async function discard() {
    if (!saved) return
    await remove.mutateAsync({ id: saved.id, discardPosed: true })
    setSaved(null)
  }

  /** Écrit l'étape 1 : crée ou met à jour. Rend l'id du projet. */
  async function save(): Promise<string> {
    const body = {
      title: fields.title.trim(),
      emoji: fields.emoji,
      description: fields.description.trim() || null,
      start_at: fields.start!,
      due_at: fields.end,
    }
    const snapshot = { ...fields, title: body.title }
    if (saved) {
      const same =
        saved.title === body.title &&
        saved.emoji === body.emoji &&
        (saved.description.trim() || null) === body.description &&
        saved.start === body.start_at &&
        saved.end === body.due_at
      if (!same) {
        await update.mutateAsync({ id: saved.id, body })
        setSaved({ ...snapshot, id: saved.id })
      }
      return saved.id
    }
    const [principal, ...secondary] = fields.domainIds
    const created = await create.mutateAsync({
      domainId: principal,
      body: { ...body, status: 'todo', secondary_domain_ids: secondary },
    })
    // Le brouillon des activités types devient des liens en base.
    for (const link of links)
      await setLink.mutateAsync({
        projectId: created.id,
        activityTypeId: link.activity_type_id,
        body: {
          planning: link.planning,
          weekdays: link.weekdays,
          slot_start: link.slot_start,
          slot_minutes: link.slot_minutes,
          preserve_after: link.preserve_after,
          off_step_ids: [],
        },
      })
    setLinks([])
    setSaved({ ...snapshot, id: created.id })
    return created.id
  }

  return {
    fields,
    patch,
    links,
    localHandlers,
    complete,
    dirty,
    id: saved?.id ?? null,
    save,
    discard,
    saving:
      create.isPending ||
      update.isPending ||
      remove.isPending ||
      setLink.isPending,
  }
}

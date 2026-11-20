import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import {
  type AcquisitionPlan,
  type ResourceProposal,
  useUpdatePlan,
} from '@/entities/plan'
import {
  linkTitleQuery,
  type Resource,
  useCreateResource,
  useResources,
} from '@/entities/resource'
import { ApiError } from '@/shared/api'
import { toast } from '@/shared/ui'

import {
  isLink,
  proposalEmoji,
  proposalMeta,
  resourceTitle,
} from '../lib/resource-text'

/** Une ressource en cours d'ajout : le texte écrit, et si on lit son lien. */
export interface PendingResource {
  key: number
  text: string
  reading: boolean
  /** Créée : on attend que le cycle relu la porte. */
  createdId?: string
  /** Une proposition de Sophia : sa tuile et sa ligne grise. */
  proposal?: { emoji: string; sub: string }
}

/** Une ressource du cycle dans « Ajoutées », et si on l'a ajoutée ici. */
export interface AddedResource {
  resource: Resource
  /** Ajoutée pendant ce cadrage : elle se retire (✕). Celles qui y étaient
   *  à l'ouverture restent (`prod/Cadrer etude - Ressources`, relance). */
  mine: boolean
  /** Ajoutée depuis une proposition, pendant ce cadrage : sa ligne grise
   *  reste celle de la carte (auteur · type · durée · date). */
  sub?: string
}

/**
 * Les ressources du cycle pendant le cadrage (#175, temps 3). Tenu par la
 * modale — et non par l'écran Ressources — pour qu'un Retour au périmètre
 * ne perde pas ce qu'on a ajouté ici.
 *
 * - `added` : les ressources du cycle, dans l'**ordre de consommation** ;
 *   un ajout entre en fin (le serveur l'y range).
 * - `add` : un lien ou un titre. Un lien se lit d'abord (le titre de sa
 *   page, `GET /link-title`) — « Lecture… » pendant ce temps —, puis la
 *   ressource se crée **dans le cycle** (`plan_id`) : le serveur y lit aussi
 *   sa sorte, pour la tuile (📺, 📘, 🔗). Chaque ajout s'écrit aussitôt.
 * - `addProposal` : une ressource proposée par Sophia entre dans le cycle,
 *   son titre, son lien et son auteur repris de la carte — en fin, comme
 *   les autres. Rend `false` si l'ajout a échoué (la carte revient).
 * - `remove` : retire du **cycle** une ressource ajoutée ici (la liste
 *   entière, `PATCH /plans/{id}`) ; elle reste dans la bibliothèque du
 *   savoir.
 */
export function useFrameResources(skillId: string, plan: AcquisitionPlan) {
  const queryClient = useQueryClient()
  const { data: resources } = useResources(skillId)
  const create = useCreateResource(skillId)
  const update = useUpdatePlan()
  // Les ids ajoutés pendant ce cadrage, et ceux en cours d'ajout.
  const [mine, setMine] = useState<ReadonlySet<string>>(new Set())
  // La ligne grise des ressources ajoutées depuis une carte.
  const [subs, setSubs] = useState<ReadonlyMap<string, string>>(new Map())
  const [pending, setPending] = useState<PendingResource[]>([])
  const [nextKey, setNextKey] = useState(0)

  const byId = new Map((resources ?? []).map((r) => [r.id, r]))
  const added: AddedResource[] = [...plan.resources]
    .sort((a, b) => a.position - b.position)
    .flatMap((pr) => {
      const resource = byId.get(pr.resource_id)
      return resource
        ? [
            {
              resource,
              mine: mine.has(resource.id),
              sub: subs.get(resource.id),
            },
          ]
        : []
    })

  async function add(text: string) {
    const typed = text.trim()
    if (!typed) return
    const key = nextKey
    setNextKey(key + 1)
    const link = isLink(typed)
    setPending((p) => [...p, { key, text: typed, reading: link }])
    try {
      // Un titre illisible n'empêche pas l'ajout : le lien en tient lieu.
      const read = link
        ? await queryClient.fetchQuery(linkTitleQuery(typed)).catch(() => null)
        : null
      const created = await create.mutateAsync({
        title: resourceTitle(typed, read?.title ?? null),
        author: read?.author ?? null,
        reference: link ? typed : null,
        plan_id: plan.id,
      })
      setMine((s) => new Set(s).add(created.id))
      // Elle reste « en cours » jusqu'à ce que le cycle relu la porte :
      // pas de trou entre les deux.
      setPending((p) =>
        p.map((x) => (x.key === key ? { ...x, createdId: created.id } : x)),
      )
    } catch (err) {
      setPending((p) => p.filter((x) => x.key !== key))
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'La ressource n’a pas été ajoutée',
      )
    }
  }

  async function addProposal(p: ResourceProposal): Promise<boolean> {
    const key = nextKey
    setNextKey(key + 1)
    const sub = [p.author, proposalMeta(p)].filter(Boolean).join(' · ')
    setPending((list) => [
      ...list,
      {
        key,
        text: p.title,
        reading: false,
        proposal: { emoji: proposalEmoji(p.kind), sub },
      },
    ])
    try {
      const created = await create.mutateAsync({
        title: p.title.slice(0, 200),
        reference: p.url,
        author: p.author,
        plan_id: plan.id,
      })
      setMine((s) => new Set(s).add(created.id))
      setSubs((m) => new Map(m).set(created.id, sub))
      setPending((list) =>
        list.map((x) => (x.key === key ? { ...x, createdId: created.id } : x)),
      )
      return true
    } catch (err) {
      setPending((list) => list.filter((x) => x.key !== key))
      toast.error(
        err instanceof ApiError
          ? err.message
          : 'La ressource n’a pas été ajoutée',
      )
      return false
    }
  }

  function remove(resourceId: string) {
    const ids = plan.resources
      .map((r) => r.resource_id)
      .filter((id) => id !== resourceId)
    update
      .mutateAsync({ id: plan.id, body: { resource_ids: ids } })
      .then(() =>
        setMine((s) => {
          const next = new Set(s)
          next.delete(resourceId)
          return next
        }),
      )
      .catch((err) =>
        toast.error(
          err instanceof ApiError
            ? err.message
            : 'La ressource n’a pas pu se retirer',
        ),
      )
  }

  const shown = new Set(added.map((a) => a.resource.id))
  return {
    added,
    pending: pending.filter((p) => !p.createdId || !shown.has(p.createdId)),
    add,
    addProposal,
    remove,
  }
}

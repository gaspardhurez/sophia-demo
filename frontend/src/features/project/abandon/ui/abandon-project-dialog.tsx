import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'

import { type Project, useUpdateProject } from '@/entities/project'
import { useDomainsSkills } from '@/entities/skill'
import { ApiError } from '@/shared/api'
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  toast,
} from '@/shared/ui'

/**
 * Abandonner un projet — annoncer ce que ça touche (design #27), puis le faire.
 *
 * Abandonner ne supprime aucune activité (#37, modifie #32) : toutes restent
 * au calendrier avec leur lien au projet, on trie à la main. La ligne
 * « Activités à venir supprimées » a donc disparu.
 */
export function AbandonProjectDialog({
  project,
  trigger,
}: {
  project: Project
  trigger: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const update = useUpdateProject()
  const queryClient = useQueryClient()
  const { data: skills } = useDomainsSkills(project.domain_ids)

  const openCycles = (skills ?? []).filter(
    (s) => project.skill_ids.includes(s.id) && s.status === 'in_progress',
  ).length
  const types = project.activity_types.filter(
    (link) => link.planning !== 'manual',
  ).length

  const lines = [
    {
      axis: 'Savoirs',
      n: openCycles,
      text:
        openCycles > 1
          ? 'cycles ouverts — ils restent ouverts sur leur savoir'
          : 'cycle ouvert — il reste ouvert sur le savoir',
    },
    {
      axis: 'Activités types',
      n: types,
      text:
        types > 1
          ? 'planifiées — elles ne se posent plus pour lui'
          : 'planifiée — elle ne se pose plus pour lui',
    },
  ].filter((l) => l.n > 0)

  async function confirm() {
    try {
      await update.mutateAsync({
        id: project.id,
        body: { status: 'abandoned' },
      })
      // Ses activités types cessent de se poser pour lui.
      await queryClient.invalidateQueries({ queryKey: ['activities'] })
      setOpen(false)
      toast.success('Projet abandonné')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Échec')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Abandonner « {project.title} » ?</DialogTitle>
        </DialogHeader>
        {lines.length > 0 ? (
          <ul className="grid">
            {lines.map((l) => (
              <li
                key={l.axis}
                className="flex min-h-[34px] items-center gap-2 border-b border-border/70 py-1 last:border-0"
              >
                <span className="w-24 shrink-0 text-[10px] uppercase tracking-[.05em] text-muted-foreground">
                  {l.axis}
                </span>
                <span className="font-heading text-sm font-semibold tabular-nums">
                  {l.n}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {l.text}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Rien d'autre n'est touché : le projet passe simplement en abandon.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="ghost"
            isPending={update.isPending}
            className="bg-destructive/10 text-destructive hover:bg-destructive/15"
            onClick={() => void confirm()}
          >
            Abandonner le projet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

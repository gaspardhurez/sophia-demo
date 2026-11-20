import { useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useState } from 'react'

import { useProjectMetrics } from '@/entities/metric'
import { type Project, useDeleteProject } from '@/entities/project'
import { useDomainsSkills } from '@/entities/skill'
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
 * Supprimer un projet — annoncer ce qui part et ce qui reste (design #32),
 * puis le faire.
 *
 * Le back tranche : objectifs, précisions et étapes partent. Les activités
 * restent toutes, passées comme à venir, sans ce lien (#37, modifie #32) — la
 * ligne « Activités à venir supprimées » a donc disparu.
 */
export function DeleteProjectDialog({
  project,
  trigger,
  onDeleted,
}: {
  project: Project
  trigger: ReactNode
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const remove = useDeleteProject()
  const queryClient = useQueryClient()
  const { data: results } = useProjectMetrics(project.id)
  const { data: skills } = useDomainsSkills(project.domain_ids)

  const objectives =
    project.totals.length +
    (results?.length ?? 0) +
    project.achievements.length +
    (project.skill_ids.length > 0 ? 1 : 0)
  const steps = project.steps.length
  const types = project.activity_types.filter(
    (link) => link.planning !== 'manual',
  ).length
  const openCycles = (skills ?? []).filter(
    (s) => project.skill_ids.includes(s.id) && s.status === 'in_progress',
  ).length

  const lines = [
    {
      axis: 'Objectifs',
      n: objectives,
      text: 'et leurs précisions — supprimés',
    },
    { axis: 'Étapes', n: steps, text: 'supprimées' },
    {
      axis: 'Activités types',
      n: types,
      text: types > 1 ? 'gardées, détachées' : 'gardée, détachée',
    },
    {
      axis: 'Savoirs',
      n: openCycles,
      text: openCycles > 1 ? 'cycles restent ouverts' : 'cycle reste ouvert',
    },
  ].filter((l) => l.n > 0)

  async function confirm() {
    try {
      await remove.mutateAsync({ id: project.id })
      // Des activités viennent de quitter le projet.
      await queryClient.invalidateQueries({ queryKey: ['activities'] })
      setOpen(false)
      toast.success(`Projet « ${project.title} » supprimé`)
      onDeleted()
    } catch {
      toast.error('La suppression a échoué')
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Supprimer « {project.title} » ?</DialogTitle>
        </DialogHeader>
        {lines.length > 0 && (
          <ul className="grid">
            {lines.map((l) => (
              <li
                key={l.axis}
                className="flex h-[34px] items-center gap-2.5 border-t border-border/70"
              >
                <span className="w-24 shrink-0 text-[10px] font-semibold tracking-[.05em] text-muted-foreground uppercase">
                  {l.axis}
                </span>
                <span className="flex min-w-0 flex-1 items-baseline gap-[5px] tabular-nums">
                  <span className="font-heading text-sm font-semibold">
                    {l.n}
                  </span>
                  <span className="truncate text-[13px] text-muted-foreground">
                    {l.text}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="ghost"
            isPending={remove.isPending}
            className="bg-destructive/10 text-destructive hover:bg-destructive/20"
            onClick={() => void confirm()}
          >
            Supprimer le projet
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

import { Pencil, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import {
  CounterChip,
  DEFAULT_DOMAIN_COLOR,
  domainColor,
  domainColorValues,
  DOMAIN_COLORS,
  type Domain,
  type DomainColorKey,
  useDomainCounters,
  useUpdateDomain,
} from '@/entities/domain'
import { buildFrise, type Project, SeasonFrise } from '@/entities/project'
import { DeleteDomainDialog } from '@/features/domain/delete'
import { DomainStatusMenu } from '@/features/domain/set-status'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import {
  Button,
  EmojiField,
  FormSection,
  Input,
  Textarea,
  toast,
} from '@/shared/ui'

interface Draft {
  name: string
  emoji: string
  color: DomainColorKey
  vision: string
}

/**
 * L'en-tête d'un domaine (design #51, `prod/Domaine`) : le haut blanc de la
 * carte que la page monte autour de lui.
 *
 * En lecture : tuile d'emoji, nom, chip de statut (elle est aussi le geste),
 * les compteurs du domaine en chips (#192 : depuis toujours, l'année au
 * survol), crayon au survol ; la vision sous le titre, sans encadré. La frise
 * des saisons sort du bloc blanc : une bande dessous, séparée par un filet.
 * Le crayon passe l'en-tête en édition sur place — le nom devient le champ,
 * la tuile ouvre le sélecteur d'emoji, Couleur et Vision dessous, Supprimer à
 * gauche du pied. La frise s'efface pendant l'édition.
 */
export function DomainHeader({
  domain,
  projects,
  selectedProjectId,
  onSelectProject,
  onDeleted,
}: {
  domain: Domain
  projects: Project[]
  selectedProjectId: string | null
  onSelectProject: (projectId: string | null) => void
  onDeleted: () => void
}) {
  const update = useUpdateDomain()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [deleting, setDeleting] = useState(false)
  const color = domainColor(domain.color)
  const values = domainColorValues(domain.color)
  const frise = useMemo(() => buildFrise(projects, new Date()), [projects])
  const { data: counters } = useDomainCounters(domain.id)

  function startEdit() {
    setDraft({
      name: domain.name,
      emoji: domain.emoji ?? '',
      color: (DOMAIN_COLORS.some((c) => c.key === domain.color)
        ? domain.color
        : DEFAULT_DOMAIN_COLOR) as DomainColorKey,
      vision: domain.vision ?? '',
    })
  }

  async function onSave() {
    if (!draft || !draft.name.trim()) return
    try {
      await update.mutateAsync({
        id: domain.id,
        body: {
          name: draft.name.trim(),
          emoji: draft.emoji || null,
          color: draft.color,
          vision: draft.vision.trim() || null,
        },
      })
      setDraft(null)
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : 'La mise à jour a échoué',
      )
    }
  }

  const tile = 'size-9 shrink-0 rounded-[10px] border text-xl'

  if (draft) {
    const muted = 'h-8 px-2.5 text-xs font-semibold'
    const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch })
    return (
      <section className="grid gap-3 rounded-t-xl border-b bg-card px-6 py-5">
        <div className="flex items-center gap-3">
          <EmojiField
            value={draft.emoji}
            onChange={(emoji) => set({ emoji })}
            aria-label="Emoji du domaine"
            className={cn(tile, 'w-9', domainColor(draft.color).soft)}
          />
          <Input
            autoFocus
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            aria-label="Nom du domaine"
            aria-required
            className="h-10 flex-1 font-heading text-lg font-semibold tracking-[-0.01em]"
          />
        </div>

        <FormSection title="Couleur" className="max-w-[720px] gap-2">
          <div className="flex gap-1.5">
            {DOMAIN_COLORS.map((c) => (
              <button
                key={c.key}
                type="button"
                title={c.label}
                aria-label={c.label}
                aria-pressed={draft.color === c.key}
                onClick={() => set({ color: c.key })}
                className={cn('size-6 rounded-full', domainColor(c.key).dot)}
                style={
                  draft.color === c.key
                    ? {
                        boxShadow: `0 0 0 2px var(--card), 0 0 0 4px ${domainColorValues(c.key).base}`,
                      }
                    : undefined
                }
              />
            ))}
          </div>
        </FormSection>

        <FormSection title="Vision" className="max-w-[720px] gap-2">
          <Textarea
            rows={2}
            aria-label="Vision"
            placeholder="Où tu veux arriver dans ce domaine"
            value={draft.vision}
            onChange={(e) => set({ vision: e.target.value })}
          />
        </FormSection>

        <div className="mt-1 flex items-center gap-2">
          <Button
            variant="ghost"
            className={cn(
              muted,
              'text-destructive hover:bg-destructive/10 hover:text-destructive',
            )}
            onClick={() => setDeleting(true)}
          >
            <Trash2 className="size-3.5" /> Supprimer
          </Button>
          <Button
            variant="outline"
            className={cn(muted, 'ml-auto')}
            onClick={() => setDraft(null)}
          >
            Annuler
          </Button>
          <Button
            className={muted}
            onClick={() => void onSave()}
            isPending={update.isPending}
            disabled={!draft.name.trim()}
          >
            Enregistrer
          </Button>
        </div>

        <DeleteDomainDialog
          domain={domain}
          open={deleting}
          onOpenChange={setDeleting}
          onDeleted={onDeleted}
        />
      </section>
    )
  }

  return (
    <>
      <section className="group/head grid gap-3 rounded-t-xl border-b bg-card px-6 py-5">
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={cn(tile, 'grid place-items-center', color.soft)}
          >
            {domain.emoji}
          </span>
          <h1 className="font-heading text-[22px] leading-none font-semibold tracking-[-0.02em]">
            {domain.name}
          </h1>
          <DomainStatusMenu domain={domain} />
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {counters?.map((counter) => (
              <CounterChip
                key={counter.unit?.id ?? 'hours'}
                counter={counter}
                colorKey={domain.color}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={startEdit}
            aria-label="Éditer le domaine"
            className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/head:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100"
          >
            <Pencil className="size-4" />
          </button>
        </div>

        {domain.vision && (
          <p className="max-w-[720px] text-[13px] leading-normal whitespace-pre-line text-pretty text-muted-foreground">
            {domain.vision}
          </p>
        )}
      </section>

      {frise.bars.length > 0 && (
        // La frise a sa marge haute (`mt-1.5`) : 10 + 6 = les 16 px de la maquette.
        <div className="border-b px-6 pt-2.5 pb-3.5">
          <SeasonFrise
            frise={frise}
            colors={values}
            textClassName={color.text}
            selectedId={selectedProjectId}
            onSelect={onSelectProject}
          />
        </div>
      )}
    </>
  )
}

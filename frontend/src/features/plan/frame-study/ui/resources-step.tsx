import { ArrowUpRight, Link2, Search, X } from 'lucide-react'
import { useState } from 'react'

import { resourceEmoji } from '@/entities/resource'
import { cn } from '@/shared/lib/utils'
import type { ResourceProposal } from '@/entities/plan'
import { Button, Skeleton, SkeletonRegion } from '@/shared/ui'

import {
  isLink,
  proposalEmoji,
  proposalMeta,
  resourceSubline,
  shortLink,
} from '../lib/resource-text'
import { useFramingCompanion } from '../model/companion'
import type {
  AddedResource,
  PendingResource,
} from '../model/use-frame-resources'
import {
  PREFERENCES_MAX,
  type ResourcePreferences,
} from '../model/use-resource-preferences'
import type { ResourceSearch } from '../model/use-resource-search'
import { ErrorLine, Footer, UnavailableNote } from './parts'

/** Le petit titre d'une liste (« Ajoutées », « Proposées »). */
const LIST_LABEL =
  'text-[10.5px] font-semibold tracking-[0.05em] text-muted-foreground uppercase'

/**
 * 3 · Ressources (#175, `prod/Cadrer etude - Ressources`), sur un écran :
 *
 * - « Tu as déjà des ressources ? » : un lien ou un titre ; Ajouter (ou
 *   Entrée) l'ajoute au cycle aussitôt.
 * - « Tu as des préférences ? (format, sources…) » : ce qui guide la
 *   recherche de Sophia, gardé au domaine quand le champ perd le focus
 *   (`useResourcePreferences`) — grisé sans elle.
 * - « Ajoutées » : les ressources du cycle, numérotées dans l'ordre de
 *   consommation (un ajout entre en fin) ; « Lecture… » pendant qu'on lit
 *   un lien ; ✕ retire du cycle celles ajoutées pendant ce cadrage (celles
 *   qui y étaient restent).
 * - « Proposées » : avec le compagnon, la recherche **part au clic** —
 *   « Chercher des ressources » à l'arrivée, puis « Chercher à nouveau »,
 *   discret, foncé dès qu'une préférence ou une ressource a changé depuis
 *   (`useResourceSearch`). Trois squelettes pendant la recherche ; puis
 *   trois cartes (titre, ↗, auteur · pourquoi s'y fier, type · durée ·
 *   date · ce qu'elle couvre) : Ajouter la fait monter dans « Ajoutées »,
 *   la suivante prend sa place. Rien : « Rien de solide pour ces
 *   préférences. » ; toutes ajoutées : « Plus rien à proposer. » ; échec :
 *   « La recherche n'a pas abouti. » et Réessayer. Sans compagnon, la
 *   ligne grisée « Recherche de ressources indisponible ».
 *
 * Pied : Retour, Terminer.
 */
export function ResourcesStep({
  added,
  pending,
  preferences,
  search,
  onAdd,
  onAddProposal,
  onRemove,
  onBack,
  onDone,
}: {
  added: AddedResource[]
  pending: PendingResource[]
  preferences: ResourcePreferences
  search: ResourceSearch
  onAdd: (text: string) => void
  onAddProposal: (proposal: ResourceProposal) => void
  onRemove: (resourceId: string) => void
  onBack: () => void
  onDone: () => void
}) {
  const companion = useFramingCompanion('resources')
  const [text, setText] = useState('')
  const typed = text.trim()

  function add() {
    if (!typed) return
    onAdd(typed)
    setText('')
  }

  /** Chercher, avec les préférences du champ ; les liens déjà ajoutés ne
   *  reviennent pas. */
  function find() {
    search.run(
      preferences.text,
      added.flatMap(({ resource }) =>
        resource.reference ? [resource.reference] : [],
      ),
    )
  }

  return (
    <>
      <div className="flex h-[580px] max-h-[calc(100dvh-10rem)] flex-col">
        <div className="flex flex-col gap-3 border-b border-foreground/[0.05] px-[18px] pt-4 pb-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">
              Tu as déjà des ressources ?
            </span>
            <span className="flex h-9 items-center gap-2 rounded-lg pr-1.5 pl-2.5 ring-1 ring-border ring-inset focus-within:ring-[1.5px] focus-within:ring-foreground/40">
              <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={text}
                placeholder="Colle un lien, ou écris un titre…"
                maxLength={500}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    add()
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70"
              />
              {typed && (
                <Button
                  size="xs"
                  className="text-[12.5px] font-medium"
                  onClick={add}
                >
                  Ajouter
                </Button>
              )}
            </span>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">
              Tu as des préférences ?{' '}
              <span className="font-normal text-muted-foreground">
                (format, sources…)
              </span>
            </span>
            <input
              value={companion.available ? preferences.text : ''}
              disabled={!companion.available}
              maxLength={PREFERENCES_MAX}
              placeholder="Des vidéos courtes, des coachs reconnus…"
              onChange={(e) => preferences.setText(e.target.value)}
              onBlur={preferences.commit}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              className={cn(
                'h-9 rounded-lg bg-transparent px-2.5 text-[13.5px] ring-1 ring-border outline-none ring-inset placeholder:text-muted-foreground/70 focus:ring-[1.5px] focus:ring-foreground/40 disabled:opacity-50',
                // Pas encore gardé : le liseré reste marqué.
                companion.available &&
                  preferences.changed &&
                  'ring-[1.5px] ring-foreground/40',
              )}
            />
          </label>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-[18px] overflow-auto px-[18px] pt-3.5 pb-4">
          {(added.length > 0 || pending.length > 0) && (
            <div className="flex flex-col gap-2">
              <span className={LIST_LABEL}>Ajoutées</span>
              <ol className="flex flex-col gap-2">
                {added.map(({ resource, mine, sub }, i) => (
                  <Tile
                    key={resource.id}
                    n={i + 1}
                    emoji={resourceEmoji(resource)}
                    title={resource.title}
                    sub={sub ?? resourceSubline(resource)}
                    onRemove={mine ? () => onRemove(resource.id) : undefined}
                  />
                ))}
                {pending.map((p, i) => (
                  <Tile
                    key={`pending-${p.key}`}
                    n={added.length + i + 1}
                    emoji={p.proposal?.emoji ?? (isLink(p.text) ? '🔗' : '📘')}
                    title={
                      !p.proposal && isLink(p.text) ? shortLink(p.text) : p.text
                    }
                    sub={
                      p.proposal?.sub ??
                      (p.reading ? 'Lecture…' : 'Référence sans lien')
                    }
                    waiting
                  />
                ))}
              </ol>
            </div>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex min-h-7 items-center gap-2">
              <span className={LIST_LABEL}>Proposées</span>
              {companion.available &&
                search.proposals !== null &&
                !search.loading && (
                  <button
                    type="button"
                    onClick={find}
                    className={cn(
                      'ml-auto inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-[7px] px-2.5 text-[12.5px] font-medium',
                      search.stale
                        ? 'bg-foreground text-background hover:bg-foreground/85'
                        : 'text-foreground/65 hover:bg-foreground/[0.045]',
                    )}
                  >
                    <Search className="size-[13px]" strokeWidth={2.2} />
                    Chercher à nouveau
                  </button>
                )}
            </div>
            {!companion.available ? (
              <UnavailableNote
                label="Recherche de ressources indisponible"
                reason={companion.reason}
              />
            ) : search.loading ? (
              <SkeletonRegion className="flex flex-col gap-2">
                {[0, 1, 2].map((i) => (
                  <Skeleton
                    key={i}
                    className="h-[84px] rounded-[10px] bg-foreground/[0.035]"
                  />
                ))}
              </SkeletonRegion>
            ) : search.failed ? (
              <ErrorLine
                message="La recherche n'a pas abouti."
                onRetry={search.retry}
              />
            ) : search.proposals === null ? (
              <div className="flex justify-center rounded-[10px] border border-dashed border-border py-[22px]">
                <Button
                  className="h-[34px] px-3.5 text-[13.5px] font-medium"
                  onClick={find}
                >
                  <Search className="size-[13px]" strokeWidth={2.2} />
                  Chercher des ressources
                </Button>
              </div>
            ) : search.shown.length ? (
              <ul className="flex flex-col gap-2">
                {search.shown.map((p) => (
                  <Card
                    key={p.url}
                    proposal={p}
                    onAdd={() => onAddProposal(p)}
                  />
                ))}
              </ul>
            ) : (
              <span className="text-[13.5px] text-muted-foreground">
                {search.exhausted
                  ? 'Plus rien à proposer.'
                  : 'Rien de solide pour ces préférences.'}
              </span>
            )}
          </div>
        </div>
      </div>
      <Footer
        start={
          <Button
            variant="ghost"
            size="sm"
            className="text-[13px] font-medium text-foreground/70"
            onClick={onBack}
          >
            Retour
          </Button>
        }
      >
        <Button size="sm" className="text-[13px] font-medium" onClick={onDone}>
          Terminer
        </Button>
      </Footer>
    </>
  )
}

/** Une ressource d'« Ajoutées » : son rang, sa tuile, son titre et sa ligne
 *  grise ; ✕ si elle se retire. En cours d'ajout, grisée, sans ✕. */
function Tile({
  n,
  emoji,
  title,
  sub,
  waiting = false,
  onRemove,
}: {
  n: number
  emoji: string
  title: string
  sub: string
  waiting?: boolean
  onRemove?: () => void
}) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-[10px] bg-foreground/[0.025] px-3 py-2.5',
        waiting && 'text-muted-foreground',
      )}
    >
      <span className="w-3.5 shrink-0 text-[12.5px] font-semibold text-muted-foreground">
        {n}
      </span>
      <span aria-hidden className="shrink-0">
        {emoji}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-semibold">{title}</span>
        <span className="truncate text-xs text-muted-foreground">{sub}</span>
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Retirer « ${title} »`}
          title="Retirer"
          onClick={onRemove}
          className="grid size-[26px] shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.07] hover:text-foreground"
        >
          <X className="size-[13px]" />
        </button>
      )}
    </li>
  )
}

/**
 * Une ressource proposée : sa tuile, son titre et ↗ (l'ouvrir dans un
 * nouvel onglet) ; l'auteur, en gras, et pourquoi s'y fier ; le type, la
 * durée, la date et ce qu'elle couvre du périmètre. Ajouter, à droite.
 */
function Card({
  proposal,
  onAdd,
}: {
  proposal: ResourceProposal
  onAdd: () => void
}) {
  const meta = [proposalMeta(proposal), proposal.covers]
    .filter(Boolean)
    .join(' · ')
  return (
    <li className="flex gap-3 rounded-[10px] px-3.5 py-3 ring-1 ring-border ring-inset">
      <span aria-hidden className="shrink-0 leading-[22px]">
        {proposalEmoji(proposal.kind)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <div className="flex items-center gap-[7px]">
          <span className="font-semibold">{proposal.title}</span>
          <a
            href={proposal.url}
            target="_blank"
            rel="noreferrer"
            title="Ouvrir dans un nouvel onglet"
            aria-label="Ouvrir dans un nouvel onglet"
            className="grid size-[22px] shrink-0 place-items-center rounded-[5px] text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground"
          >
            <ArrowUpRight className="size-3" />
          </a>
        </div>
        <span className="text-[12.5px] leading-[1.45] text-pretty text-foreground/70">
          {proposal.author && (
            <>
              <span className="font-medium text-foreground">
                {proposal.author}
              </span>
              {' · '}
            </>
          )}
          {proposal.why_trust}
        </span>
        {meta && <span className="text-xs text-muted-foreground">{meta}</span>}
      </div>
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 self-center text-[13px] font-medium"
        onClick={onAdd}
      >
        Ajouter
      </Button>
    </li>
  )
}

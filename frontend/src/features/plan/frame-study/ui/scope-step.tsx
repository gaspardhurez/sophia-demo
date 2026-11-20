import { Check, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'

import { cn } from '@/shared/lib/utils'
import { Button, Skeleton, SkeletonRegion } from '@/shared/ui'

import type { FrameTag } from '../lib/scope-text'
import { useFramingCompanion } from '../model/companion'
import type { ScopeProposal } from '../model/use-scope-proposal'
import { ErrorLine, Footer, UnavailableNote } from './parts'

/** Les largeurs du squelette (`prod/Cadrer etude - Perimetre`). */
const SKELETON = [170, 230, 260, 140, 190]

/**
 * 2 · Périmètre (#175, `prod/Cadrer etude - Perimetre`) : « Qu'est-ce que
 * tu veux couvrir ? ».
 *
 * - Les éléments en étiquettes : cochée (foncée) = dans ce cycle ; non
 *   cochée (blanche bordée) = hors de ce cycle, gardée pour les bords. Un
 *   clic bascule.
 * - « + » en pointillés ouvre une étiquette en saisie : Entrée l'ajoute,
 *   cochée, et en rouvre une ; Échap renonce ; quitter un champ vide le
 *   referme. ✕ au survol (ou au focus) retire un élément écrit à la main.
 * - Avec le compagnon, ses propositions sont demandées **à l'arrivée**
 *   (d'après l'intention de l'écran ; pas de nouvel appel si elle n'a pas
 *   changé) : un squelette sans texte pendant le chargement (Suivant
 *   grisé), puis elles rejoignent les éléments déjà là ; un échec,
 *   « Sophia n'a pas pu proposer de périmètre. » et Réessayer — « + »
 *   reste possible. Sans lui, la ligne grisée « Périmètre proposé
 *   indisponible » et les éléments du périmètre existant.
 * - Suivant passe toujours (rien de coché : pas de périmètre).
 */
export function ScopeStep({
  tags,
  intention,
  proposal,
  onTags,
  onBack,
  onNext,
}: {
  tags: FrameTag[]
  /** L'intention de l'écran, d'où partent les propositions. */
  intention: string | null
  proposal: ScopeProposal
  onTags: (tags: FrameTag[]) => void
  onBack: () => void
  /** Avancer avec ces éléments : la modale les écrit. */
  onNext: (tags: FrameTag[]) => void
}) {
  const companion = useFramingCompanion('scope')
  const [typing, setTyping] = useState<string | null>(null)
  const { ask } = proposal
  useEffect(() => {
    if (companion.available) ask(intention)
    // `ask` ne redemande pas pour une même intention.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companion.available, intention])
  const loading = companion.available && proposal.loading

  /** Les éléments, avec celui en saisie s'il porte du texte (cochée ; déjà
   *  là, il se coche). */
  function withTyped(): FrameTag[] {
    const label = (typing ?? '').trim()
    if (!label) return tags
    const known = tags.find((t) => t.label === label)
    return known
      ? tags.map((t) => (t === known ? { ...t, inCycle: true } : t))
      : [...tags, { label, inCycle: true, removable: true }]
  }

  function addTyped() {
    if (!(typing ?? '').trim()) return setTyping(null)
    onTags(withTyped())
    // Une autre s'ouvre : on en ajoute souvent plusieurs d'affilée.
    setTyping('')
  }

  return (
    <>
      <div className="flex min-h-[300px] flex-col gap-3.5 px-[18px] py-5">
        <span className="text-[15px] font-semibold">
          Qu'est-ce que tu veux couvrir ?
        </span>
        {!companion.available && (
          <UnavailableNote
            label="Périmètre proposé indisponible"
            reason={companion.reason}
          />
        )}
        {companion.available && proposal.failed && (
          <ErrorLine
            message="Sophia n'a pas pu proposer de périmètre."
            onRetry={() => proposal.retry(intention)}
          />
        )}
        {loading ? (
          <SkeletonRegion className="flex flex-wrap gap-2">
            {SKELETON.map((w) => (
              <Skeleton
                key={w}
                className="h-[34px] rounded-full bg-foreground/[0.05]"
                style={{ width: w }}
              />
            ))}
          </SkeletonRegion>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <span key={tag.label} className="group/tag relative inline-flex">
                <button
                  type="button"
                  aria-pressed={tag.inCycle}
                  onClick={() =>
                    onTags(
                      tags.map((t) =>
                        t === tag ? { ...t, inCycle: !t.inCycle } : t,
                      ),
                    )
                  }
                  className={cn(
                    'inline-flex h-[34px] cursor-pointer items-center gap-[7px] rounded-full pr-3 pl-2.5 text-[13.5px] font-medium whitespace-nowrap',
                    tag.inCycle
                      ? 'bg-foreground text-background hover:bg-foreground/85'
                      : 'pl-3 text-foreground/65 ring-1 ring-border ring-inset hover:bg-foreground/[0.025] hover:text-foreground hover:ring-foreground/45',
                  )}
                >
                  {tag.inCycle && (
                    <Check className="size-[13px]" strokeWidth={3} />
                  )}
                  {tag.label}
                </button>
                {tag.removable && (
                  <button
                    type="button"
                    aria-label={`Retirer « ${tag.label} »`}
                    title="Retirer"
                    onClick={() => onTags(tags.filter((t) => t !== tag))}
                    className="absolute -top-1.5 -right-1.5 hidden size-[18px] cursor-pointer place-items-center rounded-full bg-background text-foreground/70 shadow-[0_0_0_1px_var(--border)] group-focus-within/tag:grid group-hover/tag:grid hover:text-foreground"
                  >
                    <X className="size-2.5" strokeWidth={3} />
                  </button>
                )}
              </span>
            ))}
            {typing !== null ? (
              <span className="inline-flex h-[34px] items-center rounded-full px-3 ring-[1.5px] ring-foreground/45 ring-inset">
                <input
                  value={typing}
                  autoFocus
                  // Échap renonce à l'étiquette, sans fermer la modale.
                  data-escape-local
                  placeholder="Ce que tu veux couvrir…"
                  onChange={(e) => setTyping(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      addTyped()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      setTyping(null)
                    }
                  }}
                  onBlur={() => !typing.trim() && setTyping(null)}
                  className="w-[170px] bg-transparent text-[13.5px] outline-none placeholder:text-muted-foreground/70"
                />
              </span>
            ) : (
              <button
                type="button"
                aria-label="Ajouter au périmètre"
                title="Ajouter au périmètre"
                onClick={() => setTyping('')}
                className="grid size-[34px] cursor-pointer place-items-center rounded-full border border-dashed border-foreground/20 text-foreground/55 hover:bg-foreground/[0.03] hover:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            )}
          </div>
        )}
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
        <Button
          size="sm"
          disabled={loading}
          className="text-[13px] font-medium"
          // Une étiquette restée en saisie compte : on l'a écrite.
          onClick={() => onNext(withTyped())}
        >
          Suivant
        </Button>
      </Footer>
    </>
  )
}

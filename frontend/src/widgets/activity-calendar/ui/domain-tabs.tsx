import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'

import { type Domain, domainColorValues } from '@/entities/domain'
import { cn } from '@/shared/lib/utils'

/**
 * La bande de domaines du calendrier complet (#215, #216, #217 ;
 * `kit/Filtre domaines`), dans l'en-tête, à droite de la navigation, sur une
 * ligne : une case par domaine actif, sans « Tout ». Un clic choisit ce
 * domaine seul (un second clic sur le seul choisi le retire) ; ⇧-clic
 * l'ajoute aux autres ou l'en retire. Les domaines choisis filtrent la
 * colonne de gauche et mettent leurs activités en focus dans la grille.
 *
 * Au repos, l'emoji seul. Au survol (ou au focus clavier), le nom glisse à
 * sa droite. Un domaine choisi garde son nom, sur sa couleur, à son encre ;
 * survolé, une flèche s'ouvre après le nom et ouvre sa page dans un autre
 * onglet (20/11). Tant
 * qu'un domaine est choisi, les autres passent en grisé. La bande
 * s'allonge avec les noms ; au-delà de la place, elle défile sans barre.
 */
export function DomainTabs({
  domains,
  selected,
  onChange,
}: {
  domains: Domain[]
  selected: string[]
  onChange: (selected: string[]) => void
}) {
  if (domains.length === 0) return null
  return (
    <div className="flex min-w-0 overflow-x-auto rounded-lg bg-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {domains.map((d) => {
        const on = selected.includes(d.id)
        const { base, ink } = domainColorValues(d.color)
        return (
          // La case porte le fond ; le bouton et, choisi, le lien vers la
          // page du domaine y sont frères (pas de lien dans un bouton).
          <div
            key={d.id}
            className={cn(
              'group/tab flex h-8 shrink-0 items-center transition-[background,opacity,filter] duration-150',
              !on &&
                'hover:bg-foreground/[.07] hover:text-foreground has-focus-visible:bg-foreground/[.07]',
              !on &&
                selected.length > 0 &&
                'opacity-65 grayscale-[.6] hover:opacity-100 hover:grayscale-0 has-focus-visible:opacity-100 has-focus-visible:grayscale-0',
            )}
            style={
              on
                ? {
                    background: `color-mix(in oklab, ${base} 28%, transparent)`,
                    color: ink,
                  }
                : undefined
            }
          >
            <button
              type="button"
              title={`${d.name} (⇧-clic : en ajouter d'autres)`}
              aria-label={d.name}
              aria-pressed={on}
              onClick={(e) => {
                if (e.shiftKey)
                  onChange(
                    on
                      ? selected.filter((id) => id !== d.id)
                      : [...selected, d.id],
                  )
                else onChange(on && selected.length === 1 ? [] : [d.id])
              }}
              onFocus={(e) =>
                e.currentTarget.scrollIntoView({
                  block: 'nearest',
                  inline: 'nearest',
                })
              }
              className="inline-flex h-8 min-w-8 cursor-pointer items-center justify-center px-2 outline-none"
            >
              <span className="text-[15px] leading-none">{d.emoji}</span>
              <span
                className={cn(
                  'inline-block overflow-hidden text-[12.5px] whitespace-nowrap transition-[max-width,margin,opacity] duration-200 ease-out',
                  on
                    ? 'ml-1.5 max-w-[140px] font-semibold opacity-100'
                    : 'ml-0 max-w-0 font-medium opacity-0 group-hover/tab:ml-1.5 group-hover/tab:max-w-[140px] group-hover/tab:opacity-100 group-has-focus-visible/tab:ml-1.5 group-has-focus-visible/tab:max-w-[140px] group-has-focus-visible/tab:opacity-100',
                )}
              >
                {d.name}
              </span>
            </button>
            {on && (
              <Link
                to={`/domains/${d.id}`}
                target="_blank"
                rel="noopener"
                aria-label={`Ouvrir ${d.name} dans un autre onglet`}
                title="Ouvrir le domaine dans un autre onglet"
                className="grid h-5 max-w-0 place-items-center overflow-hidden rounded opacity-0 outline-none transition-[max-width,margin,opacity] duration-200 ease-out group-hover/tab:mr-1.5 group-hover/tab:max-w-5 group-hover/tab:opacity-100 hover:bg-foreground/10 focus-visible:mr-1.5 focus-visible:max-w-5 focus-visible:opacity-100"
              >
                <ArrowUpRight className="size-3.5 shrink-0" />
              </Link>
            )}
          </div>
        )
      })}
    </div>
  )
}

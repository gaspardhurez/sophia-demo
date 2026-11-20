import type { ReactNode } from 'react'

import { cn } from '@/shared/lib/utils'

import { Skeleton } from './skeleton'

interface ItemCardProps {
  /** Contenu de la pastille de gauche : emoji, icône. */
  accent?: ReactNode
  /**
   * Classes de la pastille (couleur du domaine, en général). Fournies par
   * l'appelant : `shared/ui` ignore le métier et ne connaît aucune palette.
   */
  accentClassName?: string
  /** Ligne principale — nom et information de tête. */
  children: ReactNode
  /** Seconde ligne, en petit gris. Optionnelle. */
  meta?: ReactNode
  /**
   * Contenu **entre le texte et le bord** — un champ de saisie, une valeur.
   *
   * Ni dans la ligne du titre (il s'y alignait et flottait en haut d'une carte à
   * deux lignes), ni flottant au milieu de la place restante — il se déplaçait
   * alors avec la longueur du nom, et deux cartes voisines ne l'alignaient plus.
   *
   * Il est donc collé au bord droit et **c'est à l'appelant de lui donner une
   * largeur fixe** : le début du contenu tombe alors au même endroit d'une carte
   * à l'autre, quel que soit le texte. Ce qui déborde côté droit peut passer
   * sous les actions de survol — assez rare pour ne pas réserver la place au
   * repos, où le nom en a plus besoin.
   */
  trailing?: ReactNode
  /**
   * La colonne de droite prend **toute la place laissée** par le texte, au lieu
   * de se réduire à son contenu. Pour ce qui doit s'étendre — une barre de
   * progression, qui ne dit rien de plus large qu'un pouce.
   *
   * Opt-in : par défaut la colonne reste au plus juste, sans quoi les cartes
   * qui n'y mettent qu'une pastille verraient leur titre écrasé pour rien.
   */
  trailingFill?: boolean
  /** Contenu de droite **toujours visible** : pastilles, chip de cible. */
  actions?: ReactNode
  /**
   * Actions révélées au survol (éditer, supprimer).
   *
   * Rendues **hors du flux**, en absolu : masquées, elles ne prenaient pas moins
   * de place, et le texte se tronquait comme si elles étaient là. Ici la carte
   * dispose de toute sa largeur au repos, et les boutons viennent par-dessus au
   * survol — sans décalage, puisque rien ne bouge.
   */
  hoverActions?: ReactNode
  /**
   * Contenu déplié **sous la ligne, dans la même carte** — une courbe, un détail.
   *
   * C'est la carte qui grandit, pas une seconde carte qui apparaît en dessous :
   * deux bordures empilées se lisent comme deux objets, alors qu'il n'y en a
   * qu'un. Un filet les sépare, la carte reste une.
   *
   * Le glissement passe par `grid-rows` 0fr → 1fr : une hauteur nulle qui
   * s'ouvre, sans avoir à la mesurer. Le contenu reste monté une fois replié —
   * c'est ce qui permet à la fermeture de s'animer aussi.
   */
  expansion?: ReactNode
  /** Le dépliage est-il ouvert ? Sans effet sans `expansion`. */
  expanded?: boolean
  /**
   * Carte **sélectionnable** : elle prend la teinte de `selectedClassName`.
   *
   * Ici et pas dans chaque liste : trois écrans recopiaient le même
   * `picked ? accentClassName : ...` avec leur propre rond de coche, et ils
   * avaient déjà divergé (`primary/5` contre `primary/10`).
   *
   * **Pas de pastille de coche** : la teinte porte l'état à elle seule, comme
   * sur les nœuds de l'arbre de compétences. Un rond en plus dit deux fois la
   * même chose, et il prenait la place que le titre réclame.
   */
  selected?: boolean
  /** Teinte de l'état sélectionné (couleur du domaine, chez l'appelant). */
  selectedClassName?: string
  /**
   * Rend la carte cliquable, par un **calque** en absolu et non une enveloppe.
   *
   * Envelopper le contenu mettait `meta` et `trailing` dans un bouton : un champ
   * y devenait invalide, et le moindre clic dedans basculait la sélection. Avec
   * un calque, ce qui est interactif repasse simplement au-dessus.
   */
  onSelect?: () => void
  className?: string
}

/**
 * Carte d'un élément dans une liste — activité type, métrique, et la suite.
 *
 * Elle existe parce que ces cartes avaient été écrites séparément avec les
 * mêmes classes recopiées : côte à côte sur la page domaine, elles ne tombaient
 * ni à la même hauteur ni sur les mêmes marges. Deux listes qui se regardent
 * doivent s'aligner, et ça ne se tient pas à coups de copier-coller.
 *
 * **Toutes les cartes ont la même hauteur, quelle que soit leur organisation
 * intérieure** : c'est le bloc de contenu qui porte un `min-h`, pas la carte, et
 * son contenu s'y centre. Une métrique sur une ligne et une activité type sur deux
 * tombent donc au même endroit, sans réserver de ligne vide et sans que le
 * nombre de pastilles change quoi que ce soit.
 */
export function ItemCard({
  accent,
  accentClassName,
  children,
  meta,
  trailing,
  trailingFill,
  actions,
  hoverActions,
  expansion,
  expanded,
  selected,
  selectedClassName,
  onSelect,
  className,
}: ItemCardProps) {
  return (
    <div
      className={cn(
        'group rounded-lg border bg-card shadow-sm',
        selected !== undefined && 'transition-colors',
        selected
          ? (selectedClassName ?? 'border-primary bg-primary/10')
          : selected === false && 'hover:border-ring',
        // `min-w-0` : sans lui, une carte en cellule de grille prend la largeur
        // de son contenu le plus large (ici le dessin) au lieu de celle de sa
        // colonne, et la grille déborde.
        'min-w-0',
        className,
      )}
    >
      {/* La ligne porte le `relative` — pas la carte : les actions de survol
          sont en absolu sur toute la hauteur, et dépliage ouvert elles auraient
          couvert le dessin. */}
      <div className="relative flex items-center gap-3 p-3">
        {/* Calque de sélection, et non une enveloppe : envelopper le contenu
            mettait `meta` et `trailing` DANS un bouton — un champ y devenait
            invalide, et le moindre clic dedans basculait la sélection. Ici le
            calque couvre la carte, et ce qui est interactif repasse au-dessus
            (`relative z-10`). */}
        {onSelect && (
          <button
            type="button"
            onClick={onSelect}
            aria-pressed={selected}
            className="absolute inset-0 rounded-lg"
          >
            <span className="sr-only">Sélectionner</span>
          </button>
        )}

        {accent !== undefined && (
          <span
            aria-hidden
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg border text-lg',
              // Carte retenue : la teinte est déjà sur la carte entière. La
              // remettre sur la pastille la redit une seconde fois — bordure
              // comprise, sans quoi il reste un cadre autour de l'emoji sur un
              // fond qui n'en a plus besoin.
              selected ? 'border-transparent' : accentClassName,
            )}
          >
            {accent}
          </span>
        )}

        {/* `min-h-11` = la hauteur d'un contenu à deux lignes (ligne de titre
            avec pastilles : 24px, + 2px, + meta : 16px). C'est le bloc de
            CONTENU qu'on fixe, pas la carte : mettre un `min-h` sur la carte ne
            suffisait pas, une ligne de titre chargée de pastilles la dépassait
            et les deux colonnes se décalaient de deux pixels. Ici la hauteur ne
            dépend plus de ce qu'il y a dedans, et `justify-center` centre une
            carte à une seule ligne au lieu de la coller en haut. */}
        <div
          className={cn(
            'flex min-h-11 min-w-0 flex-col justify-center',
            // Avec une colonne de droite extensible, c'est ELLE qui prend le
            // reste : le texte se contente de ce qu'il lui faut.
            trailingFill ? 'shrink' : 'flex-1',
          )}
        >
          {/* `min-w-0` : sans lui, un titre long pousse la carte au-delà de
              sa colonne et `truncate` ne mord jamais — les cartes voisines
              finissaient par se toucher. */}
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            {children}
          </div>
          {meta && (
            /* `relative z-10` : la seconde ligne peut porter un contrôle — le
               palier d'une étape — et doit rester atteignable PAR-DESSUS le
               calque de sélection. Sans ça le calque la recouvre : ni le survol
               ni le clic ne l'atteignent, et cliquer dessus bascule la sélection
               au lieu d'éditer. */
            <div className="relative z-10 mt-0.5 truncate text-xs text-muted-foreground">
              {meta}
            </div>
          )}
        </div>

        {trailing && (
          <div
            className={cn(
              'relative z-10 flex items-center gap-1.5',
              // `pl-3` complète le `gap-3` de la rangée pour faire 24px à
              // gauche — autant que le `pl-6` que la réserve laisse à droite.
              // Sans lui la colonne colle au texte et flotte loin des boutons,
              // décentrée de la moitié de l'écart.
              trailingFill ? 'min-w-0 flex-1 pl-3' : 'shrink-0',
            )}
          >
            {trailing}
          </div>
        )}

        {/* Réserve la place des boutons de survol — mais SEULEMENT quand la
            carte a une colonne de droite. Le calque est hors du flux à dessein :
            sans ça il rognerait en permanence le nom, alors qu'il n'est qu'une
            porte d'entrée. Une colonne de droite, elle, porte de l'information
            qu'on vient lire (une progression, un champ de cible) — et se
            retrouvait dessous.

            Une copie **invisible** des boutons plutôt qu'une largeur en dur :
            la réserve suit d'elle-même le nombre de boutons, alors qu'un
            `mr-24` se serait décalé en silence au troisième. */}
        {trailing && hoverActions && (
          <div
            aria-hidden
            className="pointer-events-none invisible flex shrink-0 items-center gap-1 pr-3 pl-6"
          >
            {hoverActions}
          </div>
        )}

        {actions}

        {hoverActions && (
          <div className="absolute inset-y-0 right-0 z-10 flex items-center gap-1 rounded-r-lg pr-3 pl-6 opacity-0 transition-opacity group-hover:opacity-100 bg-gradient-to-l from-card from-70% to-transparent">
            {hoverActions}
          </div>
        )}
      </div>

      {expansion && (
        <div
          className={cn(
            'grid transition-[grid-template-rows] duration-300 ease-out',
            expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
          )}
        >
          <div className="overflow-hidden">
            {/* Le filet en haut plutôt qu'un fond distinct : il sépare sans
                fabriquer un second bloc. */}
            <div className="border-t border-border/70 px-3 pt-2 pb-3">
              {expansion}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Le squelette de la carte. Attaché à `ItemCard` (idiome déjà utilisé par
 * `ProjectCard.Skeleton`) pour qu'il ne dérive pas : un placeholder qui
 * recopie les classes de la carte finit toujours par ne plus lui ressembler.
 */
ItemCard.Skeleton = function ItemCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card p-3 shadow-sm">
      <Skeleton className="size-9 shrink-0 rounded-lg" />
      <div className="flex min-h-11 min-w-0 flex-1 flex-col justify-center">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="mt-1.5 h-3 w-64" />
      </div>
    </div>
  )
}

/**
 * L'état vide **à la taille d'une carte**.
 *
 * Distinct d'`EmptyState`, qui est un encadré pleine hauteur pour une page ou
 * une section entière : sa hauteur dépend de son texte, donc deux colonnes aux
 * phrases de longueurs différentes se décalent. Ici la géométrie est celle
 * d'`ItemCard`, par construction — une liste vide occupe exactement la place
 * d'une liste à un élément.
 */
ItemCard.Empty = function ItemCardEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-[4.25rem] items-center justify-center rounded-lg border border-dashed border-border p-3 text-center text-sm text-muted-foreground">
      {children}
    </div>
  )
}

/**
 * Un bouton d'action de carte — éditer, supprimer.
 *
 * Attaché à `ItemCard` parce que ses classes étaient recopiées à l'identique
 * dans chaque liste : trois fichiers, six occurrences, et autant d'endroits où
 * le style pouvait diverger.
 */
ItemCard.Action = function ItemCardAction({
  label,
  onClick,
  danger,
  children,
}: {
  label: string
  onClick: () => void
  /** Rouge au survol — pour ce qui détruit. */
  danger?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-muted/60',
        danger ? 'hover:text-destructive' : 'hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

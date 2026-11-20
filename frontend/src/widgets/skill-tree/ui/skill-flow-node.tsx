import { Handle, type NodeProps, Position } from '@xyflow/react'
import { PanelRight, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/shared/lib/utils'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/shared/ui'

import type { SkillFlowNodeType } from '../lib/layout'
import { DeleteSkillFromTree } from './delete-skill-from-tree'

/**
 * Un nœud de la carte mentale : **du texte, pas une carte**.
 *
 * Il fut une carte de 220 × 64 px avec bordure, fond et ombre — trois fois
 * l'encre d'un libellé, et surtout une largeur imposée à « RAG » comme à une
 * phrase. Une carte mentale se lit à ses mots et à ses courbes ; le cadre n'y
 * ajoute rien et coûte la place qui manquait.
 *
 * Ce qui reste visible en permanence : la pastille de statut et le nom. Le
 * chevron, la corbeille et le « + » n'apparaissent qu'au survol — ils servent à
 * agir, pas à lire.
 */
export function SkillFlowNode({ data }: NodeProps<SkillFlowNodeType>) {
  const {
    skill,
    hasChildren,
    isCollapsed,
    readOnly,
    dimmed,
    selectable,
    selected,
    onMenuOpenChange,
    onOpenSkill,
    accentClassName,
    side,
    color,
    maxWidth,
  } = data
  const [deleting, setDeleting] = useState(false)

  // Les liens partent vers l'extérieur : à droite du centre, on entre par la
  // gauche et on ressort par la droite ; à gauche, l'inverse.
  const versExterieur = side === 'right'
  const handles = (
    <>
      <Handle
        type="target"
        id={side}
        position={versExterieur ? Position.Left : Position.Right}
        className="!size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent"
      />
      {hasChildren && (
        <Handle
          type="source"
          id={side}
          position={versExterieur ? Position.Right : Position.Left}
          className="!size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent"
        />
      )}
    </>
  )

  /**
   * Un **compte**, pas un chevron.
   *
   * Le chevron est un vocabulaire d'arborescence de fichiers : il dit
   * « ouvrable », ce qu'on sait déjà maintenant que le clic ouvre le nœud. Le
   * nombre dit ce qu'aucun signe ne disait — **combien** attend derrière, donc
   * s'il vaut la peine d'ouvrir. Il ne paraît qu'une fois replié : déplié, la
   * branche se compte toute seule.
   */
  const compte = hasChildren && isCollapsed && (
    <span
      aria-label={`${skill.children.length} sous-savoirs`}
      // `inline-flex` + `size` minimale : le `line-height` seul centrait « à peu
      // près », et un 1 ne tombait pas au même endroit qu'un 10.
      className="inline-flex size-[18px] min-w-[18px] shrink-0 items-center justify-center self-center rounded-full px-1 text-[10px] font-medium text-white"
      style={{ background: color }}
    >
      {skill.children.length}
    </span>
  )

  // `max-width` et non `width` : la boîte épouse son texte. Avec une largeur
  // imposée, le moindre écart entre la largeur mesurée et la largeur rendue
  // était absorbé par le libellé — et comme il s'aligne à droite du côté
  // gauche, l'écart se creusait juste là où part le lien vers les enfants.
  const libelle = (
    <span
      title={skill.name}
      className={cn(
        // Une seule ligne, jamais deux : un libellé replié laissait une boîte
        // deux fois plus haute qu'à moitié remplie, et un écart béant entre le
        // texte et les pastilles. Le troncage viendra si un nom l'exige.
        'min-w-0 whitespace-nowrap leading-5 text-[13px]',
        versExterieur ? 'text-left' : 'text-right',
        dimmed ? 'text-muted-foreground' : 'font-medium',
        // Replié : le libellé porte la marque qu'il cache quelque chose, sinon
        // rien ne distingue une feuille d'une branche fermée.
      )}
    >
      {skill.name}
    </span>
  )

  // Mode picker : le nœud EST la cible du clic — pas de case à cocher, qui
  // ajouterait une seconde cible plus petite pour le même geste.
  if (selectable) {
    const cible = (
      <div
        style={{ maxWidth }}
        className={cn(
          'group flex cursor-pointer items-start gap-1.5 rounded border border-transparent px-1.5 py-0.5 transition-colors',
          versExterieur ? 'flex-row' : 'flex-row-reverse',
          selected
            ? (accentClassName ?? 'bg-primary/15')
            : 'hover:border-border hover:bg-muted/60',
        )}
      >
        {handles}
        {libelle}
        {compte}
      </div>
    )

    return cible
  }

  const carte = (
    <div
      style={{ maxWidth }}
      className={cn(
        'group flex items-start gap-1.5 rounded border border-transparent px-1.5 py-0.5 hover:border-border hover:bg-muted/60',
        versExterieur ? 'flex-row' : 'flex-row-reverse',
        hasChildren && 'cursor-pointer',
      )}
    >
      {handles}

      {libelle}
      {compte}
    </div>
  )

  if (readOnly) return carte

  /**
   * Supprimer passe par le **clic droit**.
   *
   * La corbeille et le « + » vivaient dans la carte, révélés au survol mais
   * occupant leur place en permanence : sur un arbre entier ils rognaient la
   * largeur du libellé au point de le tronquer — « Software » s'affichait
   * « Sof ». Une action doit rester disponible sans coûter de pixels, et le
   * clic droit n'en coûte aucun.
   */
  return (
    // `onOpenChange` : en se refermant, Radix laisse passer un clic jusqu'au
    // nœud, dont le clic ouvre ou referme le tiroir. Le canvas s'en sert pour
    // ignorer ce clic-là. Même piège que sur le menu de branche, retiré depuis.
    <ContextMenu onOpenChange={onMenuOpenChange}>
      <ContextMenuTrigger asChild>{carte}</ContextMenuTrigger>
      <ContextMenuContent>
        {onOpenSkill && (
          <ContextMenuItem onSelect={() => onOpenSkill(skill.id)}>
            <PanelRight className="size-4" /> Ouvrir la fiche
          </ContextMenuItem>
        )}
        <ContextMenuItem
          onSelect={() => setDeleting(true)}
          className="text-destructive"
        >
          <Trash2 className="size-4" /> Supprimer
        </ContextMenuItem>
      </ContextMenuContent>
      {/* La fenêtre du panneau (remonter ou supprimer les enfants). Rendue en
          portail mais enfant du nœud dans l'arbre React : ses clics ne doivent
          pas remonter jusqu'au nœud, qui plierait sa branche. */}
      {deleting && (
        <span className="contents" onClick={(e) => e.stopPropagation()}>
          <DeleteSkillFromTree
            skill={skill}
            onClose={() => setDeleting(false)}
          />
        </span>
      )}
    </ContextMenu>
  )
}

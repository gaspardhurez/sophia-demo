import type { Edge, Node } from '@xyflow/react'
import { hierarchy, tree } from 'd3-hierarchy'

import type { SkillNode } from '@/entities/skill'

/** Données portées par un nœud React Flow de compétence. */
export interface SkillFlowData extends Record<string, unknown> {
  skill: SkillNode
  /** A des enfants — le nœud est alors un tiroir, et son clic l'ouvre. */
  hasChildren: boolean
  /** Est actuellement replié (ses descendants sont masqués). */
  isCollapsed: boolean
  /** Lecture seule : pas d'actions (ajout, suppression, édition de statut). */
  readOnly: boolean
  /** Grisé : simple ancêtre de contexte, pas une compétence mise en avant. */
  dimmed: boolean
  /** Mode sélection (picker) : le nœud se rattache/détache au clic. */
  selectable: boolean
  /** Rattaché dans le picker. */
  selected: boolean
  /** Le menu contextuel de ce nœud s'ouvre ou se ferme. Le canvas s'en sert
   *  pour ignorer le clic que Radix laisse passer en refermant. */
  onMenuOpenChange?: (open: boolean) => void
  /** Ouvre le savoir (panneau latéral). Absent en picker et en lecture seule. */
  onOpenSkill?: (skillId: string) => void
  /** Teinte du nœud rattaché — la couleur du domaine, faute de quoi la primaire. */
  accentClassName?: string
  /** Côté de la carte mentale : la branche part à gauche ou à droite du centre. */
  side: 'left' | 'right'
  /** Couleur de la branche de tête à laquelle ce nœud appartient. */
  color: string
  /** Où le libellé se replie — la largeur de sa colonne, pas la sienne. */
  maxWidth: number
}

/** Données du nœud racine : le domaine lui-même. */
export interface DomainFlowData extends Record<string, unknown> {
  domainId: string
  domainName: string
  readOnly: boolean
}

export interface SkillGraphOptions {
  readOnly?: boolean
  /** Si fourni, les compétences hors de cet ensemble sont grisées (contexte). */
  focusIds?: Set<string> | null
  /** Mode picker : les nœuds compétence deviennent cochables. */
  selectable?: boolean
  /** Compétences rattachées dans le picker. */
  selectedIds?: Set<string> | null
  /** Ouverture/fermeture d'un menu contextuel de nœud. */
  onMenuOpenChange?: (open: boolean) => void
  /** Ouvre le savoir — le clic sur une feuille, et l'entrée du menu contextuel. */
  onOpenSkill?: (skillId: string) => void
  /** Teinte d'un nœud rattaché — la couleur du domaine, fournie plus haut. */
  accentClassName?: string
}

export type SkillFlowNodeType = Node<SkillFlowData, 'skill'>
export type DomainFlowNodeType = Node<DomainFlowData, 'domain'>
export type SkillGraphNode = SkillFlowNodeType | DomainFlowNodeType

/** Hauteur d'une ligne de libellé, et l'air entre deux voisins. */
const LINE = 20
const ROW_GAP = 16
/**
 * Largeur de la carte du domaine, au centre. **Exportée** : le layout s'en sert
 * pour écarter le premier niveau, la carte pour se dessiner. Les deux valeurs
 * ont divergé une fois, et le premier niveau s'est retrouvé par-dessus elle.
 */
export const DOMAIN_WIDTH = 220
/**
 * Air entre le **bord** de la carte du domaine et le premier niveau.
 *
 * Mesuré depuis le bord, pas depuis le centre : la carte fait 220 px de large,
 * et compter depuis son milieu posait le premier niveau par-dessus elle — d'où
 * des libellés sur la carte et des courbes qui repartaient en arrière pour les
 * rejoindre.
 */
const CENTER_GAP = 40
/**
 * Air entre deux colonnes — la place où les courbes se déploient.
 *
 * Il était fixe, et c'est ce qui empilait les traits : « Software » distribue
 * ses six enfants sur 684 px de haut dans 56 px de large, soit une pente de
 * 1:12. Six courbes à cette inclinaison forment une corde verticale où plus
 * rien ne se distingue.
 *
 * Il s'adapte donc à l'**étalement** des enfants du niveau : plus ils sont
 * dispersés, plus il faut de longueur pour que les courbes s'écartent. Le
 * plancher garde une colonne serrée quand rien ne l'exige.
 */
const COL_GAP_MIN = 56
const COL_GAP_MAX = 200
/** Un cinquième de l'étalement : au-delà, la carte s'étire plus qu'elle ne gagne. */
const COL_GAP_RATIO = 0.2
/**
 * Au-delà, le libellé passe sur une seconde ligne plutôt que d'étirer sa colonne.
 *
 * Une colonne prend la largeur de son plus long libellé : sans plafond, un
 * « Graphes avancés (Dijkstra, MST, tri topologique) » élargirait tout son
 * niveau pour lui seul. Bas, donc — dans une carte mentale un libellé long se
 * plie, il ne pousse pas les murs.
 */
/** Largeur de secours d'une colonne, quand rien ne l'a mesurée. */
const MAX_LABEL = 190
/**
 * Plafond de repli — **désactivé**.
 *
 * Un libellé tenait sur deux lignes au-delà de `MAX_LABEL`, et ça ne marchait
 * pas : la boîte prenait la hauteur de deux lignes alors que la seconde était
 * à moitié vide, et l'écart entre le texte et les pastilles devenait béant. Des
 * noms de trois mots s'y retrouvaient sans raison.
 *
 * Une ligne, donc, quelle que soit la longueur. Le jour où un nom deviendra
 * vraiment trop long, la réponse sera de le **tronquer** — on décidera à
 * l'usage, quand le cas se présentera pour de vrai.
 */
const MAX_LINES = 1
/**
 * Ce qui entoure le texte dans un nœud : les deux paddings, 2 × 6.
 *
 * Il comptait aussi une pastille de statut (10 + 6 d'écart) qui a depuis quitté
 * le nœud. Ces 16 px fantômes rognaient la place du libellé, qui se repliait
 * sur deux lignes pour des noms qui tenaient largement sur une.
 */
const CHROME = 12
/** Le compte affiché sur un nœud replié : sa pastille et son écart. */
const BADGE = 26
/**
 * Largeur réelle d'un libellé, **mesurée** et non estimée.
 *
 * Elle l'était — un nombre de caractères multiplié par une largeur moyenne — et
 * l'écart se voyait : le nœud réservait une dizaine de pixels de plus que son
 * texte, si bien que le trait vers ses enfants ne partait pas du mot mais d'un
 * peu plus loin. Une moyenne ne peut pas départager « CS » de « Il », et c'est
 * pourtant la fin du mot qu'on relie.
 *
 * `measureText` d'un canvas hors écran donne la vraie valeur, en synchrone et
 * sans rien insérer dans le document. Le repli sur une estimation ne sert qu'aux
 * environnements sans canvas (tests, rendu serveur).
 */
let contexte: CanvasRenderingContext2D | null | undefined
function textWidth(name: string): number {
  if (contexte === undefined) {
    contexte = document.createElement('canvas').getContext('2d')
    if (contexte) {
      // La police du LIBELLÉ, relevée sur un témoin portant ses classes — pas
      // celle du corps de page, qui n'est pas forcément la même. On mesurait
      // sinon un texte dans une police que personne n'affiche.
      const temoin = document.createElement('span')
      temoin.className = 'text-[13px] font-medium'
      temoin.style.position = 'absolute'
      temoin.style.visibility = 'hidden'
      document.body.appendChild(temoin)
      const style = getComputedStyle(temoin)
      contexte.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`
      temoin.remove()
    }
  }
  return contexte ? contexte.measureText(name).width : name.length * 6.6
}

/**
 * Largeur qu'un nœud demanderait sur une seule ligne : son texte, ce qui
 * l'entoure, et le compte quand il est replié — sans quoi la pastille déborde
 * d'une boîte calculée sans elle.
 */
function labelWidth(name: string, extra = 0): number {
  return CHROME + textWidth(name) + extra
}

/** Nombre de lignes qu'occupe un libellé — une seule, cf. `MAX_LINES`. */
function nodeLines(): number {
  return MAX_LINES
}

/**
 * Hauteur réservée à un libellé. Exportée pour la même raison que sa largeur :
 * le nœud doit se dessiner dans ce que le layout lui a réservé.
 */
export function nodeHeight(): number {
  return nodeLines() * LINE
}

/**
 * Couleur de branche, une par racine.
 *
 * C'est elle qui rend une carte mentale lisible, bien plus que sa géométrie :
 * l'œil suit une couleur à travers la page sans avoir à remonter les liens.
 * Variables Tailwind plutôt que classes, parce qu'une arête React Flow prend
 * une valeur de couleur, pas un nom de classe.
 */
const BRANCHES = [
  'var(--color-violet-500)',
  'var(--color-sky-500)',
  'var(--color-rose-500)',
  'var(--color-amber-500)',
  'var(--color-emerald-500)',
  'var(--color-orange-500)',
  'var(--color-teal-500)',
]

interface Datum {
  id: string
  skill: SkillNode | null
  hasChildren: boolean
  isCollapsed: boolean
  children: Datum[]
}

function toDatum(node: SkillNode, collapsed: Set<string>): Datum {
  const isCollapsed = collapsed.has(node.id)
  return {
    id: node.id,
    skill: node,
    hasChildren: node.children.length > 0,
    isCollapsed,
    // Un nœud replié : on n'émet pas ses descendants, d3 ne les layoute pas.
    children: isCollapsed
      ? []
      : node.children.map((c) => toDatum(c, collapsed)),
  }
}

/**
 * Positionne l'arbre pour React Flow via un layout d3-hierarchy.
 *
 * La racine matérialise le **domaine** : toutes les compétences racines s'y
 * rattachent. Les sous-arbres repliés (`collapsed`) sont élagués *avant* le
 * layout, si bien que les nœuds restants se repositionnent proprement.
 */
export function buildSkillGraph(
  roots: SkillNode[],
  domainId: string,
  domainName: string,
  collapsed: Set<string>,
  options: SkillGraphOptions = {},
): { nodes: SkillGraphNode[]; edges: Edge[] } {
  const {
    readOnly = false,
    focusIds = null,
    selectable = false,
    selectedIds = null,
    onMenuOpenChange,
    onOpenSkill,
    accentClassName,
  } = options
  const domainNodeId = `domain:${domainId}`

  /**
   * Carte mentale bilatérale : le domaine au centre, les branches à gauche et à
   * droite, chacune un arbre **horizontal**.
   *
   * L'arbre descendant étalait ses feuilles côte à côte — 9 000 px de large pour
   * 340 de haut sur le domaine Dev, une bande qu'aucun écran n'épouse. Ici la
   * profondeur pousse à l'horizontale (quatre colonnes, pas cinquante-et-une),
   * les frères s'empilent au coût d'une ligne de texte, et les deux côtés
   * divisent la hauteur par deux : le même arbre tient dans 1 680 × 680.
   */
  const feuillesDe = (n: SkillNode): number =>
    n.children.length === 0
      ? 1
      : n.children.reduce((t, e) => t + feuillesDe(e), 0)

  // Répartition qui équilibre les deux côtés : on place la plus grosse branche
  // restante du côté le plus léger. Sans ça, une branche de cinquante feuilles
  // en face d'une de trois donne une carte bancale.
  const gauche: SkillNode[] = []
  const droite: SkillNode[] = []
  let poidsG = 0
  let poidsD = 0
  const couleurs = new Map<string, string>()
  ;[...roots]
    .map((r, i) => ({ r, i, poids: feuillesDe(r) }))
    .sort((a, b) => b.poids - a.poids)
    .forEach(({ r, i, poids }) => {
      couleurs.set(r.id, BRANCHES[i % BRANCHES.length])
      if (poidsD <= poidsG) {
        droite.push(r)
        poidsD += poids
      } else {
        gauche.push(r)
        poidsG += poids
      }
    })

  /**
   * Ce qui s'ajoute au texte dans ce nœud précis : la pastille de compte quand
   * il est replié. Le layout doit en réserver la place, faute de quoi le
   * libellé se replie pour la lui faire.
   */
  const extras = (hasChildren: boolean, isCollapsed: boolean) =>
    hasChildren && isCollapsed ? BADGE : 0

  const nodes: SkillGraphNode[] = []
  const edges: Edge[] = []

  // Deux temps. On pose d'abord les rangs (d3 ne sert qu'à ça : l'ordre vertical
  // et l'espacement des frères), puis on décide des colonnes en fonction de ce
  // qu'elles contiennent vraiment.
  const hauteur = (d: Datum) => (d.skill ? nodeHeight() : LINE)
  const poser = (racines: SkillNode[]) =>
    tree<Datum>()
      .nodeSize([1, 1])
      .separation((a, b) => (hauteur(a.data) + hauteur(b.data)) / 2 + ROW_GAP)(
      hierarchy(
        {
          id: domainNodeId,
          skill: null,
          hasChildren: true,
          isCollapsed: false,
          children: racines.map((r) => toDatum(r, collapsed)),
        } as Datum,
        (d) => d.children,
      ),
    )

  const poses = [
    { pose: poser(droite), sens: 1 as const, cote: 'right' as const },
    { pose: poser(gauche), sens: -1 as const, cote: 'left' as const },
  ].filter(({ cote }) => (cote === 'right' ? droite : gauche).length > 0)

  /**
   * Largeur de chaque colonne = le plus long libellé qu'elle contient, **de son
   * côté**.
   *
   * Elle valait 210 px pour toutes, si bien qu'une colonne de « CS » et « DSA »
   * réservait autant qu'une de « Structures hiérarchiques » — d'où des branches
   * interminables entre le centre et les premiers niveaux.
   *
   * Et elle se calculait sur les deux côtés à la fois : un « System design » à
   * gauche écartait « DSA » à droite d'autant, alors qu'ils ne se regardent
   * jamais. Chaque moitié a désormais ses colonnes.
   */
  const colonnes = new Map<string, number>()
  const cle = (cote: string, profondeur: number) => `${cote}:${profondeur}`
  for (const { pose, cote } of poses) {
    pose.each((n) => {
      if (!n.data.skill) return
      const l = labelWidth(
        n.data.skill.name,
        extras(n.data.hasChildren, n.data.isCollapsed),
      )
      const k = cle(cote, n.depth)
      colonnes.set(k, Math.max(colonnes.get(k) ?? 0, l))
    })
  }
  /**
   * Air à droite de la colonne d'un niveau : ce qu'il faut pour que les
   * courbes issues de ses nœuds aient le temps de s'écarter avant d'atteindre
   * la colonne suivante.
   */
  const ecarts = new Map<string, number>()
  for (const { pose, cote } of poses) {
    pose.each((n) => {
      if (!n.children?.length) return
      const rangs = n.children.map((e) => e.x)
      const etalement = Math.max(...rangs) - Math.min(...rangs)
      const k = cle(cote, n.depth)
      ecarts.set(k, Math.max(ecarts.get(k) ?? 0, etalement * COL_GAP_RATIO))
    })
  }
  const ecart = (cote: string, profondeur: number) =>
    Math.min(
      COL_GAP_MAX,
      Math.max(COL_GAP_MIN, ecarts.get(cle(cote, profondeur)) ?? 0),
    )

  /** Distance du centre au bord intérieur de la colonne de cette profondeur. */
  const offset = (cote: string, profondeur: number) => {
    let x = DOMAIN_WIDTH / 2 + CENTER_GAP
    for (let d = 1; d < profondeur; d++) {
      x += (colonnes.get(cle(cote, d)) ?? 0) + ecart(cote, d)
    }
    return x
  }

  for (const { pose, sens, cote } of poses) {
    for (const point of pose.descendants()) {
      const { skill, hasChildren, isCollapsed } = point.data
      if (!skill) continue // le centre est posé une seule fois, hors des côtés

      // La colonne fixe où le nœud **commence** ; sa largeur, elle, est celle
      // de son texte. Les faire coïncider donnait des catégories courtes
      // étirées sur toute la colonne — de la largeur vide, et surtout un lien
      // qui partait du bord de la colonne au lieu de la fin du mot.
      const colonne = colonnes.get(cle(cote, point.depth)) ?? MAX_LABEL
      const largeur = Math.min(
        colonne,
        labelWidth(skill.name, extras(hasChildren, isCollapsed)),
      )
      // d3 rend (rang, profondeur) ; on échange les axes pour aller à
      // l'horizontale. À gauche le nœud se pose par son bord droit, pour que
      // les libellés s'alignent sur la colonne au lieu de flotter.
      const position = {
        x:
          sens === 1
            ? offset(cote, point.depth)
            : -offset(cote, point.depth) - largeur,
        y: point.x - pose.x - nodeHeight() / 2,
      }
      const racine = point.ancestors().find((a) => a.depth === 1)
      const color = couleurs.get(racine?.data.skill?.id ?? '') ?? BRANCHES[0]

      nodes.push({
        id: point.data.id,
        type: 'skill',
        position,
        data: {
          skill,
          hasChildren,
          isCollapsed,
          readOnly,
          dimmed: focusIds ? !focusIds.has(point.data.id) : false,
          selectable,
          selected: selectedIds ? selectedIds.has(point.data.id) : false,
          onMenuOpenChange,
          onOpenSkill,
          accentClassName,
          side: cote,
          color,
          maxWidth: colonne,
        },
      })

      if (point.parent) {
        edges.push({
          id: `${point.parent.data.id}->${point.data.id}`,
          source: point.parent.data.id,
          target: point.data.id,
          sourceHandle: cote,
          targetHandle: cote,
          style: { stroke: color, strokeWidth: 1.5 },
        })
      }
    }
  }

  nodes.push({
    id: domainNodeId,
    type: 'domain',
    position: { x: -DOMAIN_WIDTH / 2, y: -LINE },
    data: { domainId, domainName, readOnly },
    draggable: false, // le centre ne se déplace pas
  })

  return { nodes, edges }
}

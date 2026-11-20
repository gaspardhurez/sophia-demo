import {
  Background,
  Controls,
  type Node,
  type NodeTypes,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react'
import {
  ChevronsDownUp,
  ChevronsUpDown,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import {
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useRef,
} from 'react'

import {
  buildSkillTree,
  filterTreeToAncestors,
  type Skill,
  type SkillNode,
  useReparentSkill,
} from '@/entities/skill'
import { ApiError } from '@/shared/api'
import { cn } from '@/shared/lib/utils'
import { toast } from '@/shared/ui'

import { buildSkillGraph, type SkillGraphNode } from '../lib/layout'
import { DomainFlowNode } from './domain-flow-node'
import { SkillFlowNode } from './skill-flow-node'

const nodeTypes: NodeTypes = { skill: SkillFlowNode, domain: DomainFlowNode }
// Bézier : `smoothstep` dessine des équerres, une carte mentale se lit à ses
// courbes. La couleur, elle, est posée par arête — une par branche.
const defaultEdgeOptions = { type: 'default' as const }

interface SkillTreeCanvasProps {
  skills: Skill[]
  /** Plein écran piloté par le parent, qui porte le conteneur. */
  fullscreen?: boolean
  onToggleFullscreen?: () => void
  domainId: string
  domainName: string
  /** Lecture seule : pas de dnd ni d'actions sur les nœuds. */
  readOnly?: boolean
  /** Si fourni, l'arbre est réduit à ces compétences + ancêtres (grisés). */
  focusIds?: Set<string> | null
  /** Picker : compétences cochées ; défini avec `onToggleSelect`. */
  selectedIds?: Set<string> | null
  /** Teinte du domaine pour un nœud rattaché (l'appelant la connaît). */
  accentClassName?: string
  /** Picker : si fourni, seules ces compétences sont cochables (les autres inertes). */
  selectableIds?: Set<string> | null
  /** Picker : bascule la sélection d'une compétence au clic. */
  onToggleSelect?: (skillId: string) => void
  /** Ouvre un savoir — le clic sur une feuille et l'entrée du menu contextuel.
   *  Sans lui, l'arbre garde son comportement d'avant. */
  onOpenSkill?: (skillId: string) => void
}

export function SkillTreeCanvas({
  skills,
  domainId,
  domainName,
  readOnly = false,
  focusIds = null,
  selectedIds = null,
  accentClassName,
  selectableIds = null,
  onToggleSelect,
  onOpenSkill,
  fullscreen = false,
  onToggleFullscreen,
}: SkillTreeCanvasProps) {
  /**
   * L'arbre s'ouvre **entièrement replié** — on choisit ce qu'on ouvre.
   *
   * Il n'y a plus d'accordéon : il refermait la fratrie à chaque ouverture, ce
   * qui garderait maintenant une moitié de la carte vide en permanence. Il
   * palliait l'illisibilité de la disposition descendante ; la carte mentale
   * l'a réglée autrement — l'arbre entier du Dev tient dans 1 680 × 680 px,
   * tout déplié.
   *
   * **Sauf en focus ou en sélection** : là l'arbre est déjà réduit à ce qui
   * compte, et replier cacherait précisément ce qu'on vient chercher — ou
   * rendrait invisible une compétence rattachée.
   */
  const repliables = useMemo(() => {
    const ids = new Set<string>()
    const parcourir = (noeuds: SkillNode[]) => {
      for (const n of noeuds) {
        if (n.children.length > 0) ids.add(n.id)
        parcourir(n.children)
      }
    }
    parcourir(buildSkillTree(skills))
    return ids
  }, [skills])
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    focusIds || selectableIds
      ? new Set()
      : new Set(
          (function tous(noeuds: SkillNode[]): string[] {
            return noeuds.flatMap((n) =>
              n.children.length > 0 ? [n.id, ...tous(n.children)] : [],
            )
          })(buildSkillTree(skills)),
        ),
  )
  // « Tout replié » = plus aucun nœud dépliable ouvert. Le bouton bascule donc
  // vers l'action inverse de ce qu'on voit, jamais vers un état déjà atteint.
  const toutReplie = collapsed.size >= repliables.size
  const replierTout = useCallback(
    () => setCollapsed(new Set(repliables)),
    [repliables],
  )
  const deplierTout = useCallback(() => setCollapsed(new Set()), [])

  const onToggleCollapse = useCallback((skillId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(skillId)) next.delete(skillId)
      else next.add(skillId)
      return next
    })
  }, [])

  /**
   * Bascule groupée d'une branche, plus l'effet sur la vue.
   *
   * **Sélectionner déplie** : on vient de cocher dix compétences, les garder
   * cachées derrière un tiroir fermé revient à ne pas montrer ce qu'on a fait.
   *
   * **Désélectionner ne touche à rien** : replier serait un second effet non
   * demandé, et refermer sous les yeux de quelqu'un qui hésite lui fait perdre
   * l'endroit où il était.
   */
  /**
   * Horodate la **fermeture** d'un menu contextuel, pour ignorer le clic qui la
   * suit.
   *
   * En se refermant, Radix laisse passer un `click` jusqu'au nœud sous le
   * curseur — et le clic d'un nœud ouvre ou referme son tiroir. Les traces le
   * montrent sans ambiguïté : « branche » puis « onNodeClick » puis
   * « onToggleCollapse », pour un seul geste de l'utilisateur.
   *
   * C'est la fermeture qu'il faut marquer, pas l'ouverture : on peut rester
   * plusieurs secondes dans le menu avant de choisir. Et le signal vient du
   * nœud, pas de React Flow — Radix intercepte l'événement `contextmenu` avant
   * que React Flow puisse le voir, si bien que `onNodeContextMenu` n'est jamais
   * appelé.
   */
  const finDeMenu = useRef(0)
  const onMenuOpenChange = useCallback((open: boolean) => {
    if (!open) finDeMenu.current = Date.now()
  }, [])

  const graph = useMemo(
    () =>
      buildSkillGraph(
        focusIds
          ? filterTreeToAncestors(skills, focusIds)
          : buildSkillTree(skills),
        domainId,
        domainName,
        collapsed,
        {
          readOnly,
          focusIds,
          selectable: Boolean(onToggleSelect),
          selectedIds,
          onMenuOpenChange,
          // Pas d'ouverture en picker : on y coche, on n'y consulte pas.
          onOpenSkill: onToggleSelect ? undefined : onOpenSkill,
          accentClassName,
        },
      ),
    [
      skills,
      domainId,
      domainName,
      collapsed,
      readOnly,
      focusIds,
      onToggleSelect,
      onOpenSkill,
      onMenuOpenChange,
      selectedIds,
      accentClassName,
    ],
  )

  const [nodes, setNodes, onNodesChange] = useNodesState<SkillGraphNode>(
    graph.nodes,
  )
  const [edges, setEdges, onEdgesChange] = useEdgesState(graph.edges)
  useEffect(() => {
    setNodes(graph.nodes)
    setEdges(graph.edges)
  }, [graph, setNodes, setEdges])

  const { getIntersectingNodes, fitView } = useReactFlow()
  // Le conteneur change de taille au plein écran : React Flow s'y adapte, mais
  // garde son cadrage — celui d'une fenêtre trois fois plus petite.
  useEffect(() => {
    const t = setTimeout(() => fitView({ duration: 200 }), 60)
    return () => clearTimeout(t)
  }, [fullscreen, fitView])
  const reparent = useReparentSkill()
  const [dropTargetId, setDropTargetId] = useState<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // Cible de drop = un nœud (compétence ou domaine) chevauché par le nœud tiré,
  // hors lui-même. Le back valide ensuite profondeur / cycle / même domaine.
  const findDropTarget = useCallback(
    (dragged: Node): Node | null => {
      const hits = getIntersectingNodes(dragged).filter(
        (n) => n.id !== dragged.id,
      )
      return hits[0] ?? null
    },
    [getIntersectingNodes],
  )

  const onNodeDragStart = useCallback((_: unknown, node: Node) => {
    setDraggingId(node.id)
  }, [])

  // Double-clic sur une compétence : replie/déplie (comme le chevron). On stoppe
  // la propagation pour éviter le zoom double-clic du canvas.
  const onNodeDoubleClick = useCallback(
    (event: MouseEvent, node: Node) => {
      if (node.type !== 'skill') return
      event.stopPropagation()
      onToggleCollapse(node.id)
    },
    [onToggleCollapse],
  )

  /**
   * Un clic, deux gestes possibles — et le dépliage passe TOUJOURS en premier.
   *
   * En mode picker, la sélection court-circuitait tout : un nœud non cochable
   * absorbait le clic sans rien faire, et il ne restait plus que la poignée de
   * repli, quelques pixels, pour ouvrir une branche. Choisir une compétence
   * enfouie devenait impossible.
   *
   * Un nœud qui en contient d'autres est un **tiroir** : le clic l'ouvre et le
   * referme, qu'on soit en train de sélectionner ou non. C'est le geste qu'on
   * fait naturellement dessus. Une feuille n'a rien à ouvrir : son clic bascule
   * la sélection, si elle est cochable.
   */
  const onNodeClick = useCallback(
    (event: React.MouseEvent, node: Node) => {
      if (event.button !== 0) return
      if (Date.now() - finDeMenu.current < 400) return
      if (node.type !== 'skill') return
      if (repliables.has(node.id)) {
        onToggleCollapse(node.id)
        return
      }
      // Hors picker, une feuille qui s'apprend ouvre son panneau : c'est le
      // geste principal de l'arbre depuis qu'il mène quelque part. Un nœud à
      // enfants garde le sien — ouvrir le tiroir —, et son panneau reste
      // atteignable par le clic droit : on ne prend pas un geste installé pour
      // en donner un nouveau.
      if (!onToggleSelect) {
        onOpenSkill?.(node.id)
        return
      }
      if (selectableIds && !selectableIds.has(node.id)) return
      onToggleSelect(node.id)
    },
    [onToggleSelect, onOpenSkill, selectableIds, repliables, onToggleCollapse],
  )

  const onNodeDrag = useCallback(
    (_: unknown, node: Node) => {
      setDropTargetId(findDropTarget(node)?.id ?? null)
    },
    [findDropTarget],
  )

  const onNodeDragStop = useCallback(
    async (_: unknown, node: Node) => {
      const target = findDropTarget(node)
      setDropTargetId(null)
      setDraggingId(null)
      // Le geste est éphémère : on repositionne selon le layout calculé. Un
      // reparent réussi relancera le layout via l'invalidation.
      setNodes(graph.nodes)
      if (!target) return
      const newParentId = target.type === 'domain' ? null : target.id
      try {
        await reparent.mutateAsync({ id: node.id, newParentId })
      } catch (err) {
        toast.error(
          err instanceof ApiError ? err.message : 'Le déplacement a échoué',
        )
      }
    },
    [findDropTarget, graph.nodes, reparent, setNodes],
  )

  const renderedNodes = useMemo(
    () =>
      nodes.map((node) =>
        node.id === dropTargetId
          ? {
              ...node,
              className: cn(
                node.className,
                'rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-background',
              ),
            }
          : node,
      ),
    [nodes, dropTargetId],
  )

  // Pendant le drag, on masque les arêtes qui touchent le nœud tiré : sinon le
  // fil vers le parent (et vers les enfants) fait un élastique qui suit le geste.
  const renderedEdges = useMemo(
    () =>
      draggingId
        ? edges.filter(
            (e) => e.source !== draggingId && e.target !== draggingId,
          )
        : edges,
    [edges, draggingId],
  )

  return (
    <div
      className={cn('rounded-lg border', fullscreen ? 'h-full' : 'h-[600px]')}
    >
      <ReactFlow
        nodes={renderedNodes}
        edges={renderedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={readOnly ? undefined : onNodeDragStart}
        onNodeDrag={readOnly ? undefined : onNodeDrag}
        onNodeDragStop={readOnly ? undefined : onNodeDragStop}
        onNodeClick={onNodeClick}
        onNodeDoubleClick={onNodeDoubleClick}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        nodesDraggable={!readOnly}
        nodesConnectable={false}
        selectNodesOnDrag={false}
        fitView
        proOptions={{ hideAttribution: false }}
      >
        <Background />
        <Controls showInteractive={false} />
        {/* En bas à droite : le coin haut-droit du bloc porte déjà l'action
            « Modifier », et le bas-gauche les contrôles de zoom. */}
        <Panel position="bottom-right" className="flex gap-1">
          <BoutonVue
            label={toutReplie ? 'Tout déplier' : 'Tout replier'}
            onClick={toutReplie ? deplierTout : replierTout}
          >
            {toutReplie ? (
              <ChevronsUpDown className="size-4" />
            ) : (
              <ChevronsDownUp className="size-4" />
            )}
          </BoutonVue>
          {onToggleFullscreen && (
            <BoutonVue
              label={fullscreen ? 'Quitter le plein écran' : 'Plein écran'}
              onClick={onToggleFullscreen}
            >
              {fullscreen ? (
                <Minimize2 className="size-4" />
              ) : (
                <Maximize2 className="size-4" />
              )}
            </BoutonVue>
          )}
        </Panel>
      </ReactFlow>
    </div>
  )
}

/** Bouton de la barre de vue — même grammaire que les contrôles React Flow. */
function BoutonVue({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-8 place-items-center rounded-md border bg-card text-muted-foreground shadow-sm transition-colors hover:bg-muted/60 hover:text-foreground"
    >
      {children}
    </button>
  )
}

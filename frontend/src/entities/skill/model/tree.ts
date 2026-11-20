import type { Skill, SkillNode } from './types'

/**
 * Reconstruit l'arbre à partir de la liste plate renvoyée par l'API.
 *
 * L'API renvoie les compétences déjà triées (order, puis nom) ; on préserve cet
 * ordre pour les racines comme pour les enfants en itérant sur la liste telle
 * quelle. Une compétence dont le parent est absent de la liste est traitée comme
 * une racine (cas défensif, ne devrait pas arriver sur une liste par domaine).
 */
export function buildSkillTree(skills: Skill[]): SkillNode[] {
  const nodesById = new Map<string, SkillNode>()
  for (const skill of skills) {
    nodesById.set(skill.id, { ...skill, children: [] })
  }

  const roots: SkillNode[] = []
  for (const skill of skills) {
    const node = nodesById.get(skill.id)!
    const parent = skill.parent_skill_id
      ? nodesById.get(skill.parent_skill_id)
      : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

/**
 * Le chemin de chaque compétence — ses ancêtres, du plus haut au plus proche,
 * joints par « › ». Vide pour une racine.
 *
 * Se calcule sur la liste plate, sans passer par l'arbre : un sélecteur affiche
 * des feuilles, pas une hiérarchie, et n'a besoin que de savoir d'où chacune
 * vient. Un parent absent de la liste coupe simplement le chemin — on n'affiche
 * pas ce qu'on ne voit pas.
 */
export function skillPaths(skills: Skill[]): Map<string, string> {
  const byId = new Map(skills.map((s) => [s.id, s]))
  const paths = new Map<string, string>()
  for (const skill of skills) {
    const ancestors: string[] = []
    let parent = skill.parent_skill_id
      ? byId.get(skill.parent_skill_id)
      : undefined
    // `seen` protège d'un cycle : le back l'interdit, mais une boucle infinie
    // au rendu coûte plus cher que deux lignes de garde.
    const seen = new Set<string>([skill.id])
    while (parent && !seen.has(parent.id)) {
      seen.add(parent.id)
      ancestors.unshift(parent.name)
      parent = parent.parent_skill_id
        ? byId.get(parent.parent_skill_id)
        : undefined
    }
    paths.set(skill.id, ancestors.join(' › '))
  }
  return paths
}

/** Nombre total de descendants d'un nœud (tous niveaux confondus). */
export function countDescendants(node: SkillNode): number {
  return node.children.reduce(
    (total, child) => total + 1 + countDescendants(child),
    0,
  )
}

/**
 * Réduit l'arbre aux compétences de `keepIds` **et à leurs ancêtres**, pour
 * garder un arbre connecté. Les nœuds hors `keepIds` sont des ancêtres de
 * contexte (à afficher en sourdine côté rendu).
 */
export function filterTreeToAncestors(
  skills: Skill[],
  keepIds: Set<string>,
): SkillNode[] {
  function subtreeHasKept(node: SkillNode): boolean {
    return keepIds.has(node.id) || node.children.some(subtreeHasKept)
  }
  function prune(nodes: SkillNode[]): SkillNode[] {
    return nodes
      .filter(subtreeHasKept)
      .map((node) => ({ ...node, children: prune(node.children) }))
  }
  return prune(buildSkillTree(skills))
}

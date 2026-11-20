/**
 * Le dessin commun des lignes de la colonne (`prod/Notes`) : sur le fond de
 * la colonne, le survol s'assombrit à peine, la ligne choisie un peu plus —
 * en opacités de l'encre, pour se lire en clair comme en sombre.
 */
export const ROW_HOVER = 'hover:bg-foreground/[0.045]'
export const ROW_SELECTED = 'bg-foreground/[0.07]'

/** L'intitulé d'un groupe (« Ressources », « Actions ») : petites capitales
 *  grises, 24 px de haut. */
export const GROUP_LABEL =
  'text-[10.5px] font-semibold tracking-[.05em] text-muted-foreground uppercase'

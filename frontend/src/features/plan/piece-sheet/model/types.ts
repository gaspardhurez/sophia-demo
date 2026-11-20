import type { PiecePhase } from '@/entities/plan'

/**
 * Le **view-model** de la fiche d'une pièce (#137, #138, `kit/Fiche piece`) :
 * tout ce que la fiche affiche, déjà décidé. Le composant ne calcule rien ;
 * les fonctions de `build.ts` le construisent depuis les données du cycle.
 */

/** Ce que la pièce est — l'étude n'a pas de fiche (son clic ouvre les notes). */
export type PieceSheetKind =
  'exercise' | 'situation' | 'integrated' | 'generic' | 'recall'

/** L'état en pastille, au pied du rail : point vide (`todo`), demi-disque
 *  (`progress`), coche (`done` — le titre passe alors à l'encre, coché). */
export interface PieceSheetState {
  tone: 'todo' | 'progress' | 'done'
  /** « Jamais fait », « En cours », « Réussi », « J+15 », « Arrêtée »… */
  label: string
}

/** La courbe de l'interro, dans l'encadré : `idle` = pas lancée (frise en
 *  pointillé), `stopped` = arrêtée à la clôture (frise grisée). */
export interface PieceSheetCurve {
  status: 'idle' | 'running' | 'finished' | 'stopped'
  /** `recall_stage` (0 à 5 ; 5 = terminée). */
  stage: number
  /** « 12 questions · prochaine le 22 oct. ». */
  caption: string
}

/** L'encadré gris sous le titre. Absent : la pièce générique. */
export interface PieceSheetBox {
  /** « Instructions », ou « Critères de réussite » d'une mise en situation. */
  text: { title: string; body: string } | null
  reference: string | null
  /** « Comment il est fait » d'un intégré. */
  integrated: { statement: string; solution: string; evaluation: string } | null
  curve: PieceSheetCurve | null
}

/**
 * La marque d'une ligne du fil : faite (coche pleine), à venir (anneau),
 * ratée (séance passée non cochée), passation ouverte (demi-disque), ou un
 * **événement** de l'interro (« Test lancé », « Recommencée ») qui ne
 * compte pas dans le nombre.
 */
export type PieceSheetMark =
  'done' | 'planned' | 'missed' | 'open' | 'launch' | 'restart'

/** Une ligne du fil : une séance (ou une passation, ou un événement). */
export interface PieceSheetPass {
  key: string
  /** `YYYY-MM-DD` — le jour en grand, et le mois qui groupe. */
  day: string
  title: string
  mark: PieceSheetMark
  /** Le retour de la passe (#139) sinon la note de la séance ; le score
   *  d'une passation. */
  note: string | null
  /** Le niveau sur 5 du retour (#139). */
  level: number | null
  /** L'acte qui prend un retour (séance faite, Pratique ou Mise en
   *  situation) : le crayon rouvre la saisie. */
  feedback: {
    activityId: string
    actId: string
    level: number | null
    feedback: string | null
  } | null
}

/** Le critère de maîtrise d'un objet de Pratique ou de Mise en situation
 *  (#157) : `passes` passes à `level`/5 dans le cycle, dont `reached` faites
 *  (plafonné ; toutes une fois la pièce maîtrisée). */
export interface PieceSheetCriterion {
  passes: number
  level: number
  reached: number
}

/** Ce que le pied et l'en-tête des séances proposent. */
export interface PieceSheetActions {
  /** L'icône Planifier après le nombre de séances — absente sur un cycle
   *  clos. */
  plan: boolean
  /** Modifier — ni l'interro ni la pièce générique. */
  edit: boolean
  /** « Ouvrir ↗ », désactivé — un intégré (sa page n'existe pas). */
  open: boolean
  /** Le bouton plein de l'interro : passer (dû ou en retard), reprendre (une
   *  passation ouverte). Lancer la courbe se fait depuis la tuile de l'Étude
   *  (« Lancer l'interro », #157), pas d'ici. */
  recall: 'take' | 'resume' | null
  /** « Recommencer » (tertiaire, à gauche) : courbe démarrée, sauf
   *  arrêtée. */
  restart: boolean
  /** « Fermer » : courbe terminée ou arrêtée. */
  close: boolean
}

export interface PieceSheetData {
  kind: PieceSheetKind
  title: string
  /** L'emoji de la tuile (et du filigrane) ; vide pour une pièce générique,
   *  qui se lit avec sa mini-jauge (et 🌱 en filigrane). */
  emoji: string
  phase: PiecePhase
  /** « Pratique », « Mise en situation », « Étude » (l'interro). */
  phaseLabel: string
  state: PieceSheetState
  /** Les pastilles du rail, sous le nombre de fois — absent : la générique,
   *  l'interro. */
  criterion: PieceSheetCriterion | null
  /** Séances faites (passations terminées pour l'interro) — les événements
   *  et les séances à venir n'y comptent pas. */
  count: number
  /** Le jour de la dernière, `YYYY-MM-DD`. */
  last: string | null
  /** « jeu. 22 », « Aujourd'hui », « Depuis jeu. 10 » ; `alert` : rose (une
   *  interro due ou en retard). */
  next: { label: string; alert: boolean } | null
  box: PieceSheetBox | null
  /** Du plus récent au plus ancien. */
  passes: PieceSheetPass[]
  /** Le bouton de verdict : son libellé ne bouge pas, c'est le remplissage
   *  qui dit s'il est posé. Absent : pas de verdict (intégré, interro,
   *  générique, cycle clos). */
  verdict: { label: string; done: boolean } | null
  actions: PieceSheetActions
  /** « 5 sur 12 sues » : la passation ouverte, que la confirmation de
   *  Recommencer annonce abandonnée. */
  openRecall: string | null
}

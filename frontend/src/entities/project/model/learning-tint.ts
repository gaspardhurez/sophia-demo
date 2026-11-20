/**
 * Opacité de la teinte du domaine par niveau d'un savoir visé : rien avant de
 * commencer, puis Étude, Pratique, Application ; l'acquis passe à l'encre. La
 * mosaïque de la carte Apprentissage et les blocs du suivi de l'en-tête
 * (design #34) lisent la même échelle.
 */
export const LEARNING_TINT = [0, 0.3, 0.5, 0.75] as const

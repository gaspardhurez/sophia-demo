import type { components } from '@/shared/api'

/** Une métrique : ce qu'on mesure (« Squat 1RM », en kg, dans Musculation). */
export type Metric = components['schemas']['MetricRead']
export type MetricCreate = components['schemas']['MetricCreate']
export type MetricUpdate = components['schemas']['MetricUpdate']

/** Un relevé : une valeur, un jour, éventuellement issue d'une activité. */
export type MetricValue = components['schemas']['MetricValueRead']

/** Un résultat visé : ce qu'un projet vise sur une métrique. */
export type ProjectMetric = components['schemas']['ProjectMetricRead']

/** Sens de progression — sert à dériver le meilleur relevé, pas une barre. */
export type MetricDirection = components['schemas']['MetricDirection']

/** Ce qu'une suppression emporterait. */
export type MetricUsage = components['schemas']['MetricUsage']

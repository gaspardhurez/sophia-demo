/**
 * Erreur HTTP renvoyée par l'API, statut compris.
 *
 * openapi-fetch ne remonte que le corps de la réponse dans `error` ; le statut
 * vit sur `response`. On recolle les deux pour que l'appelant puisse
 * distinguer un 404 d'une panne.
 *
 * Note : une panne réseau (backend éteint) ne passe pas par ici — `fetch` lève
 * directement, et l'exception traverse telle quelle.
 */
export class ApiError extends Error {
  // Champ déclaré explicitement : `erasableSyntaxOnly` interdit les parameter
  // properties, qui produiraient du code à l'exécution.
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

/** Construit une ApiError à partir du couple (corps d'erreur, réponse). */
export function toApiError(error: unknown, response: Response): ApiError {
  const detail = (error as { detail?: unknown } | undefined)?.detail
  // FastAPI renvoie une string pour HTTPException, une liste pour les 422.
  const message =
    typeof detail === 'string' ? detail : `Erreur ${response.status}`
  return new ApiError(response.status, message)
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404
}

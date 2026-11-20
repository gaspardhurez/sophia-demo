import createClient from 'openapi-fetch'

import type { paths } from './schema'

/** La base de l'API : les chemins qu'elle renvoie (`/media/<id>`) s'y rattachent. */
export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

export const api = createClient<paths>({ baseUrl: API_BASE_URL })

/**
 * L'adresse WebSocket d'un chemin de l'API (`ws:` ou `wss:` selon la base) :
 * ce qui ne passe pas par openapi-fetch (la dictée en direct).
 */
export function apiSocketUrl(path: string): string {
  const base = API_BASE_URL.replace(/\/+$/, '').replace(/^http/, 'ws')
  return `${base}/${path.replace(/^\/+/, '')}`
}

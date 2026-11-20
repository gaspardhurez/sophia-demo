import { API_BASE_URL } from './client'

/**
 * L'adresse d'un média à mettre dans `<img src>`. L'API renvoie une `url`
 * relative à elle (`/media/<id>`) — c'est elle qu'on stocke, pour survivre à
 * un changement de port ou d'hôte ; on la rattache ici à la base de l'API.
 * Une adresse déjà complète (`https:`, `blob:`, `data:`) passe telle quelle.
 */
export function mediaSrc(url: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(url)) return url
  return `${API_BASE_URL.replace(/\/+$/, '')}/${url.replace(/^\/+/, '')}`
}

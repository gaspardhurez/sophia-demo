import { Navigate, useLocation, useParams } from 'react-router-dom'

/** L'ancienne adresse de la page savoir : elle vit dans le hub depuis #152.
 *  Le lien garde ses paramètres (`?cycle=`, `?objet=`, `?projet=`) et son
 *  état (l'onglet « Nouveau cycle »). */
export function SkillRedirect() {
  const { skillId } = useParams<{ skillId: string }>()
  const location = useLocation()
  return (
    <Navigate
      to={`/learning/${skillId}${location.search}`}
      state={location.state}
      replace
    />
  )
}

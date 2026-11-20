import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useDocumentTitle } from '@/shared/lib/document-title'
import { LearningOverview, type PieceOpen } from '@/widgets/learning-hub'
import { PieceSheetHost } from '@/widgets/piece-sheet-host'

/** L'arrivée sur le hub (#152, #165) : une étiquette de pièce y ouvre sa
 *  fiche, sans quitter le hub — la page compose les deux widgets. */
export function LearningOverviewPage() {
  useDocumentTitle('Apprentissage')
  const navigate = useNavigate()
  const [piece, setPiece] = useState<PieceOpen | null>(null)
  return (
    <>
      <LearningOverview
        onSkill={(id) => navigate(`/learning/${id}`)}
        onPiece={setPiece}
      />
      {piece && (
        <PieceSheetHost
          key={`${piece.planId}:${piece.act.kind}:${piece.act.practice_item_id ?? piece.act.nature ?? ''}`}
          target={piece}
          onClose={() => setPiece(null)}
        />
      )}
    </>
  )
}

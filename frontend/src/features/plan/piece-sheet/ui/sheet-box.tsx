import type { ReactNode } from 'react'

import type { DomainColorClasses } from '@/entities/domain'
import { RecallCurve } from '@/entities/plan'
import { cn } from '@/shared/lib/utils'

import type { PieceSheetBox, PieceSheetCurve } from '../model/types'

/**
 * L'**encadré** gris sous le titre (`kit/Fiche piece`) : Instructions (ou
 * Critères de réussite) et Référence ; « Comment il est fait » d'un intégré ;
 * la courbe de l'interro et sa ligne « n questions · … ».
 */
export function SheetBox({
  box,
  accent,
}: {
  box: PieceSheetBox
  accent: DomainColorClasses
}) {
  return (
    <div className="flex flex-col gap-3.5 rounded-xl bg-muted/50 px-4 py-3.5">
      {box.text && (
        <BoxSection title={box.text.title}>
          <p className="text-sm leading-normal whitespace-pre-wrap text-pretty text-foreground/80">
            {box.text.body}
          </p>
        </BoxSection>
      )}
      {box.reference && (
        <BoxSection title="Référence">
          <p className="text-sm break-words underline underline-offset-[3px]">
            {box.reference}
          </p>
        </BoxSection>
      )}
      {box.integrated && (
        <BoxSection title="Comment il est fait">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Énoncé</dt>
            <dd>{box.integrated.statement}</dd>
            <dt className="text-muted-foreground">Solution</dt>
            <dd>{box.integrated.solution}</dd>
            <dt className="text-muted-foreground">Évaluation</dt>
            <dd>{box.integrated.evaluation}</dd>
          </dl>
        </BoxSection>
      )}
      {box.curve && <CurveSection curve={box.curve} accent={accent} />}
    </div>
  )
}

function BoxSection({
  title,
  children,
}: {
  title: string
  children: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2.5">
      <h3 className="font-heading text-sm font-semibold">{title}</h3>
      {children}
    </section>
  )
}

/**
 * La courbe J+1 → J+90 (`RecallCurve`) : pas lancée, en pointillé ; arrêtée
 * à la clôture, grisée ; terminée, tous les crans pleins.
 */
function CurveSection({
  curve,
  accent,
}: {
  curve: PieceSheetCurve
  accent: DomainColorClasses
}) {
  const stopped = curve.status === 'stopped'
  const idle = curve.status === 'idle'
  return (
    <section className="flex flex-col gap-3">
      <h3 className="font-heading text-sm font-semibold">Courbe</h3>
      {/* `RecallCurve` n'a pas de variante « pas lancée » : ses crans vides
          passent en pointillé par le conteneur. */}
      <div className={cn(idle && '[&_.rounded-full]:border-dashed')}>
        <RecallCurve
          reached={idle ? 0 : curve.stage}
          target={idle ? -1 : curve.stage}
          size="sm"
          fillClassName={stopped ? 'bg-zinc-400' : accent.ink}
          ringClassName={stopped ? 'border-zinc-400' : accent.solid}
        />
      </div>
      <span className="text-[13px] text-foreground/70">{curve.caption}</span>
    </section>
  )
}

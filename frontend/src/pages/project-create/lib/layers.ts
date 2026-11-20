/**
 * Une couche Radix est ouverte par-dessus — menu, sélecteur de période,
 * fenêtre de confirmation : Échap lui revient, pas à la création.
 */
export function otherLayerOpen(): boolean {
  return Boolean(
    document.querySelector(
      '[data-radix-popper-content-wrapper], [role="dialog"][data-state="open"], [role="alertdialog"]',
    ),
  )
}

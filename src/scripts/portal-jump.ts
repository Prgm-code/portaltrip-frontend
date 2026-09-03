// Coreografía del salto entre páginas: origen del portal, destello y elemento compartido.
interface JumpEvent extends Event {
  sourceElement?: Element;
  newDocument?: Document;
}

const portalOrigin = { x: 50, y: 50 };

function applyOrigin(root: HTMLElement): void {
  root.style.setProperty('--portal-x', `${portalOrigin.x.toFixed(2)}%`);
  root.style.setProperty('--portal-y', `${portalOrigin.y.toFixed(2)}%`);
}

document.addEventListener('astro:before-preparation', (event) => {
  const { sourceElement } = event as JumpEvent;
  const rect = sourceElement?.getBoundingClientRect();
  if (rect && rect.width > 0 && window.innerWidth > 0 && window.innerHeight > 0) {
    portalOrigin.x = ((rect.left + rect.width / 2) / window.innerWidth) * 100;
    portalOrigin.y = ((rect.top + rect.height / 2) / window.innerHeight) * 100;
  } else {
    portalOrigin.x = 50;
    portalOrigin.y = 50;
  }
  applyOrigin(document.documentElement);

  // La reserva que inicia un viaje se funde con la escena del portal en la bitácora.
  const stage = sourceElement?.closest<HTMLElement>('.reservation-item');
  if (stage) stage.style.viewTransitionName = 'journey-stage';

  const flash = document.querySelector<HTMLElement>('.jump-flash');
  if (flash) {
    flash.classList.remove('active');
    void flash.offsetWidth;
    flash.classList.add('active');
    flash.addEventListener('animationend', () => flash.classList.remove('active'), { once: true });
  }
});

// Los atributos de <html> se reemplazan en el swap: el nuevo documento hereda el origen.
document.addEventListener('astro:before-swap', (event) => {
  const { newDocument } = event as JumpEvent;
  if (newDocument) applyOrigin(newDocument.documentElement);
});

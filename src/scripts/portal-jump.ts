// Coreografía del salto entre páginas: origen del portal, salida de las tarjetas,
// destello y elemento compartido. El campo de estrellas acelera en paralelo (starfield.ts).
interface JumpEvent extends Event {
  sourceElement?: Element;
  newDocument?: Document;
  loader?: () => Promise<void>;
}

/** Tiempo que las tarjetas tardan en desvanecerse antes de que se capture la vista. */
const EXIT_DURATION_MS = 560;
const portalOrigin = { x: 50, y: 50 };
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function applyOrigin(root: HTMLElement): void {
  root.style.setProperty('--portal-x', `${portalOrigin.x.toFixed(2)}%`);
  root.style.setProperty('--portal-y', `${portalOrigin.y.toFixed(2)}%`);
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

document.addEventListener('astro:before-preparation', (event) => {
  const jump = event as JumpEvent;
  const { sourceElement } = jump;
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
  if (stage) {
    stage.style.viewTransitionName = 'journey-stage';
    stage.dataset.jumpStage = 'true';
  }

  // El resto de la interfaz se desvanece hacia el portal y deja ver el warp de fondo.
  // El loader se retrasa lo justo para que la captura de la vista vieja ya esté vacía.
  document.documentElement.classList.add('jumping');
  if (!reduceMotion.matches && typeof jump.loader === 'function') {
    const originalLoader = jump.loader;
    jump.loader = async () => {
      await Promise.all([originalLoader(), wait(EXIT_DURATION_MS)]);
    };
  }

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
  if (newDocument) {
    applyOrigin(newDocument.documentElement);
    newDocument.documentElement.classList.remove('jumping');
  }
});

document.addEventListener('astro:after-swap', () => {
  document.documentElement.classList.remove('jumping');
});

// Punto de entrada del planificador: la implementación vive en travel-planner/.
import { initializeApp, paintPlannerIfCached } from 'scripts/travel-planner';

// Con <ClientRouter /> este módulo se evalúa una sola vez por sesión; cada llegada a la
// página (carga inicial o salto desde otra dimensión) recibe HTML nuevo y vuelve a arrancar.
function boot(): void {
  const form = document.getElementById('booking-form');
  if (!form || form.dataset.booted) return;
  form.dataset.booted = 'true';
  void initializeApp();
}

boot();
document.addEventListener('astro:after-swap', () => {
  paintPlannerIfCached();
});
document.addEventListener('astro:page-load', boot);

// El respaldo CSS aparece de inmediato; WebGL se carga al acercarse al portal.
const started = new WeakSet<HTMLCanvasElement>();
let observer: IntersectionObserver | undefined;
let generation = 0;

function mountPortals(): void {
  observer?.disconnect();
  const currentGeneration = ++generation;
  observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || !(entry.target instanceof HTMLCanvasElement)) continue;
        const canvas = entry.target;
        observer?.unobserve(canvas);
        if (started.has(canvas)) continue;
        started.add(canvas);
        void import('./portal')
          .then(({ startPortal }) => {
            if (canvas.isConnected && currentGeneration === generation) startPortal(canvas);
          })
          .catch(() => {
            started.delete(canvas);
            canvas.closest('.portal-wrap')?.classList.add('portal-fallback');
          });
      }
    },
    { rootMargin: '120px' },
  );
  for (const canvas of document.querySelectorAll<HTMLCanvasElement>('.portal-canvas')) {
    if (!started.has(canvas)) observer.observe(canvas);
  }
}

mountPortals();
document.addEventListener('astro:before-swap', () => {
  generation += 1;
  observer?.disconnect();
});
document.addEventListener('astro:after-swap', mountPortals);

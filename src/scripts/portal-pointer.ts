interface PortalPointerHandlers {
  move: (x: number, y: number) => void;
  reset: () => void;
}

/** Mouse hover and one captured finger share the same measured movement path. */
export function bindPortalPointer(
  host: HTMLElement,
  handlers: PortalPointerHandlers,
  signal: AbortSignal,
): void {
  let activePointer: number | null = null;
  const options = { signal };

  function reset(): void {
    const pointer = activePointer;
    activePointer = null;
    if (pointer !== null && host.hasPointerCapture(pointer)) host.releasePointerCapture(pointer);
    handlers.reset();
  }

  host.addEventListener(
    'pointerdown',
    (event) => {
      if (!event.isTrusted || event.pointerType === 'mouse' || !event.isPrimary) return;
      if (activePointer !== null || host.dataset.bosons !== 'needed') return;
      activePointer = event.pointerId;
      handlers.reset();
      host.setPointerCapture(event.pointerId);
      handlers.move(event.clientX, event.clientY);
    },
    options,
  );

  host.addEventListener(
    'pointermove',
    (event) => {
      if (!event.isTrusted) return;
      if (event.pointerType !== 'mouse' && event.pointerId !== activePointer) return;
      const box = host.getBoundingClientRect();
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      ) {
        handlers.reset();
        return;
      }
      handlers.move(event.clientX, event.clientY);
    },
    options,
  );

  host.addEventListener(
    'pointerenter',
    (event) => {
      if (event.isTrusted && event.pointerType === 'mouse')
        handlers.move(event.clientX, event.clientY);
    },
    options,
  );
  host.addEventListener(
    'pointerleave',
    () => {
      if (activePointer === null) handlers.reset();
    },
    options,
  );
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
    host.addEventListener(
      type,
      (event) => {
        if (event.pointerId === activePointer) reset();
      },
      options,
    );
  }
  signal.addEventListener('abort', reset, { once: true });
}

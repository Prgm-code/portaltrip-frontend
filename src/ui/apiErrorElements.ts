import type { ApiErrorView } from 'services/portalTripApiError';
import { createElement } from 'ui/dom';

/** Usa el estado HTTP como marca principal; evita símbolos ambiguos. */
function errorMark(error: ApiErrorView): string {
  if (error.status) return String(error.status);
  return error.kind === 'network' ? 'OFF' : '!';
}

function configureRetryButton(
  button: HTMLButtonElement,
  readyLabel: string,
  onRetry: () => void,
): void {
  button.textContent = readyLabel;
  button.addEventListener('click', onRetry, { once: true });
}

/**
 * Construye el estado de error temático utilizado por el catálogo.
 *
 * @param error Contenido de UI generado a partir del error técnico.
 * @param onRetry Acción que vuelve a ejecutar la petición fallida.
 * @returns Panel accesible listo para insertarse en el DOM.
 */
export function createApiErrorPanel(error: ApiErrorView, onRetry?: () => void): HTMLElement {
  const header = createElement(
    'div',
    { className: 'flex items-center justify-center gap-2' },
    createElement('span', {
      className:
        'rounded-full border border-[var(--orange)]/30 bg-[var(--orange)]/10 px-2.5 py-1 font-mono text-[10px] font-bold tracking-[.12em] text-[var(--orange)]',
      text: `CÓDIGO · ${error.code}`,
    }),
    createElement('span', {
      className: 'font-mono text-[10px] font-bold uppercase tracking-[.14em] text-[var(--dim)]',
      text: 'Anomalía detectada',
    }),
  );

  const panel = createElement('section', {
    className:
      'my-3 grid min-h-[245px] w-full place-items-center rounded-[18px] border border-dashed border-[var(--orange)]/35 bg-[radial-gradient(circle_at_50%_20%,rgba(255,172,66,.12),transparent_46%),rgba(255,255,255,.02)] px-5 py-8 text-center',
    attrs: { role: 'alert', 'aria-label': `${error.code}: ${error.title}` },
    dataset: { errorKind: error.kind },
  });

  const content = createElement(
    'div',
    { className: 'grid max-w-[440px] justify-items-center' },
    createElement('span', {
      className:
        'mb-3 grid size-16 place-items-center rounded-full border border-[var(--orange)]/50 bg-[var(--orange)]/10 font-mono text-[19px] font-black leading-none text-[var(--orange)] shadow-[0_0_30px_rgba(255,172,66,.2)]',
      text: errorMark(error),
      attrs: { 'aria-hidden': 'true' },
    }),
    header,
    createElement('h3', {
      className: 'mb-1.5 mt-3 text-[21px] font-extrabold tracking-[-.04em] text-[var(--ink)]',
      text: error.title,
    }),
    createElement('p', {
      className: 'm-0 text-[13px] leading-relaxed text-[var(--muted)]',
      text: error.message,
    }),
    createElement('small', {
      className: 'mt-1.5 text-[11px] leading-relaxed text-[var(--dim)]',
      text: error.hint,
    }),
  );

  if (onRetry) {
    const retry = createElement('button', {
      className: 'btn btn-primary mt-4 min-h-[40px] text-[11px]',
      attrs: { type: 'button' },
    });
    configureRetryButton(retry, 'Recalibrar portal →', onRetry);
    content.append(retry);
  }

  panel.append(content);
  return panel;
}

/** Versión compacta del error para bloquear y explicar el estado del formulario. */
export function createApiFormErrorNotice(error: ApiErrorView, onRetry?: () => void): HTMLElement {
  const notice = createElement(
    'section',
    {
      className:
        'grid grid-cols-[36px_1fr] gap-x-3 rounded-xl border border-[var(--orange)]/35 bg-[var(--orange)]/8 p-3 text-left',
      attrs: { role: 'alert', 'aria-label': `${error.code}: ${error.title}` },
      dataset: { errorKind: error.kind },
    },
    createElement('span', {
      className:
        'row-span-2 grid size-9 place-items-center rounded-full border border-[var(--orange)]/40 bg-[var(--night)] font-mono text-[11px] font-black text-[var(--orange)]',
      text: errorMark(error),
      attrs: { 'aria-hidden': 'true' },
    }),
    createElement(
      'div',
      { className: 'flex items-center gap-2' },
      createElement('b', { className: 'text-[12px] text-[#ffd9a8]', text: error.title }),
      createElement('small', {
        className:
          'rounded-full bg-[var(--orange)]/15 px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-[var(--orange)]',
        text: `CÓDIGO ${error.code}`,
      }),
    ),
    createElement('p', {
      className: 'm-0 mt-1 text-[10px] leading-relaxed text-[var(--muted)]',
      text: `${error.message} ${error.hint}`,
    }),
  );

  if (onRetry) {
    const retry = createElement('button', {
      className:
        'col-start-2 mt-2 w-max cursor-pointer border-0 bg-transparent p-0 text-[10px] font-extrabold text-[var(--green)] hover:underline disabled:cursor-wait disabled:opacity-60',
      attrs: { type: 'button' },
    });
    configureRetryButton(retry, 'Recalibrar formulario →', onRetry);
    notice.append(retry);
  }

  return notice;
}

/** Aviso mostrado mientras los campos dependientes de la API están bloqueados. */
export function createApiFormLoadingNotice(): HTMLElement {
  return createElement(
    'div',
    {
      className:
        'flex items-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--green)]/5 px-3 py-2.5 font-mono text-[10.5px] uppercase tracking-[.06em] text-[var(--muted)]',
      attrs: { role: 'status' },
    },
    createElement('span', { className: 'spinner', attrs: { 'aria-hidden': 'true' } }),
    createElement('span', {
      text: 'Sincronizando destinos y acompañantes antes de habilitar la reserva...',
    }),
  );
}

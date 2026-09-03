import { createElement } from 'ui/dom';
import { formatCredits } from 'utils/travelRules';

// Piezas del pasaporte que se crean en tiempo de ejecución. Texto de la API por `textContent`.

/** Bitácora bloqueada: sin sesión no hay reservas que mostrar. */
export function createLockedReservationsState(): HTMLDivElement {
  const state = createElement(
    'div',
    { className: 'empty-state locked-state' },
    createElement('span', { className: 'empty-orbit', text: '◎' }),
    createElement('b', { text: 'Tu bitácora vive en la Ciudadela' }),
    createElement('p', {
      text: 'Ingresa con tu pasaporte para ver, iniciar o cancelar tus reservas. Si aún no tienes uno, se crea al confirmar tu primer salto.',
    }),
  );
  state.append(
    createElement(
      'div',
      { className: 'locked-actions' },
      createElement('button', {
        text: 'Ingresar con mi pasaporte',
        attrs: { type: 'button' },
        dataset: { openPassport: 'login' },
      }),
      createElement('button', {
        className: 'ghost',
        text: 'Crear pasaporte',
        attrs: { type: 'button' },
        dataset: { openPassport: 'register' },
      }),
    ),
  );
  return state;
}

/** Aviso único sobre reservas guardadas en este navegador antes del pasaporte. */
export function createLegacyNotice(count: number, onDiscard: () => void): HTMLElement {
  const discard = createElement('button', {
    text: 'Descartar archivo',
    attrs: { type: 'button' },
  });
  discard.addEventListener('click', onDiscard, { once: true });
  return createElement(
    'section',
    { className: 'legacy-notice', attrs: { role: 'note' } },
    createElement('span', { text: 'ARCHIVO LOCAL' }),
    createElement(
      'p',
      {},
      createElement('b', {
        text: `${count} reserva${count === 1 ? '' : 's'} de la versión anterior ${count === 1 ? 'sigue' : 'siguen'} en este dispositivo.`,
      }),
      ' Se crearon antes del pasaporte y no pueden transferirse a tu cuenta.',
    ),
    discard,
  );
}

/** Aviso temático para el 422 de saldo insuficiente. */
export function createBalanceErrorNotice(required: number, current: number): HTMLElement {
  const missing = Math.max(0, required - current);
  return createElement(
    'div',
    { className: 'balance-error' },
    createElement('b', { text: 'Créditos insuficientes para este salto' }),
    createElement(
      'dl',
      {},
      createElement(
        'div',
        {},
        createElement('dt', { text: 'Costo' }),
        createElement('dd', { text: formatCredits(required) }),
      ),
      createElement(
        'div',
        {},
        createElement('dt', { text: 'Tu saldo' }),
        createElement('dd', { text: formatCredits(current) }),
      ),
      createElement(
        'div',
        {},
        createElement('dt', { text: 'Faltan' }),
        createElement('dd', { className: 'missing', text: formatCredits(missing) }),
      ),
    ),
    createElement('small', {
      text: 'Cancela una reserva confirmada para recuperar créditos o elige un salto más económico.',
    }),
  );
}

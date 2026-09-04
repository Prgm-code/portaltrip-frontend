import { msg } from 'i18n';
import { createElement } from 'ui/dom';
import { formatCredits } from 'utils/travelRules';

// Piezas del pasaporte que se crean en tiempo de ejecución. Texto de la API por `textContent`.

/** Bitácora bloqueada: sin sesión no hay reservas que mostrar. */
export function createLockedReservationsState(): HTMLDivElement {
  const state = createElement(
    'div',
    { className: 'empty-state locked-state' },
    createElement('span', { className: 'empty-orbit', text: '◎' }),
    createElement('b', { text: msg().reservations.lockedTitle }),
    createElement('p', { text: msg().reservations.lockedCopy }),
  );
  state.append(
    createElement(
      'div',
      { className: 'locked-actions' },
      createElement('button', {
        text: msg().reservations.lockedSignIn,
        attrs: { type: 'button' },
        dataset: { openPassport: 'login' },
      }),
      createElement('button', {
        className: 'ghost',
        text: msg().reservations.lockedRegister,
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
    text: msg().reservations.legacyDiscard,
    attrs: { type: 'button' },
  });
  discard.addEventListener('click', onDiscard, { once: true });
  return createElement(
    'section',
    { className: 'legacy-notice', attrs: { role: 'note' } },
    createElement('span', { text: msg().reservations.legacyKicker }),
    createElement(
      'p',
      {},
      createElement('b', { text: msg().reservations.legacyBody(count) }),
      msg().reservations.legacyNote,
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
    createElement('b', { text: msg().errors.balanceNotice.title }),
    createElement(
      'dl',
      {},
      createElement(
        'div',
        {},
        createElement('dt', { text: msg().errors.balanceNotice.cost }),
        createElement('dd', { text: formatCredits(required) }),
      ),
      createElement(
        'div',
        {},
        createElement('dt', { text: msg().errors.balanceNotice.yours }),
        createElement('dd', { text: formatCredits(current) }),
      ),
      createElement(
        'div',
        {},
        createElement('dt', { text: msg().errors.balanceNotice.missing }),
        createElement('dd', { className: 'missing', text: formatCredits(missing) }),
      ),
    ),
    createElement('small', { text: msg().errors.balanceNotice.hint }),
  );
}

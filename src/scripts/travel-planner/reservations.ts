import { formatReservationDate, msg } from 'i18n';
import { PlannerView } from 'models/reservation';
import { element } from 'scripts/travel-planner/helpers';
import { showToast } from 'scripts/travel-planner/notifications';
import { cancelReservation, getReservations } from 'services/portalTripApi';
import { getApiErrorView, isUnauthorizedError } from 'services/portalTripApiError';
import { isAuthenticated, sessionStore } from 'stores/sessionStore';
import { travelStore } from 'stores/travelStore';
import { createApiErrorPanel } from 'ui/apiErrorElements';
import { createEmptyState, createReservationItem } from 'ui/appElements';
import { createLegacyNotice, createLockedReservationsState } from 'ui/authElements';
import { createElement } from 'ui/dom';
import { countLegacyReservations, discardLegacyReservations } from 'utils/legacyReservations';
import { formatBalance, formatCredits } from 'utils/travelRules';

let lastError: unknown = null;

// Las reservas viven en la API; la caché local solo evita repintar con datos viejos.
export async function loadReservations(): Promise<void> {
  if (!isAuthenticated()) {
    travelStore.getState().setReservations([]);
    travelStore.getState().setReservationsStatus('idle');
    renderReservations();
    return;
  }
  travelStore.getState().setReservationsStatus('loading');
  renderReservations();
  try {
    travelStore.getState().setReservations(await getReservations());
  } catch (error) {
    lastError = error;
    travelStore.getState().setReservationsStatus(isUnauthorizedError(error) ? 'idle' : 'error');
  }
  renderReservations();
}

async function cancel(id: string, button: HTMLButtonElement): Promise<void> {
  button.disabled = true;
  button.textContent = msg().reservations.cancelling;
  try {
    const result = await cancelReservation(id);
    travelStore.getState().upsertReservation(result.reservation);
    sessionStore.getState().setBalance(result.remainingBalance);
    renderReservations();
    showToast(msg().toasts.cancelled(formatBalance(result.reservation.quote.total)), 'neutral');
  } catch (error) {
    button.disabled = false;
    button.textContent = msg().reservations.cancel;
    const view = getApiErrorView(error);
    showToast(msg().toasts.toastPair(view.title, view.message), 'neutral');
  }
}

function renderLegacyNotice(): void {
  const box = document.getElementById('legacy-notice');
  if (!box) return;
  const count = countLegacyReservations();
  box.hidden = count === 0;
  if (count === 0) {
    box.replaceChildren();
    return;
  }
  box.replaceChildren(
    createLegacyNotice(count, () => {
      discardLegacyReservations();
      renderLegacyNotice();
      showToast(msg().toasts.legacyDiscarded, 'neutral');
    }),
  );
}

export function renderReservations(): void {
  const { reservations, reservationsStatus } = travelStore.getState();
  const list = element<HTMLDivElement>('#reservations-list');
  const authenticated = isAuthenticated();
  element('#reservation-count').textContent = String(authenticated ? reservations.length : 0);
  renderLegacyNotice();

  if (!authenticated) {
    list.replaceChildren(createLockedReservationsState());
  } else if (reservationsStatus === 'loading' && !reservations.length) {
    list.replaceChildren(
      createElement(
        'p',
        { className: 'catalog-status', attrs: { role: 'status' } },
        createElement('span', { className: 'spinner' }),
        msg().reservations.syncing,
      ),
    );
  } else if (reservationsStatus === 'error') {
    list.replaceChildren(
      createApiErrorPanel(getApiErrorView(lastError), () => void loadReservations()),
    );
  } else if (!reservations.length) {
    const emptyState = createEmptyState(
      msg().reservations.emptyTitle,
      msg().reservations.emptyCopy,
    );
    emptyState.append(
      createElement('button', {
        text: msg().reservations.explore,
        attrs: { type: 'button' },
        dataset: { goDestinations: '' },
      }),
    );
    list.replaceChildren(emptyState);
  } else {
    list.replaceChildren(
      ...reservations.map((reservation) => {
        const formattedDate = formatReservationDate(reservation.travelDate);
        return createReservationItem(
          reservation,
          formattedDate,
          formatCredits(reservation.quote.total),
        );
      }),
    );
  }

  list
    .querySelector<HTMLButtonElement>('[data-go-destinations]')
    ?.addEventListener('click', () => setActiveView(PlannerView.DESTINATIONS));
  list.querySelectorAll<HTMLButtonElement>('[data-cancel-reservation]').forEach((button) => {
    button.addEventListener('click', () => {
      void cancel(button.dataset.cancelReservation ?? '', button);
    });
  });
}

// Mantiene sincronizados store, panel visible, pestañas ARIA y contenido de reservas.
function applyActiveView(view: PlannerView): void {
  travelStore.getState().setView(view);
  document.querySelectorAll<HTMLElement>('[data-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.panel !== view;
  });
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((tab) => {
    const active = tab.dataset.view === view;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  });
  if (view === PlannerView.RESERVATIONS) renderReservations();
}

// El cambio de panel se envuelve en una View Transition del mismo documento cuando el
// navegador la soporta; la lógica de estado es idéntica con o sin animación.
export function setActiveView(view: PlannerView, animate = true): void {
  const panels = [...document.querySelectorAll<HTMLElement>('[data-panel]')];
  const alreadyVisible = panels.some((panel) => panel.dataset.panel === view && !panel.hidden);
  if (!animate || alreadyVisible || typeof document.startViewTransition !== 'function') {
    applyActiveView(view);
    return;
  }

  panels.forEach((panel) => {
    panel.style.viewTransitionName = `panel-${panel.dataset.panel}`;
  });
  const transition = document.startViewTransition(() => applyActiveView(view));
  transition.finished.finally(() => {
    panels.forEach((panel) => {
      panel.style.viewTransitionName = '';
    });
  });
}

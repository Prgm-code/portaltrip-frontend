import { msg } from 'i18n';
import { PlannerView } from 'models/reservation';
import { setPassportMode } from 'scripts/passport';
import { SHOW_RESERVATIONS_EVENT } from 'scripts/session-hud';
import {
  readDraft,
  renderBookingApiState,
  renderCompanions,
  renderPassportStep,
  renderQuote,
  showFormErrors,
  submitReservation,
  syncFormFromDraft,
  updateCompanions,
} from 'scripts/travel-planner/booking';
import {
  changePage,
  hideBrokenDestinationImage,
  renderCatalog,
} from 'scripts/travel-planner/catalog';
import { element, tomorrow } from 'scripts/travel-planner/helpers';
import { showToast } from 'scripts/travel-planner/notifications';
import {
  loadReservations,
  renderReservations,
  setActiveView,
} from 'scripts/travel-planner/reservations';
import { sessionStore } from 'stores/sessionStore';
import { travelStore } from 'stores/travelStore';

const MAX_COMPANIONS = 3;
const SEARCH_DELAY_MS = 250;
let searchTimer: number | undefined;

function persistFormDraft(): void {
  travelStore.getState().setDraft(readDraft());
}

function chooseDestination(id: number, message = msg().toasts.destinationAdded): void {
  travelStore.getState().setDraft({ destinationId: id, companionIds: [] });
  syncFormFromDraft();
  updateCompanions(id);
  element('#reserva').scrollIntoView({ behavior: 'smooth', block: 'start' });
  showToast(message, 'success');
}

// Catálogo y rutas destacadas se vuelven a renderizar; delegar el clic en el documento
// evita registrar listeners por tarjeta.
function bindDestinationSelection(signal: AbortSignal): void {
  document.addEventListener(
    'click',
    (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest<HTMLButtonElement>('[data-book-location]');
      if (!button) return;
      chooseDestination(Number(button.dataset.bookLocation));
    },
    { signal },
  );
}

// Mostrador de búsqueda: traslada destino, fecha y pasajeros a la consola de salto.
function bindSearchDeck(): void {
  const deck = document.getElementById('search-deck');
  if (!(deck instanceof HTMLFormElement)) return;
  const date = element<HTMLInputElement>('#deck-date');
  const passengers = element<HTMLInputElement>('#deck-passengers');
  date.min = tomorrow();
  deck.querySelectorAll<HTMLButtonElement>('[data-deck-step]').forEach((button) => {
    button.addEventListener('click', () => {
      passengers.value = String(
        Math.min(8, Math.max(1, Number(passengers.value) + Number(button.dataset.deckStep))),
      );
    });
  });
  deck.addEventListener('submit', (event) => {
    event.preventDefault();
    const destinationId = Number(element<HTMLSelectElement>('#deck-destination').value);
    if (!destinationId) {
      showToast(msg().toasts.pickCoordinate, 'neutral');
      element<HTMLSelectElement>('#deck-destination').focus();
      return;
    }
    travelStore.getState().setDraft({
      travelDate: date.value,
      passengers: Number(passengers.value) || 1,
    });
    chooseDestination(destinationId, msg().toasts.fareReady);
  });
}

function bindBookingEvents(bookingForm: HTMLFormElement): void {
  element<HTMLInputElement>('#travelDate').min = tomorrow();
  bookingForm.addEventListener('submit', (event) => void submitReservation(event));
  bookingForm.addEventListener('input', (event) => {
    // Los campos del pasaporte no alteran el borrador ni la cotización.
    if (event.target instanceof Element && event.target.closest('#passport-step')) {
      if (event.target instanceof HTMLInputElement && event.target.name === 'fullName') {
        event.target.dataset.touched = 'true';
      }
      showFormErrors([]);
      return;
    }
    // El nombre del pasajero sugiere el del pasaporte hasta que se edite a mano.
    if (event.target instanceof HTMLInputElement && event.target.name === 'passengerName') {
      event.target.dataset.touched = 'true';
      const fullName = document.getElementById('fullName');
      if (fullName instanceof HTMLInputElement && !fullName.dataset.touched) {
        fullName.value = event.target.value;
      }
    }
    persistFormDraft();
    showFormErrors([]);
    renderQuote();
  });
  element<HTMLSelectElement>('#destinationId').addEventListener('change', (event) => {
    travelStore.getState().setDraft({ companionIds: [] });
    renderCompanions();
    updateCompanions(Number((event.currentTarget as HTMLSelectElement).value));
  });
  element<HTMLDivElement>('#companion-grid').addEventListener('change', (event) => {
    if (!(event.target instanceof HTMLElement)) return;
    const checkbox = event.target.closest<HTMLInputElement>('input[name="companionIds"]');
    if (!checkbox) return;
    const selected = [
      ...document.querySelectorAll<HTMLInputElement>('input[name="companionIds"]:checked'),
    ];
    if (selected.length > MAX_COMPANIONS) {
      checkbox.checked = false;
      showToast(msg().toasts.maxCompanions, 'neutral');
    }
    persistFormDraft();
    renderCompanions();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-step]').forEach((button) => {
    button.addEventListener('click', () => {
      const input = element<HTMLInputElement>('#passengers');
      input.value = String(
        Math.min(8, Math.max(1, Number(input.value) + Number(button.dataset.step))),
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  // El paso de pasaporte alterna entre crear cuenta e ingresar sin salir del formulario.
  element<HTMLElement>('#passport-step').addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const switcher = event.target.closest<HTMLButtonElement>('[data-passport-mode]');
    if (!switcher) return;
    setPassportMode(
      element('#passport-step'),
      switcher.dataset.passportMode === 'login' ? 'login' : 'register',
    );
    renderPassportStep();
    showFormErrors([]);
  });
}

// Paginación y filtros solo tocan la store: el catálogo completo ya está en memoria.
function bindCatalogEvents(): void {
  element<HTMLButtonElement>('#previous-page').addEventListener('click', () =>
    changePage(travelStore.getState().locationsPage - 1),
  );
  element<HTMLButtonElement>('#next-page').addEventListener('click', () =>
    changePage(travelStore.getState().locationsPage + 1),
  );
  element<HTMLSelectElement>('#type-filter').addEventListener('change', (event) => {
    const state = travelStore.getState();
    state.setFilters(state.search, (event.currentTarget as HTMLSelectElement).value);
    renderCatalog();
  });
  element<HTMLInputElement>('#location-search').addEventListener('input', (event) => {
    window.clearTimeout(searchTimer);
    const search = (event.currentTarget as HTMLInputElement).value;
    searchTimer = window.setTimeout(() => {
      const state = travelStore.getState();
      state.setFilters(search, state.typeFilter);
      renderCatalog();
    }, SEARCH_DELAY_MS);
  });
}

function bindNavigationEvents(signal: AbortSignal): void {
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((tab) => {
    tab.addEventListener('click', () => {
      const view = tab.dataset.view;
      if (view === PlannerView.DESTINATIONS || view === PlannerView.RESERVATIONS) {
        setActiveView(view);
      }
    });
  });
  const showReservations = (): void => {
    setActiveView(PlannerView.RESERVATIONS);
    element('.catalog-column').scrollIntoView({ behavior: 'smooth' });
  };
  element<HTMLButtonElement>('#header-reservations').addEventListener('click', showReservations);
  document.addEventListener(SHOW_RESERVATIONS_EVENT, showReservations, { signal });
}

// Refleja automáticamente los cambios de loading/error de Zustand en el formulario.
function bindApiState(): () => void {
  const unsubscribe = travelStore.subscribe((state, previousState) => {
    if (
      state.loading !== previousState.loading ||
      state.error !== previousState.error ||
      state.locations !== previousState.locations
    ) {
      renderBookingApiState();
    }
  });
  renderBookingApiState();
  return unsubscribe;
}

// Entrar, salir o cambiar de saldo repinta pasaporte, cotización y bitácora.
function bindSessionState(): () => void {
  return sessionStore.subscribe((state, previousState) => {
    const token = state.session?.accessToken;
    const previousToken = previousState.session?.accessToken;
    renderPassportStep();
    renderQuote();
    if (token !== previousToken) {
      showFormErrors([]);
      void loadReservations();
    } else if (state.session?.user.balance !== previousState.session?.user.balance) {
      renderReservations();
    }
  });
}

export function bindEvents(): boolean {
  // Guardias explícitas de nulidad para los nodos raíz antes de registrar eventos.
  const bookingForm = document.getElementById('booking-form') as HTMLFormElement | null;
  const destinationGrid = document.getElementById('destination-grid');
  const reservationsList = document.getElementById('reservations-list');
  if (bookingForm === null || destinationGrid === null || reservationsList === null) {
    console.error(msg().boot.missingDom);
    return false;
  }

  // La captura permite manejar errores de imágenes, que no hacen bubble normalmente.
  const lifecycle = new AbortController();
  document.addEventListener(
    'error',
    (event) => {
      if (event.target instanceof HTMLImageElement && event.target.closest('.destination-photos')) {
        hideBrokenDestinationImage(event.target);
      }
    },
    { capture: true, signal: lifecycle.signal },
  );
  bindDestinationSelection(lifecycle.signal);
  bindSearchDeck();
  bindBookingEvents(bookingForm);
  bindCatalogEvents();
  bindNavigationEvents(lifecycle.signal);
  const unsubscribeApiState = bindApiState();
  const unsubscribeSession = bindSessionState();

  // Al saltar a otra página el formulario desaparece: se liberan los listeners globales
  // para que la store no intente renderizar un DOM que ya no existe.
  document.addEventListener(
    'astro:before-swap',
    () => {
      lifecycle.abort();
      unsubscribeApiState();
      unsubscribeSession();
    },
    { once: true },
  );
  return true;
}

import { renderCompanions, renderPassportStep, renderQuote } from 'scripts/travel-planner/booking';
import {
  renderCatalog,
  updateLocationOptions,
  updateTypeOptions,
} from 'scripts/travel-planner/catalog';
import { ensureCatalog, getBaseCompanions, locationsById } from 'scripts/travel-planner/context';
import { bindEvents } from 'scripts/travel-planner/events';
import {
  loadReservations,
  renderReservations,
  setActiveView,
} from 'scripts/travel-planner/reservations';
import { isAuthenticated } from 'stores/sessionStore';
import { travelStore } from 'stores/travelStore';

// Carga inicial separada para que el botón temático pueda reintentar sin duplicar listeners.
async function loadInitialData(): Promise<void> {
  // Primero se inyecta el estado visual; después comienzan ambas peticiones.
  const state = travelStore.getState();
  state.setError(null);
  state.setLoading(true);
  renderCatalog(() => void loadInitialData());

  try {
    // Ubicaciones y personajes llegan completos y en paralelo; se piden una sola vez.
    await ensureCatalog({ trackLoading: true, reportError: true });
    const locations = [...locationsById.values()].sort((first, second) => first.id - second.id);
    travelStore.getState().setLocations(locations);
    travelStore.getState().setCompanions(getBaseCompanions());
    updateLocationOptions();
    updateTypeOptions();
    renderCompanions();
    renderCatalog();
  } catch {
    // El servicio ya guardó el error para que el catálogo lo muestre.
    renderCatalog(() => void loadInitialData());
  }
}

// Arranca listeners y estado local antes de consultar los catálogos remotos.
export async function initializeApp(): Promise<void> {
  if (!bindEvents()) return;
  // El HTML llega limpio en cada visita (también al volver desde la bitácora con el router):
  // el borrador en memoria se alinea con el formulario vacío y se restaura la pestaña activa.
  travelStore.getState().resetDraft();
  renderPassportStep();
  renderReservations();
  setActiveView(travelStore.getState().activeView, false);
  renderQuote();
  const catalog = loadInitialData();
  if (isAuthenticated()) void loadReservations();
  await catalog;
}

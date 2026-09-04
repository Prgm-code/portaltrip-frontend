import { compareNames, locationTypeLabel, msg } from 'i18n';
import type { Location } from 'models/catalog';
import { type RiskLevel, TripType } from 'models/reservation';
import {
  ensureCatalog,
  getCharactersByIds,
  locationsById,
  rememberLocations,
} from 'scripts/travel-planner/context';
import { element } from 'scripts/travel-planner/helpers';
import {
  selectFilteredLocations,
  selectPage,
  selectTotalPages,
  travelStore,
} from 'stores/travelStore';
import { createApiErrorPanel } from 'ui/apiErrorElements';
import {
  createDestinationCard,
  createEmptyState,
  createFeaturedCard,
  createSkeletonCard,
} from 'ui/appElements';
import { createElement } from 'ui/dom';
import { calculateQuote, formatCredits, requiresInsurance } from 'utils/travelRules';

const PREVIEW_LIMIT_PER_LOCATION = 3;
const SKELETON_COUNT = 6;
const TYPE_FILTER_MIN_COUNT = 2;
const FEATURED_LIMIT = 6;
const FEATURED_MIN_RESIDENTS = 3;

function locationRisk(location: Location): RiskLevel {
  return calculateQuote({ passengers: 1, tripType: TripType.EXPRESS, insurance: false }, location)
    .risk;
}

// Oculta solo la imagen fallida y recalcula el mosaico con las imágenes restantes.
export function hideBrokenDestinationImage(image: HTMLImageElement): void {
  const container = image.closest<HTMLElement>('.destination-photos');
  if (!container || image.hidden) return;
  image.hidden = true;
  const visibleImages = [...container.querySelectorAll<HTMLImageElement>('img')].filter(
    (candidate) => !candidate.hidden,
  ).length;
  container.style.gridTemplateColumns = visibleImages > 0 ? `repeat(${visibleImages}, 1fr)` : '1fr';
  const label = container.querySelector<HTMLElement>('.photo-label');
  if (label) label.hidden = visibleImages === 0;
}

// Búsqueda y paginación ocurren en memoria: la API entrega las 126 coordenadas de una vez.
export function renderCatalog(onRetry: () => void = () => void loadCatalog()): void {
  const state = travelStore.getState();
  const grid = element<HTMLDivElement>('#destination-grid');
  const status = element<HTMLDivElement>('#catalog-status');
  const filtered = selectFilteredLocations(state);
  const totalPages = selectTotalPages(filtered);
  const page = Math.min(state.locationsPage, totalPages);
  const visible = selectPage(filtered, page);

  // Un error tiene prioridad para que Promise.all no deje esqueletos visibles
  // mientras terminan otras peticiones que ya no pueden completar la pantalla.
  if (state.error) {
    status.replaceChildren(createApiErrorPanel(state.error, onRetry));
    grid.replaceChildren();
  } else if (state.loading && !state.locations.length) {
    status.replaceChildren(
      createElement('span', { className: 'spinner' }),
      document.createTextNode(msg().catalog.syncing),
    );
    grid.replaceChildren(...Array.from({ length: SKELETON_COUNT }, createSkeletonCard));
  } else if (filtered.length === 0) {
    status.replaceChildren(
      createEmptyState(msg().catalog.emptyTitle, msg().catalog.emptyCopy, true),
    );
    grid.replaceChildren();
  } else {
    status.textContent = msg().catalog.count(filtered.length, visible.length);
    grid.replaceChildren(
      ...visible.map((location) =>
        createDestinationCard(
          location,
          getCharactersByIds(location.residentIds.slice(0, PREVIEW_LIMIT_PER_LOCATION)),
          locationRisk(location),
        ),
      ),
    );
  }

  element<HTMLSpanElement>('#page-status').textContent = msg().catalog.page(page, totalPages);
  const unavailable = (state.loading && !state.locations.length) || Boolean(state.error);
  element<HTMLButtonElement>('#previous-page').disabled = unavailable || page <= 1;
  element<HTMLButtonElement>('#next-page').disabled = unavailable || page >= totalPages;
}

export function changePage(page: number): void {
  const filtered = selectFilteredLocations(travelStore.getState());
  const clamped = Math.min(Math.max(1, page), selectTotalPages(filtered));
  travelStore.getState().setPage(clamped);
  renderCatalog();
}

// Rutas destacadas: destinos de bajo riesgo con residentes visibles y su tarifa de salida.
export function renderFeaturedRoutes(): void {
  const container = document.getElementById('featured-routes');
  if (!container) return;
  const { locations, loading, error } = travelStore.getState();
  if (error || (loading && !locations.length)) {
    container.replaceChildren(...Array.from({ length: 4 }, createSkeletonCard));
    return;
  }
  const featured = locations
    .filter((location) => location.residentIds.length >= FEATURED_MIN_RESIDENTS)
    .map((location) => ({ location, risk: locationRisk(location) }))
    .sort((first, second) => {
      const order = { LOW: 0, MEDIUM: 1, HIGH: 2 } as const;
      return (
        order[first.risk] - order[second.risk] ||
        second.location.residentIds.length - first.location.residentIds.length
      );
    })
    .slice(0, FEATURED_LIMIT);

  if (!featured.length) {
    container.replaceChildren(
      createEmptyState(msg().featured.emptyTitle, msg().featured.emptyCopy, true),
    );
    return;
  }
  container.replaceChildren(
    ...featured.map(({ location, risk }, index) => {
      const fare = calculateQuote(
        { passengers: 1, tripType: TripType.EXPRESS, insurance: requiresInsurance(location) },
        location,
      );
      const card = createFeaturedCard(
        location,
        getCharactersByIds(location.residentIds.slice(0, PREVIEW_LIMIT_PER_LOCATION)),
        risk,
        formatCredits(fare.total),
      );
      card.style.setProperty('--i', String(index));
      return card;
    }),
  );
}

// Los selectores del formulario y del mostrador listan todo el catálogo ordenado por nombre.
export function updateLocationOptions(): void {
  const state = travelStore.getState();
  const previousDestination = String(state.draft.destinationId || '');
  const sorted = [...state.locations].sort((first, second) =>
    compareNames(first.name, second.name),
  );
  const targets: Array<[HTMLSelectElement | null, string]> = [
    [
      document.getElementById('destinationId') as HTMLSelectElement | null,
      msg().catalog.selectDestination,
    ],
    [
      document.getElementById('deck-destination') as HTMLSelectElement | null,
      msg().deck.pickCoordinate,
    ],
  ];

  targets.forEach(([select, placeholder]) => {
    if (!select) return;
    const current = select.value || previousDestination;
    select.replaceChildren(
      new Option(placeholder, ''),
      ...sorted.map(
        (location) => new Option(`${location.name} · ${location.dimension}`, String(location.id)),
      ),
    );
    select.value = current;
  });
}

// Solo aparecen los tipos con más de una coordenada; el resto sigue disponible por búsqueda.
export function updateTypeOptions(): void {
  const state = travelStore.getState();
  const select = element<HTMLSelectElement>('#type-filter');
  const counts = new Map<string, number>();
  state.locations.forEach((location) => {
    const type = location.type || 'unknown';
    counts.set(type, (counts.get(type) ?? 0) + 1);
  });
  const types = [...counts.entries()]
    .filter(([, count]) => count >= TYPE_FILTER_MIN_COUNT)
    .sort((first, second) => second[1] - first[1] || compareNames(first[0], second[0]));

  select.replaceChildren(
    new Option(msg().catalog.allTypes, 'all'),
    ...types.map(
      ([type, count]) => new Option(msg().catalog.typeOption(locationTypeLabel(type), count), type),
    ),
  );
  select.value = types.some(([type]) => type === state.typeFilter) ? state.typeFilter : 'all';
}

// El servicio controla loading/error; este módulo decide cómo reflejarlos en el catálogo.
export async function loadCatalog(): Promise<void> {
  const state = travelStore.getState();
  // La pauta exige feedback visible antes de disparar la llamada de red.
  state.setError(null);
  state.setLoading(true);
  renderCatalog();

  try {
    await ensureCatalog({ trackLoading: true, reportError: true });
    const locations = [...locationsById.values()].sort((first, second) => first.id - second.id);
    rememberLocations(locations);
    travelStore.getState().setLocations(locations);
    updateLocationOptions();
    updateTypeOptions();
  } catch {
    // El servicio ya dejó el error temático y tipado en Zustand.
  } finally {
    renderCatalog();
  }
}

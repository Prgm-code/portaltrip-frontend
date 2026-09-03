import type { Character, Location } from 'models/catalog';
import { PlannerView, type Reservation, type ReservationDraft, TripType } from 'models/reservation';
import type { ApiErrorView } from 'services/portalTripApiError';
import { createStore } from 'zustand/vanilla';

export const CATALOG_PAGE_SIZE = 12;

const initialDraft: ReservationDraft = {
  passengerName: '',
  destinationId: 0,
  travelDate: '',
  passengers: 1,
  companionIds: [],
  tripType: TripType.EXPRESS,
  insurance: false,
  comments: '',
};

export type ReservationsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface TravelState {
  /** Catálogo completo; la API no pagina. */
  locations: Location[];
  companions: Character[];
  /** Caché de las reservas de la cuenta autenticada. */
  reservations: Reservation[];
  reservationsStatus: ReservationsStatus;
  draft: ReservationDraft;
  activeView: PlannerView;
  locationsPage: number;
  search: string;
  typeFilter: string;
  loading: boolean;
  error: ApiErrorView | null;
  setLocations: (locations: Location[]) => void;
  setCompanions: (companions: Character[]) => void;
  setDraft: (patch: Partial<ReservationDraft>) => void;
  setView: (view: TravelState['activeView']) => void;
  setFilters: (search: string, typeFilter: string) => void;
  setPage: (page: number) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: ApiErrorView | null) => void;
  setReservations: (reservations: Reservation[]) => void;
  setReservationsStatus: (status: ReservationsStatus) => void;
  upsertReservation: (reservation: Reservation) => void;
  resetDraft: () => void;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Ubicaciones que cumplen la búsqueda y el tipo elegido. */
export function selectFilteredLocations(
  state: Pick<TravelState, 'locations' | 'search' | 'typeFilter'>,
): Location[] {
  const search = normalize(state.search);
  const type = normalize(state.typeFilter);
  return state.locations.filter((location) => {
    if (type && type !== 'all' && normalize(location.type) !== type) return false;
    if (!search) return true;
    return (
      normalize(location.name).includes(search) || normalize(location.dimension).includes(search)
    );
  });
}

export function selectTotalPages(filtered: Location[]): number {
  return Math.max(1, Math.ceil(filtered.length / CATALOG_PAGE_SIZE));
}

export function selectPage(filtered: Location[], page: number): Location[] {
  const start = (page - 1) * CATALOG_PAGE_SIZE;
  return filtered.slice(start, start + CATALOG_PAGE_SIZE);
}

// Solo estado de sesión de navegación: la fuente de verdad de las reservas es la API.
export const travelStore = createStore<TravelState>()((set) => ({
  locations: [],
  companions: [],
  reservations: [],
  reservationsStatus: 'idle',
  draft: { ...initialDraft },
  activeView: PlannerView.DESTINATIONS,
  locationsPage: 1,
  search: '',
  typeFilter: 'all',
  loading: false,
  error: null,
  setLocations: (locations) => set({ locations, locationsPage: 1 }),
  setCompanions: (companions) => set({ companions }),
  setDraft: (patch) => set((state) => ({ draft: { ...state.draft, ...patch } })),
  setView: (activeView) => set({ activeView }),
  setFilters: (search, typeFilter) => set({ search, typeFilter, locationsPage: 1 }),
  setPage: (locationsPage) => set({ locationsPage }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setReservations: (reservations) => set({ reservations, reservationsStatus: 'ready' }),
  setReservationsStatus: (reservationsStatus) => set({ reservationsStatus }),
  upsertReservation: (reservation) =>
    set((state) => {
      const exists = state.reservations.some((item) => item.id === reservation.id);
      return {
        reservations: exists
          ? state.reservations.map((item) => (item.id === reservation.id ? reservation : item))
          : [reservation, ...state.reservations],
      };
    }),
  resetDraft: () => set({ draft: { ...initialDraft }, companions: [] }),
}));

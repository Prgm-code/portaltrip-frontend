import type { ApiRequestControl, ResourceByIdRequest } from 'models/api-requests';
import type { AuthSession, LoginRequest, RegisterRequest, UserProfile } from 'models/auth';
import type { Character, Episode, HealthStatus, Location } from 'models/catalog';
import type {
  Quote,
  QuoteRequest,
  Reservation,
  ReservationRequest,
  ReservationWithBalance,
} from 'models/reservation';
import {
  getApiErrorView,
  normalizeApiError,
  PortalTripApiError,
  throwPreviewError,
} from 'services/portalTripApiError';
import { getActiveSession, sessionStore } from 'stores/sessionStore';
import { travelStore } from 'stores/travelStore';

/** Origen de la API; se define en `.env` como `PUBLIC_API_URL`. */
export const API_BASE_URL = (import.meta.env.PUBLIC_API_URL ?? 'http://localhost:8080').replace(
  /\/+$/,
  '',
);
const API_PREFIX = '/api/v1';
const DEFAULT_TIMEOUT_MS = 8_000;

/** Evento global emitido cuando la API rechaza la sesión actual. */
export const SESSION_EXPIRED_EVENT = 'portaltrip:session-expired';

interface Envelope<T> {
  status: number;
  message: string;
  data?: T;
  timestamp: string;
}

interface RequestOptions extends ApiRequestControl {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: unknown;
  /** Adjunta el token de la sesión activa; sin sesión la petición falla con 401 local. */
  auth?: boolean;
  idempotencyKey?: string;
}

interface AuthResponse {
  tokenType: string;
  accessToken: string;
  expiresAt: string;
  user: UserProfile;
}

// Un contador evita que varias peticiones paralelas desactiven `loading`
// antes de que todas hayan terminado.
let pendingRequests = 0;

function startLoading(): void {
  pendingRequests += 1;
  travelStore.getState().setLoading(true);
}

function stopLoading(): void {
  pendingRequests = Math.max(0, pendingRequests - 1);
  travelStore.getState().setLoading(pendingRequests > 0);
}

async function readEnvelope<T>(response: Response): Promise<Envelope<T> | null> {
  try {
    return (await response.json()) as Envelope<T>;
  } catch {
    return null;
  }
}

function buildHeaders(options: RequestOptions): Headers {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.idempotencyKey) headers.set('Idempotency-Key', options.idempotencyKey);
  if (options.auth) {
    const session = getActiveSession();
    if (!session) throw new PortalTripApiError('Authentication required', 401);
    headers.set('Authorization', `Bearer ${session.accessToken}`);
  }
  return headers;
}

function handleUnauthorized(options: RequestOptions): void {
  if (!options.auth) return;
  sessionStore.getState().clearSession();
  document.dispatchEvent(new CustomEvent(SESSION_EXPIRED_EVENT));
}

// Cliente genérico: fetch, async/await, timeout, envelope y errores tipados.
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { trackLoading = false, reportError = false, method = 'GET', body } = options;
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  if (trackLoading) startLoading();
  if (reportError) travelStore.getState().setError(null);

  try {
    throwPreviewError();
    const response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
      method,
      headers: buildHeaders(options),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const envelope = await readEnvelope<T>(response);

    if (!response.ok) {
      if (response.status === 401) handleUnauthorized(options);
      throw new PortalTripApiError(
        envelope?.message ?? `La API respondió con el código ${response.status}`,
        response.status,
        envelope?.data,
      );
    }
    if (!envelope) throw new PortalTripApiError('La API devolvió una respuesta ilegible.');
    return envelope.data as T;
  } catch (error: unknown) {
    const apiError = normalizeApiError(error, controller.signal.aborted);
    if (reportError) travelStore.getState().setError(getApiErrorView(apiError));
    throw apiError;
  } finally {
    globalThis.clearTimeout(timeout);
    if (trackLoading) stopLoading();
  }
}

function toSession(response: AuthResponse): AuthSession {
  return {
    accessToken: response.accessToken,
    expiresAt: response.expiresAt,
    user: response.user,
  };
}

// Autenticación y cuenta.
export async function register(input: RegisterRequest): Promise<AuthSession> {
  return toSession(await request<AuthResponse>('/auth/register', { method: 'POST', body: input }));
}

export async function login(input: LoginRequest): Promise<AuthSession> {
  return toSession(await request<AuthResponse>('/auth/login', { method: 'POST', body: input }));
}

export function getProfile(): Promise<UserProfile> {
  return request<UserProfile>('/users/me', { auth: true });
}

export interface PortalActivity {
  cycleId: string;
  nextSequence: number;
  progress: number;
  payout: number;
  balance: number;
}

export interface PortalActivitySample {
  cycleId: string;
  sequence: number;
  activeMs: number;
  distance: number;
}

export function startPortalActivity(): Promise<PortalActivity> {
  return request<PortalActivity>('/users/me/portal-activity/start', { method: 'POST', auth: true });
}

export function reportPortalActivity(sample: PortalActivitySample): Promise<PortalActivity> {
  return request<PortalActivity>('/users/me/portal-activity', {
    method: 'POST',
    auth: true,
    body: sample,
  });
}

// Catálogo público. Las listas llegan completas: el navegador filtra y pagina.
const catalogControl: ApiRequestControl = { trackLoading: true, reportError: true };

export function getLocations(control: ApiRequestControl = catalogControl): Promise<Location[]> {
  return request<Location[]>('/locations', control);
}

export function getLocation(
  { id }: ResourceByIdRequest,
  control: ApiRequestControl = {},
): Promise<Location> {
  return request<Location>(`/locations/${id}`, control);
}

export function getCharacters(control: ApiRequestControl = catalogControl): Promise<Character[]> {
  return request<Character[]>('/characters', control);
}

export function getCharacter(
  { id }: ResourceByIdRequest,
  control: ApiRequestControl = {},
): Promise<Character> {
  return request<Character>(`/characters/${id}`, control);
}

export function getEpisodes(control: ApiRequestControl = {}): Promise<Episode[]> {
  return request<Episode[]>('/episodes', control);
}

// Cotización sin persistencia; el servidor fuerza el seguro en dimensiones desconocidas.
export function getQuote(input: QuoteRequest): Promise<Quote> {
  return request<Quote>('/quotes', { method: 'POST', body: input });
}

// Reservas de la cuenta autenticada.
export function createReservation(
  input: ReservationRequest,
  idempotencyKey: string,
): Promise<ReservationWithBalance> {
  return request<ReservationWithBalance>('/reservations', {
    method: 'POST',
    body: input,
    auth: true,
    idempotencyKey,
  });
}

export function getReservations(): Promise<Reservation[]> {
  return request<Reservation[]>('/reservations', { auth: true });
}

export function getReservation(id: string): Promise<Reservation> {
  return request<Reservation>(`/reservations/${encodeURIComponent(id)}`, { auth: true });
}

export function startReservation(id: string): Promise<Reservation> {
  return request<Reservation>(`/reservations/${encodeURIComponent(id)}/start`, {
    method: 'PATCH',
    auth: true,
  });
}

export function completeReservation(id: string): Promise<Reservation> {
  return request<Reservation>(`/reservations/${encodeURIComponent(id)}/complete`, {
    method: 'PATCH',
    auth: true,
  });
}

export function cancelReservation(id: string): Promise<ReservationWithBalance> {
  return request<ReservationWithBalance>(`/reservations/${encodeURIComponent(id)}/cancel`, {
    method: 'PATCH',
    auth: true,
  });
}

/** `GET /health` vive fuera de `/api/v1` y no usa el envelope. */
export async function checkHealth(timeoutMs = 4_000): Promise<boolean> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${API_BASE_URL}/health`, { signal: controller.signal });
    if (!response.ok) return false;
    const health = (await response.json()) as HealthStatus;
    return health.status === 'UP';
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

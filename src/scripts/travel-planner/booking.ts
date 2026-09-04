import { msg } from 'i18n';
import type { PassportInput } from 'models/auth';
import { type Character, CharacterStatus, type Location } from 'models/catalog';
import { PlannerView, type ReservationDraft, TripType } from 'models/reservation';
import { authenticate, passportCopy, readPassport, setPassportMode } from 'scripts/passport';
import { loadCatalog } from 'scripts/travel-planner/catalog';
import {
  getBaseCompanions,
  getCharactersByIds,
  locationsById,
} from 'scripts/travel-planner/context';
import { element } from 'scripts/travel-planner/helpers';
import { showToast } from 'scripts/travel-planner/notifications';
import { renderReservations, setActiveView } from 'scripts/travel-planner/reservations';
import { createReservation } from 'services/portalTripApi';
import {
  getApiErrorView,
  getValidationMessages,
  isBalanceError,
  isUnauthorizedError,
  PortalTripApiError,
} from 'services/portalTripApiError';
import { getSpendableBalance } from 'stores/portalPlayStore';
import {
  getActiveSession,
  getCurrentUser,
  isAuthenticated,
  sessionStore,
} from 'stores/sessionStore';
import { travelStore } from 'stores/travelStore';
import { createApiFormErrorNotice, createApiFormLoadingNotice } from 'ui/apiErrorElements';
import {
  appendDestinationHint,
  appendFormErrors,
  createCompanionCard,
  setRiskContent,
} from 'ui/appElements';
import { createBalanceErrorNotice } from 'ui/authElements';
import { createElement } from 'ui/dom';
import {
  calculateQuote,
  formatBalance,
  formatCredits,
  remainingAfter,
  requiresInsurance,
  validatePassport,
  validateReservation,
} from 'utils/travelRules';

type FormValueControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

const DESTINATION_RESIDENT_LIMIT = 16;
const COMPANION_OPTION_LIMIT = 20;

// La clave de idempotencia acompaña a un cuerpo exacto: si el borrador cambia, se renueva.
let attempt: { key: string; fingerprint: string } | null = null;
let submitting = false;

function idempotencyKeyFor(request: ReservationDraft): string {
  const fingerprint = JSON.stringify(request);
  if (attempt?.fingerprint !== fingerprint) {
    attempt = { key: crypto.randomUUID(), fingerprint };
  }
  return attempt.key;
}

function parseTripType(value: FormDataEntryValue | null): TripType {
  const tripType = String(value ?? '');
  if (tripType === TripType.EXPRESS) return TripType.EXPRESS;
  if (tripType === TripType.EXPLORATION) return TripType.EXPLORATION;
  if (tripType === TripType.PREMIUM) return TripType.PREMIUM;
  return TripType.EXPRESS;
}

// Evita repetir conversiones al sincronizar el store con los controles del formulario.
function setControlValue(selector: string, value: string | number): void {
  element<FormValueControl>(selector).value = String(value);
}

function uniqueCharacters(characters: Character[]): Character[] {
  return [...new Map(characters.map((character) => [character.id, character])).values()];
}

function passportStep(): HTMLElement {
  return element<HTMLElement>('#passport-step');
}

function submitLabel(): string {
  const copy = msg().booking;
  if (isAuthenticated()) return copy.submitConfirm;
  return passportStep().dataset.passportMode === 'login' ? copy.submitLogin : copy.submitRegister;
}

function setSubmitLabel(text: string): void {
  element<HTMLButtonElement>('#confirm-booking').querySelector('span')?.replaceChildren(text);
}

/**
 * Bloquea únicamente los controles que necesitan datos remotos.
 * Los datos personales escritos por el pasajero se conservan durante el error.
 */
export function renderBookingApiState(): void {
  const { loading, error, locations } = travelStore.getState();
  const blocked = (loading && !locations.length) || Boolean(error) || submitting;
  const form = element<HTMLFormElement>('#booking-form');
  const status = element<HTMLDivElement>('#booking-api-status');
  const companionGrid = element<HTMLDivElement>('#companion-grid');
  const submit = element<HTMLButtonElement>('#confirm-booking');

  element<HTMLSelectElement>('#destinationId').disabled = blocked;
  submit.disabled = blocked;
  companionGrid
    .querySelectorAll<HTMLInputElement>('input[name="companionIds"]')
    .forEach((input) => {
      input.disabled = blocked;
    });
  companionGrid.classList.toggle('pointer-events-none', blocked);
  companionGrid.classList.toggle('opacity-50', blocked);
  companionGrid.setAttribute('aria-disabled', String(blocked));
  form.setAttribute('aria-busy', String(loading || submitting));

  const copy = msg().booking;
  setSubmitLabel(
    submitting
      ? copy.submitting
      : loading && !locations.length
        ? copy.syncing
        : error
          ? copy.unavailable
          : submitLabel(),
  );

  const showStatus = Boolean(error) || (loading && !locations.length);
  status.hidden = !showStatus;
  if (error) {
    status.replaceChildren(createApiFormErrorNotice(error, () => void loadCatalog()));
  } else if (showStatus) {
    status.replaceChildren(createApiFormLoadingNotice());
  } else {
    status.replaceChildren();
  }
}

function passengerNameInput(): HTMLInputElement {
  return element<HTMLInputElement>('#passengerName');
}

/** Completa el pasajero con el nombre de la cuenta si la persona no lo editó. */
function prefillPassengerNameFromSession(): void {
  const user = getCurrentUser();
  if (!user) return;
  const input = passengerNameInput();
  if (input.dataset.touched === 'true') return;
  const name = user.fullName.trim();
  if (!name) return;
  if (input.value === name && travelStore.getState().draft.passengerName === name) return;
  input.value = name;
  travelStore.getState().setDraft({ passengerName: name });
}

function releasePassengerNamePrefill(): void {
  delete passengerNameInput().dataset.touched;
}

// El paso de pasaporte solo existe para visitantes sin sesión.
export function renderPassportStep(): void {
  const step = passportStep();
  const authenticated = isAuthenticated();
  step.hidden = authenticated;
  const copy = msg().booking;
  element('[data-booking-kicker]').textContent = authenticated
    ? copy.kickerRoute
    : copy.kickerStep1;
  element('.submit-note span').textContent = authenticated
    ? copy.noteAuthenticated
    : copy.noteAnonymous;
  if (authenticated) {
    prefillPassengerNameFromSession();
  } else {
    const mode = step.dataset.passportMode === 'login' ? 'login' : 'register';
    setPassportMode(step, mode);
    const title = step.querySelector<HTMLElement>('[data-passport-step-title]');
    if (title)
      title.textContent = mode === 'register' ? copy.stepRegisterTitle : copy.stepLoginTitle;
    const fullName = step.querySelector<HTMLInputElement>('[name="fullName"]');
    const passengerName = passengerNameInput().value.trim();
    if (fullName && !fullName.value && passengerName) fullName.value = passengerName;
  }
  if (!submitting) setSubmitLabel(submitLabel());
}

// Renderiza el selector de equipo desde el borrador persistido en Zustand.
export function renderCompanions(): void {
  const { companions, draft, loading, error } = travelStore.getState();
  const grid = element<HTMLDivElement>('#companion-grid');
  element('#companion-status').textContent = `${draft.companionIds.length} / 3`;

  if (!companions.length) {
    grid.replaceChildren(createElement('p', { text: msg().booking.crewNone }));
    return;
  }
  grid.replaceChildren(
    ...companions.map((character) =>
      createCompanionCard(character, draft.companionIds.includes(character.id)),
    ),
  );
  if ((loading && !locationsById.size) || error) {
    grid.querySelectorAll<HTMLInputElement>('input[name="companionIds"]').forEach((input) => {
      input.disabled = true;
    });
  }
}

function renderBalanceTile(total: number): void {
  const tile = element<HTMLDivElement>('#balance-tile');
  const session = getActiveSession();
  tile.hidden = !session;
  if (!session) return;
  const spendable = getSpendableBalance();
  const remaining = remainingAfter(spendable, total);
  element('#balance-value').textContent = formatCredits(remaining);
  tile.classList.toggle('warn', remaining < 0);
  tile.title =
    remaining < 0
      ? msg().booking.missingBalance(formatBalance(Math.abs(remaining)))
      : msg().booking.currentBalance(formatBalance(spendable));
}

export function renderQuote(): void {
  const state = travelStore.getState();
  let draft = state.draft;
  const destination = locationsById.get(draft.destinationId);
  const hint = element<HTMLDivElement>('#destination-hint');
  const insurance = element<HTMLInputElement>('#insurance');
  const mandatory = requiresInsurance(destination);

  if (mandatory && !draft.insurance) {
    state.setDraft({ insurance: true });
    insurance.checked = true;
    draft = { ...draft, insurance: true };
  }

  const quote = calculateQuote(draft, destination);
  element('#price-value').textContent = formatCredits(quote.total);
  setRiskContent(element<HTMLElement>('#risk-value'), quote.risk);
  renderBalanceTile(quote.total);
  if (destination) {
    hint.hidden = false;
    appendDestinationHint(hint, destination);
  } else {
    hint.hidden = true;
  }

  element('#insurance-copy').textContent = mandatory
    ? msg().booking.insuranceMandatory
    : msg().booking.insuranceOptional;
}

// Prioriza residentes vivos del destino y completa el selector con el catálogo base.
export function updateCompanions(destinationId: number): void {
  const destination = locationsById.get(destinationId);
  if (!destination) {
    travelStore.getState().setCompanions(getBaseCompanions());
    renderCompanions();
    return;
  }

  const residents = getCharactersByIds(
    destination.residentIds.slice(0, DESTINATION_RESIDENT_LIMIT),
  ).filter((character) => character.status === CharacterStatus.ALIVE);
  travelStore
    .getState()
    .setCompanions(
      uniqueCharacters([...residents, ...getBaseCompanions()]).slice(0, COMPANION_OPTION_LIMIT),
    );
  renderCompanions();
}

// FormData, limpieza de textos y conversión de tipos. Los campos del pasaporte no forman parte.
export function readDraft(): ReservationDraft {
  const data = new FormData(element<HTMLFormElement>('#booking-form'));
  return {
    passengerName: String(data.get('passengerName') ?? '').trim(),
    destinationId: Number(data.get('destinationId')),
    travelDate: String(data.get('travelDate') ?? ''),
    passengers: Number(data.get('passengers')) || 1,
    companionIds: data.getAll('companionIds').map(Number).filter(Number.isFinite),
    tripType: parseTripType(data.get('tripType')),
    insurance: data.get('insurance') === 'on',
    comments: String(data.get('comments') ?? '').trim(),
  };
}

export function syncFormFromDraft(): void {
  const draft = travelStore.getState().draft;
  setControlValue('#passengerName', draft.passengerName);
  setControlValue('#destinationId', draft.destinationId || '');
  setControlValue('#travelDate', draft.travelDate);
  setControlValue('#passengers', draft.passengers);
  element<HTMLInputElement>('#insurance').checked = draft.insurance;
  setControlValue('#comments', draft.comments);
  element<HTMLInputElement>(`input[name="tripType"][value="${draft.tripType}"]`).checked = true;
  renderCompanions();
  renderQuote();
}

export function showFormErrors(errors: string[]): void {
  const box = element<HTMLDivElement>('#form-errors');
  box.hidden = errors.length === 0;
  if (errors.length) appendFormErrors(box, errors);
  else box.replaceChildren();
}

function showFormNotice(node: HTMLElement): void {
  const box = element<HTMLDivElement>('#form-errors');
  box.hidden = false;
  box.replaceChildren(node);
}

function setSubmitting(value: boolean): void {
  submitting = value;
  renderBookingApiState();
}

function toRequest(draft: ReservationDraft): ReservationDraft {
  return {
    ...draft,
    passengerName: draft.passengerName.trim(),
    companionIds: [...draft.companionIds].sort((first, second) => first - second),
    comments: draft.comments.trim(),
  };
}

async function ensurePassport(passport: PassportInput): Promise<boolean> {
  const result = await authenticate(passport);
  if (result.ok) {
    showToast(
      passport.mode === 'register'
        ? msg().toasts.registered(formatBalance(getSpendableBalance()))
        : msg().toasts.welcomedBack(formatBalance(getSpendableBalance())),
    );
    return true;
  }
  if (result.duplicate) {
    setPassportMode(passportStep(), 'login');
    renderPassportStep();
    passportStep().querySelector<HTMLInputElement>('[name="password"]')?.focus();
  }
  showFormErrors(result.errors);
  return false;
}

function handleSubmitError(error: unknown): void {
  if (isUnauthorizedError(error)) {
    renderPassportStep();
    setPassportMode(passportStep(), 'login');
    renderPassportStep();
    showFormErrors([msg().toasts.expiredBooking]);
    return;
  }
  if (isBalanceError(error)) {
    showFormNotice(createBalanceErrorNotice(error.data.required, error.data.current));
    return;
  }
  const validation = getValidationMessages(error);
  if (validation.length) {
    showFormErrors(validation);
    return;
  }
  if (error instanceof PortalTripApiError && error.status === 409) {
    attempt = null;
    showFormErrors([msg().toasts.conflictRetry]);
    return;
  }
  const view = getApiErrorView(error);
  showFormErrors([msg().errors.form(view.title, view.message, view.hint)]);
}

// Evita el submit nativo, valida en local, asegura el pasaporte y crea la reserva en la API.
export async function submitReservation(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const apiState = travelStore.getState();
  if (submitting) return;
  if ((apiState.loading && !apiState.locations.length) || apiState.error) {
    renderBookingApiState();
    return;
  }

  const draft = readDraft();
  travelStore.getState().setDraft(draft);
  const destination: Location | undefined = locationsById.get(draft.destinationId);
  const companions = travelStore
    .getState()
    .companions.filter((character) => draft.companionIds.includes(character.id));
  const errors = validateReservation(draft, destination, companions);
  if (!destination) errors.push(msg().booking.destinationGone);

  const passport = isAuthenticated() ? null : readPassport(passportStep());
  if (passport) errors.push(...validatePassport(passport));
  showFormErrors(errors);
  if (errors.length || !destination) return;

  setSubmitting(true);
  try {
    if (passport && !(await ensurePassport(passport))) return;

    const request = toRequest(draft);
    const result = await createReservation(request, idempotencyKeyFor(request));
    attempt = null;
    sessionStore.getState().setBalance(result.remainingBalance);
    travelStore.getState().upsertReservation(result.reservation);
    renderReservations();
    showToast(msg().toasts.booked(result.reservation.number, formatBalance(getSpendableBalance())));
    travelStore.getState().resetDraft();
    element<HTMLFormElement>('#booking-form').reset();
    releasePassengerNamePrefill();
    syncFormFromDraft();
    renderPassportStep();
    setActiveView(PlannerView.RESERVATIONS);
    element("[data-panel='reservations']").scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    handleSubmitError(error);
  } finally {
    setSubmitting(false);
  }
}

export { passportCopy };

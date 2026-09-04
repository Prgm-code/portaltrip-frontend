import { formatJourneyDate, msg } from 'i18n';
import type { Character, Episode, Location } from 'models/catalog';
import { type Reservation, ReservationStatus } from 'models/reservation';
import {
  ensureCatalog,
  episodesById,
  getCharactersByIds,
  locationsById,
} from 'scripts/travel-planner/context';
import { element } from 'scripts/travel-planner/helpers';
import { showToast } from 'scripts/travel-planner/notifications';
import {
  completeReservation,
  getLocation,
  getReservation,
  startReservation,
} from 'services/portalTripApi';
import {
  type ApiErrorView,
  getApiErrorView,
  isUnauthorizedError,
} from 'services/portalTripApiError';
import { isAuthenticated, sessionStore } from 'stores/sessionStore';
import { createElement } from 'ui/dom';
import {
  createCharacterModal,
  createEpisodeModal,
  createJourneyError,
  createJourneyView,
} from 'ui/journeyElements';
import { formatCredits } from 'utils/travelRules';

const MAX_JOURNEY_RESIDENTS = 24;
let loaded = false;
let loading = false;

function bindRelationToggles(content: HTMLElement): void {
  content.querySelectorAll<HTMLButtonElement>('[data-expand-relation]').forEach((button) => {
    button.addEventListener('click', () => {
      const relation = button.dataset.expandRelation ?? '';
      const block = content.querySelector<HTMLElement>(`[data-relation="${relation}"]`);
      if (!block) return;
      const expanded = block.classList.toggle('expanded');
      button.textContent = expanded
        ? msg().journey.showLess
        : msg().journey.showAll(
            Number(button.dataset.total),
            relation === 'episodes' ? 'episodes' : 'residents',
          );
    });
  });
}

function bindDetailModals(content: HTMLElement, residents: Character[], episodes: Episode[]): void {
  const modal = element<HTMLDialogElement>('#details-modal');
  const modalContent = element<HTMLDivElement>('#modal-content');
  const characterMap = new Map(residents.map((resident) => [resident.id, resident]));
  const episodeMap = new Map(episodes.map((episode) => [episode.id, episode]));

  content.querySelectorAll<HTMLButtonElement>('[data-character-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const character = characterMap.get(Number(button.dataset.characterId));
      if (!character) return;
      modalContent.replaceChildren(createCharacterModal(character, episodeMap));
      modal.showModal();
    });
  });

  content.querySelectorAll<HTMLButtonElement>('[data-episode-id]').forEach((button) => {
    button.addEventListener('click', () => {
      const episode = episodeMap.get(Number(button.dataset.episodeId));
      if (!episode) return;
      modalContent.replaceChildren(createEpisodeModal(episode, residents));
      modal.showModal();
    });
  });

  element<HTMLButtonElement>('[data-close-modal]').addEventListener('click', () => modal.close());
  modal.addEventListener('click', (event) => {
    if (event.target === modal) modal.close();
  });
}

// Completar el viaje es una transición en la API: IN_PROGRESS → COMPLETED.
function bindJourneyCompletion(content: HTMLElement): void {
  const button = content.querySelector<HTMLButtonElement>('[data-complete-journey]');
  if (!button || button.disabled) return;

  button.addEventListener('click', async () => {
    const reservationId = button.dataset.completeJourney ?? '';
    button.disabled = true;
    button.textContent = msg().journey.closing;
    try {
      const completed = await completeReservation(reservationId);
      if (completed.status !== ReservationStatus.COMPLETED)
        throw new Error(msg().journey.unexpectedStatus);
      button.textContent = msg().journey.completed;
      content.querySelector<HTMLElement>('[data-journey-finale]')?.classList.add('completed');
      const kicker = content.querySelector<HTMLElement>('[data-finale-kicker]');
      const title = content.querySelector<HTMLElement>('[data-finale-title]');
      const copy = content.querySelector<HTMLElement>('[data-finale-copy]');
      if (kicker) kicker.textContent = msg().journey.finaleDone;
      if (title) title.textContent = msg().journey.finaleDoneTitle;
      if (copy) copy.textContent = msg().journey.finaleDoneCopy;
      showToast(msg().toasts.expeditionDone(completed.number));
    } catch (error) {
      button.disabled = false;
      button.textContent = msg().journey.complete;
      const view = getApiErrorView(error);
      showToast(msg().toasts.toastPair(view.title, view.message), 'neutral');
    }
  });
}

function renderJourney(
  reservation: Reservation,
  destination: Location,
  characters: Character[],
  episodes: Episode[],
  residents: Character[],
): void {
  const residentIds = new Set(residents.map((resident) => resident.id));
  const relatedEpisodes = episodes.filter((episode) =>
    episode.characterIds.some((characterId) => residentIds.has(characterId)),
  );
  const content = element<HTMLDivElement>('#journey-content');
  content.replaceChildren(
    createJourneyView({
      reservation,
      destination,
      characters,
      residents,
      episodes,
      relatedEpisodes,
      date: formatJourneyDate(reservation.travelDate),
      teamNames: characters.length
        ? characters.map((character) => character.name).join(', ')
        : msg().journey.noCompanions,
      formattedTotal: formatCredits(reservation.quote.total),
    }),
  );

  element('#journey-loading').hidden = true;
  content.hidden = false;
  bindRelationToggles(content);
  bindDetailModals(content, residents, episodes);
  bindJourneyCompletion(content);
}

function renderError(error: ApiErrorView | string, action?: HTMLElement): void {
  const loadingBox = element('#journey-loading');
  loadingBox.hidden = false;
  loadingBox.replaceChildren(createJourneyError(error, action));
  const retry = loadingBox.querySelector<HTMLButtonElement>('[data-retry-journey]');
  if (!retry) return;
  retry.addEventListener('click', () => window.location.reload(), { once: true });
}

function renderLocked(): void {
  renderError(
    msg().journey.locked,
    createElement('button', {
      className: 'btn btn-primary min-h-[40px] text-[12px]',
      text: msg().reservations.lockedSignIn,
      attrs: { type: 'button' },
      dataset: { openPassport: 'login' },
    }),
  );
}

async function initializeJourney(): Promise<void> {
  if (loading || loaded) return;
  const reservationId = new URLSearchParams(window.location.search).get('id');
  if (!reservationId) return renderError(msg().journey.missingId);
  if (!isAuthenticated()) return renderLocked();

  loading = true;
  try {
    let reservation = await getReservation(reservationId);
    if (reservation.status === ReservationStatus.CANCELLED)
      return renderError(msg().journey.cancelled);
    if (reservation.status === ReservationStatus.CONFIRMED) {
      reservation = await startReservation(reservation.id);
    }

    await ensureCatalog({}, { episodes: true });
    const destination =
      locationsById.get(reservation.destination.id) ??
      (await getLocation({ id: reservation.destination.id }));
    const characters = getCharactersByIds(reservation.companions.map((companion) => companion.id));
    const residents = getCharactersByIds(destination.residentIds.slice(0, MAX_JOURNEY_RESIDENTS));
    const episodes = [...episodesById.values()].sort((first, second) => first.id - second.id);
    renderJourney(reservation, destination, characters, episodes, residents);
    loaded = true;
  } catch (error) {
    if (isUnauthorizedError(error)) renderLocked();
    else renderError(getApiErrorView(error));
  } finally {
    loading = false;
  }
}

// Mismo patrón que app.ts: el módulo vive toda la sesión, la bitácora arranca por página.
function boot(): void {
  const content = document.getElementById('journey-content');
  if (!content || content.dataset.booted) return;
  content.dataset.booted = 'true';
  loaded = false;
  void initializeJourney();

  // Si la persona ingresa desde el diálogo de pasaporte, la bitácora se abre sin recargar.
  const unsubscribe = sessionStore.subscribe((state, previous) => {
    if (state.session && !previous.session) void initializeJourney();
  });
  document.addEventListener('astro:before-swap', unsubscribe, { once: true });
}

boot();
document.addEventListener('astro:page-load', boot);

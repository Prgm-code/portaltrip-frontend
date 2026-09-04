import { currentLocale, localizedPath, locationTypeLabel, msg } from 'i18n';
import type { Character, Episode, Location } from 'models/catalog';
import { type Reservation, ReservationStatus, riskClassNames } from 'models/reservation';
import type { ApiErrorView } from 'services/portalTripApiError';
import { createElement, createFragment, createImage } from 'ui/dom';

function placeName(reference: Character['origin']): string {
  return reference?.name ?? msg().journey.unknownPlace;
}

type RelationKind = 'residents' | 'episodes';

function characterDescription(character: Character): string {
  return `${character.species}${character.type ? ` · ${character.type}` : ''}`;
}

// Piezas pequeñas reutilizadas por la bitácora y los modales.
function createLogHeading(kicker: string, title: string, copy: string): HTMLDivElement {
  return createElement(
    'div',
    { className: 'log-heading' },
    createElement('span', { text: kicker }),
    createElement('h2', { text: title }),
    createElement('p', { text: copy }),
  );
}

function createStatus(status: Character['status']): HTMLSpanElement {
  return createElement(
    'span',
    { className: `resident-status ${status.toLowerCase()}` },
    createElement('i'),
    status,
  );
}

function createDefinition(label: string, value: string | number): HTMLDivElement {
  return createElement(
    'div',
    {},
    createElement('dt', { text: label }),
    createElement('dd', { text: value }),
  );
}

// Cards de personajes y episodios relacionados.
export function createCharacterStory(
  character: Character,
  episodeMap: Map<number, Episode>,
): HTMLElement {
  const episodes = character.episodeIds
    .slice(0, 3)
    .map((id) => episodeMap.get(id))
    .filter((episode): episode is Episode => Boolean(episode));
  const history = createElement('ol');
  if (episodes.length) {
    episodes.forEach((episode) => {
      history.append(
        createElement(
          'li',
          {},
          createElement('span', { text: episode.code }),
          createElement('b', { text: episode.name }),
          createElement('small', { text: episode.airDate }),
        ),
      );
    });
  } else {
    history.append(createElement('li', {}, createElement('b', { text: msg().journey.noEpisodes })));
  }

  const profileImage = createImage(character.image, msg().journey.portrait(character.name));
  const profile = createElement(
    'div',
    { className: 'story-profile' },
    profileImage,
    createElement(
      'div',
      {},
      createElement('span', { className: 'alive-signal' }, createElement('i'), character.status),
      createElement('h3', { text: character.name }),
      createElement('p', { text: characterDescription(character) }),
    ),
  );
  const story = createElement(
    'p',
    { className: 'character-story' },
    createElement('b', { text: character.name }),
    msg().journey.story(
      character.name,
      placeName(character.origin),
      placeName(character.location),
      character.episodeIds.length,
    ),
  );
  const details = createElement(
    'dl',
    {},
    createDefinition(msg().journey.origin, placeName(character.origin)),
    createDefinition(msg().journey.currentLocation, placeName(character.location)),
    createDefinition(msg().journey.gender, character.gender),
  );
  const episodeHistory = createElement(
    'div',
    { className: 'episode-history' },
    createElement('span', { text: msg().journey.firstRecords }),
    history,
  );
  return createElement(
    'article',
    { className: 'story-card' },
    profile,
    story,
    details,
    episodeHistory,
  );
}

export function createRelatedResident(character: Character, index: number): HTMLButtonElement {
  const image = createImage(character.image);
  return createElement(
    'button',
    {
      className: `related-resident${index >= 12 ? ' relation-extra' : ''}`,
      attrs: { type: 'button', 'aria-label': msg().journey.viewCharacter(character.name) },
      dataset: { characterId: character.id },
    },
    createElement(
      'div',
      { className: 'resident-portrait' },
      createElement('span', { text: '◎', attrs: { 'aria-hidden': 'true' } }),
      image,
    ),
    createElement(
      'div',
      { className: 'resident-copy' },
      createStatus(character.status),
      createElement('h3', { text: character.name }),
      createElement('p', { text: characterDescription(character) }),
    ),
    createElement(
      'strong',
      {},
      character.episodeIds.length,
      createElement('small', { text: msg().journey.episodes }),
    ),
  );
}

export function createRelatedEpisode(
  episode: Episode,
  residentIds: Set<number>,
  index: number,
): HTMLButtonElement {
  const relatedResidents = episode.characterIds.filter((id) => residentIds.has(id)).length;
  return createElement(
    'button',
    {
      className: `related-episode${index >= 12 ? ' relation-extra' : ''}`,
      attrs: { type: 'button', 'aria-label': msg().journey.viewEpisode(episode.name) },
      dataset: { episodeId: episode.id },
    },
    createElement('span', { text: episode.code }),
    createElement(
      'div',
      {},
      createElement('h3', { text: episode.name }),
      createElement('p', { text: episode.airDate }),
    ),
    createElement(
      'strong',
      {},
      relatedResidents,
      createElement('small', { text: msg().journey.resident(relatedResidents) }),
    ),
  );
}

// Contenido intercambiable del dialog de detalles.
export function createCharacterModal(
  character: Character,
  episodeMap: Map<number, Episode>,
): DocumentFragment {
  const episodes = character.episodeIds
    .map((id) => episodeMap.get(id))
    .filter((item): item is Episode => Boolean(item));
  const portraitImage = createImage(character.image, msg().journey.portrait(character.name));
  const fragment = createFragment(
    createElement(
      'div',
      { className: 'modal-character-hero' },
      createElement(
        'div',
        { className: 'modal-portrait' },
        createElement('span', { text: '◎', attrs: { 'aria-hidden': 'true' } }),
        portraitImage,
      ),
      createElement(
        'div',
        {},
        createStatus(character.status),
        createElement('p', { className: 'modal-kicker', text: msg().journey.characterFile }),
        createElement('h2', { id: 'modal-title', text: character.name }),
        createElement('p', { text: characterDescription(character) }),
      ),
    ),
    createElement(
      'dl',
      { className: 'modal-data' },
      createDefinition(msg().journey.origin, placeName(character.origin)),
      createDefinition(msg().journey.currentLocation, placeName(character.location)),
      createDefinition(msg().journey.gender, character.gender),
      createDefinition(msg().journey.episodeCount, character.episodeIds.length),
    ),
  );

  const list = createElement('div');
  if (episodes.length) {
    episodes.slice(0, 8).forEach((episode) => {
      list.append(
        createElement(
          'article',
          {},
          createElement('b', { text: episode.code }),
          createElement('span', { text: episode.name }),
          createElement('small', { text: episode.airDate }),
        ),
      );
    });
  } else {
    list.append(createElement('p', { text: msg().journey.noEpisodeDetails }));
  }
  const related = createElement(
    'div',
    { className: 'modal-related-list' },
    createElement('span', { text: msg().journey.registeredChapters }),
    list,
  );
  if (episodes.length > 8)
    related.append(
      createElement('small', { text: msg().journey.extraChapters(episodes.length - 8) }),
    );
  fragment.append(related);
  return fragment;
}

export function createEpisodeModal(episode: Episode, residents: Character[]): DocumentFragment {
  const participantIds = new Set(episode.characterIds);
  const relatedResidents = residents.filter((resident) => participantIds.has(resident.id));
  const fragment = createFragment(
    createElement(
      'div',
      { className: 'modal-episode-hero' },
      createElement('span', { text: episode.code }),
      createElement('p', { className: 'modal-kicker', text: msg().journey.episodeFile }),
      createElement('h2', { id: 'modal-title', text: episode.name }),
      createElement('p', { text: msg().journey.aired(episode.airDate) }),
    ),
    createElement(
      'dl',
      { className: 'modal-data episode-data' },
      createDefinition(msg().journey.code, episode.code),
      createDefinition(msg().journey.totalCharacters, episode.characterIds.length),
      createDefinition(msg().journey.relatedResidents, relatedResidents.length),
    ),
  );
  const cards = createElement('div', { className: 'modal-residents' });
  if (relatedResidents.length) {
    relatedResidents.forEach((resident) => {
      const image = createImage(resident.image);
      cards.append(
        createElement(
          'article',
          {},
          createElement(
            'div',
            {},
            createElement('span', { text: '◎', attrs: { 'aria-hidden': 'true' } }),
            image,
          ),
          createElement('b', { text: resident.name }),
          createElement('small', { text: resident.species }),
        ),
      );
    });
  } else {
    cards.append(createElement('p', { text: msg().journey.noResidentsInEpisode }));
  }
  fragment.append(
    createElement(
      'div',
      { className: 'modal-related-list' },
      createElement('span', { text: msg().journey.residentsInEpisode }),
      cards,
    ),
  );
  return fragment;
}

function createMissionItem(label: string, value: string, valueClass = ''): HTMLDivElement {
  return createElement(
    'div',
    {},
    createElement('span', { text: label }),
    createElement('b', { className: valueClass, text: value }),
  );
}

function createTimelineStep(
  number: string,
  phase: string,
  title: string,
  copy: string,
): HTMLElement {
  return createElement(
    'article',
    {},
    createElement('span', { text: number }),
    createElement(
      'div',
      {},
      createElement('small', { text: phase }),
      createElement('h3', { text: title }),
      createElement('p', { text: copy }),
    ),
  );
}

function createRelationsBlock(
  kind: RelationKind,
  title: string,
  description: Node,
  grid: HTMLElement,
  total: number,
): HTMLDivElement {
  const block = createElement(
    'div',
    { className: 'relation-block', dataset: { relation: kind } },
    createElement(
      'div',
      { className: 'relation-title' },
      createElement(
        'div',
        {},
        createElement('span', { text: kind === 'residents' ? '01' : '02' }),
        createElement('h3', { text: title }),
      ),
      createElement('p', {}, description),
    ),
    grid,
  );
  if (total > 12)
    block.append(
      createElement('button', {
        className: 'relation-toggle',
        text: msg().journey.showAll(total, kind),
        attrs: { type: 'button' },
        dataset: { expandRelation: kind, total },
      }),
    );
  return block;
}

// Datos ya resueltos que necesita la vista; este builder no realiza peticiones.
export interface JourneyViewData {
  reservation: Reservation;
  destination: Location;
  characters: Character[];
  residents: Character[];
  episodes: Episode[];
  relatedEpisodes: Episode[];
  date: string;
  teamNames: string;
  formattedTotal: string;
}

// Ensambla la segunda etapa completa del viaje como un único fragmento DOM.
export function createJourneyView(data: JourneyViewData): DocumentFragment {
  const { reservation, destination, characters, residents, episodes, relatedEpisodes } = data;
  const isCompleted = reservation.status === ReservationStatus.COMPLETED;
  const fragment = createFragment();
  const episodeMap = new Map(episodes.map((episode) => [episode.id, episode]));
  const residentIds = new Set(residents.map((resident) => resident.id));

  const copy = msg().journey;
  const labels = msg().labels;
  const collage = createElement('div', {
    className: 'destination-collage',
    attrs: { 'aria-label': copy.collage(destination.name) },
  });
  if (residents.length) {
    residents.slice(0, 5).forEach((resident, index) => {
      collage.append(createImage(resident.image, resident.name, `collage-${index + 1}`));
    });
  } else {
    collage.append(
      createElement(
        'div',
        { className: 'uncharted-destination' },
        '◎',
        createElement('span', { text: copy.uncharted }),
      ),
    );
  }
  collage.append(
    createElement(
      'span',
      { className: 'destination-label' },
      createElement('b', { text: locationTypeLabel(destination.type) }),
      ` ${copy.registeredResidents(destination.residentIds.length)}`,
    ),
  );

  fragment.append(
    createElement(
      'section',
      { className: 'journey-hero' },
      createElement(
        'div',
        { className: 'journey-hero-copy' },
        createElement('span', {
          className: 'journey-code',
          text: copy.expedition(reservation.number),
        }),
        createElement(
          'h1',
          {},
          copy.headingTo,
          createElement('em', { text: reservation.destination.name }),
        ),
        createElement('p', {
          text: copy.ready(reservation.passengerName, data.teamNames, destination.dimension),
        }),
        createElement(
          'div',
          { className: 'journey-actions' },
          createElement('a', { text: copy.openLog, attrs: { href: '#bitacora' } }),
          createElement('span', { text: data.date }),
        ),
      ),
      collage,
    ),
    createElement(
      'section',
      { className: 'mission-strip', attrs: { 'aria-label': copy.mission } },
      createMissionItem(copy.destination, destination.name),
      createMissionItem(copy.dimension, destination.dimension),
      createMissionItem(
        copy.risk,
        labels.risk[reservation.quote.risk],
        `mission-risk ${riskClassNames[reservation.quote.risk]}`,
      ),
      createMissionItem(copy.investment, data.formattedTotal),
    ),
  );

  const travelLog = createElement(
    'section',
    { className: 'travel-log', id: 'bitacora' },
    createLogHeading(copy.logKicker, copy.logTitle, copy.logCopy),
    createElement(
      'div',
      { className: 'timeline' },
      createTimelineStep(
        '01',
        copy.prep,
        copy.portalCalibrated(destination.name),
        copy.prepCopy(reservation.passengers, labels.tripType[reservation.tripType]),
      ),
      createTimelineStep(
        '02',
        copy.crossing,
        copy.entry(destination.dimension),
        copy.crossingCopy(
          destination.name,
          locationTypeLabel(destination.type),
          labels.risk[reservation.quote.risk],
        ),
      ),
      createTimelineStep(
        '03',
        copy.encounter,
        destination.residentIds.length
          ? copy.signals(destination.residentIds.length)
          : copy.silence,
        destination.residentIds.length ? copy.portraitsRecovered : copy.noResidentsInsured,
      ),
    ),
  );
  fragment.append(travelLog);

  const residentsGrid = createElement('div', { className: 'related-residents-grid' });
  if (residents.length)
    residents.forEach((resident, index) => {
      residentsGrid.append(createRelatedResident(resident, index));
    });
  else
    residentsGrid.append(
      createElement('div', {
        className: 'relation-empty',
        text: copy.noResidents,
      }),
    );
  const episodesGrid = createElement('div', { className: 'related-episodes-grid' });
  if (relatedEpisodes.length)
    relatedEpisodes.forEach((episode, index) => {
      episodesGrid.append(createRelatedEpisode(episode, residentIds, index));
    });
  else
    episodesGrid.append(
      createElement('div', {
        className: 'relation-empty',
        text: copy.noRelatedEpisodes,
      }),
    );

  const relationDescription = document.createDocumentFragment();
  relationDescription.append(
    copy.linkedBy,
    createElement('code', { text: 'location.residentIds' }),
  );
  fragment.append(
    createElement(
      'section',
      { className: 'destination-relations', id: 'datos-destino' },
      createElement(
        'div',
        { className: 'relations-heading' },
        createLogHeading(
          copy.connections,
          copy.connectionsTitle,
          copy.connectionsCopy(destination.name),
        ),
        createElement(
          'div',
          { className: 'relations-stats' },
          createElement(
            'div',
            {},
            createElement('b', { text: residents.length }),
            createElement('span', { text: copy.characters }),
          ),
          createElement(
            'div',
            {},
            createElement('b', { text: relatedEpisodes.length }),
            createElement('span', { text: copy.chapters }),
          ),
        ),
      ),
      createRelationsBlock(
        'residents',
        copy.residentCharacters,
        relationDescription,
        residentsGrid,
        residents.length,
      ),
      createRelationsBlock(
        'episodes',
        copy.connectedChapters,
        document.createTextNode(copy.connectedHint),
        episodesGrid,
        relatedEpisodes.length,
      ),
    ),
  );

  const storyGrid = createElement('div', { className: 'story-grid' });
  if (characters.length)
    characters.forEach((character) => {
      storyGrid.append(createCharacterStory(character, episodeMap));
    });
  else
    storyGrid.append(
      createElement(
        'div',
        { className: 'journey-empty' },
        createElement('b', { text: copy.noCrewTitle }),
        createElement('p', { text: copy.noCrewCopy }),
        createElement('a', {
          text: copy.anotherBooking,
          attrs: { href: localizedPath(currentLocale(), '/#reserva') },
        }),
      ),
    );
  const completeButton = createElement('button', {
    className: 'journey-complete',
    text: isCompleted ? copy.completed : copy.complete,
    attrs: { type: 'button' },
    dataset: { completeJourney: reservation.id },
  });
  completeButton.disabled = isCompleted;

  fragment.append(
    createElement(
      'section',
      { className: 'crew-section' },
      createLogHeading(copy.crewKicker, copy.crewTitle, copy.crewCopy),
      storyGrid,
    ),
    createElement(
      'section',
      {
        className: `journey-finale${isCompleted ? ' completed' : ''}`,
        attrs: { 'aria-live': 'polite' },
        dataset: { journeyFinale: '' },
      },
      createElement('span', {
        text: isCompleted ? copy.finaleDone : copy.finaleLive,
        dataset: { finaleKicker: '' },
      }),
      createElement('h2', {
        text: isCompleted ? copy.finaleDoneTitle : copy.finaleLiveTitle,
        dataset: { finaleTitle: '' },
      }),
      createElement('p', {
        text: isCompleted ? copy.finaleDoneCopy : copy.finaleLiveCopy,
        dataset: { finaleCopy: '' },
      }),
      createElement(
        'div',
        { className: 'journey-finale-actions' },
        completeButton,
        createElement('a', {
          text: copy.backAgency,
          attrs: { href: localizedPath(currentLocale(), '/') },
        }),
      ),
    ),
  );
  return fragment;
}

export function createJourneyError(
  error: ApiErrorView | string,
  action?: HTMLElement,
): DocumentFragment {
  const isApiError = typeof error !== 'string';
  const title = isApiError ? error.title : msg().journey.openFailed;
  const message = isApiError ? error.message : error;
  const content = createElement(
    'div',
    { className: 'grid max-w-[520px] justify-items-center text-center' },
    createElement('div', {
      className: 'loading-error font-mono text-[20px]! font-black',
      text: isApiError ? String(error.status ?? 'OFF') : '!',
    }),
    isApiError &&
      createElement('span', {
        className:
          'rounded-full border border-[#f38c75]/30 bg-[#f38c75]/10 px-3 py-1 font-mono text-[11px] font-bold tracking-[.12em] text-[#f38c75]',
        text: msg().errors.panel.code(error.code),
      }),
    createElement('h1', { text: title }),
    createElement('p', { text: message }),
    isApiError &&
      createElement('small', {
        className: 'mt-2 text-[12px] leading-relaxed text-[#748178]',
        text: error.hint,
      }),
  );

  const actions = createElement('div', { className: 'mt-5 flex flex-wrap justify-center gap-2.5' });
  if (action) actions.append(action);
  if (isApiError)
    actions.append(
      createElement('button', {
        className: 'btn btn-primary min-h-[40px] text-[12px]',
        text: msg().journey.retryJump,
        attrs: { type: 'button' },
        dataset: { retryJourney: 'true' },
      }),
    );
  actions.append(
    createElement('a', {
      className: 'btn btn-ghost min-h-[40px] text-[12px]',
      text: msg().journey.backReservations,
      attrs: { href: localizedPath(currentLocale(), '/') },
    }),
  );
  content.append(actions);
  return createFragment(content);
}

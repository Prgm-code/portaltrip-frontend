import type { ApiRequestControl } from 'models/api-requests';
import { type Character, CharacterStatus, type Episode, type Location } from 'models/catalog';
import { getCharacters, getEpisodes, getLocations } from 'services/portalTripApi';

// Cachés en memoria compartidas por catálogo, formulario y bitácora durante la sesión.
// La API entrega listas completas sin paginación, así que se piden una sola vez.
export const locationsById = new Map<number, Location>();
export const charactersById = new Map<number, Character>();
export const episodesById = new Map<number, Episode>();

const BASE_COMPANION_LIMIT = 20;

export function rememberLocations(locations: Location[]): void {
  locations.forEach((location) => {
    locationsById.set(location.id, location);
  });
}

export function rememberCharacters(characters: Character[]): void {
  characters.forEach((character) => {
    charactersById.set(character.id, character);
  });
}

export function rememberEpisodes(episodes: Episode[]): void {
  episodes.forEach((episode) => {
    episodesById.set(episode.id, episode);
  });
  hydrateEpisodeIds();
}

// El listado de personajes no trae episodios; se derivan del listado de episodios.
function hydrateEpisodeIds(): void {
  if (!episodesById.size) return;
  const byCharacter = new Map<number, number[]>();
  [...episodesById.values()]
    .sort((first, second) => first.id - second.id)
    .forEach((episode) => {
      episode.characterIds.forEach((characterId) => {
        const list = byCharacter.get(characterId) ?? [];
        list.push(episode.id);
        byCharacter.set(characterId, list);
      });
    });
  charactersById.forEach((character, id) => {
    if (!character.episodeIds.length) character.episodeIds = byCharacter.get(id) ?? [];
  });
}

export function getCharactersByIds(ids: number[]): Character[] {
  return ids
    .map((id) => charactersById.get(id))
    .filter((character): character is Character => Boolean(character));
}

/** Catálogo de respaldo: los primeros personajes vivos, usado cuando el destino no tiene residentes. */
export function getBaseCompanions(): Character[] {
  const alive: Character[] = [];
  for (const character of charactersById.values()) {
    if (character.status === CharacterStatus.ALIVE) alive.push(character);
    if (alive.length >= BASE_COMPANION_LIMIT) break;
  }
  return alive;
}

/** Garantiza que las tres listas estén en memoria; cada una se descarga una sola vez. */
export async function ensureCatalog(
  control: ApiRequestControl = {},
  { episodes = false }: { episodes?: boolean } = {},
): Promise<void> {
  const tasks: Promise<void>[] = [];
  if (!locationsById.size) tasks.push(getLocations(control).then(rememberLocations));
  if (!charactersById.size) tasks.push(getCharacters(control).then(rememberCharacters));
  if (episodes && !episodesById.size) tasks.push(getEpisodes(control).then(rememberEpisodes));
  await Promise.all(tasks);
}

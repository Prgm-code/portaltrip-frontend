/** Estados de un personaje tal como los entrega PortalTrip API (copia del catálogo original). */
export enum CharacterStatus {
  ALIVE = 'Alive',
  DEAD = 'Dead',
  UNKNOWN = 'unknown',
}

/** Referencia mínima a otro recurso del catálogo. */
export interface NamedRef {
  id: number;
  name: string;
}

export interface Location {
  id: number;
  name: string;
  type: string;
  dimension: string;
  /** IDs de los últimos residentes conocidos, ordenados de forma ascendente. */
  residentIds: number[];
}

export interface Character {
  id: number;
  name: string;
  status: CharacterStatus;
  species: string;
  type: string;
  gender: string;
  origin: NamedRef | null;
  location: NamedRef | null;
  image: string;
  /** Vacío en el listado; el detalle y la caché de episodios lo completan. */
  episodeIds: number[];
}

export interface Episode {
  id: number;
  name: string;
  airDate: string;
  /** Código de emisión, por ejemplo `S01E01`. */
  code: string;
  characterIds: number[];
}

export interface HealthStatus {
  status: string;
  application: string;
  timestamp: string;
}

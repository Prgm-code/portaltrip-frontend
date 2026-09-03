/** Controla cómo una petición se refleja en el estado global de carga y error. */
export interface ApiRequestControl {
  trackLoading?: boolean;
  reportError?: boolean;
}

/** Filtros del catálogo; la API entrega la lista completa y el navegador filtra. */
export interface CatalogFilters {
  search: string;
  typeFilter: string;
}

export interface ResourceByIdRequest {
  id: number;
}

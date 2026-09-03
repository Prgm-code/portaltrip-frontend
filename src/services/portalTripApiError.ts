const ERROR_PREVIEW_PARAM = 'apiError';

/** Categorías que la interfaz usa para presentar cada anomalía. */
export type ApiErrorKind =
  | 'not-found'
  | 'timeout'
  | 'rate-limit'
  | 'server'
  | 'network'
  | 'unauthorized'
  | 'forbidden'
  | 'conflict'
  | 'validation'
  | 'balance'
  | 'bad-request'
  | 'unknown';

/** Información segura y temática que puede mostrarse directamente en la UI. */
export interface ApiErrorView {
  kind: ApiErrorKind;
  code: string;
  status?: number;
  title: string;
  message: string;
  hint: string;
}

/** `data` de un 422 por saldo insuficiente. */
export interface BalanceErrorData {
  required: number;
  current: number;
}

/** Error tipado producido al consultar PortalTrip API. */
export class PortalTripApiError extends Error {
  /**
   * @param message Mensaje del servidor o descripción entendible del fallo.
   * @param status Código HTTP, cuando el servidor alcanzó a responder.
   * @param data Contenido de `data` en la respuesta de error, si lo hubo.
   * @param originalError Error original de red o de lectura del JSON.
   */
  constructor(
    message: string,
    public readonly status?: number,
    public readonly data?: unknown,
    public readonly originalError?: unknown,
  ) {
    super(message);
    this.name = 'PortalTripApiError';
  }
}

/** Simula un error desde `?apiError=404` para revisar la interfaz. */
export function throwPreviewError(): void {
  if (typeof window === 'undefined') return;
  const status = Number(new URLSearchParams(window.location.search).get(ERROR_PREVIEW_PARAM));
  if (Number.isInteger(status) && status >= 400 && status <= 599) {
    throw new PortalTripApiError(`Error HTTP ${status} simulado para revisar la interfaz.`, status);
  }
}

// Los valores capturados como unknown se convierten a un error estable y tipado.
export function normalizeApiError(error: unknown, aborted = false): PortalTripApiError {
  if (aborted) {
    return new PortalTripApiError(
      'La API no respondió dentro del tiempo esperado.',
      408,
      undefined,
      error,
    );
  }

  if (error instanceof PortalTripApiError) return error;

  if (error instanceof TypeError) {
    return new PortalTripApiError(
      'No fue posible conectar con PortalTrip API.',
      undefined,
      undefined,
      error,
    );
  }

  const message =
    error instanceof Error ? error.message : 'Ocurrió un error inesperado al consultar la API.';
  return new PortalTripApiError(message, undefined, undefined, error);
}

export function isBalanceError(
  error: unknown,
): error is PortalTripApiError & { data: BalanceErrorData } {
  if (!(error instanceof PortalTripApiError) || error.status !== 422) return false;
  const data = error.data as Partial<BalanceErrorData> | undefined;
  return typeof data?.required === 'number' && typeof data?.current === 'number';
}

export function isDuplicateAccountError(error: unknown): boolean {
  return (
    error instanceof PortalTripApiError && error.status === 409 && /email/i.test(error.message)
  );
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof PortalTripApiError && error.status === 401;
}

/**
 * Lista de mensajes de validación que el formulario puede mostrar tal cual.
 * Un 422 de dominio trae `data: string[]`; un 400 concatena `campo: mensaje` con `;`.
 */
export function getValidationMessages(error: unknown): string[] {
  if (!(error instanceof PortalTripApiError)) return [];
  if (error.status === 422 && Array.isArray(error.data)) {
    return error.data.filter((item): item is string => typeof item === 'string');
  }
  if (error.status === 400) {
    return error.message
      .split(';')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Traduce un error técnico a una respuesta temática para la interfaz.
 *
 * @param error Error técnico, HTTP o de red.
 * @returns Título, explicación, ayuda y código listos para renderizar.
 */
export function getApiErrorView(error: unknown): ApiErrorView {
  const apiError = normalizeApiError(error);
  const status = apiError.status;

  if (status === 400)
    return {
      kind: 'bad-request',
      code: 'HTTP 400',
      status,
      title: 'Coordenadas incompletas',
      message: 'La Ciudadela rechazó algunos datos de la petición.',
      hint: apiError.message,
    };

  if (status === 401)
    return {
      kind: 'unauthorized',
      code: 'HTTP 401',
      status,
      title: 'Pasaporte vencido',
      message: 'La Ciudadela ya no reconoce tu sesión.',
      hint: 'Vuelve a ingresar con tu correo y clave para continuar.',
    };

  if (status === 403)
    return {
      kind: 'forbidden',
      code: 'HTTP 403',
      status,
      title: 'Acceso restringido',
      message: 'Tu pasaporte no tiene permiso para esta zona del multiverso.',
      hint: 'Regresa a la agencia y verifica tu cuenta.',
    };

  if (status === 404)
    return {
      kind: 'not-found',
      code: 'HTTP 404',
      status,
      title: 'Dimensión perdida',
      message: 'La coordenada solicitada desapareció del mapa multiversal o nunca existió.',
      hint: 'Prueba otro destino o vuelve al catálogo.',
    };

  if (status === 408)
    return {
      kind: 'timeout',
      code: 'HTTP 408',
      status,
      title: 'El portal agotó su tiempo',
      message: 'La conexión se cerró antes de recibir las coordenadas completas.',
      hint: 'Recalibra el portal e intenta nuevamente.',
    };

  if (status === 409)
    return {
      kind: 'conflict',
      code: 'HTTP 409',
      status,
      title: isDuplicateAccountError(apiError)
        ? 'Este correo ya tiene pasaporte'
        : 'Coordenadas en conflicto',
      message: isDuplicateAccountError(apiError)
        ? 'Ya existe una cuenta registrada con ese correo.'
        : 'La Ciudadela detectó una operación que choca con el estado actual.',
      hint: isDuplicateAccountError(apiError)
        ? 'Ingresa con tu clave para continuar la reserva.'
        : apiError.message,
    };

  if (status === 422 && isBalanceError(apiError))
    return {
      kind: 'balance',
      code: 'HTTP 422',
      status,
      title: 'Créditos insuficientes',
      message: 'Tu saldo no alcanza para abrir este portal.',
      hint: 'Cancela una reserva confirmada para recuperar créditos o elige un salto más económico.',
    };

  if (status === 422)
    return {
      kind: 'validation',
      code: 'HTTP 422',
      status,
      title: 'Protocolo de viaje rechazado',
      message: 'La Ciudadela detectó una regla de viaje incumplida.',
      hint: getValidationMessages(apiError).join(' ') || apiError.message,
    };

  if (status === 429)
    return {
      kind: 'rate-limit',
      code: 'HTTP 429',
      status,
      title: 'Demasiados portales abiertos',
      message: 'La red interdimensional está saturada por exceso de saltos.',
      hint: 'Vuelve a intentarlo cuando quieras recalibrar el portal.',
    };

  if (status !== undefined && status >= 500)
    return {
      kind: 'server',
      code: `HTTP ${status}`,
      status,
      title: 'La Ciudadela está fuera de servicio',
      message: 'Los servidores multiversales sufren una anomalía temporal.',
      hint: 'Tus créditos y reservas están a salvo. Intenta abrir el portal más tarde.',
    };

  if (status === undefined && apiError.originalError instanceof TypeError)
    return {
      kind: 'network',
      code: 'SIN SEÑAL',
      title: 'Se perdió la señal interdimensional',
      message: 'No logramos contactar con PortalTrip API.',
      hint: 'Comprueba tu conexión y vuelve a calibrar el portal.',
    };

  return {
    kind: 'unknown',
    code: status ? `HTTP ${status}` : 'ERROR PT-∞',
    status,
    title: 'Anomalía multiversal inesperada',
    message: 'Algo alteró la trayectoria de la petición.',
    hint: 'Intenta nuevamente; si continúa, regresa a la agencia.',
  };
}

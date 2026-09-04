import { msg } from 'i18n';

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
    throw new PortalTripApiError(msg().errors.preview(status), status);
  }
}

// Los valores capturados como unknown se convierten a un error estable y tipado.
export function normalizeApiError(error: unknown, aborted = false): PortalTripApiError {
  if (aborted) {
    return new PortalTripApiError(msg().errors.timeout, 408, undefined, error);
  }

  if (error instanceof PortalTripApiError) return error;

  if (error instanceof TypeError) {
    return new PortalTripApiError(msg().errors.unreachable, undefined, undefined, error);
  }

  const message = error instanceof Error ? error.message : msg().errors.unexpected;
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
  const views = msg().errors.views;

  if (status === 400)
    return {
      kind: 'bad-request',
      code: 'HTTP 400',
      status,
      title: views.badRequest.title,
      message: views.badRequest.message,
      hint: apiError.message,
    };

  if (status === 401)
    return {
      kind: 'unauthorized',
      code: 'HTTP 401',
      status,
      title: views.unauthorized.title,
      message: views.unauthorized.message,
      hint: views.unauthorized.hint,
    };

  if (status === 403)
    return {
      kind: 'forbidden',
      code: 'HTTP 403',
      status,
      title: views.forbidden.title,
      message: views.forbidden.message,
      hint: views.forbidden.hint,
    };

  if (status === 404)
    return {
      kind: 'not-found',
      code: 'HTTP 404',
      status,
      title: views.notFound.title,
      message: views.notFound.message,
      hint: views.notFound.hint,
    };

  if (status === 408)
    return {
      kind: 'timeout',
      code: 'HTTP 408',
      status,
      title: views.timeout.title,
      message: views.timeout.message,
      hint: views.timeout.hint,
    };

  if (status === 409)
    return {
      kind: 'conflict',
      code: 'HTTP 409',
      status,
      title: isDuplicateAccountError(apiError) ? views.duplicate.title : views.conflict.title,
      message: isDuplicateAccountError(apiError) ? views.duplicate.message : views.conflict.message,
      hint: isDuplicateAccountError(apiError) ? views.duplicate.hint : apiError.message,
    };

  if (status === 422 && isBalanceError(apiError))
    return {
      kind: 'balance',
      code: 'HTTP 422',
      status,
      title: views.balance.title,
      message: views.balance.message,
      hint: views.balance.hint,
    };

  if (status === 422)
    return {
      kind: 'validation',
      code: 'HTTP 422',
      status,
      title: views.validation.title,
      message: views.validation.message,
      hint: getValidationMessages(apiError).join(' ') || apiError.message,
    };

  if (status === 429)
    return {
      kind: 'rate-limit',
      code: 'HTTP 429',
      status,
      title: views.rateLimit.title,
      message: views.rateLimit.message,
      hint: views.rateLimit.hint,
    };

  if (status !== undefined && status >= 500)
    return {
      kind: 'server',
      code: `HTTP ${status}`,
      status,
      title: views.server.title,
      message: views.server.message,
      hint: views.server.hint,
    };

  if (status === undefined && apiError.originalError instanceof TypeError)
    return {
      kind: 'network',
      code: views.network.code,
      title: views.network.title,
      message: views.network.message,
      hint: views.network.hint,
    };

  return {
    kind: 'unknown',
    code: status ? `HTTP ${status}` : 'ERROR PT-∞',
    status,
    title: views.unknown.title,
    message: views.unknown.message,
    hint: views.unknown.hint,
  };
}

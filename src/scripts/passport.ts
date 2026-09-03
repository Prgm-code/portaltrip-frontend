import type { AuthSession, PassportInput, PassportMode } from 'models/auth';
import { login, register } from 'services/portalTripApi';
import {
  type ApiErrorView,
  getApiErrorView,
  getValidationMessages,
  isDuplicateAccountError,
  isUnauthorizedError,
} from 'services/portalTripApiError';
import { sessionStore } from 'stores/sessionStore';
import { validatePassport } from 'utils/travelRules';

export type PassportResult =
  | { ok: true; session: AuthSession }
  | { ok: false; duplicate: true; errors: string[] }
  | { ok: false; duplicate?: false; errors: string[]; view?: ApiErrorView };

const PASSPORT_COPY: Record<
  PassportMode,
  { title: string; copy: string; submit: string; switchLabel: string }
> = {
  register: {
    title: 'Crea tu pasaporte',
    copy: 'Recibes 5.000 créditos de bienvenida para tu primer salto.',
    submit: 'Crear pasaporte',
    switchLabel: '¿Ya tienes pasaporte? Ingresa con tu clave',
  },
  login: {
    title: 'Ingresa a tu pasaporte',
    copy: 'Usa el correo y la clave con los que creaste tu cuenta.',
    submit: 'Ingresar',
    switchLabel: '¿Aún no tienes pasaporte? Créalo y recibe 5.000 créditos',
  },
};

export function passportCopy(mode: PassportMode) {
  return PASSPORT_COPY[mode];
}

export function parsePassportMode(value: string | undefined): PassportMode {
  return value === 'login' ? 'login' : 'register';
}

/** Cambia el modo de un contenedor de pasaporte y sincroniza pestañas y textos. */
export function setPassportMode(scope: HTMLElement, mode: PassportMode): void {
  scope.dataset.passportMode = mode;
  scope.querySelectorAll<HTMLButtonElement>('[role="tab"][data-passport-mode]').forEach((tab) => {
    const active = tab.dataset.passportMode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  const copy = PASSPORT_COPY[mode];
  const title = scope.querySelector<HTMLElement>('[data-passport-title]');
  const description = scope.querySelector<HTMLElement>('[data-passport-copy]');
  const submit = scope.querySelector<HTMLElement>('[data-passport-submit]');
  const switcher = scope.querySelector<HTMLElement>('[data-passport-switch]');
  if (title) title.textContent = copy.title;
  if (description) description.textContent = copy.copy;
  if (submit) submit.textContent = copy.submit;
  if (switcher) {
    switcher.textContent = copy.switchLabel;
    switcher.dataset.passportMode = mode === 'register' ? 'login' : 'register';
  }
  const password = scope.querySelector<HTMLInputElement>('input[name="password"]');
  if (password) password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
}

/** Lee los campos de pasaporte de cualquier contenedor (paso del formulario o diálogo). */
export function readPassport(scope: HTMLElement): PassportInput {
  const value = (name: string): string =>
    scope.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value.trim() ?? '';
  return {
    mode: parsePassportMode(scope.dataset.passportMode),
    fullName: value('fullName'),
    email: value('email'),
    password: scope.querySelector<HTMLInputElement>('[name="password"]')?.value ?? '',
  };
}

// Registro con retroceso a ingreso: la API responde 409 cuando el correo ya existe.
export async function authenticate(input: PassportInput): Promise<PassportResult> {
  const errors = validatePassport(input);
  if (errors.length) return { ok: false, errors };

  try {
    const session =
      input.mode === 'register'
        ? await register({
            fullName: input.fullName.trim(),
            email: input.email.trim(),
            password: input.password,
          })
        : await login({ email: input.email.trim(), password: input.password });
    sessionStore.getState().setSession(session);
    return { ok: true, session };
  } catch (error) {
    if (isDuplicateAccountError(error)) {
      return {
        ok: false,
        duplicate: true,
        errors: ['Este correo ya tiene pasaporte. Ingresa tu clave para continuar.'],
      };
    }
    if (isUnauthorizedError(error)) {
      return { ok: false, errors: ['Correo o clave incorrectos. Revisa tus datos.'] };
    }
    const validation = getValidationMessages(error);
    if (validation.length) return { ok: false, errors: validation };
    const view = getApiErrorView(error);
    return { ok: false, errors: [`${view.title}. ${view.message} ${view.hint}`], view };
  }
}

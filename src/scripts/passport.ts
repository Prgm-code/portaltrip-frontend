import { msg } from 'i18n';
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

export function passportCopy(mode: PassportMode) {
  return msg().passport[mode];
}

/** Pinta etiquetas fijas del diálogo o del paso embebido. El layout persiste entre idiomas. */
export function paintPassportChrome(scope: HTMLElement): void {
  const copy = msg().passport;
  const booking = msg().booking;
  const kicker = scope.querySelector<HTMLElement>('.section-kicker');
  if (kicker && scope.id === 'passport-dialog') kicker.textContent = copy.kicker;
  scope.querySelectorAll<HTMLButtonElement>('[role="tab"][data-passport-mode]').forEach((tab) => {
    tab.textContent = tab.dataset.passportMode === 'login' ? copy.tabLogin : copy.tabRegister;
  });
  const badge = scope.querySelector<HTMLElement>('.credit-badge');
  if (badge) {
    const mark = document.createElement('span');
    mark.setAttribute('aria-hidden', 'true');
    mark.textContent = '✦';
    badge.replaceChildren(mark, document.createTextNode(` ${copy.welcomeCredits}`));
  }
  const fullName = scope.querySelector<HTMLInputElement>('[name="fullName"]');
  if (fullName) {
    fullName.placeholder =
      scope.id === 'passport-dialog' ? copy.namePlaceholder : booking.fullNamePlaceholder;
    const label = fullName.closest('label')?.querySelector('.field-label');
    if (label) label.textContent = booking.fullName;
  }
  const email = scope.querySelector<HTMLInputElement>('[name="email"]');
  if (email) {
    const label = email.closest('label')?.querySelector('.field-label');
    if (label) label.textContent = booking.email;
  }
  const password = scope.querySelector<HTMLInputElement>('[name="password"]');
  if (password) {
    const label = password.closest('label')?.querySelector('.field-label');
    if (label instanceof HTMLElement) {
      const hint = label.querySelector('small');
      label.replaceChildren(booking.password, ' ');
      if (hint) {
        hint.textContent = booking.passwordHint;
        label.append(hint);
      }
    }
  }
  const close = scope.querySelector<HTMLElement>('[data-close-passport]');
  if (close) close.setAttribute('aria-label', copy.close);
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
  paintPassportChrome(scope);
  const copy = passportCopy(mode);
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
        errors: [msg().passport.duplicate],
      };
    }
    if (isUnauthorizedError(error)) {
      return { ok: false, errors: [msg().passport.badCredentials] };
    }
    const validation = getValidationMessages(error);
    if (validation.length) return { ok: false, errors: validation };
    const view = getApiErrorView(error);
    return { ok: false, errors: [msg().errors.form(view.title, view.message, view.hint)], view };
  }
}

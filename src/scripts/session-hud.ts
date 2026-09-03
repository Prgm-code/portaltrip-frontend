// HUD de sesión compartido por todas las páginas: chip de cuenta, diálogo de pasaporte,
// expiración del token y menú. Los listeners se delegan en `document` porque el router
// reemplaza el header en cada salto.
import type { PassportMode } from 'models/auth';
import { PlannerView } from 'models/reservation';
import { authenticate, readPassport, setPassportMode } from 'scripts/passport';
import { showToast } from 'scripts/travel-planner/notifications';
import { getProfile, SESSION_EXPIRED_EVENT } from 'services/portalTripApi';
import { getActiveSession, sessionMillisecondsLeft, sessionStore } from 'stores/sessionStore';
import { travelStore } from 'stores/travelStore';
import { appendFormErrors } from 'ui/appElements';
import { formatBalance } from 'utils/travelRules';

/** Emitido en la página de inicio cuando el menú pide abrir "Mis reservas". */
export const SHOW_RESERVATIONS_EVENT = 'portaltrip:show-reservations';

const EXPIRY_WARNING_MS = 2 * 60 * 1000;
let expiryTimer: number | undefined;

function query<T extends HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}

function setAccountMenu(open: boolean): void {
  const chip = query<HTMLButtonElement>('#account-chip');
  const menu = query<HTMLElement>('[data-account-menu]');
  if (!chip || !menu) return;
  chip.setAttribute('aria-expanded', String(open));
  menu.hidden = !open;
}

/** Refleja la sesión en header, readout del héroe y atributo raíz. */
export function syncSessionHud(): void {
  const session = getActiveSession();
  document.documentElement.dataset.session = session ? 'authenticated' : 'anonymous';
  document.querySelectorAll<HTMLElement>('[data-session-anonymous]').forEach((node) => {
    node.hidden = Boolean(session);
  });
  document.querySelectorAll<HTMLElement>('[data-session-authenticated]').forEach((node) => {
    node.hidden = !session;
  });
  if (session) {
    const firstName = session.user.fullName.split(' ')[0] ?? session.user.fullName;
    document.querySelectorAll<HTMLElement>('[data-account-name]').forEach((node) => {
      node.textContent = firstName;
    });
    document.querySelectorAll<HTMLElement>('[data-account-balance]').forEach((node) => {
      node.textContent = formatBalance(session.user.balance);
    });
    document.querySelectorAll<HTMLElement>('[data-account-email]').forEach((node) => {
      node.textContent = session.user.email;
    });
    const expiring = sessionMillisecondsLeft(session) <= EXPIRY_WARNING_MS;
    query<HTMLElement>('#account-chip')?.classList.toggle('expiring', expiring);
  } else {
    setAccountMenu(false);
  }
  const readout = query<HTMLElement>('[data-readout-passport]');
  if (readout) {
    readout.hidden = !session;
    readout.textContent = session
      ? `PASAPORTE · ${session.user.fullName.toUpperCase()} · ${formatBalance(session.user.balance)}`
      : '';
  }
  scheduleExpiry(session ? sessionMillisecondsLeft(session) : 0);
}

// Al vencer el token el HUD vuelve al estado anónimo aunque no haya peticiones en curso.
function scheduleExpiry(millisecondsLeft: number): void {
  window.clearTimeout(expiryTimer);
  if (millisecondsLeft <= 0) return;
  const warnIn = Math.max(0, millisecondsLeft - EXPIRY_WARNING_MS);
  expiryTimer = window.setTimeout(
    () => {
      const session = getActiveSession();
      if (!session) {
        syncSessionHud();
        return;
      }
      syncSessionHud();
      expiryTimer = window.setTimeout(() => {
        getActiveSession();
        syncSessionHud();
      }, sessionMillisecondsLeft(session));
    },
    Math.min(warnIn, 2 ** 31 - 1),
  );
}

// Diálogo global de pasaporte.
function passportDialog(): HTMLDialogElement | null {
  return query<HTMLDialogElement>('#passport-dialog');
}

export function openPassportDialog(mode: PassportMode, notice?: string): void {
  const dialog = passportDialog();
  if (!dialog) return;
  setPassportMode(dialog, mode);
  showPassportErrors(dialog, []);
  const copy = dialog.querySelector<HTMLElement>('[data-passport-copy]');
  if (copy && notice) copy.textContent = notice;
  if (!dialog.open) dialog.showModal();
  dialog
    .querySelector<HTMLInputElement>(mode === 'register' ? '[name="fullName"]' : '[name="email"]')
    ?.focus();
}

function closePassportDialog(): void {
  const dialog = passportDialog();
  if (dialog?.open) dialog.close();
}

function showPassportErrors(scope: HTMLElement, errors: string[]): void {
  const box = scope.querySelector<HTMLElement>('[data-passport-errors]');
  if (!box) return;
  box.hidden = errors.length === 0;
  if (errors.length) appendFormErrors(box, errors);
  else box.replaceChildren();
}

async function submitPassportDialog(form: HTMLFormElement): Promise<void> {
  const dialog = passportDialog();
  if (!dialog) return;
  const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (submit) submit.disabled = true;
  form.setAttribute('aria-busy', 'true');
  try {
    const result = await authenticate(readPassport(dialog));
    if (!result.ok) {
      if (result.duplicate) setPassportMode(dialog, 'login');
      showPassportErrors(dialog, result.errors);
      return;
    }
    closePassportDialog();
    form.reset();
    showToast(`Pasaporte activo · ${formatBalance(result.session.user.balance)} disponibles`);
  } finally {
    if (submit) submit.disabled = false;
    form.removeAttribute('aria-busy');
  }
}

function logout(): void {
  sessionStore.getState().clearSession();
  travelStore.getState().setReservations([]);
  travelStore.getState().setReservationsStatus('idle');
  showToast('Pasaporte cerrado. Tus reservas siguen en la Ciudadela.', 'neutral');
}

function togglePassword(button: HTMLButtonElement): void {
  const field = button.closest<HTMLElement>('.password-field');
  const input = field?.querySelector<HTMLInputElement>('input');
  if (!input) return;
  const reveal = input.type === 'password';
  input.type = reveal ? 'text' : 'password';
  button.textContent = reveal ? 'Ocultar' : 'Mostrar';
  button.setAttribute('aria-pressed', String(reveal));
}

// Refresca el saldo real al arrancar con una sesión guardada.
async function refreshProfile(): Promise<void> {
  if (!getActiveSession()) return;
  try {
    sessionStore.getState().setUser(await getProfile());
  } catch {
    // Un 401 ya limpió la sesión; otros errores mantienen los datos guardados.
  }
}

function bindDocument(): void {
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const trigger = event.target.closest<HTMLElement>(
      '[data-open-passport], [data-close-passport], [data-logout], #account-chip, [data-toggle-password], [data-open-reservations], #passport-dialog [data-passport-mode]',
    );
    if (!trigger) {
      if (!event.target.closest('[data-account-menu]')) setAccountMenu(false);
      return;
    }

    if (trigger.matches('[data-open-passport]')) {
      event.preventDefault();
      openPassportDialog(trigger.dataset.openPassport === 'register' ? 'register' : 'login');
    } else if (trigger.matches('[data-close-passport]')) {
      closePassportDialog();
    } else if (trigger.matches('[data-logout]')) {
      setAccountMenu(false);
      logout();
    } else if (trigger.id === 'account-chip') {
      setAccountMenu(trigger.getAttribute('aria-expanded') !== 'true');
    } else if (trigger.matches('[data-toggle-password]')) {
      togglePassword(trigger as HTMLButtonElement);
    } else if (trigger.matches('[data-open-reservations]')) {
      setAccountMenu(false);
      travelStore.getState().setView(PlannerView.RESERVATIONS);
      if (document.getElementById('reservations-list')) {
        event.preventDefault();
        document.dispatchEvent(new CustomEvent(SHOW_RESERVATIONS_EVENT));
      }
    } else if (trigger.dataset.passportMode) {
      const dialog = passportDialog();
      if (dialog)
        setPassportMode(dialog, trigger.dataset.passportMode === 'login' ? 'login' : 'register');
    }
  });

  // Fase de captura: debe correr antes de que el ClientRouter de Astro intercepte el submit.
  document.addEventListener(
    'submit',
    (event) => {
      if (event.target instanceof HTMLFormElement && event.target.id === 'passport-form') {
        event.preventDefault();
        void submitPassportDialog(event.target);
      }
    },
    { capture: true },
  );

  document.addEventListener('click', (event) => {
    // Clic en el fondo del diálogo: cerrar.
    const dialog = passportDialog();
    if (dialog?.open && event.target === dialog) dialog.close();
  });

  document.addEventListener(SESSION_EXPIRED_EVENT, () => {
    syncSessionHud();
    openPassportDialog(
      'login',
      'Tu sesión venció. Vuelve a ingresar para continuar donde estabas.',
    );
  });

  sessionStore.subscribe(syncSessionHud);
  document.addEventListener('astro:page-load', syncSessionHud);
}

bindDocument();
syncSessionHud();
void refreshProfile();

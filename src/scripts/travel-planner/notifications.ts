import { createToast, type ToastKind } from 'ui/appElements';

// Las notificaciones son temporales y no forman parte del estado persistente.
// La región vive en el layout; si una página no la tiene, el aviso se omite.
export function showToast(message: string, kind: ToastKind = 'success'): void {
  const region = document.getElementById('toast-region');
  if (!region) return;
  const toast = createToast(message, kind);
  region.append(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

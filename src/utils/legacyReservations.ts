/**
 * Antes del pasaporte las reservas vivían en `localStorage["reservas"]`.
 * No pueden transferirse a la cuenta (la API cobraría cada una), así que solo se
 * informa su existencia una vez y se permite descartarlas.
 */
export const LEGACY_STORAGE_KEY = 'reservas';

export function countLegacyReservations(): number {
  if (typeof localStorage === 'undefined') return 0;
  const saved = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!saved) return 0;
  try {
    const parsed = JSON.parse(saved) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
    const nested = (parsed as { state?: { reservations?: unknown[] } })?.state?.reservations;
    return Array.isArray(nested) ? nested.length : 0;
  } catch {
    return 0;
  }
}

export function discardLegacyReservations(): void {
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

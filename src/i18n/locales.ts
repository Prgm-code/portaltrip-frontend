export const locales = ['es', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'es';

export function isLocale(value: string | undefined | null): value is Locale {
  return value === 'es' || value === 'en';
}

export function parseLocale(value: string | undefined | null): Locale {
  if (!value) return defaultLocale;
  const normalized = value.toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-')) return 'en';
  return defaultLocale;
}

export function intlLocale(locale: Locale): string {
  return locale === 'en' ? 'en-US' : 'es-CL';
}

export function localeFromPath(pathname: string): Locale {
  if (pathname === '/en' || pathname === '/en/' || pathname.startsWith('/en/')) return 'en';
  return defaultLocale;
}

export function resolveAstroLocale(currentLocale: string | undefined, pathname: string): Locale {
  if (isLocale(currentLocale)) return currentLocale;
  return localeFromPath(pathname);
}

export function stripLocalePrefix(pathname: string): string {
  if (pathname === '/en' || pathname === '/en/') return '/';
  if (pathname.startsWith('/en/')) {
    const rest = pathname.slice(3);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return pathname;
}

/** Path interno (`/`, `/viaje`, `/#reserva`) con el prefijo del locale. */
export function localizedPath(locale: Locale, path: string): string {
  const hashIndex = path.indexOf('#');
  const queryIndex = path.indexOf('?');
  const cut =
    hashIndex === -1 ? queryIndex : queryIndex === -1 ? hashIndex : Math.min(hashIndex, queryIndex);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const suffix = cut === -1 ? '' : path.slice(cut);
  const clean = pathname === '' ? '/' : pathname;
  if (locale === defaultLocale) return `${clean}${suffix}`;
  if (clean === '/') return `/en/${suffix}`;
  return `/en${clean}${suffix}`;
}

export function journeyPath(locale: Locale, reservationId: string): string {
  return `${localizedPath(locale, '/viaje')}?id=${encodeURIComponent(reservationId)}`;
}

/** Conserva query y hash del URL actual al cambiar de idioma. */
export function switchLocaleHref(target: Locale, pathname: string, search = '', hash = ''): string {
  return `${localizedPath(target, stripLocalePrefix(pathname))}${search}${hash}`;
}

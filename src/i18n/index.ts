import { en } from './en';
import { es, type Messages } from './es';
import {
  defaultLocale,
  intlLocale,
  isLocale,
  journeyPath,
  type Locale,
  localeFromPath,
  locales,
  localizedPath,
  parseLocale,
  resolveAstroLocale,
  stripLocalePrefix,
  switchLocaleHref,
} from './locales';

export type { Locale, Messages };
export {
  defaultLocale,
  intlLocale,
  isLocale,
  journeyPath,
  localeFromPath,
  locales,
  localizedPath,
  parseLocale,
  resolveAstroLocale,
  stripLocalePrefix,
  switchLocaleHref,
};

export const messages: Record<Locale, Messages> = { es, en };

export function currentLocale(): Locale {
  if (typeof document !== 'undefined') return parseLocale(document.documentElement.lang);
  return defaultLocale;
}

export function msg(locale: Locale = currentLocale()): Messages {
  return messages[locale];
}

export function locationTypeLabel(type: string, locale: Locale = currentLocale()): string {
  const copy = messages[locale].catalog;
  if (!type) return copy.unknownType;
  return copy.types[type] ?? type;
}

export function formatCredits(value: number, locale: Locale = currentLocale()): string {
  return formatBalance(value, locale);
}

export function formatBalance(value: number, locale: Locale = currentLocale()): string {
  return `${new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 0 }).format(value)} CR`;
}

export function formatReservationDate(isoDate: string, locale: Locale = currentLocale()): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${isoDate}T12:00:00`));
}

export function formatJourneyDate(isoDate: string, locale: Locale = currentLocale()): string {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${isoDate}T12:00:00`));
}

export function compareNames(
  first: string,
  second: string,
  locale: Locale = currentLocale(),
): number {
  return first.localeCompare(second, intlLocale(locale));
}

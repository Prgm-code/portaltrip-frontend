import { msg } from 'i18n';
import type { PassportInput } from 'models/auth';
import { type Character, CharacterStatus, type Location } from 'models/catalog';
import { type Quote, type ReservationDraft, RiskLevel, type TripType } from 'models/reservation';

export { formatBalance, formatCredits } from 'i18n';

// Las reglas son idénticas a QuoteCalculator en el backend; el servidor es la autoridad.
const BASE_PRICE = 1200;
export const INSURANCE_PRICE = 190;
/** Créditos que la API regala al crear una cuenta (REGISTRATION_CREDIT). */
export const WELCOME_CREDIT = 5000;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 64;

const tripMultipliers: Record<TripType, number> = {
  express: 1,
  exploration: 1.3,
  premium: 1.65,
};

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/;

export function requiresInsurance(location?: Location): boolean {
  return location?.dimension.toLowerCase() === 'unknown';
}

function getRiskLevel(location?: Location): RiskLevel {
  if (!location || location.residentIds.length === 0) return RiskLevel.HIGH;
  if (requiresInsurance(location) || location.residentIds.length < 5) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

export function calculateQuote(
  draft: Pick<ReservationDraft, 'passengers' | 'tripType' | 'insurance'>,
  destination?: Location,
): Quote {
  const passengerCount = Math.max(1, draft.passengers || 1);
  const normalizedType = destination?.type.toLowerCase() ?? '';
  const locationRate = normalizedType.includes('station') ? 0.25 : 0;
  const passengerSurcharge = BASE_PRICE * 0.18 * Math.max(0, passengerCount - 1);
  const tripSurcharge = BASE_PRICE * (tripMultipliers[draft.tripType] - 1);
  const locationSurcharge = BASE_PRICE * locationRate;
  const insuranceCost = draft.insurance ? INSURANCE_PRICE * passengerCount : 0;

  return {
    basePrice: BASE_PRICE,
    locationSurcharge,
    passengerSurcharge,
    tripSurcharge,
    insuranceCost,
    total: BASE_PRICE + locationSurcharge + passengerSurcharge + tripSurcharge + insuranceCost,
    risk: getRiskLevel(destination),
  };
}

// Reglas evaluadas antes de enviar una reserva a la API.
export function validateReservation(
  draft: ReservationDraft,
  destination: Location | undefined,
  companions: Character[],
): string[] {
  const errors: string[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const travelDate = new Date(`${draft.travelDate}T00:00:00`);

  const copy = msg().validation;
  if (draft.passengerName.trim().length < 3) errors.push(copy.passengerName);
  if (!draft.destinationId) errors.push(copy.destination);
  if (!draft.travelDate || Number.isNaN(travelDate.getTime()) || travelDate <= today) {
    errors.push(copy.travelDate);
  }
  if (draft.passengers < 1 || draft.passengers > 8) errors.push(copy.passengers);
  if (draft.companionIds.length > 3) errors.push(copy.companions);
  if (companions.some((companion) => companion.status !== CharacterStatus.ALIVE)) {
    errors.push(copy.alive);
  }
  if (requiresInsurance(destination) && !draft.insurance) {
    errors.push(copy.insurance);
  }

  return errors;
}

// Reglas del paso de pasaporte; reflejan las validaciones de `/auth/register` y `/auth/login`.
export function validatePassport(passport: PassportInput): string[] {
  const errors: string[] = [];
  const copy = msg().validation;
  if (passport.mode === 'register') {
    const name = passport.fullName.trim();
    if (name.length < 3 || name.length > 100) errors.push(copy.fullName);
  }
  if (!EMAIL_PATTERN.test(passport.email.trim())) errors.push(copy.email);
  if (
    passport.password.length < MIN_PASSWORD_LENGTH ||
    passport.password.length > MAX_PASSWORD_LENGTH
  ) {
    errors.push(
      passport.mode === 'register'
        ? copy.passwordRegister(MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH)
        : copy.passwordLogin,
    );
  }
  return errors;
}

export function remainingAfter(balance: number, total: number): number {
  return Math.round((balance - total) * 100) / 100;
}

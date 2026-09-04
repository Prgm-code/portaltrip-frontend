import type { NamedRef } from 'models/catalog';

/** Tipos de viaje admitidos por el formulario y por `POST /reservations`. */
export enum TripType {
  EXPRESS = 'express',
  EXPLORATION = 'exploration',
  PREMIUM = 'premium',
}

/** Niveles de riesgo con los códigos que devuelve la API. */
export enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

/** Estados del ciclo de vida de una reserva, idénticos a los del backend. */
export enum ReservationStatus {
  CONFIRMED = 'CONFIRMED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

/** Paneles principales que puede mostrar la interfaz. */
export enum PlannerView {
  DESTINATIONS = 'destinations',
  RESERVATIONS = 'reservations',
}

export const riskClassNames: Record<RiskLevel, string> = {
  [RiskLevel.LOW]: 'bajo',
  [RiskLevel.MEDIUM]: 'medio',
  [RiskLevel.HIGH]: 'alto',
};

export const statusClassNames: Record<ReservationStatus, string> = {
  [ReservationStatus.CONFIRMED]: 'confirmada',
  [ReservationStatus.IN_PROGRESS]: 'en-curso',
  [ReservationStatus.COMPLETED]: 'completada',
  [ReservationStatus.CANCELLED]: 'cancelada',
};

/** Cuerpo exacto de `POST /reservations`. El email sale de la cuenta autenticada. */
export interface ReservationRequest {
  passengerName: string;
  destinationId: number;
  travelDate: string;
  passengers: number;
  companionIds: number[];
  tripType: TripType;
  insurance: boolean;
  comments: string;
}

/** El borrador del formulario coincide con la petición; se conserva el nombre por claridad. */
export type ReservationDraft = ReservationRequest;

export interface QuoteRequest {
  destinationId: number;
  passengers: number;
  tripType: TripType;
  insurance: boolean;
}

export interface Quote {
  basePrice: number;
  locationSurcharge: number;
  passengerSurcharge: number;
  tripSurcharge: number;
  insuranceCost: number;
  total: number;
  risk: RiskLevel;
}

export interface ReservationCompanion {
  id: number;
  name: string;
  image: string;
}

/** Reserva tal como la devuelve la API. */
export interface Reservation {
  id: string;
  number: string;
  status: ReservationStatus;
  passengerName: string;
  email: string;
  destination: NamedRef;
  travelDate: string;
  passengers: number;
  companions: ReservationCompanion[];
  tripType: TripType;
  insurance: boolean;
  comments: string;
  quote: Quote;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

/** Crear y cancelar devuelven además el saldo actualizado de la cuenta. */
export interface ReservationWithBalance {
  reservation: Reservation;
  remainingBalance: number;
}

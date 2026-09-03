/** Perfil devuelto por `/auth/*` y `/users/me`. */
export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  /** Créditos disponibles; la API los entrega como decimal. */
  balance: number;
}

/** Sesión persistida en el navegador. */
export interface AuthSession {
  accessToken: string;
  /** Instante ISO en el que el token deja de ser válido. */
  expiresAt: string;
  user: UserProfile;
}

export interface RegisterRequest {
  fullName: string;
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

/** El mismo panel de pasaporte crea cuentas o inicia sesión. */
export type PassportMode = 'register' | 'login';

/** Datos del paso de pasaporte tal como los escribe la persona. */
export interface PassportInput {
  mode: PassportMode;
  fullName: string;
  email: string;
  password: string;
}

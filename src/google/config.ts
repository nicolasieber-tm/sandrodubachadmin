// Google-OAuth-/Kalender-Konfiguration.
//
// Bewusst KEIN Schema-Parsing beim Import (anders als src/env.ts): Die App und
// /admin/kalender muessen ohne gesetzte Google-Env-Variablen normal laufen.
// process.env wird daher erst zur Laufzeit der Funktionen gelesen.

export const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
] as const;

export const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';

const DEFAULT_REDIRECT_URI = 'http://localhost:3000/api/google/callback';

/** True, wenn Client-ID und -Secret vorhanden sind (Google ist nutzbar). */
export function isGoogleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

/** Liefert die OAuth-Konfiguration aus der Umgebung (mit Default-Redirect-URI). */
export function googleOAuthConfig(): GoogleOAuthConfig {
  return {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? DEFAULT_REDIRECT_URI,
  };
}

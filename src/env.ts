import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.url(),
  SESSION_COOKIE_NAME: z.string().min(1).default('sd_session'),
  // Login-Zugang fuer /admin. E-Mail UND Passwort werden beim Login direkt
  // gegen diese Variablen geprueft (siehe auth/actions.ts) — auf Railway
  // aenderbar, das neue Passwort ist sofort aktiv. Optional im Schema, damit
  // `next build` nicht abbricht; die Pflichtpruefung passiert zur Laufzeit im
  // loginAction.
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_PASSWORD: z.string().min(8).optional(),
  APP_URL: z.url().default('http://localhost:3000'),
  // Sandros Nummer fuer WhatsApp-/Anruf-Buttons in der Buchungsstrecke,
  // im internationalen Format (z. B. +41791234567). Fehlt sie, werden die
  // Buttons ausgeblendet.
  CONTACT_PHONE: z.string().min(8).optional(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

// Waehrend `next build` (Sammeln der Page-Daten) loest Railway Referenz-Variablen
// wie ${{Postgres.DATABASE_URL}} noch nicht auf -> DATABASE_URL kann beim Build
// fehlen. Die DB wird zur Build-Zeit nicht angefragt (alle DB-Routen sind
// dynamisch), daher genuegt dort ein Platzhalter, damit die strikte Validierung
// den Build nicht abbricht. Zur Laufzeit ist die echte URL gesetzt und wird
// normal geprueft. (db/index.ts liest ohnehin process.env.DATABASE_URL direkt.)
const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build';
const source =
  isBuildPhase && !process.env.DATABASE_URL
    ? { ...process.env, DATABASE_URL: 'postgresql://build:build@localhost:5432/build' }
    : process.env;

export const env = schema.parse(source);

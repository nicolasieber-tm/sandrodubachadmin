// REINE Platzhalter-Engine fuer E-Mail-Vorlagen (kein DB/Netz). Ersetzt
// {{platzhalter}} im Vorlagentext durch Werte einer Buchung. TZ-fest via Intl,
// damit die Datumsformatierung unabhaengig von der Server-Zeitzone ist.
//
// Bewusst client-tauglich gehalten: Dieselbe Funktion erzeugt die Live-Vorschau
// im Admin-UI. Daher KEINE server-only-Markierung und keine DB-Abhaengigkeit.
import { formatRappen } from '@/lib/money';

const ZONE = 'Europe/Zurich';

// Minimal-Buchungsform, die die Engine liest. So bleibt renderTemplate von der
// vollen Booking-Row entkoppelt (Vorschau im Client braucht nur diese Felder).
export interface TemplateBooking {
  customerName: string;
  offerNameSnapshot: string;
  // null = Anfrage ohne Wunschtermin → «nach Absprache».
  requestedDate: string | null;
  requestedTime: string;
  location: string | null;
  priceRappen: number;
  message: string | null;
}

const WOCHENTAGE = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
] as const;

const MONATE = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
] as const;

// Liefert {wochentagIndex 0..6 (0=So), tag, monatIndex 0..11, jahr} fuer ein
// Datum 'YYYY-MM-DD', interpretiert als Zuercher Wandzeit. TZ-fest via Intl:
// wir bilden 12:00 UTC des Tages (kein DST-Sprung-Risiko an der Tagesgrenze) und
// fragen die Zone nach Wochentag/Datum.
function zurichDateParts(
  dateStr: string,
): { weekdayIndex: number; day: number; monthIndex: number; year: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return null;
  const [, y, mo, d] = m;
  const noon = Date.UTC(+y, +mo - 1, +d, 12, 0, 0);
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(new Date(noon)).map((x) => [x.type, x.value]));
  const shortToIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const weekdayIndex = shortToIndex[p.weekday as string] ?? new Date(noon).getUTCDay();
  return {
    weekdayIndex,
    day: +p.day,
    monthIndex: +p.month - 1,
    year: +p.year,
  };
}

// Vollformatiertes Datum «Montag, 15. Juni 2026» (de-CH). null bei ungueltig.
function formatDatumLong(dateStr: string): string | null {
  const parts = zurichDateParts(dateStr);
  if (!parts) return null;
  const tag = WOCHENTAGE[parts.weekdayIndex];
  const monat = MONATE[parts.monthIndex];
  return `${tag}, ${parts.day}. ${monat} ${parts.year}`;
}

function formatWochentag(dateStr: string): string | null {
  const parts = zurichDateParts(dateStr);
  if (!parts) return null;
  return WOCHENTAGE[parts.weekdayIndex];
}

// Werte aller bekannten Platzhalter fuer eine Buchung berechnen.
function buildValues(b: TemplateBooking): Record<string, string> {
  const datumLong = b.requestedDate ? formatDatumLong(b.requestedDate) : null;
  const wochentag = b.requestedDate ? formatWochentag(b.requestedDate) : null;
  const uhrzeit = b.requestedTime ? `${b.requestedTime} Uhr` : 'nach Absprache';

  // {{termin}} kombiniert Datum + Zeit analog der heutigen whenLine-Semantik:
  //  - kein Datum → «nach Absprache»
  //  - Datum ohne Zeit → nur Datum
  //  - Datum + Zeit → «… um HH:MM Uhr»
  let termin: string;
  if (!datumLong) {
    termin = 'nach Absprache';
  } else if (b.requestedTime) {
    termin = `${datumLong} um ${b.requestedTime} Uhr`;
  } else {
    termin = datumLong;
  }

  return {
    name: b.customerName,
    angebot: b.offerNameSnapshot,
    datum: datumLong ?? 'nach Absprache',
    wochentag: wochentag ?? 'nach Absprache',
    uhrzeit,
    termin,
    ort: b.location && b.location.trim() !== '' ? b.location : 'wird noch bekannt gegeben',
    preis: formatRappen(b.priceRappen),
    nachricht: b.message && b.message.trim() !== '' ? b.message : '',
  };
}

/**
 * Ersetzt {{platzhalter}} im Vorlagentext durch die Werte der Buchung.
 *
 * - Whitespace-tolerant: «{{ name }}» wird wie «{{name}}» behandelt.
 * - Unbekannte Platzhalter bleiben unveraendert stehen (sichtbar = debugbar).
 * - Reine String-Operation, keine Seiteneffekte.
 */
export function renderTemplate(template: string, b: TemplateBooking): string {
  const values = buildValues(b);
  return template.replace(/\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (match, key: string) => {
    return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : match;
  });
}

// Liste aller unterstuetzten Platzhalter (fuer Legende/Chips im Admin-UI).
export const TEMPLATE_PLACEHOLDERS = [
  { token: '{{name}}', beschreibung: 'Name der Kundin/des Kunden' },
  { token: '{{angebot}}', beschreibung: 'Name des Angebots' },
  { token: '{{datum}}', beschreibung: 'Datum, z. B. «Montag, 15. Juni 2026»' },
  { token: '{{wochentag}}', beschreibung: 'Wochentag, z. B. «Montag»' },
  { token: '{{uhrzeit}}', beschreibung: 'Uhrzeit mit «Uhr»' },
  { token: '{{termin}}', beschreibung: 'Datum + Uhrzeit kombiniert' },
  { token: '{{ort}}', beschreibung: 'Ort des Shootings' },
  { token: '{{preis}}', beschreibung: 'Preis, z. B. «250 CHF»' },
  { token: '{{nachricht}}', beschreibung: 'Nachricht der Kundin/des Kunden' },
] as const;

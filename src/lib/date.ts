// Datums-Helfer für die Anzeige im Admin-UI.
// Alle Texte deutsch (Schweiz). Monatskürzel dreistellig, Grossbuchstaben.

const MONTH_ABBR_DE = [
  'JAN',
  'FEB',
  'MÄR',
  'APR',
  'MAI',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OKT',
  'NOV',
  'DEZ',
] as const;

/**
 * Zerlegt ein ISO-Datum 'YYYY-MM-DD' in Tag-Zahl (ohne führende Null) und
 * deutsches Monatskürzel. Beispiel: '2026-06-08' → { day: '8', month: 'JUN' }.
 */
export function dayMonth(iso: string): { day: string; month: string } {
  const [, monthStr, dayStr] = iso.split('-');
  const monthIndex = Number(monthStr) - 1;
  const day = String(Number(dayStr));
  const month = MONTH_ABBR_DE[monthIndex] ?? '';
  return { day, month };
}

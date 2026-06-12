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

const MONTH_FULL_DE = [
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

/**
 * Formatiert ein ISO-Datum 'YYYY-MM-DD' als ausgeschriebenes 'Tag Monat Jahr'
 * (deutsch). Beispiel: '2026-06-25' → '25. Juni 2026'. Reine String-Zerlegung
 * (kein Date-Objekt → keine Zeitzonen-Verschiebung). Ungültige Eingabe → ''.
 */
export function fullDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  const [, year, monthStr, dayStr] = m;
  const month = MONTH_FULL_DE[Number(monthStr) - 1];
  if (!month) return '';
  return `${Number(dayStr)}. ${month} ${year}`;
}

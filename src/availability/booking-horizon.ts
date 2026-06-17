// Pure Logik für den Buchungshorizont (max. Vorlaufzeit in Monaten).
// KEIN server-only: wird von der öffentlichen Calendar-Komponente (Client)
// UND von der Server-Validierung genutzt. Alles in lokaler Zeitzone, ohne
// toISOString (kein UTC-Versatz) — konsistent mit booking-flow.tsx.

// Datum um `months` verschieben. Klemmt auf den letzten Tag des Zielmonats,
// falls der Ursprungstag dort nicht existiert (z. B. 31.01. + 1 → 28./29.02.).
// Rückgabe ist die lokale Mitternacht des Zieltags.
export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const y = target.getFullYear();
  const m = target.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const day = Math.min(date.getDate(), lastDay);
  return new Date(y, m, day);
}

// Spätestes buchbares Datum (lokale Mitternacht) oder null bei unbegrenzt.
// months null/0/negativ → null.
export function maxBookingDate(now: Date, months: number | null): Date | null {
  if (months === null || months <= 0) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return addMonths(startOfToday, months);
}

// Liegt requestedDate ('YYYY-MM-DD') innerhalb des Horizonts?
// null-Horizont → immer true. Vergangenheit wird hier NICHT geprüft.
export function isWithinHorizon(
  requestedDate: string,
  now: Date,
  months: number | null,
): boolean {
  const max = maxBookingDate(now, months);
  if (!max) return true;
  const req = new Date(`${requestedDate}T00:00:00`);
  return req.getTime() <= max.getTime();
}

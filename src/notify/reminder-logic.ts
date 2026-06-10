import type { Booking } from '@/db/schema';

// REINE Logik (ohne DB/Netz): Entscheidet, ob fuer eine Buchung jetzt ein
// 48h-Reminder faellig ist. Die Zeitzonen-Rechnung erfolgt TZ-fest via Intl,
// unabhaengig von der Server-Zeitzone (gleiches Muster wie src/google/sync.ts).

const ZONE = 'Europe/Zurich';
const REMINDER_WINDOW_MS = 48 * 60 * 60 * 1000;

/**
 * Offset der Zone ZONE relativ zu UTC in Minuten fuer einen konkreten Instant
 * (positiv = oestlich von UTC). TZ-fest via Intl.
 */
function zoneOffsetMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return Math.round((asUtc - date.getTime()) / 60000);
}

/**
 * Wandelt eine Zuercher Wandzeit (Datum 'YYYY-MM-DD' + Zeit 'HH:MM') in den
 * zugehoerigen UTC-Instant. Liefert null bei ungueltigem/fehlendem Datum/Zeit.
 *
 * Vorgehen: Aus den Wandzeit-Komponenten eine UTC-Naeherung bilden, deren
 * tatsaechlichen Zonen-Offset bestimmen und damit den echten Instant korrigieren.
 */
export function zurichWallTimeToInstant(dateStr: string, timeStr: string): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr ?? '');
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeStr ?? '');
  if (!dateMatch || !timeMatch) return null;

  const [, y, mo, d] = dateMatch;
  const [, h, mi] = timeMatch;
  const hour = +h;
  const minute = +mi;
  if (hour > 23 || minute > 59) return null;

  // Naeherung: Wandzeit-Komponenten als UTC interpretieren.
  const guessUtc = Date.UTC(+y, +mo - 1, +d, hour, minute, 0);
  const offsetMin = zoneOffsetMinutes(new Date(guessUtc));
  // Echter Instant: Wandzeit liegt offsetMin Minuten vor UTC -> abziehen.
  return new Date(guessUtc - offsetMin * 60000);
}

/**
 * Ist fuer diese Buchung jetzt ('now') ein 48h-Reminder faellig?
 *
 * Kriterien (alle muessen erfuellt sein):
 *  - Status 'bestaetigt'
 *  - requestedTime gesetzt (getakteter Termin, keine Ganztags-Buchung)
 *  - reminderSentAt == null (noch nicht erinnert)
 *  - Termin-Instant (requestedDate + requestedTime in Europe/Zurich) liegt
 *    zwischen now und now+48h: Termin ist in <= 48h, aber noch nicht vorbei.
 */
export function isReminderDue(b: Booking, now: Date): boolean {
  if (b.status !== 'bestaetigt') return false;
  if (!b.requestedTime) return false;
  if (b.reminderSentAt != null) return false;

  const appointment = zurichWallTimeToInstant(b.requestedDate, b.requestedTime);
  if (!appointment) return false;

  const diffMs = appointment.getTime() - now.getTime();
  // Termin noch in der Zukunft (> 0) und innerhalb des 48h-Fensters (<= 48h).
  return diffMs > 0 && diffMs <= REMINDER_WINDOW_MS;
}

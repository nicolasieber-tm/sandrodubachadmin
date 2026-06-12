import type { Booking } from '@/db/schema';

// REINE Logik (ohne DB/Netz): Entscheidet, ob fuer eine Buchung jetzt ein
// 48h-Reminder faellig ist. Die Zeitzonen-Rechnung erfolgt TZ-fest via Intl,
// unabhaengig von der Server-Zeitzone (gleiches Muster wie src/google/sync.ts).

const ZONE = 'Europe/Zurich';
const HOUR_MS = 60 * 60 * 1000;

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

// Minimalform einer Reminder-Regel fuer die reine Logik (entkoppelt von der
// vollen DB-Row): nur die Felder, die die Faelligkeit bestimmen.
export interface ReminderRuleLite {
  id: string;
  offsetHours: number;
  enabled: boolean;
}

/**
 * Ist fuer diese Buchung jetzt ('now') der Reminder der Regel `rule` faellig?
 *
 * Kriterien (alle muessen erfuellt sein):
 *  - Status 'bestaetigt'
 *  - requestedDate + requestedTime gesetzt (getakteter Termin)
 *  - Regel ist aktiv
 *  - fuer (Buchung, Regel) wurde noch nicht versendet (nicht in alreadySentRuleIds)
 *  - Termin liegt im Fenster (untererOffset, rule.offsetHours] vor `now`:
 *      diffMs ∈ ( untererOffset*h , rule.offsetHours*h ]
 *
 * «untererOffset» = groesster aktiver Offset, der KLEINER als rule.offsetHours
 * ist (sonst 0). Dadurch faellt eine kurzfristige Buchung NUR in das Fenster
 * des naechstgelegenen Reminders – nie in mehrere gleichzeitig.
 *
 * Beispiel mit aktiven Offsets [168, 24]:
 *  - Regel 168h: faellig, wenn diff ∈ (24h, 168h]
 *  - Regel  24h: faellig, wenn diff ∈ ( 0h,  24h]
 * Eine Buchung, die in 20h stattfindet, loest also nur den 24h-Reminder aus.
 */
export function isReminderDueForRule(
  b: Booking,
  rule: ReminderRuleLite,
  alreadySentRuleIds: Set<string>,
  allEnabledOffsetsHours: number[],
  now: Date,
): boolean {
  if (b.status !== 'bestaetigt') return false;
  if (!b.requestedDate) return false;
  if (!b.requestedTime) return false;
  if (!rule.enabled) return false;
  if (alreadySentRuleIds.has(rule.id)) return false;

  const appointment = zurichWallTimeToInstant(b.requestedDate, b.requestedTime);
  if (!appointment) return false;

  const diffMs = appointment.getTime() - now.getTime();

  // Untere Fenstergrenze: groesster aktiver Offset unterhalb dieser Regel.
  const lowerOffsetHours = allEnabledOffsetsHours
    .filter((h) => h < rule.offsetHours)
    .reduce((max, h) => Math.max(max, h), 0);

  const oberGrenzeMs = rule.offsetHours * HOUR_MS;
  const unterGrenzeMs = lowerOffsetHours * HOUR_MS;

  // Termin innerhalb (untereGrenze, obereGrenze]; insbesondere noch in Zukunft,
  // da die unterste Grenze 0 ist (diffMs > 0).
  return diffMs > unterGrenzeMs && diffMs <= oberGrenzeMs;
}

import 'server-only';
import { and, asc, count, desc, eq, gte, inArray, lt, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, bookingRemindersSent, type Booking } from '@/db/schema';
import type { CustomFieldAnswer } from '@/offers/custom-fields';
import type { BookingStatusValue } from './status';

export type CreateBookingInput = {
  offerId?: string | null;
  offerNameSnapshot: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  message?: string | null;
  // null = Anfrage ohne Wunschtermin (Angebote im 'anfrage'-Modus).
  requestedDate: string | null;
  requestedTime?: string;
  location?: string | null;
  priceRappen: number;
  status?: BookingStatusValue;
  source?: 'iframe' | 'manuell';
  discountId?: string | null;
  customFields?: CustomFieldAnswer[];
  // Verlängerung über die Angebotsdauer hinaus (z. B. im Planer aufgezogene
  // Dauer). Default 0 = reine Angebotsdauer.
  extraMinutes?: number;
};

export type DashboardStats = {
  neueAnfragen: number;
  bestaetigtDieseWoche: number;
  umsatzMonatRappen: number;
  naechsteTermine: Booking[];
  neueListe: Booking[];
};

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const [row] = await db
    .insert(bookings)
    .values({
      offerId: input.offerId ?? null,
      offerNameSnapshot: input.offerNameSnapshot,
      customerName: input.customerName,
      customerEmail: input.customerEmail,
      customerPhone: input.customerPhone ?? '',
      message: input.message ?? null,
      requestedDate: input.requestedDate,
      requestedTime: input.requestedTime ?? '',
      location: input.location ?? null,
      priceRappen: input.priceRappen,
      status: input.status ?? 'neu',
      source: input.source ?? 'manuell',
      discountId: input.discountId ?? null,
      customFields: input.customFields ?? [],
      extraMinutes: input.extraMinutes ?? 0,
    })
    .returning();
  return row;
}

/**
 * Korrigiert Preis und Rabatt-Verknüpfung einer Buchung. Wird verwendet, wenn
 * eine Rabatt-Einlösung nachträglich fehlschlägt (Wettlauf/aufgebraucht) und
 * die Buchung auf den Basispreis zurückgesetzt werden muss.
 */
export async function updateBookingPricing(
  id: string,
  data: { priceRappen: number; discountId: string | null },
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookings)
    .set({ priceRappen: data.priceRappen, discountId: data.discountId })
    .where(eq(bookings.id, id))
    .returning();
  return row;
}

/**
 * GENERISCHE Bearbeitungs-Funktion fuer Termin-Details. Setzt NUR die
 * uebergebenen Felder (Partial) – nicht uebergebene bleiben unveraendert.
 * Gemeinsame Achse fuer das Verschieben (Datum/Zeit/Ort, Step 3), die
 * Preisanpassung (Step 4) und Wegkosten/Zusatzminuten (Step 5).
 */
export async function updateBookingDetails(
  id: string,
  data: Partial<{
    requestedDate: string | null;
    requestedTime: string;
    location: string | null;
    priceRappen: number;
    travelCostRappen: number;
    extraMinutes: number;
    // null setzt den 48h-Reminder-Status zurueck (z. B. nach dem Verschieben),
    // damit fuer den neuen Zeitpunkt erneut eine Erinnerung verschickt wird.
    reminderSentAt: Date | null;
  }>,
): Promise<Booking | undefined> {
  const patch: Partial<typeof bookings.$inferInsert> = {};
  if (data.requestedDate !== undefined) patch.requestedDate = data.requestedDate;
  if (data.requestedTime !== undefined) patch.requestedTime = data.requestedTime;
  if (data.location !== undefined) patch.location = data.location;
  if (data.priceRappen !== undefined) patch.priceRappen = data.priceRappen;
  if (data.travelCostRappen !== undefined) patch.travelCostRappen = data.travelCostRappen;
  if (data.extraMinutes !== undefined) patch.extraMinutes = data.extraMinutes;
  if (data.reminderSentAt !== undefined) patch.reminderSentAt = data.reminderSentAt;

  // Ohne zu setzende Felder: aktuellen Stand zurueckgeben, kein leeres UPDATE.
  if (Object.keys(patch).length === 0) {
    return getBooking(id);
  }

  const [row] = await db
    .update(bookings)
    .set(patch)
    .where(eq(bookings.id, id))
    .returning();
  return row;
}

export async function listBookings(filter?: {
  status?: BookingStatusValue;
}): Promise<Booking[]> {
  if (filter?.status) {
    return db
      .select()
      .from(bookings)
      .where(eq(bookings.status, filter.status))
      .orderBy(desc(bookings.createdAt));
  }
  return db.select().from(bookings).orderBy(desc(bookings.createdAt));
}

export async function getBooking(id: string): Promise<Booking | undefined> {
  const rows = await db.select().from(bookings).where(eq(bookings.id, id)).limit(1);
  return rows[0];
}

/**
 * Buchungen an einem konkreten Tag, die einen Slot belegen – also nur mit
 * Status 'neu' oder 'bestaetigt'. Basis für die Slot-Berechnung im /book-Flow.
 */
export async function listBookingsOnDate(dateStr: string): Promise<Booking[]> {
  return db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.requestedDate, dateStr),
        inArray(bookings.status, ['neu', 'bestaetigt']),
      ),
    )
    .orderBy(asc(bookings.requestedTime));
}

/**
 * Buchungen in einem Datumsbereich (inklusive Grenzen), ohne abgesagte.
 * Sortiert nach Datum und Uhrzeit – für die interne Wochenübersicht.
 */
export async function listBookingsInRange(
  fromDate: string,
  toDate: string,
): Promise<Booking[]> {
  return db
    .select()
    .from(bookings)
    .where(
      and(
        gte(bookings.requestedDate, fromDate),
        lte(bookings.requestedDate, toDate),
        ne(bookings.status, 'abgesagt'),
      ),
    )
    .orderBy(asc(bookings.requestedDate), asc(bookings.requestedTime));
}

/**
 * Kandidaten fuer die automatischen Reminder: bestaetigte, kuenftige Buchungen
 * mit Uhrzeit. Welcher Reminder (welche Regel) faellig ist, entscheidet die
 * reine Logik in src/notify/reminder-logic.ts (isReminderDueForRule) zusammen
 * mit den bereits versendeten Eintraegen (bookingRemindersSent).
 *
 * Die Query haelt sich bewusst grob (Datum >= heute). 'todayStr' wird als
 * Parameter uebergeben, damit der Aufrufer die Zeitbasis kontrollieren kann.
 *
 * Hinweis: Der frueher genutzte Einmal-Marker bookings.reminderSentAt wird hier
 * NICHT mehr gefiltert (Mehrfach-Reminder pro Buchung). Die Spalte bleibt im
 * Schema erhalten, ist fuer die neue Logik aber bedeutungslos.
 */
export async function listBookingsForReminderCheck(todayStr: string): Promise<Booking[]> {
  return db
    .select()
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'bestaetigt'),
        gte(bookings.requestedDate, todayStr),
        ne(bookings.requestedTime, ''),
      ),
    )
    .orderBy(asc(bookings.requestedDate), asc(bookings.requestedTime));
}

/** Regel-IDs, fuer die einer Buchung bereits ein Reminder versendet wurde. */
export async function listSentReminderRuleIds(bookingId: string): Promise<string[]> {
  const rows = await db
    .select({ ruleId: bookingRemindersSent.ruleId })
    .from(bookingRemindersSent)
    .where(eq(bookingRemindersSent.bookingId, bookingId));
  return rows.map((r) => r.ruleId);
}

/**
 * Vermerkt den Versand eines Reminders fuer (Buchung, Regel). Idempotent: ein
 * bereits vorhandener Eintrag (PK-Konflikt) bricht NICHT ab.
 */
export async function markReminderRuleSent(
  bookingId: string,
  ruleId: string,
  sentAt: Date = new Date(),
): Promise<void> {
  await db
    .insert(bookingRemindersSent)
    .values({ bookingId, ruleId, sentAt })
    .onConflictDoNothing();
}

/**
 * Loescht alle Reminder-Versand-Marker einer Buchung. Wird beim Verschieben des
 * Termins aufgerufen, damit die Reminder fuer den neuen Zeitpunkt erneut anlaufen.
 */
export async function clearRemindersSent(bookingId: string): Promise<void> {
  await db.delete(bookingRemindersSent).where(eq(bookingRemindersSent.bookingId, bookingId));
}

export async function setBookingStatus(
  id: string,
  status: BookingStatusValue,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookings)
    .set({ status, decidedAt: status === 'neu' ? null : new Date() })
    .where(eq(bookings.id, id))
    .returning();
  return row;
}

/** Hinterlegt Event-ID und Ziel-Kalender des Google-Events an der Buchung. */
export async function setBookingGoogleSync(
  id: string,
  eventId: string,
  calendarId: string,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookings)
    .set({ googleEventId: eventId, googleCalendarId: calendarId })
    .where(eq(bookings.id, id))
    .returning();
  return row;
}

/** Setzt die Google-Sync-Felder zurueck (nach Loeschen des Events). */
export async function clearBookingGoogleSync(id: string): Promise<void> {
  await db
    .update(bookings)
    .set({ googleEventId: null, googleCalendarId: null })
    .where(eq(bookings.id, id));
}

// Hilfsfunktionen zur Berechnung der Datumsgrenzen (lokale Zeit).
function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

function toDateString(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Montag 00:00 der laufenden Woche (lokale Zeit). getDay(): 0=So..6=Sa.
function startOfWeekMonday(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7; // So->6, Mo->0, Di->1, ...
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

export async function getDashboardStats(now: Date = new Date()): Promise<DashboardStats> {
  const todayStr = toDateString(now);
  const monthStartStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthStartStr = toDateString(nextMonthStart);
  const weekStart = startOfWeekMonday(now);

  const [{ value: neueAnfragen }] = await db
    .select({ value: count() })
    .from(bookings)
    .where(eq(bookings.status, 'neu'));

  const [{ value: bestaetigtDieseWoche }] = await db
    .select({ value: count() })
    .from(bookings)
    .where(and(eq(bookings.status, 'bestaetigt'), gte(bookings.decidedAt, weekStart)));

  // Umsatz = Angebotspreis + Wegkosten (Step 5: Wegkosten zaehlen mit).
  const [{ value: umsatzMonatRappen }] = await db
    .select({
      value: sql<number>`coalesce(sum(${bookings.priceRappen} + ${bookings.travelCostRappen}), 0)::int`,
    })
    .from(bookings)
    .where(
      and(
        eq(bookings.status, 'bestaetigt'),
        gte(bookings.requestedDate, monthStartStr),
        lt(bookings.requestedDate, nextMonthStartStr),
      ),
    );

  const naechsteTermine = await db
    .select()
    .from(bookings)
    .where(
      and(
        inArray(bookings.status, ['neu', 'bestaetigt']),
        gte(bookings.requestedDate, todayStr),
      ),
    )
    .orderBy(asc(bookings.requestedDate))
    .limit(5);

  const neueListe = await db
    .select()
    .from(bookings)
    .where(eq(bookings.status, 'neu'))
    .orderBy(desc(bookings.createdAt))
    .limit(5);

  return {
    neueAnfragen,
    bestaetigtDieseWoche,
    umsatzMonatRappen: Number(umsatzMonatRappen),
    naechsteTermine,
    neueListe,
  };
}

import 'server-only';
import { and, asc, count, desc, eq, gte, inArray, lt, lte, ne, sql } from 'drizzle-orm';
import { db } from '@/db';
import { bookings, type Booking } from '@/db/schema';
import type { BookingStatusValue } from './status';

export type CreateBookingInput = {
  offerId?: string | null;
  offerNameSnapshot: string;
  customerName: string;
  customerEmail: string;
  customerPhone?: string;
  message?: string | null;
  requestedDate: string;
  requestedTime?: string;
  location?: string | null;
  priceRappen: number;
  status?: BookingStatusValue;
  source?: 'iframe' | 'manuell';
  discountId?: string | null;
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

  const [{ value: umsatzMonatRappen }] = await db
    .select({ value: sql<number>`coalesce(sum(${bookings.priceRappen}), 0)::int` })
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

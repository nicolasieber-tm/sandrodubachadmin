'use server';

// Server-Actions für den Vollbild-Wochenplaner (/admin/planer).
//
// Auth-/Audit-Muster wie in src/bookings/actions.ts: Der Zugriffsschutz liegt
// auf der Middleware (matcher '/admin/:path*'); Änderungen werden über
// logAudit protokolliert.

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { getAvailability } from '@/availability/repository';
import { getOffer, listAllOffers } from '@/offers/repository';
import { googleBusyIntervals, pushBookingToGoogle } from '@/google/sync';
import { notifyBookingConfirmed, notifyBookingRescheduled } from '@/notify';
import type { Booking } from '@/db/schema';
import {
  getBooking,
  listBookingsInRange,
  setBookingStatus,
  updateBookingDetails as updateBookingDetailsRepo,
  clearRemindersSent,
} from './repository';
import { canTransition, type BookingStatusValue } from './status';

// Ein Termin-Block im Planer. Dauer = Angebotsdauer + Zusatzminuten.
export interface PlannerBooking {
  id: string;
  date: string; // 'YYYY-MM-DD'
  time: string; // 'HH:MM' oder '' (ohne Zeit → Chip-Zeile)
  durationMinutes: number;
  name: string;
  offerName: string;
  status: BookingStatusValue;
}

// Belegt-Block aus Google (andere Kalender-Einträge), nicht verschiebbar.
export interface PlannerBusy {
  start: string; // 'HH:MM'
  durationMinutes: number;
}

// Öffnungszeiten eines Wochentags (0=Mo … 6=So) für die Schattierung.
export interface PlannerDayAvailability {
  enabled: boolean;
  startTime: string; // 'HH:MM'
  endTime: string; // 'HH:MM'
}

export interface PlannerWeek {
  days: string[]; // sieben ISO-Tage Mo→So
  today: string;
  rangeLabel: string; // z. B. „8.–14. Jun"
  availability: PlannerDayAvailability[]; // Index = Wochentag 0=Mo
  bookings: PlannerBooking[];
  // Google-Belegung pro ISO-Tag (bereits um gepushte Tool-Termine bereinigt).
  googleBusy: Record<string, PlannerBusy[]>;
}

const MONTH_ABBR_DE = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Montag der Woche von `d` (lokale Zeit; Konvention wie /admin/kalender).
function startOfWeekMonday(d: Date): Date {
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  base.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  return base;
}

// Default-Öffnungszeiten, falls für einen Wochentag (noch) keine DB-Zeile
// existiert — identisch zur defaultRow-Logik auf /admin/kalender.
function defaultAvailability(weekday: number): PlannerDayAvailability {
  return { enabled: weekday !== 6, startTime: '09:00', endTime: '18:00' };
}

function rangeLabelFor(fromIso: string, toIsoStr: string): string {
  const startD = new Date(`${fromIso}T00:00:00`);
  const endD = new Date(`${toIsoStr}T00:00:00`);
  return startD.getMonth() === endD.getMonth()
    ? `${startD.getDate()}.–${endD.getDate()}. ${MONTH_ABBR_DE[endD.getMonth()]}`
    : `${startD.getDate()}. ${MONTH_ABBR_DE[startD.getMonth()]} – ${endD.getDate()}. ${MONTH_ABBR_DE[endD.getMonth()]}`;
}

/**
 * Wochendaten für den Planer: Tage Mo→So der Woche um `anchorIso` (verschoben
 * um `weekOffset` Wochen), Öffnungszeiten, Termin-Blöcke (mit Dauer aus dem
 * Angebot) und Google-Belegung. Google-Intervalle, die exakt einem
 * Tool-Termin entsprechen (gepushte Events), werden herausgefiltert, damit
 * Termine nicht doppelt erscheinen.
 */
export async function getPlannerWeek(
  anchorIso: string | null,
  weekOffset: number,
): Promise<PlannerWeek> {
  const now = new Date();
  const base = anchorIso ? new Date(`${anchorIso}T00:00:00`) : now;
  const weekStart = startOfWeekMonday(base);
  weekStart.setDate(weekStart.getDate() + Math.trunc(weekOffset) * 7);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return toIso(d);
  });

  const [availRows, offers, rows] = await Promise.all([
    getAvailability(),
    listAllOffers(),
    listBookingsInRange(days[0], days[6]),
  ]);

  const availByWeekday = new Map(availRows.map((r) => [r.weekday, r]));
  const availability: PlannerDayAvailability[] = Array.from({ length: 7 }, (_, wd) => {
    const row = availByWeekday.get(wd);
    return row
      ? { enabled: row.enabled, startTime: row.startTime, endTime: row.endTime }
      : defaultAvailability(wd);
  });

  const offerById = new Map(offers.map((o) => [o.id, o]));
  const plannerBookings: PlannerBooking[] = rows
    .filter((b) => b.requestedDate)
    .map((b) => {
      const offer = b.offerId ? offerById.get(b.offerId) : undefined;
      return {
        id: b.id,
        date: b.requestedDate as string,
        time: b.requestedTime ?? '',
        durationMinutes: (offer?.durationMinutes ?? 60) + (b.extraMinutes ?? 0),
        name: b.customerName,
        offerName: b.offerNameSnapshot,
        status: b.status as BookingStatusValue,
      };
    });

  // Google-Belegung pro Tag parallel laden (liefert [] ohne Verbindung).
  const busyLists = await Promise.all(days.map((d) => googleBusyIntervals(d)));
  const googleBusy: Record<string, PlannerBusy[]> = {};
  for (let i = 0; i < days.length; i++) {
    const day = days[i];
    const toolSlots = new Set(
      plannerBookings
        .filter((b) => b.date === day && b.time !== '')
        .map((b) => `${b.time}|${b.durationMinutes}`),
    );
    // Exakte Treffer (gleicher Start, gleiche Dauer) sind unsere eigenen,
    // nach Google gepushten Termine — nicht doppelt anzeigen.
    googleBusy[day] = busyLists[i].filter(
      (iv) => !toolSlots.has(`${iv.start}|${iv.durationMinutes}`),
    );
  }

  return {
    days,
    today: toIso(now),
    rangeLabel: rangeLabelFor(days[0], days[6]),
    availability,
    bookings: plannerBookings,
    googleBusy,
  };
}

export type MoveResult = { ok: true } | { error: string };

/**
 * Verschiebt einen Termin (oder terminiert eine Anfrage ohne Datum) auf
 * Datum + Zeit — der Drop-/Klick-Pfad des Planers. Preis, Ort und Wegkosten
 * bleiben unverändert; extraMinutes wird nur gesetzt, wenn übergeben (im
 * Planungsmodus aufgezogene Dauer über die Angebotsdauer hinaus). Bei
 * Terminänderung werden die Reminder-Marker gelöscht (Erinnerungen laufen für
 * den neuen Zeitpunkt neu an); bestätigte Termine werden nach Google
 * synchronisiert. Eine Kunden-Mail geht nur bei notifyCustomer=true raus.
 */
export async function movePlannerBooking(
  id: string,
  dateIso: string,
  time: string,
  notifyCustomer: boolean,
  extraMinutes?: number | null,
): Promise<MoveResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso) || !/^\d{2}:\d{2}$/.test(time)) {
    return { error: 'Ungültige Datums-/Zeitangabe.' };
  }
  if (
    extraMinutes != null &&
    (!Number.isInteger(extraMinutes) || extraMinutes < 0 || extraMinutes > 24 * 60)
  ) {
    return { error: 'Ungültige Zusatzminuten.' };
  }

  const current = await getBooking(id);
  if (!current) {
    return { error: 'Buchung nicht gefunden.' };
  }
  if (current.status !== 'neu' && current.status !== 'bestaetigt') {
    return { error: 'In diesem Status kann der Termin nicht verschoben werden.' };
  }

  const verschoben =
    dateIso !== current.requestedDate || time !== current.requestedTime;

  const updated = await updateBookingDetailsRepo(id, {
    requestedDate: dateIso,
    requestedTime: time,
    ...(extraMinutes != null ? { extraMinutes } : {}),
  });
  if (!updated) {
    return { error: 'Buchung nicht gefunden.' };
  }

  if (verschoben) {
    await clearRemindersSent(id);
  }

  await logAudit({
    action: 'booking.verschoben',
    entity: 'booking',
    entityId: id,
    meta: { via: 'planer', neuesDatum: dateIso, neueZeit: time },
  });

  // Google-Sync wie im Bearbeiten-Pfad: nur bestätigte Termine haben ein Event.
  if (updated.status === 'bestaetigt') {
    try {
      await pushBookingToGoogle(updated);
    } catch (err) {
      console.warn('[google] Sync nach Planer-Verschieben fehlgeschlagen:', err);
    }
  }

  if (notifyCustomer) {
    await notifyBookingRescheduled(updated);
  }

  revalidatePath('/admin');
  revalidatePath('/admin/termine');
  revalidatePath('/admin/planer');
  return { ok: true };
}

/**
 * Volle Buchung für das Termindetail-Modal im Planer (Klick auf einen Block).
 * Read-only; null, wenn nicht (mehr) vorhanden.
 */
export async function getPlannerBookingDetail(id: string): Promise<Booking | null> {
  const booking = await getBooking(id);
  return booking ?? null;
}

export interface FinalizeInput {
  date: string; // 'YYYY-MM-DD'
  vonTime: string; // 'HH:MM'
  bisTime: string; // 'HH:MM', muss nach vonTime liegen
  location: string;
  adminNote: string;
  // 'save' = nur eintragen (Status bleibt) · 'save_confirm' = eintragen UND
  // bestätigen (löst die Bestätigungs-Mail aus; nur aus Status 'neu') ·
  // 'save_notify' = eintragen + Verschiebe-Mail (für bereits Bestätigte).
  mode: 'save' | 'save_confirm' | 'save_notify';
}

/**
 * Abschluss des Planungsmodus: trägt Datum/Zeit (inkl. aufgezogener Dauer als
 * Zusatzminuten), genauen Ort und interne Notizen ein. Bei 'save_confirm'
 * wird der Termin zusätzlich bestätigt — erst NACH dem Speichern, damit die
 * Bestätigungs-Mail und das Google-Event bereits die neuen Daten tragen.
 */
export async function finalizePlannedBooking(
  id: string,
  input: FinalizeInput,
): Promise<MoveResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { error: 'Ungültiges Datum.' };
  }
  if (!/^\d{2}:\d{2}$/.test(input.vonTime) || !/^\d{2}:\d{2}$/.test(input.bisTime)) {
    return { error: 'Ungültige Zeitangabe.' };
  }
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const gesamt = toMin(input.bisTime) - toMin(input.vonTime);
  if (gesamt <= 0) {
    return { error: '«Bis» muss nach «Von» liegen.' };
  }

  const current = await getBooking(id);
  if (!current) {
    return { error: 'Buchung nicht gefunden.' };
  }
  if (current.status !== 'neu' && current.status !== 'bestaetigt') {
    return { error: 'In diesem Status kann der Termin nicht geplant werden.' };
  }
  if (input.mode === 'save_confirm' && !canTransition(current.status, 'bestaetigt')) {
    return { error: 'Bestätigen ist in diesem Status nicht möglich.' };
  }

  // Aufgezogene Gesamtdauer → Zusatzminuten über die Angebotsdauer hinaus.
  const offer = current.offerId ? await getOffer(current.offerId) : undefined;
  const baseDuration = offer?.durationMinutes ?? 60;
  const extraMinutes = Math.max(0, gesamt - baseDuration);

  const verschoben =
    input.date !== current.requestedDate || input.vonTime !== current.requestedTime;

  const updated = await updateBookingDetailsRepo(id, {
    requestedDate: input.date,
    requestedTime: input.vonTime,
    extraMinutes,
    location: input.location.trim() === '' ? null : input.location.trim(),
    adminNote: input.adminNote.trim() === '' ? null : input.adminNote.trim(),
  });
  if (!updated) {
    return { error: 'Buchung nicht gefunden.' };
  }

  if (verschoben) {
    await clearRemindersSent(id);
  }
  await logAudit({
    action: 'booking.geplant',
    entity: 'booking',
    entityId: id,
    meta: { via: 'planer', datum: input.date, von: input.vonTime, bis: input.bisTime, mode: input.mode },
  });

  if (input.mode === 'save_confirm') {
    // Bestätigen wie in confirmBooking (bookings/actions.ts): Status, Audit,
    // Kunden-Mail, Google-Event — auf Basis der frisch gespeicherten Daten.
    const confirmed = await setBookingStatus(id, 'bestaetigt');
    await logAudit({ action: 'booking.bestaetigt', entity: 'booking', entityId: id });
    if (confirmed) {
      await notifyBookingConfirmed(confirmed);
      try {
        await pushBookingToGoogle(confirmed);
      } catch (err) {
        console.warn('[google] Sync nach Planer-Bestätigung fehlgeschlagen:', err);
      }
    }
  } else if (updated.status === 'bestaetigt') {
    try {
      await pushBookingToGoogle(updated);
    } catch (err) {
      console.warn('[google] Sync nach Planer-Eintrag fehlgeschlagen:', err);
    }
    if (input.mode === 'save_notify') {
      await notifyBookingRescheduled(updated);
    }
  }

  revalidatePath('/admin');
  revalidatePath('/admin/termine');
  revalidatePath('/admin/planer');
  return { ok: true };
}

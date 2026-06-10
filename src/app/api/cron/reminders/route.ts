import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { listBookingsForReminderCheck, markReminderSent } from '@/bookings/repository';
import { notifyBookingReminder } from '@/notify';
import { isReminderDue } from '@/notify/reminder-logic';
import { logAudit } from '@/lib/audit';

// Cron-Endpoint: versendet automatische 48h-Reminder vor dem Shooting.
//
// Gedacht fuer einen periodischen (z. B. stuendlichen) Aufruf durch den
// Railway-Cron. Schutz via Bearer-Token (CRON_SECRET). Der Endpoint laedt
// grobe Kandidaten aus der DB, filtert sie mit der reinen 48h-Logik und
// verschickt fuer jeden faelligen Termin genau einen Reminder.
//
// Robustheit: ein fehlgeschlagener Versand bricht die uebrigen NICHT ab.

export const dynamic = 'force-dynamic';

const ZONE = 'Europe/Zurich';

/** Heutiges Datum 'YYYY-MM-DD' in der Zone ZONE (TZ-fest via Intl). */
function zurichToday(now: Date): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Konstant-zeitiger Vergleich zweier Tokens. Bei Laengenungleichheit sofort
 * Mismatch (timingSafeEqual wuerde sonst werfen).
 */
function tokenMatches(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  // Ohne konfiguriertes Secret bleibt der Endpoint NICHT offen.
  if (!secret) {
    return NextResponse.json(
      { fehler: 'CRON_SECRET ist nicht gesetzt – Endpoint deaktiviert.' },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (!tokenMatches(auth, expected)) {
    return NextResponse.json({ fehler: 'Nicht autorisiert.' }, { status: 401 });
  }

  const now = new Date();
  const todayStr = zurichToday(now);

  const kandidaten = await listBookingsForReminderCheck(todayStr);
  const faellig = kandidaten.filter((b) => isReminderDue(b, now));

  let gesendet = 0;
  for (const b of faellig) {
    try {
      // notifyBookingReminder wirft nie (Transport schluckt Fehler), aber wir
      // kapseln dennoch defensiv pro Buchung, damit markReminderSent/Audit
      // einen einzelnen Ausreisser nicht den ganzen Lauf abbrechen lassen.
      await notifyBookingReminder(b);
      await markReminderSent(b.id, now);
      await logAudit({
        action: 'booking.reminder.gesendet',
        entity: 'booking',
        entityId: b.id,
        meta: { requestedDate: b.requestedDate, requestedTime: b.requestedTime },
      });
      gesendet += 1;
    } catch (err) {
      console.error(
        '[cron] Reminder fehlgeschlagen fuer Buchung',
        b.id,
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return NextResponse.json({ geprueft: kandidaten.length, gesendet });
}

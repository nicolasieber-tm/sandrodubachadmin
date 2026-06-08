import { getAvailability } from '@/availability/repository';
import { listConnections, availableCalendarKeys } from '@/calendars/repository';
import { listAllOffers } from '@/offers/repository';
import { listBookingsInRange } from '@/bookings/repository';
import { AvailabilityEditor } from '@/components/admin/availability-editor';
import { CalendarConnections } from '@/components/admin/calendar-connections';
import { OfferCalendarMap } from '@/components/admin/offer-calendar-map';
import { WeekCalendar } from '@/components/admin/week-calendar';
import { getGoogleConnection } from '@/google/tokens';
import { isGoogleConfigured } from '@/google/config';
import type { Availability } from '@/db/schema';

// Erlaubte Werte des ?google-Status-Parameters (vom OAuth-Flow gesetzt).
type GoogleStatus = 'verbunden' | 'fehler' | 'nichtkonfiguriert';

function parseGoogleStatus(value: string | undefined): GoogleStatus | null {
  return value === 'verbunden' || value === 'fehler' || value === 'nichtkonfiguriert'
    ? value
    : null;
}

// Wochentag-Konvention: 0=Montag … 6=Sonntag.
// Default-Zeile für einen Wochentag, falls in der DB (noch) nicht vorhanden.
// Sonntag (weekday 6) ist standardmässig deaktiviert.
function defaultRow(weekday: number): Availability {
  return {
    id: `default-${weekday}`,
    weekday,
    enabled: weekday !== 6,
    startTime: '09:00',
    endTime: '18:00',
  };
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Montag 00:00 der laufenden Woche (lokale Zeit). getDay(): 0=So..6=Sa,
// daher (getDay() + 6) % 7 für den Abstand zum Montag.
function startOfWeekMonday(now: Date): Date {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffToMonday = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

const MONTH_ABBR_DE = [
  'Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun',
  'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez',
] as const;

export default async function KalenderPage({
  searchParams,
}: {
  // Next 16: searchParams ist ein Promise.
  searchParams: Promise<{ w?: string; google?: string }>;
}) {
  const rows = await getAvailability();
  const byWeekday = new Map(rows.map((row) => [row.weekday, row]));

  // Immer sieben Zeilen rendern (0=Montag … 6=Sonntag), fehlende ergänzen.
  const seven: Availability[] = Array.from({ length: 7 }, (_, weekday) =>
    byWeekday.get(weekday) ?? defaultRow(weekday),
  );

  // --- Wochenübersicht ---
  const { w, google } = await searchParams;
  const googleStatus = parseGoogleStatus(google);
  const offset = Number.isFinite(Number(w)) ? Math.trunc(Number(w)) : 0;
  const now = new Date();
  const todayIso = toIso(now);

  const weekStart = startOfWeekMonday(now);
  weekStart.setDate(weekStart.getDate() + offset * 7);
  const days: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return toIso(d);
  });
  const fromIso = days[0];
  const toIsoStr = days[6];
  const weekBookings = await listBookingsInRange(fromIso, toIsoStr);

  // Lesbarer Bereich, z. B. „8.–14. Jun".
  const startD = new Date(`${fromIso}T00:00:00`);
  const endD = new Date(`${toIsoStr}T00:00:00`);
  const sameMonth = startD.getMonth() === endD.getMonth();
  const rangeLabel = sameMonth
    ? `${startD.getDate()}.–${endD.getDate()}. ${MONTH_ABBR_DE[endD.getMonth()]}`
    : `${startD.getDate()}. ${MONTH_ABBR_DE[startD.getMonth()]} – ${endD.getDate()}. ${MONTH_ABBR_DE[endD.getMonth()]}`;

  const prevHref = `?w=${offset - 1}`;
  const nextHref = `?w=${offset + 1}`;

  const connections = await listConnections();
  const offers = await listAllOffers();
  const calKeys = await availableCalendarKeys();

  const googleConfigured = isGoogleConfigured();
  const googleConn = await getGoogleConnection();

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Verfügbarkeit</div>
          <h1>Kalender</h1>
          <p className="lead">Wann Kund:innen Termine buchen können.</p>
        </div>
      </div>

      <WeekCalendar
        days={days}
        today={todayIso}
        bookings={weekBookings}
        prevHref={prevHref}
        nextHref={nextHref}
        rangeLabel={rangeLabel}
      />
      <CalendarConnections
        connections={connections}
        googleConfigured={googleConfigured}
        googleAccountLabel={googleConn?.row.accountLabel ?? null}
        googleStatus={googleStatus}
      />
      <OfferCalendarMap offers={offers} calendarKeys={calKeys} />
      <AvailabilityEditor initial={seven} />
    </section>
  );
}

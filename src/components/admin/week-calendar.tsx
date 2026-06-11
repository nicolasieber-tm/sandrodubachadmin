import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { statusBadgeClass, type BookingStatusValue } from '@/bookings/status';
import type { Booking } from '@/db/schema';

// Wochentag-Konvention der App: 0=Montag … 6=Sonntag.
const WEEKDAY_LABEL = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

interface WeekCalendarProps {
  /** Die sieben Tage der Woche als ISO-Strings 'YYYY-MM-DD', Mo → So. */
  days: string[];
  /** Heutiges Datum als ISO-String 'YYYY-MM-DD'. */
  today: string;
  /** Buchungen der Woche (ohne abgesagte), beliebig sortiert. */
  bookings: Booking[];
  /** Linkziel für die vorige Woche (searchParams ?w=offset). */
  prevHref: string;
  /** Linkziel für die nächste Woche. */
  nextHref: string;
  /** Lesbarer Bereich der Woche, z. B. „8.–14. Jun". */
  rangeLabel: string;
}

// Tag-Zahl ohne führende Null aus 'YYYY-MM-DD'.
function dayNumber(iso: string): string {
  return String(Number(iso.split('-')[2]));
}

export function WeekCalendar({
  days,
  today,
  bookings,
  prevHref,
  nextHref,
  rangeLabel,
}: WeekCalendarProps) {
  // Buchungen nach Datum gruppieren. Anfragen ohne Termin (requestedDate null)
  // tauchen in der Wochenansicht nicht auf.
  const byDay = new Map<string, Booking[]>();
  for (const booking of bookings) {
    if (!booking.requestedDate) continue;
    const list = byDay.get(booking.requestedDate);
    if (list) {
      list.push(booking);
    } else {
      byDay.set(booking.requestedDate, [booking]);
    }
  }

  return (
    <Card style={{ marginTop: 20 }}>
      <CardHeader>
        <div>
          <h3>Wochenübersicht</h3>
          <div className="sub">{rangeLabel}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn btn-sm btn-ghost" href={prevHref} aria-label="Vorige Woche">
            ‹
          </a>
          <a className="btn btn-sm btn-ghost" href={nextHref} aria-label="Nächste Woche">
            ›
          </a>
        </div>
      </CardHeader>

      <CardBody style={{ padding: '8px 22px 18px' }}>
        <div className="weekcal">
          {days.map((day, index) => {
            const isToday = day === today;
            const dayBookings = byDay.get(day) ?? [];
            return (
              <div key={day} className={`weekcal-col${isToday ? ' is-today' : ''}`}>
                <div className="weekcal-head">
                  <span className="weekcal-wd">{WEEKDAY_LABEL[index]}</span>
                  <span className="weekcal-day">{dayNumber(day)}</span>
                </div>
                <div className="weekcal-body">
                  {dayBookings.length === 0 ? (
                    <span className="weekcal-empty">—</span>
                  ) : (
                    dayBookings.map((booking) => (
                      <div
                        key={booking.id}
                        className={`weekcal-chip ${statusBadgeClass(
                          booking.status as BookingStatusValue,
                        )}`}
                        title={`${booking.requestedTime || '—'} · ${booking.customerName} · ${booking.offerNameSnapshot}`}
                      >
                        <span className="weekcal-time num">
                          {booking.requestedTime || '—'}
                        </span>
                        <span className="weekcal-name">{booking.customerName}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}

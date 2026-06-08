import { getAvailability } from '@/availability/repository';
import { listConnections, availableCalendarKeys } from '@/calendars/repository';
import { listAllOffers } from '@/offers/repository';
import { AvailabilityEditor } from '@/components/admin/availability-editor';
import { CalendarConnections } from '@/components/admin/calendar-connections';
import { OfferCalendarMap } from '@/components/admin/offer-calendar-map';
import type { Availability } from '@/db/schema';

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

export default async function KalenderPage() {
  const rows = await getAvailability();
  const byWeekday = new Map(rows.map((row) => [row.weekday, row]));

  // Immer sieben Zeilen rendern (0=Montag … 6=Sonntag), fehlende ergänzen.
  const seven: Availability[] = Array.from({ length: 7 }, (_, weekday) =>
    byWeekday.get(weekday) ?? defaultRow(weekday),
  );

  const connections = await listConnections();
  const offers = await listAllOffers();
  const calKeys = await availableCalendarKeys();

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Verfügbarkeit</div>
          <h1>Kalender</h1>
          <p className="lead">Wann Kund:innen Termine buchen können.</p>
        </div>
      </div>

      <CalendarConnections connections={connections} />
      <OfferCalendarMap offers={offers} calendarKeys={calKeys} />
      <AvailabilityEditor initial={seven} />
    </section>
  );
}

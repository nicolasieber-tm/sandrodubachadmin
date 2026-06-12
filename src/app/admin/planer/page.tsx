import { getPlannerWeek } from '@/bookings/planner-actions';
import { getBooking } from '@/bookings/repository';
import { getOffer, listActiveOffers } from '@/offers/repository';
import {
  PlannerCalendar,
  type PlanningTarget,
} from '@/components/admin/planner-calendar';
import type { BookingStatusValue } from '@/bookings/status';

// Vollbild-Wochenplaner: Termine sehen, verschieben (Drag & Drop), neue
// anlegen (Klick auf freie Fläche) und Anfragen terminieren (?booking=ID →
// Planungsmodus). Daten der Folgewochen lädt der Client per Server-Action.

function isIsoDate(v: string | undefined): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export default async function PlanerPage({
  searchParams,
}: {
  // Next 16: searchParams ist ein Promise.
  searchParams: Promise<{ d?: string; booking?: string }>;
}) {
  const { d, booking: bookingId } = await searchParams;

  // Planungsmodus: nur offene/bestätigte Buchungen lassen sich terminieren.
  let planning: PlanningTarget | null = null;
  if (bookingId) {
    const booking = await getBooking(bookingId);
    if (booking && (booking.status === 'neu' || booking.status === 'bestaetigt')) {
      const offer = booking.offerId ? await getOffer(booking.offerId) : undefined;
      planning = {
        id: booking.id,
        name: booking.customerName,
        offerName: booking.offerNameSnapshot,
        status: booking.status as BookingStatusValue,
        date: booking.requestedDate,
        time: booking.requestedTime ?? '',
        durationMinutes: (offer?.durationMinutes ?? 60) + (booking.extraMinutes ?? 0),
        baseDurationMinutes: offer?.durationMinutes ?? 60,
      };
    }
  }

  // Anker der Startwoche: ?d, sonst der Wunschtag der zu planenden Anfrage,
  // sonst heute (anchor null → Server-Heute in der Action).
  const anchor = isIsoDate(d) ? d : planning?.date ?? null;

  const [week, offers] = await Promise.all([
    getPlannerWeek(anchor, 0),
    listActiveOffers(),
  ]);

  // Bewusst ohne page-head: Der Planer nutzt die volle Viewport-Höhe
  // (Vollbild-Charakter); der Titel sitzt kompakt in der Kalender-Leiste.
  return (
    <section>
      <PlannerCalendar
        initialWeek={week}
        anchor={anchor}
        offers={offers}
        planning={planning}
      />
    </section>
  );
}

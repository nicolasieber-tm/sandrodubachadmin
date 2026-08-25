import { eq, sql } from 'drizzle-orm';
import { db } from '../db';
import { offers, bookings, availability, calendarConnections } from '../db/schema';

type SeedOffer = {
  name: string;
  priceRappen: number;
  unit: 'pauschal' | 'pro_stunde';
  durationMinutes: number;
  description: string;
  sortOrder: number;
};

const DEMO_OFFERS: SeedOffer[] = [
  {
    name: 'Portrait Outdoor',
    priceRappen: 25000,
    unit: 'pauschal',
    durationMinutes: 120,
    description: '2h Session im Freien · min. 50 Bilder, Lieferung in 48h.',
    sortOrder: 1,
  },
  {
    name: 'Portrait Studio',
    priceRappen: 40000,
    unit: 'pauschal',
    durationMinutes: 120,
    description: '2h Studio-Session · min. 50 Bilder, Lieferung in 48h.',
    sortOrder: 2,
  },
  {
    name: 'Individuelles Shooting',
    priceRappen: 20000,
    unit: 'pro_stunde',
    durationMinutes: 60,
    description: 'Fashion, Event, Food oder Gruppen · Preis nach Aufwand.',
    sortOrder: 3,
  },
];

async function countRows(
  table:
    | typeof offers
    | typeof bookings
    | typeof availability
    | typeof calendarConnections,
): Promise<number> {
  const res = await db.select({ value: sql<number>`count(*)::int` }).from(table);
  return Number(res[0]?.value ?? 0);
}

// Standard-Verfügbarkeit: 0=Montag … 6=Sonntag.
const DEMO_AVAILABILITY = [
  { weekday: 0, enabled: true, startTime: '09:00', endTime: '18:00' },
  { weekday: 1, enabled: true, startTime: '09:00', endTime: '18:00' },
  { weekday: 2, enabled: true, startTime: '09:00', endTime: '18:00' },
  { weekday: 3, enabled: true, startTime: '09:00', endTime: '18:00' },
  { weekday: 4, enabled: true, startTime: '09:00', endTime: '18:00' },
  { weekday: 5, enabled: true, startTime: '10:00', endTime: '14:00' },
  { weekday: 6, enabled: false, startTime: '09:00', endTime: '18:00' },
];

async function main() {
  // --- Angebote (idempotent) ---
  const existingOffers = await countRows(offers);
  if (existingOffers === 0) {
    await db.insert(offers).values(DEMO_OFFERS);
    console.log(`Angebote angelegt: ${DEMO_OFFERS.length}`);
  } else {
    // Bestehende Demo-Angebote: durationMinutes nachziehen (idempotent).
    for (const seed of DEMO_OFFERS) {
      await db
        .update(offers)
        .set({ durationMinutes: seed.durationMinutes })
        .where(eq(offers.name, seed.name));
    }
    console.log(
      `Angebote bereits vorhanden (${existingOffers}) — durationMinutes aktualisiert.`,
    );
  }

  // Angebote für die Buchungs-Snapshots laden.
  const allOffers = await db.select().from(offers);
  const byName = new Map(allOffers.map((o) => [o.name, o]));
  const outdoor = byName.get('Portrait Outdoor')!;
  const studio = byName.get('Portrait Studio')!;
  const individuell = byName.get('Individuelles Shooting')!;

  // --- Buchungen (idempotent) ---
  const existingBookings = await countRows(bookings);
  if (existingBookings === 0) {
    // Heute = 2026-06-08. Mische künftige und vergangene Termine.
    const demoBookings = [
      {
        offerId: outdoor.id,
        offerNameSnapshot: outdoor.name,
        customerName: 'Lena Brunner',
        customerEmail: 'lena.brunner@bluewin.ch',
        customerPhone: '+41 79 412 88 21',
        message: 'Gerne am späten Nachmittag wegen des Lichts.',
        requestedDate: '2026-06-18',
        requestedTime: '17:00',
        location: 'Gurten, Bern',
        priceRappen: outdoor.priceRappen,
        status: 'neu' as const,
        source: 'iframe' as const,
        decidedAt: null,
      },
      {
        offerId: studio.id,
        offerNameSnapshot: studio.name,
        customerName: 'Tobias Renz',
        customerEmail: 'tobias.renz@gmail.com',
        customerPhone: '+41 76 233 19 04',
        message: 'Bewerbungsfotos, eher klassisch.',
        requestedDate: '2026-06-25',
        requestedTime: '10:00',
        location: null,
        priceRappen: studio.priceRappen,
        status: 'neu' as const,
        source: 'iframe' as const,
        decidedAt: null,
      },
      {
        offerId: individuell.id,
        offerNameSnapshot: individuell.name,
        customerName: 'Sophie Kälin',
        customerEmail: 'sophie.kaelin@hispeed.ch',
        customerPhone: '+41 78 904 55 12',
        message: 'Food-Shooting für ein kleines Café.',
        requestedDate: '2026-07-02',
        requestedTime: '09:00',
        location: 'Café Felix, Zürich',
        priceRappen: 60000,
        status: 'neu' as const,
        source: 'manuell' as const,
        decidedAt: null,
      },
      {
        offerId: outdoor.id,
        offerNameSnapshot: outdoor.name,
        customerName: 'Marco Item',
        customerEmail: 'marco.item@outlook.com',
        customerPhone: '+41 79 661 23 47',
        message: null,
        requestedDate: '2026-06-14',
        requestedTime: '15:30',
        location: 'Seepark, Thun',
        priceRappen: outdoor.priceRappen,
        status: 'bestaetigt' as const,
        source: 'iframe' as const,
        decidedAt: new Date('2026-06-07T09:15:00+02:00'),
      },
      {
        offerId: studio.id,
        offerNameSnapshot: studio.name,
        customerName: 'Andrea Stalder',
        customerEmail: 'andrea.stalder@bluewin.ch',
        customerPhone: '+41 76 118 70 39',
        message: 'Familienportrait mit zwei Kindern.',
        requestedDate: '2026-06-21',
        requestedTime: '14:00',
        location: 'Studio Länggasse',
        priceRappen: studio.priceRappen,
        status: 'bestaetigt' as const,
        source: 'manuell' as const,
        decidedAt: new Date('2026-06-08T08:40:00+02:00'),
      },
      {
        offerId: individuell.id,
        offerNameSnapshot: individuell.name,
        customerName: 'Jonas Wyss',
        customerEmail: 'jonas.wyss@gmx.ch',
        customerPhone: '+41 79 305 44 78',
        message: 'Eventreportage, Vereinsjubiläum.',
        requestedDate: '2026-05-30',
        requestedTime: '18:00',
        location: 'Vereinslokal, Burgdorf',
        priceRappen: 80000,
        status: 'abgesagt' as const,
        source: 'iframe' as const,
        decidedAt: new Date('2026-05-22T16:05:00+02:00'),
      },
      {
        offerId: outdoor.id,
        offerNameSnapshot: outdoor.name,
        customerName: 'Nadia Furrer',
        customerEmail: 'nadia.furrer@hispeed.ch',
        customerPhone: '+41 78 552 90 16',
        message: 'Schwangerschaftsshooting im Park.',
        requestedDate: '2026-05-24',
        requestedTime: '16:00',
        location: 'Rosengarten, Bern',
        priceRappen: outdoor.priceRappen,
        status: 'erledigt' as const,
        source: 'manuell' as const,
        decidedAt: new Date('2026-05-20T11:30:00+02:00'),
      },
    ];

    await db.insert(bookings).values(demoBookings);
    console.log(`Buchungen angelegt: ${demoBookings.length}`);
  } else {
    console.log(`Buchungen bereits vorhanden (${existingBookings}) — übersprungen.`);
  }

  // --- Verfügbarkeit (idempotent) ---
  const existingAvailability = await countRows(availability);
  if (existingAvailability === 0) {
    await db.insert(availability).values(DEMO_AVAILABILITY);
    console.log(`Verfügbarkeit angelegt: ${DEMO_AVAILABILITY.length}`);
  } else {
    console.log(
      `Verfügbarkeit bereits vorhanden (${existingAvailability}) — übersprungen.`,
    );
  }

  // --- Kalender-Verbindungen (idempotent) ---
  const existingConnections = await countRows(calendarConnections);
  if (existingConnections === 0) {
    await db.insert(calendarConnections).values({
      provider: 'google',
      accountLabel: 'sandro@sandrodubach.ch',
      status: 'verbunden',
      subCalendars: ['Outdoor', 'Studio', 'Allgemein'],
    });
    console.log('Kalender-Verbindungen angelegt: 1');
  } else {
    console.log(
      `Kalender-Verbindungen bereits vorhanden (${existingConnections}) — übersprungen.`,
    );
  }

  // --- Counts ausgeben ---
  const offerCount = await countRows(offers);
  const bookingCount = await countRows(bookings);
  const availabilityCount = await countRows(availability);
  const connectionCount = await countRows(calendarConnections);
  console.log(
    `Counts → offers: ${offerCount}, bookings: ${bookingCount}, availability: ${availabilityCount}, calendarConnections: ${connectionCount}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

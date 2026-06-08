import { listBookings } from '@/bookings/repository';
import { listActiveOffers } from '@/offers/repository';
import { STATUS_LABEL, type BookingStatusValue } from '@/bookings/status';
import { BookingTable } from '@/components/admin/booking-table';

const STATUS_VALUES: BookingStatusValue[] = [
  'neu',
  'bestaetigt',
  'abgesagt',
  'erledigt',
];

function isStatusValue(value: string | undefined): value is BookingStatusValue {
  return value !== undefined && (STATUS_VALUES as string[]).includes(value);
}

export default async function TerminePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status: rawStatus } = await searchParams;
  const status = isStatusValue(rawStatus) ? rawStatus : undefined;

  const all = await listBookings();
  const rows = status ? await listBookings({ status }) : all;
  const offers = await listActiveOffers();

  const counts = STATUS_VALUES.reduce<Record<BookingStatusValue, number>>(
    (acc, s) => {
      acc[s] = all.filter((b) => b.status === s).length;
      return acc;
    },
    { neu: 0, bestaetigt: 0, abgesagt: 0, erledigt: 0 },
  );

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Buchungen</div>
          <h1>Termine &amp; Buchungen</h1>
          <p className="lead">
            Alle Anfragen und bestätigten Termine an einem Ort.
          </p>
        </div>
      </div>

      <nav className="seg" aria-label="Statusfilter">
        <a
          href="/admin/termine"
          className={status === undefined ? 'on' : undefined}
        >
          Alle <span className="cnt">{all.length}</span>
        </a>
        {STATUS_VALUES.map((s) => (
          <a
            key={s}
            href={`/admin/termine?status=${s}`}
            className={status === s ? 'on' : undefined}
          >
            {STATUS_LABEL[s]} <span className="cnt">{counts[s]}</span>
          </a>
        ))}
      </nav>

      <div style={{ marginTop: 18 }}>
        <BookingTable bookings={rows} offers={offers} />
      </div>
    </section>
  );
}

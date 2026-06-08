import { listActiveOffers } from '@/offers/repository';
import { BookingFlow } from '@/components/book/booking-flow';

// Immer frisch rendern: Angebote können sich im Admin ändern, und die Seite
// wird ohnehin selten und interaktiv aufgerufen.
export const dynamic = 'force-dynamic';

export default async function BookPage() {
  const offers = await listActiveOffers();

  if (offers.length === 0) {
    return (
      <div className="card" style={{ width: '100%', maxWidth: 520 }}>
        <div className="card-b" style={{ textAlign: 'center', padding: '40px 28px' }}>
          <h2 className="font-display" style={{ fontSize: 22, marginBottom: 8 }}>
            Aktuell keine Angebote
          </h2>
          <p className="mut" style={{ fontSize: 14 }}>
            Momentan sind keine buchbaren Angebote verfügbar. Bitte schau später
            wieder vorbei oder melde dich direkt bei Sandro.
          </p>
        </div>
      </div>
    );
  }

  return <BookingFlow offers={offers} />;
}

import { listAllOffers } from '@/offers/repository';
import { AngeboteClient } from '@/components/admin/angebote-client';

export default async function AngebotePage() {
  const offers = await listAllOffers();

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Pakete &amp; Preise</div>
          <h1>Angebote &amp; Preise</h1>
          <p className="lead">
            Pakete, Preise und Verfügbarkeit für die Buchungsstrecke verwalten.
          </p>
        </div>
      </div>

      <AngeboteClient offers={offers} />
    </section>
  );
}

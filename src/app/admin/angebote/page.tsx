import { listAllOffers, listActiveOffers } from '@/offers/repository';
import { listDiscounts } from '@/discounts/repository';
import { AngeboteClient } from '@/components/admin/angebote-client';
import { DiscountsClient } from '@/components/admin/discounts-client';

export default async function AngebotePage() {
  const offers = await listAllOffers();
  const activeOffers = await listActiveOffers();
  const codes = await listDiscounts('code');
  const links = await listDiscounts('link');

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

      <DiscountsClient codes={codes} links={links} offers={activeOffers} />
    </section>
  );
}

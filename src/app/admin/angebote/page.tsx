import { listAllOffers, listActiveOffers } from '@/offers/repository';
import { listDiscounts } from '@/discounts/repository';
import { listTravelRules } from '@/travel/repository';
import { AngeboteClient } from '@/components/admin/angebote-client';
import { DiscountsClient } from '@/components/admin/discounts-client';
import { TravelRulesClient } from '@/components/admin/travel-rules-client';

export default async function AngebotePage() {
  const offers = await listAllOffers();
  const activeOffers = await listActiveOffers();
  const codes = await listDiscounts('code');
  const links = await listDiscounts('link');
  const travelRules = await listTravelRules();

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

      <AngeboteClient offers={offers} travelRules={travelRules} />

      <DiscountsClient codes={codes} links={links} offers={activeOffers} />

      <TravelRulesClient rules={travelRules} offers={offers} />
    </section>
  );
}

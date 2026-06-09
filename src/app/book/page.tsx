import { listActiveOffers, getOffer } from '@/offers/repository';
import { getDiscountByToken } from '@/discounts/repository';
import { computeEffectivePrice, validateDiscount } from '@/discounts/logic';
import { BookingFlow, type BookingPrefill } from '@/components/book/booking-flow';

// Immer frisch rendern: Angebote können sich im Admin ändern, und die Seite
// wird ohnehin selten und interaktiv aufgerufen.
export const dynamic = 'force-dynamic';

export default async function BookPage({
  searchParams,
}: {
  // Next 16: searchParams ist ein Promise.
  searchParams: Promise<{ l?: string }>;
}) {
  const offers = await listActiveOffers();
  const { l } = await searchParams;

  // Einmal-Link: gültiges, aktives Token → Angebot vorwählen und Sonderpreis.
  let prefill: BookingPrefill | undefined;
  if (l && l.trim() !== '') {
    const link = await getDiscountByToken(l.trim());
    if (link && link.offerId) {
      const check = validateDiscount(link, { offerId: link.offerId, now: new Date() });
      if (check.ok) {
        const offer = await getOffer(link.offerId);
        if (offer && offer.active) {
          const effectiveRappen = computeEffectivePrice(offer.priceRappen, {
            valueType: link.valueType,
            value: link.value,
          });
          prefill = {
            token: l.trim(),
            offerId: offer.id,
            baseRappen: offer.priceRappen,
            effectiveRappen,
            label: link.label ?? '',
          };
        }
      }
    }
  }

  if (offers.length === 0) {
    return (
      <div className="bookx">
        <div className="bookx-card">
          <div className="bookx-body" style={{ textAlign: 'center', padding: '44px 28px' }}>
            <h2 className="bookx-success-title" style={{ fontSize: 22 }}>
              Aktuell keine Angebote
            </h2>
            <p className="bookx-success-text" style={{ marginTop: 4 }}>
              Momentan sind keine buchbaren Angebote verfügbar. Bitte schau später
              wieder vorbei oder melde dich direkt bei Sandro.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <BookingFlow offers={offers} prefill={prefill} />;
}

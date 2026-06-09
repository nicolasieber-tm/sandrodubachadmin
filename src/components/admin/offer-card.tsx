'use client';

import { useTransition } from 'react';
import { formatPrice } from '@/lib/money';
import { useToast } from '@/components/ui/toast';
import { toggleOfferAction } from '@/offers/actions';
import type { Offer } from '@/db/schema';

interface OfferCardProps {
  offer: Offer;
  onEdit: (offer: Offer) => void;
}

const UNIT_LABEL: Record<Offer['unit'], string> = {
  pauschal: 'Pauschal',
  pro_stunde: 'pro Stunde',
};

export function OfferCard({ offer, onEdit }: OfferCardProps) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleOfferAction(offer.id, !offer.active);
      if ('ok' in result) {
        toast(offer.active ? 'Angebot deaktiviert.' : 'Angebot aktiviert.');
      } else {
        toast(result.error);
      }
    });
  }

  return (
    <article className="offer" style={offer.active ? undefined : { opacity: 0.62 }}>
      <div className="top">
        <div>
          <h3>{offer.name}</h3>
          <div className="meta">
            <span>{offer.durationLabel}</span>
          </div>
        </div>
        <div className="price">
          {formatPrice(offer.priceRappen, offer.unit)}
          <small>{UNIT_LABEL[offer.unit]}</small>
        </div>
      </div>

      {offer.description ? <p className="desc">{offer.description}</p> : <p className="desc" />}

      <div className="foot">
        <label className="toggle-wrap">
          <span className="switch">
            <input
              type="checkbox"
              checked={offer.active}
              disabled={pending}
              onChange={handleToggle}
              aria-label={offer.active ? 'Angebot deaktivieren' : 'Angebot aktivieren'}
            />
            <span className="slider" />
          </span>
          {offer.active ? 'Aktiv' : 'Inaktiv'}
        </label>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onEdit(offer)}
        >
          Bearbeiten
        </button>
      </div>
    </article>
  );
}

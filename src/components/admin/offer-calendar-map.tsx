'use client';

import { useTransition } from 'react';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { formatRappen } from '@/lib/money';
import { initials, avatarGradient } from '@/lib/avatar';
import { setOfferCalendarAction } from '@/offers/actions';
import type { Offer } from '@/db/schema';

const NO_CALENDAR = '';

interface OfferCalendarMapProps {
  offers: Offer[];
  calendarKeys: string[];
}

export function OfferCalendarMap({ offers, calendarKeys }: OfferCalendarMapProps) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function handleChange(offerId: string, value: string) {
    startTransition(async () => {
      await setOfferCalendarAction(offerId, value);
      toast('Zuordnung gespeichert.');
    });
  }

  return (
    <Card style={{ marginTop: 20 }}>
      <CardHeader>
        <div>
          <h3>Angebot → Kalender zuordnen</h3>
          <div className="sub">
            Bestimmt, in welchem Kalender ein Angebot Termine belegt.
          </div>
        </div>
      </CardHeader>

      <CardBody style={{ padding: '8px 22px 18px' }}>
        {offers.map((offer) => (
          <div key={offer.id} className="map-row">
            <div className="map-offer">
              <div
                className="ic"
                style={{ background: avatarGradient(offer.name) }}
                aria-hidden="true"
              >
                {initials(offer.name)}
              </div>
              <div>
                <div className="nm">{offer.name}</div>
                <div className="pr">{formatRappen(offer.priceRappen)}</div>
              </div>
            </div>

            <div className="arrow" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </div>

            <select
              value={offer.calendarKey ?? NO_CALENDAR}
              disabled={pending}
              aria-label={`Kalender für ${offer.name}`}
              onChange={(event) => handleChange(offer.id, event.target.value)}
            >
              <option value={NO_CALENDAR}>— kein —</option>
              {calendarKeys.map((key) => (
                <option key={key} value={key}>
                  {key}
                </option>
              ))}
            </select>
          </div>
        ))}

        <div className="note" style={{ marginTop: 16 }}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          </svg>
          <span>
            Beispiel: «Portrait Studio» nutzt den Kalender «Studio» — ist dort
            ein Termin eingetragen, gilt der Slot auf der Website als belegt
            (greift mit Stufe 3c).
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

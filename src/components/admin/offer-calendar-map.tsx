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
  calendars: { id: string; summary: string; writable: boolean }[];
  writeMode: 'main' | 'per_offer';
}

export function OfferCalendarMap({ offers, calendars, writeMode }: OfferCalendarMapProps) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function handleChange(offerId: string, value: string) {
    startTransition(async () => {
      await setOfferCalendarAction(offerId, value);
      toast('Zuordnung gespeichert.');
    });
  }

  const disabled = pending || writeMode === 'main';

  return (
    <Card style={{ marginTop: 20 }}>
      <CardHeader>
        <div>
          <h3>Angebot → Zielkalender (Schreiben)</h3>
          <div className="sub">
            Bestimmt, in welchen Kalender Buchungen fuer dieses Angebot geschrieben werden.
          </div>
        </div>
      </CardHeader>

      <CardBody style={{ padding: '8px 22px 18px' }}>
        {writeMode === 'main' && (
          <div
            style={{
              padding: '12px 16px',
              borderRadius: 11,
              border: '1px solid var(--line)',
              background: 'var(--bg-tint)',
              fontSize: 13,
              color: 'var(--ink-2)',
              marginBottom: 14,
            }}
          >
            Aktiv im Modus «Pro Angebot». Aktuell schreiben alle Buchungen in den Hauptkalender.
          </div>
        )}

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
              disabled={disabled}
              aria-label={`Zielkalender fuer ${offer.name}`}
              onChange={(event) => handleChange(offer.id, event.target.value)}
            >
              <option value={NO_CALENDAR}>— kein —</option>
              {calendars.map((cal) => (
                <option key={cal.id} value={cal.id}>
                  {cal.summary}
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
            Nur Kalender mit Schreib-Berechtigung sind auswaehlbar. Wirkt nur im
            Modus «Pro Angebot» (oben einstellbar).
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

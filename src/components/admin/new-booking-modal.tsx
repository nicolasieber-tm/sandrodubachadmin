'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { createManualBooking } from '@/bookings/actions';
import { useToast } from '@/components/ui/toast';
import { formatDauer } from '@/lib/duration';
import type { Offer } from '@/db/schema';
import { CustomFieldInputs } from '@/components/custom-field-inputs';

interface NewBookingModalProps {
  offers: Offer[];
  onClose: () => void;
  // Vorbelegung von Datum/Zeit (z. B. im Planer aufgezogener Bereich).
  defaultDate?: string;
  defaultTime?: string;
  defaultEndTime?: string;
}

// 'HH:MM' → Minuten seit Mitternacht (NaN bei leerem/ungültigem Wert).
function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

type ActionState = { ok: true } | { error: string } | null;

// Rappen → CHF-Zahl für die Vorbelegung des Preisfelds.
function rappenToChf(rappen: number): string {
  return String(Math.round(rappen / 100));
}

export function NewBookingModal({
  offers,
  onClose,
  defaultDate,
  defaultTime,
  defaultEndTime,
}: NewBookingModalProps) {
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createManualBooking,
    null,
  );

  const [offerId, setOfferId] = useState(offers[0]?.id ?? '');
  const [priceChf, setPriceChf] = useState(
    offers[0] ? rappenToChf(offers[0].priceRappen) : '',
  );
  // Von/Bis kontrolliert: aus der Bis-Zeit (z. B. im Planer aufgezogen) wird
  // die Gesamtdauer abgeleitet; was über die Angebotsdauer hinausgeht, wird
  // als Zusatzminuten gespeichert.
  const [von, setVon] = useState(defaultTime ?? '');
  const [bis, setBis] = useState(defaultEndTime ?? '');

  // Verhindert mehrfaches Toasten/Schliessen beim selben Erfolg.
  const handledRef = useRef(false);
  useEffect(() => {
    if (state && 'ok' in state && !handledRef.current) {
      handledRef.current = true;
      onClose();
      toast('Buchung angelegt.');
    }
  }, [state, onClose, toast]);

  function handleOfferChange(nextId: string) {
    setOfferId(nextId);
    const offer = offers.find((o) => o.id === nextId);
    if (offer) setPriceChf(rappenToChf(offer.priceRappen));
  }

  const selectedOffer = offers.find((o) => o.id === offerId);

  // Gesamtdauer aus Von/Bis (nur wenn beide gesetzt und Bis nach Von liegt).
  const offerDuration = selectedOffer?.durationMinutes ?? 60;
  const gesamtMin =
    von !== '' && bis !== '' && toMin(bis) > toMin(von) ? toMin(bis) - toMin(von) : null;
  const extraMinutes = gesamtMin !== null ? Math.max(0, gesamtMin - offerDuration) : 0;

  return (
    <div className="overlay">
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <form action={formAction}>
          <div className="modal-h">
            <div>
              <h3>Neue Buchung</h3>
              <div className="meta">Termin manuell erfassen</div>
            </div>
            <button
              type="button"
              className="x"
              aria-label="Schliessen"
              onClick={onClose}
            >
              ×
            </button>
          </div>

          <div className="modal-b">
            <div className="field">
              <label htmlFor="offerId">Angebot</label>
              <select
                id="offerId"
                name="offerId"
                value={offerId}
                onChange={(e) => handleOfferChange(e.target.value)}
                required
              >
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="customerName">Kunde</label>
              <input
                id="customerName"
                name="customerName"
                type="text"
                required
                minLength={2}
              />
            </div>

            <div className="field">
              <label htmlFor="customerEmail">E-Mail</label>
              <input
                id="customerEmail"
                name="customerEmail"
                type="email"
                required
              />
            </div>

            <div className="field">
              <label htmlFor="customerPhone">Telefon</label>
              <input id="customerPhone" name="customerPhone" type="tel" />
            </div>

            <div className="field">
              <label htmlFor="requestedDate">Datum</label>
              <input
                id="requestedDate"
                name="requestedDate"
                type="date"
                required
                defaultValue={defaultDate}
              />
            </div>

            <div className="field-2">
              <div className="field">
                <label htmlFor="requestedTime">Von</label>
                <input
                  id="requestedTime"
                  name="requestedTime"
                  type="time"
                  value={von}
                  onChange={(e) => setVon(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="endTime">Bis (optional)</label>
                <input
                  id="endTime"
                  type="time"
                  value={bis}
                  onChange={(e) => setBis(e.target.value)}
                />
              </div>
            </div>

            {gesamtMin !== null ? (
              <p className="mut" style={{ fontSize: 12.5, marginTop: -6 }}>
                Dauer: {formatDauer(gesamtMin)}
                {extraMinutes > 0
                  ? ` — Angebot ${formatDauer(offerDuration)} + ${extraMinutes} Zusatzminuten`
                  : gesamtMin < offerDuration
                    ? ` — Hinweis: die Angebotsdauer (${formatDauer(offerDuration)}) gilt als Minimum`
                    : ''}
              </p>
            ) : null}
            {/* Über die Angebotsdauer hinausgehende Zeit als Zusatzminuten. */}
            <input type="hidden" name="extraMinutes" value={extraMinutes} />

            <div className="field">
              <label htmlFor="location">Ort</label>
              <input id="location" name="location" type="text" />
            </div>

            <div className="field">
              <label htmlFor="priceChf">Preis (CHF)</label>
              <input
                id="priceChf"
                name="priceChf"
                type="number"
                min={0}
                step={1}
                value={priceChf}
                onChange={(e) => setPriceChf(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="message">Nachricht</label>
              <textarea id="message" name="message" rows={3} />
            </div>

            <CustomFieldInputs
              fields={selectedOffer?.customFields ?? []}
              wrapperClass="field"
            />

            {state && 'error' in state ? (
              <p className="mut" role="alert" style={{ color: 'var(--red, #c0392b)' }}>
                {state.error}
              </p>
            ) : null}
          </div>

          <div className="modal-f">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onClose}
            >
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              Buchung anlegen
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

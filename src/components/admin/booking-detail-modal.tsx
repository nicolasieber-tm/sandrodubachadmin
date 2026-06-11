'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { formatRappen, gesamtpreisRappen } from '@/lib/money';
import { formatAnswerValue } from '@/offers/custom-fields';
import { nextActions, type BookingStatusValue } from '@/bookings/status';
import {
  confirmBooking,
  cancelBooking,
  completeBooking,
  updateBookingDetails,
} from '@/bookings/actions';
import { useToast } from '@/components/ui/toast';
import type { Booking } from '@/db/schema';
import { StatusBadge } from './status-badge';

interface BookingDetailModalProps {
  booking: Booking;
  // Kurzform der Wegkosten-Regel des Angebots (falls zugeordnet) – Hilfe beim
  // manuellen Festsetzen der Wegkosten.
  travelHint?: string;
  onClose: () => void;
}

type ActionResult = { ok: true } | { error: string };
type ActionState = ActionResult | null;

const ACTION_BY_TARGET: Record<
  BookingStatusValue,
  ((id: string) => Promise<ActionResult>) | undefined
> = {
  bestaetigt: confirmBooking,
  abgesagt: cancelBooking,
  erledigt: completeBooking,
  neu: undefined,
};

const BUTTON_CONFIG: Record<
  BookingStatusValue,
  { label: string; className: string }
> = {
  bestaetigt: { label: 'Bestätigen', className: 'btn btn-primary' },
  abgesagt: { label: 'Absagen', className: 'btn btn-danger' },
  erledigt: { label: 'Als erledigt markieren', className: 'btn' },
  neu: { label: '', className: 'btn' },
};

// In den Status 'neu' und 'bestaetigt' darf der Termin verschoben werden;
// bei 'abgesagt'/'erledigt' wird kein Bearbeiten angeboten.
function canEdit(status: BookingStatusValue): boolean {
  return status === 'neu' || status === 'bestaetigt';
}

export function BookingDetailModal({ booking, travelHint, onClose }: BookingDetailModalProps) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);

  // Server-Action ist (id, formData) => ...; id vorab binden, damit das Formular
  // sie als (formData) => ... via useActionState nutzen kann.
  const boundUpdate = updateBookingDetails.bind(null, booking.id);
  const [state, formAction, savePending] = useActionState<ActionState, FormData>(
    async (_prev, formData) => boundUpdate(formData),
    null,
  );

  // Erfolg genau einmal behandeln: Toast + Modal schliessen.
  const handledRef = useRef(false);
  useEffect(() => {
    if (state && 'ok' in state && !handledRef.current) {
      handledRef.current = true;
      onClose();
      toast('Termin aktualisiert.');
    }
  }, [state, onClose, toast]);

  function handleAction(target: BookingStatusValue) {
    const action = ACTION_BY_TARGET[target];
    if (!action) return;
    startTransition(async () => {
      const result = await action(booking.id);
      if ('ok' in result) {
        onClose();
        toast('Status aktualisiert.');
      } else {
        toast(result.error);
      }
    });
  }

  const actions = nextActions(booking.status);
  const editable = canEdit(booking.status);

  return (
    <div className="overlay">
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-h">
          <div>
            <h3>{booking.customerName}</h3>
            <div className="meta">
              {booking.offerNameSnapshot} · {formatRappen(booking.priceRappen)}
            </div>
          </div>
          <button className="x" aria-label="Schliessen" onClick={onClose}>
            ×
          </button>
        </div>

        {editing ? (
          <form action={formAction}>
            <div className="modal-b">
              <div className="field-2">
                <div className="field">
                  <label htmlFor="requestedDate">Datum</label>
                  <input
                    id="requestedDate"
                    name="requestedDate"
                    type="date"
                    defaultValue={booking.requestedDate ?? ''}
                    // Anfragen ohne Termin duerfen (noch) ohne Datum gespeichert
                    // werden; ein bestehendes Datum darf nicht geleert werden.
                    required={booking.requestedDate !== null}
                  />
                </div>
                <div className="field">
                  <label htmlFor="requestedTime">Zeit</label>
                  <input
                    id="requestedTime"
                    name="requestedTime"
                    type="time"
                    defaultValue={booking.requestedTime}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="location">Ort</label>
                <input
                  id="location"
                  name="location"
                  type="text"
                  defaultValue={booking.location ?? ''}
                />
              </div>

              <div className="field-2">
                <div className="field">
                  <label htmlFor="priceChf">Preis (CHF)</label>
                  <input
                    id="priceChf"
                    name="priceChf"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={booking.priceRappen / 100}
                    required
                  />
                </div>
                <div className="field">
                  <label htmlFor="travelCostChf">Wegkosten (CHF)</label>
                  <input
                    id="travelCostChf"
                    name="travelCostChf"
                    type="number"
                    min={0}
                    step="0.01"
                    defaultValue={booking.travelCostRappen / 100}
                  />
                  {travelHint ? <small className="mut">{travelHint}</small> : null}
                </div>
              </div>

              <div className="field">
                <label htmlFor="extraMinutes">Zusatzminuten</label>
                <input
                  id="extraMinutes"
                  name="extraMinutes"
                  type="number"
                  min={0}
                  step={1}
                  defaultValue={booking.extraMinutes}
                />
              </div>

              <div className="det-row" style={{ paddingTop: 4 }}>
                <span className="k">Gesamtbetrag</span>
                <span className="v">
                  {formatRappen(
                    gesamtpreisRappen(booking.priceRappen, booking.travelCostRappen),
                  )}
                  {booking.travelCostRappen > 0
                    ? ` (inkl. ${formatRappen(booking.travelCostRappen)} Wegkosten)`
                    : ''}
                </span>
              </div>

              <div className="field">
                <label
                  htmlFor="notifyCustomer"
                  style={{ display: 'flex', alignItems: 'center', gap: 8 }}
                >
                  <input
                    id="notifyCustomer"
                    name="notifyCustomer"
                    type="checkbox"
                    defaultChecked
                  />
                  Kundin/Kunde per E-Mail informieren
                </label>
              </div>

              {state && 'error' in state ? (
                <p
                  className="mut"
                  role="alert"
                  style={{ color: 'var(--red, #c0392b)' }}
                >
                  {state.error}
                </p>
              ) : null}
            </div>

            <div className="modal-f">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={savePending}
                onClick={() => setEditing(false)}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={savePending}
              >
                Speichern
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="modal-b">
              <div className="det-card">
                <div className="det-row">
                  <span className="k">Termin</span>
                  <span className="v">
                    {booking.requestedDate ?? 'Nach Absprache'}
                    {booking.requestedTime ? ` · ${booking.requestedTime}` : ''}
                  </span>
                </div>
                <div className="det-row">
                  <span className="k">Ort</span>
                  <span className="v">{booking.location || '—'}</span>
                </div>
                <div className="det-row">
                  <span className="k">Angebot</span>
                  <span className="v">{booking.offerNameSnapshot}</span>
                </div>
                <div className="det-row">
                  <span className="k">Preis</span>
                  <span className="v">{formatRappen(booking.priceRappen)}</span>
                </div>
                {booking.travelCostRappen > 0 ? (
                  <div className="det-row">
                    <span className="k">Wegkosten</span>
                    <span className="v">{formatRappen(booking.travelCostRappen)}</span>
                  </div>
                ) : null}
                {booking.travelCostRappen > 0 ? (
                  <div className="det-row">
                    <span className="k">Gesamtbetrag</span>
                    <span className="v">
                      {formatRappen(
                        gesamtpreisRappen(booking.priceRappen, booking.travelCostRappen),
                      )}
                    </span>
                  </div>
                ) : null}
                {booking.extraMinutes > 0 ? (
                  <div className="det-row">
                    <span className="k">Zusatzminuten</span>
                    <span className="v">{booking.extraMinutes} Min.</span>
                  </div>
                ) : null}
                <div className="det-row">
                  <span className="k">Quelle</span>
                  <span className="v">{booking.source}</span>
                </div>
                <div className="det-row">
                  <span className="k">Status</span>
                  <span className="v">
                    <StatusBadge status={booking.status} />
                  </span>
                </div>
              </div>

              <div className="det-contact">
                <a className="btn" href={`mailto:${booking.customerEmail}`}>
                  E-Mail
                </a>
                {booking.customerPhone ? (
                  <a className="btn" href={`tel:${booking.customerPhone}`}>
                    Anrufen
                  </a>
                ) : null}
              </div>

              {booking.message ? (
                <div className="msg-quote">
                  <div className="lbl">Nachricht</div>
                  {booking.message}
                </div>
              ) : null}

              {booking.customFields.length > 0 ? (
                <div className="det-card" style={{ marginTop: 12 }}>
                  {booking.customFields.map((a) => (
                    <div className="det-row" key={a.key}>
                      <span className="k">{a.label}</span>
                      <span className="v">{formatAnswerValue(a)}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {editable || actions.length > 0 ? (
              <div className="modal-f">
                {editable ? (
                  <button
                    className="btn"
                    disabled={pending}
                    onClick={() => setEditing(true)}
                  >
                    Bearbeiten
                  </button>
                ) : null}
                {actions.map((target) => {
                  const cfg = BUTTON_CONFIG[target];
                  return (
                    <button
                      key={target}
                      className={cfg.className}
                      disabled={pending}
                      onClick={() => handleAction(target)}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

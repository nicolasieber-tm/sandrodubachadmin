'use client';

import { useTransition } from 'react';
import { formatRappen } from '@/lib/money';
import { formatAnswerValue } from '@/offers/custom-fields';
import { nextActions, type BookingStatusValue } from '@/bookings/status';
import {
  confirmBooking,
  cancelBooking,
  completeBooking,
} from '@/bookings/actions';
import { useToast } from '@/components/ui/toast';
import type { Booking } from '@/db/schema';
import { StatusBadge } from './status-badge';

interface BookingDetailModalProps {
  booking: Booking;
  onClose: () => void;
}

type ActionResult = { ok: true } | { error: string };

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

export function BookingDetailModal({ booking, onClose }: BookingDetailModalProps) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

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

        <div className="modal-b">
          <div className="det-card">
            <div className="det-row">
              <span className="k">Termin</span>
              <span className="v">
                {booking.requestedDate}
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

        {actions.length > 0 ? (
          <div className="modal-f">
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
      </div>
    </div>
  );
}

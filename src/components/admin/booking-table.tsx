'use client';

import { useState } from 'react';
import { formatRappen } from '@/lib/money';
import { initials, avatarGradient } from '@/lib/avatar';
import type { Booking, Offer } from '@/db/schema';
import { StatusBadge } from './status-badge';
import { BookingDetailModal } from './booking-detail-modal';
import { NewBookingModal } from './new-booking-modal';

interface BookingTableProps {
  bookings: Booking[];
  offers: Offer[];
}

export function BookingTable({ bookings, offers }: BookingTableProps) {
  const [selected, setSelected] = useState<Booking | null>(null);
  const [showNew, setShowNew] = useState(false);

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 16,
        }}
      >
        <button
          className="btn btn-primary"
          onClick={() => setShowNew(true)}
        >
          + Neue Buchung
        </button>
      </div>

      <div className="card">
        {bookings.length === 0 ? (
          <div className="empty">
            <div className="ic" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <h4>Keine Buchungen</h4>
            <p>Für diesen Filter gibt es aktuell keine Einträge.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Datum/Zeit</th>
                  <th>Kunde</th>
                  <th>Angebot</th>
                  <th>Ort</th>
                  <th>Preis</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr
                    key={b.id}
                    className="clickable"
                    onClick={() => setSelected(b)}
                  >
                    <td>
                      <div className="row-when">
                        <strong>{b.requestedDate}</strong>
                        {b.requestedTime ? (
                          <div className="mut">{b.requestedTime}</div>
                        ) : null}
                      </div>
                    </td>
                    <td>
                      <div className="cust">
                        <span
                          className="ava sm"
                          style={{ background: avatarGradient(b.customerName) }}
                          aria-hidden="true"
                        >
                          {initials(b.customerName)}
                        </span>
                        {b.customerName}
                      </div>
                    </td>
                    <td>{b.offerNameSnapshot}</td>
                    <td>{b.location || '—'}</td>
                    <td>
                      <span className="price-cell">
                        {formatRappen(b.priceRappen)}
                      </span>
                    </td>
                    <td>
                      <StatusBadge status={b.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selected ? (
        <BookingDetailModal
          booking={selected}
          onClose={() => setSelected(null)}
        />
      ) : null}

      {showNew ? (
        <NewBookingModal offers={offers} onClose={() => setShowNew(false)} />
      ) : null}
    </>
  );
}

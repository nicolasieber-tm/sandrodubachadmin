'use client';

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { formatRappen } from '@/lib/money';
import { dayMonth } from '@/lib/date';
import { initials, avatarGradient } from '@/lib/avatar';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import type { Booking } from '@/db/schema';
import { StatusBadge } from './status-badge';
import { BookingDetailModal } from './booking-detail-modal';

interface DashboardBookingListsProps {
  naechsteTermine: Booking[];
  neueListe: Booking[];
  // Wegkosten-Hinweis (Kurzform der Regel) pro Angebots-ID für das Termindetail.
  travelHints: Record<string, string>;
}

// Macht eine Dashboard-Zeile anklickbar (öffnet das Termindetail). Bewusst als
// role="button" mit Tastatur-Support, damit die bestehende .row-item-Optik
// erhalten bleibt (eine echte <button> würde die Flex-/Border-Styles brechen).
function RowButton({ onOpen, children }: { onOpen: () => void; children: ReactNode }) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen();
    }
  }
  return (
    <div
      className="row-item row-link"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>
  );
}

export function DashboardBookingLists({
  naechsteTermine,
  neueListe,
  travelHints,
}: DashboardBookingListsProps) {
  const [selected, setSelected] = useState<Booking | null>(null);

  return (
    <>
      <div className="grid-2">
        <Card>
          <CardHeader>
            <h3>Nächste Termine</h3>
            <a className="btn btn-ghost btn-sm" href="/admin/termine">
              Alle ansehen
            </a>
          </CardHeader>
          <CardBody className="flush">
            {naechsteTermine.length === 0 ? (
              <div className="empty">
                <h4>Keine Termine</h4>
                <p>Aktuell sind keine kommenden Termine geplant.</p>
              </div>
            ) : (
              naechsteTermine.map((b) => {
                // naechsteTermine enthaelt nie Anfragen ohne Datum (Query
                // filtert auf requestedDate >= heute); '' nur fuer TypeScript.
                const { day, month } = dayMonth(b.requestedDate ?? '');
                return (
                  <RowButton key={b.id} onOpen={() => setSelected(b)}>
                    <div className="date-chip">
                      <span className="d">{day}</span>
                      <span className="m">{month}</span>
                    </div>
                    <div className="grow">
                      <div className="t">{b.customerName}</div>
                      <div className="s">
                        {b.offerNameSnapshot} · {b.requestedTime}
                      </div>
                    </div>
                    <StatusBadge status={b.status} />
                  </RowButton>
                );
              })
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h3>Neue Anfragen</h3>
            <span className="badge-status st-new">
              <span className="pip" />
              {neueListe.length} offen
            </span>
          </CardHeader>
          <CardBody className="flush">
            {neueListe.length === 0 ? (
              <div className="empty">
                <h4>Keine neuen Anfragen</h4>
                <p>Sobald eine Anfrage eingeht, erscheint sie hier.</p>
              </div>
            ) : (
              neueListe.map((b) => (
                <RowButton key={b.id} onOpen={() => setSelected(b)}>
                  <span
                    className="ava"
                    style={{ background: avatarGradient(b.customerName) }}
                    aria-hidden="true"
                  >
                    {initials(b.customerName)}
                  </span>
                  <div className="grow">
                    <div className="t">{b.customerName}</div>
                    <div className="s">{b.offerNameSnapshot}</div>
                  </div>
                  <span
                    style={{
                      fontWeight: 600,
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {formatRappen(b.priceRappen)}
                  </span>
                </RowButton>
              ))
            )}
          </CardBody>
        </Card>
      </div>

      {selected ? (
        <BookingDetailModal
          booking={selected}
          travelHint={selected.offerId ? travelHints[selected.offerId] : undefined}
          onClose={() => setSelected(null)}
        />
      ) : null}
    </>
  );
}

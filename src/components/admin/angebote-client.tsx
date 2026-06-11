'use client';

import { useState } from 'react';
import type { Offer, TravelRule } from '@/db/schema';
import { OfferCard } from './offer-card';
import { OfferFormModal } from './offer-form-modal';

interface AngeboteClientProps {
  offers: Offer[];
  travelRules: TravelRule[];
}

export function AngeboteClient({ offers, travelRules }: AngeboteClientProps) {
  const [editing, setEditing] = useState<Offer | null>(null);
  const [creating, setCreating] = useState(false);

  function closeModal() {
    setEditing(null);
    setCreating(false);
  }

  return (
    <>
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginBottom: 18,
        }}
      >
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          + Neues Angebot
        </button>
      </div>

      {offers.length === 0 ? (
        <div className="card">
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
                <path d="M20 7 12 3 4 7v10l8 4 8-4V7Z" />
                <path d="m4 7 8 4 8-4M12 11v10" />
              </svg>
            </div>
            <h4>Noch keine Angebote</h4>
            <p>Lege dein erstes Paket mit Preis und Dauer an.</p>
          </div>
        </div>
      ) : (
        <div className="offers">
          {offers.map((offer) => (
            <OfferCard key={offer.id} offer={offer} onEdit={setEditing} />
          ))}
        </div>
      )}

      {editing || creating ? (
        <OfferFormModal
          offer={editing ?? undefined}
          travelRules={travelRules}
          onClose={closeModal}
        />
      ) : null}
    </>
  );
}

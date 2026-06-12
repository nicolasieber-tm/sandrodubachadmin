'use client';

import { useCallback, useState } from 'react';
import { OfferMailOverrides } from './offer-mail-overrides';

// Zeile der server-seitig vorbereiteten Angebots-Auswahl (aktive zuerst
// sortiert, overrideCount aus EINER gruppierten Query statt N Requests).
export interface OfferMailRow {
  id: string;
  name: string;
  active: boolean;
  overrideCount: number;
}

interface OfferMailsSectionProps {
  offers: OfferMailRow[];
}

// Sektion «Angebots-E-Mails» im Tab «E-Mails»: Angebots-Auswahl als Chips
// (inaktive markiert, Badge = Anzahl angepasster Mails), darunter fuer das
// gewaehlte Angebot dieselben Override-Zeilen wie im Angebots-Modal –
// wiederverwendete OfferMailOverrides-Komponente, eingebettet (ohne
// Aufklapp-Gate, da auf der Seite bereits sichtbar).
export function OfferMailsSection({ offers }: OfferMailsSectionProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Live nachgefuehrte Badge-Anzahlen (Speichern/Zuruecksetzen im UI aendert
  // sie, ohne dass die Seite neu laden muss). Start: Server-Werte.
  const [counts, setCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(offers.map((o) => [o.id, o.overrideCount])),
  );

  // Stabile Identitaet + Bail-out bei gleicher Anzahl: verhindert eine
  // Render-Schleife mit dem Melde-Effekt in OfferMailOverrides.
  const handleCountChange = useCallback((offerId: string, count: number) => {
    setCounts((prev) => (prev[offerId] === count ? prev : { ...prev, [offerId]: count }));
  }, []);

  return (
    <div className="card" style={{ marginTop: 22 }}>
      <div className="card-h">
        <h3>Angebots-E-Mails</h3>
        <div className="sub">
          Eigene Mail-Texte für einzelne Angebote – sie überschreiben die
          allgemeinen Vorlagen oben. Auch im Angebots-Modal bearbeitbar.
        </div>
      </div>
      <div className="card-b">
        {offers.length === 0 ? (
          <p className="mut" style={{ fontSize: 13.5 }}>
            Noch keine Angebote vorhanden – lege zuerst unter «Angebote &amp;
            Preise» eines an.
          </p>
        ) : (
          <>
            {/* Angebots-Auswahl: Chips, aktive zuerst (Server-Sortierung). */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {offers.map((o) => {
                const gewaehlt = o.id === selectedId;
                const anzahl = counts[o.id] ?? 0;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => setSelectedId(gewaehlt ? null : o.id)}
                    aria-pressed={gewaehlt}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 7,
                      border: gewaehlt
                        ? '1px solid var(--accent-line)'
                        : '1px solid var(--line-strong)',
                      background: gewaehlt ? 'var(--accent-soft)' : 'var(--surface-2)',
                      color: gewaehlt ? 'var(--accent-ink)' : 'var(--ink-2)',
                      fontWeight: gewaehlt ? 600 : 500,
                      borderRadius: 999,
                      padding: '6px 13px',
                      fontSize: 13,
                      fontFamily: 'inherit',
                      cursor: 'pointer',
                    }}
                  >
                    {o.name}
                    {!o.active ? (
                      <span style={{ fontSize: 11, fontWeight: 500, opacity: 0.7 }}>
                        inaktiv
                      </span>
                    ) : null}
                    {anzahl > 0 ? (
                      // Badge: Anzahl angepasster Mails dieses Angebots.
                      <span
                        title={`${anzahl} angepasste Mail${anzahl === 1 ? '' : 's'}`}
                        style={{
                          background: 'var(--accent)',
                          color: '#fff',
                          borderRadius: 999,
                          padding: '1px 7px',
                          fontSize: 11,
                          fontWeight: 600,
                          lineHeight: '16px',
                        }}
                      >
                        {anzahl}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>

            {selectedId ? (
              // key erzwingt einen Remount beim Angebotswechsel (frischer
              // Lade-/Entwurfszustand in den Override-Zeilen).
              <div style={{ marginTop: 18 }}>
                <OfferMailOverrides
                  key={selectedId}
                  offerId={selectedId}
                  embedded
                  onOverrideCountChange={(count) => handleCountChange(selectedId, count)}
                />
              </div>
            ) : (
              <p className="mut" style={{ fontSize: 12.5, marginTop: 14, marginBottom: 0 }}>
                Wähle ein Angebot, um dessen E-Mail-Texte anzupassen.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

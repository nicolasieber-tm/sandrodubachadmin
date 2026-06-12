'use client';

import { useState, useTransition } from 'react';
import { useToast } from '@/components/ui/toast';
import {
  getOfferConfirmedTemplateAction,
  saveOfferConfirmedTemplateAction,
  deleteOfferConfirmedTemplateAction,
} from '@/notify/actions';
import { renderTemplate, TEMPLATE_PLACEHOLDERS } from '@/notify/template';
import { PREVIEW_SAMPLE } from '@/notify/preview-sample';

interface OfferConfirmedMailProps {
  // Nur im Bearbeiten-Modus verfuegbar: ein Override braucht eine gespeicherte
  // Angebots-ID (FK). Beim Neu-Anlegen wird die Sektion nicht gerendert.
  offerId: string;
}

// Eigene Bestaetigungs-Mail pro Angebot. Toggle aktiviert den Override; beim
// Aktivieren wird die globale Vorlage als Vorbefuellung geladen. Speichern legt
// die angebotsspezifische Zeile an/aktualisiert sie; Deaktivieren loescht sie.
//
// Hinweis: Bewusst NICHT Teil des Offer-<form>: Diese Sektion speichert ueber
// eigene Server-Actions (separat vom Angebots-Speichern), damit sie auch ohne
// Aenderungen am restlichen Formular wirkt und das Offer-Schema unberuehrt bleibt.
export function OfferConfirmedMail({ offerId }: OfferConfirmedMailProps) {
  const { toast } = useToast();
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [loadPending, startLoad] = useTransition();
  const [savePending, startSave] = useTransition();

  // Lazy: erst beim Aufklappen den aktuellen Stand laden.
  function ensureLoaded() {
    if (loaded || loadPending) return;
    startLoad(async () => {
      const res = await getOfferConfirmedTemplateAction(offerId);
      setActive(res.hasOverride);
      setSubject(res.subject);
      setBody(res.body);
      setLoaded(true);
    });
  }

  function handleToggle(next: boolean) {
    setActive(next);
    if (!next) {
      // Override loeschen (zurueck auf globale Bestaetigungs-Vorlage).
      startSave(async () => {
        const res = await deleteOfferConfirmedTemplateAction(offerId);
        toast('ok' in res ? 'Eigene Bestätigungs-Mail entfernt.' : res.error);
      });
    }
  }

  function handleSave() {
    startSave(async () => {
      const res = await saveOfferConfirmedTemplateAction(offerId, subject, body);
      toast('ok' in res ? 'Bestätigungs-Mail gespeichert.' : res.error);
    });
  }

  return (
    <details
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open) ensureLoaded();
      }}
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--r)',
        padding: '0 14px',
        marginBottom: 16,
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          padding: '13px 0',
          fontWeight: 600,
          fontSize: 13,
          color: 'var(--ink-2)',
        }}
      >
        Eigene Bestätigungs-Mail
      </summary>

      <div style={{ paddingBottom: 14 }}>
        {loadPending && !loaded ? (
          <p className="mut" style={{ fontSize: 12.5 }}>Lädt…</p>
        ) : (
          <>
            <label className="toggle-wrap" style={{ marginBottom: 12 }}>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(e) => handleToggle(e.target.checked)}
                />
                <span className="slider" />
              </span>
              Für dieses Angebot eine eigene Bestätigungs-Mail verwenden
            </label>

            {active ? (
              <>
                <div className="field">
                  <label>Betreff</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label>Text</label>
                  <textarea
                    rows={9}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    style={{ fontFamily: 'inherit' }}
                  />
                </div>

                <div style={{ marginBottom: 12 }}>
                  <div
                    className="mut"
                    style={{ fontSize: 11, fontWeight: 600, marginBottom: 7 }}
                  >
                    Platzhalter
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {TEMPLATE_PLACEHOLDERS.map((p) => (
                      <span
                        key={p.token}
                        title={p.beschreibung}
                        style={{
                          border: '1px solid var(--line-strong)',
                          background: 'var(--surface-2)',
                          color: 'var(--ink-2)',
                          borderRadius: 999,
                          padding: '3px 9px',
                          fontSize: 11.5,
                        }}
                      >
                        {p.token}
                      </span>
                    ))}
                  </div>
                </div>

                <div
                  style={{
                    padding: 12,
                    background: 'var(--accent-soft)',
                    border: '1px solid var(--accent-line)',
                    borderRadius: 'var(--r)',
                    marginBottom: 12,
                  }}
                >
                  <div
                    className="mut"
                    style={{ fontSize: 11, fontWeight: 600, marginBottom: 6 }}
                  >
                    Vorschau
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 5 }}>
                    {renderTemplate(subject, PREVIEW_SAMPLE)}
                  </div>
                  <pre
                    style={{
                      whiteSpace: 'pre-wrap',
                      fontFamily: 'inherit',
                      fontSize: 12.5,
                      margin: 0,
                      color: 'var(--ink-2)',
                    }}
                  >
                    {renderTemplate(body, PREVIEW_SAMPLE)}
                  </pre>
                </div>

                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleSave}
                  disabled={savePending}
                >
                  Bestätigungs-Mail speichern
                </button>
              </>
            ) : (
              <p className="mut" style={{ fontSize: 12.5 }}>
                Es wird die allgemeine Terminbestätigung verwendet.
              </p>
            )}
          </>
        )}
      </div>
    </details>
  );
}

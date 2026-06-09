'use client';

import { useTransition } from 'react';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { updateBusyCalendarsAction, updateWriteModeAction } from '@/google/actions';

interface Props {
  calendars: { id: string; summary: string; primary: boolean; writable: boolean }[];
  busyCalendarIds: string[];
  writeMode: 'main' | 'per_offer';
}

export function GoogleCalendarSettings({ calendars, busyCalendarIds, writeMode }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function toggleBusy(id: string, on: boolean) {
    const next = on
      ? [...busyCalendarIds, id]
      : busyCalendarIds.filter((x) => x !== id);
    startTransition(async () => {
      await updateBusyCalendarsAction(next);
      toast('Belegungs-Auswahl gespeichert.');
    });
  }

  function setMode(mode: 'main' | 'per_offer') {
    startTransition(async () => {
      await updateWriteModeAction(mode);
      toast('Schreib-Modus gespeichert.');
    });
  }

  if (calendars.length === 0) {
    return (
      <Card style={{ marginTop: 20 }}>
        <CardHeader>
          <div>
            <h3>Google-Kalender-Einstellungen</h3>
            <div className="sub">Belegung und Schreib-Ziel konfigurieren.</div>
          </div>
        </CardHeader>
        <CardBody style={{ padding: '8px 22px 18px' }}>
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              border: '1px solid var(--line)',
              background: 'var(--bg-tint)',
              fontSize: 13,
              color: 'var(--ink-2)',
            }}
          >
            Keine Kalender geladen (Google nicht verbunden oder Abruf fehlgeschlagen).
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <Card style={{ marginTop: 20 }}>
      <CardHeader>
        <div>
          <h3>Google-Kalender-Einstellungen</h3>
          <div className="sub">Belegung und Schreib-Ziel konfigurieren.</div>
        </div>
      </CardHeader>

      <CardBody style={{ padding: '8px 22px 18px' }}>
        {/* --- Belegungs-Auswahl --- */}
        <div className="gcal-section">
          <div className="gcal-section-label">Belegung beruecksichtigen aus</div>
          <div className="gcal-cal-list">
            {calendars.map((cal) => {
              const checked = busyCalendarIds.includes(cal.id);
              return (
                <label key={cal.id} className={`gcal-cal-row${pending ? ' gcal-disabled' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={pending}
                    onChange={(e) => toggleBusy(cal.id, e.target.checked)}
                  />
                  <span className="gcal-cal-name">{cal.summary}</span>
                  {cal.primary && (
                    <span className="badge-status st-conf" style={{ fontSize: 11, padding: '2px 8px' }}>
                      Hauptkalender
                    </span>
                  )}
                  {!cal.writable && (
                    <span className="badge-status st-done" style={{ fontSize: 11, padding: '2px 8px' }}>
                      nur Lesen
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        </div>

        {/* --- Schreib-Modus --- */}
        <div className="gcal-section" style={{ marginTop: 20 }}>
          <div className="gcal-section-label">Buchungen schreiben in</div>
          <div style={{ marginTop: 8 }}>
            <div className="seg">
              <button
                type="button"
                className={writeMode === 'main' ? 'on' : ''}
                disabled={pending}
                onClick={() => setMode('main')}
              >
                Hauptkalender
              </button>
              <button
                type="button"
                className={writeMode === 'per_offer' ? 'on' : ''}
                disabled={pending}
                onClick={() => setMode('per_offer')}
              >
                Pro Angebot
              </button>
            </div>
          </div>
          {writeMode === 'per_offer' && (
            <div className="note" style={{ marginTop: 12 }}>
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
              <span>Lege den Zielkalender pro Angebot unten fest.</span>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

'use client';

import { useEffect, useTransition } from 'react';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { disconnectGoogleAction } from '@/google/actions';
import type { CalendarConnection } from '@/db/schema';

// Anzeige-Label und Logo-Farbe je Anbieter.
const PROVIDER_LABEL: Record<CalendarConnection['provider'], string> = {
  google: 'Google Kalender',
  apple: 'Apple Kalender',
  outlook: 'Outlook Kalender',
};

const PROVIDER_COLOR: Record<CalendarConnection['provider'], string> = {
  google: '#4285f4',
  apple: '#1d1d1f',
  outlook: '#0a6ed1',
};

type GoogleStatus = 'verbunden' | 'fehler' | 'nichtkonfiguriert';

interface CalendarConnectionsProps {
  /** Bestehende Demo-Verbindungen (Sub-Kalender-Liste). */
  connections: CalendarConnection[];
  /** True, wenn die Google-OAuth-Env-Variablen gesetzt sind. */
  googleConfigured: boolean;
  /** Account-Label der aktiven Google-Verbindung, sonst null. */
  googleAccountLabel: string | null;
  /** ?google-Status aus dem OAuth-Redirect, sonst null. */
  googleStatus: GoogleStatus | null;
}

export function CalendarConnections({
  connections,
  googleConfigured,
  googleAccountLabel,
  googleStatus,
}: CalendarConnectionsProps) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  // ?google-Status nach dem OAuth-Redirect per Toast quittieren.
  useEffect(() => {
    if (googleStatus === 'verbunden') {
      toast('Google-Kalender verbunden.');
    } else if (googleStatus === 'fehler') {
      toast('Verbindung fehlgeschlagen.');
    }
    // 'nichtkonfiguriert' bewusst ohne Toast – die Hinweiskarte erklaert es.
  }, [googleStatus, toast]);

  function handleAdd() {
    toast('Verbindung über OAuth folgt in Stufe 4.');
  }

  function handleDisconnect() {
    startTransition(async () => {
      const result = await disconnectGoogleAction();
      if ('ok' in result) {
        toast('Google-Kalender getrennt.');
      } else {
        toast(result.error);
      }
    });
  }

  return (
    <Card style={{ marginTop: 20 }}>
      <CardHeader>
        <div>
          <h3>Verbundene Kalender</h3>
          <div className="sub">Externe Kalender für die Termin-Synchronisation.</div>
        </div>
        <button type="button" className="btn btn-sm btn-primary" onClick={handleAdd}>
          Kalender hinzufügen
        </button>
      </CardHeader>

      <CardBody style={{ padding: '8px 22px 18px' }}>
        {/* --- Google-Kalender --- */}
        {!googleConfigured ? (
          <div
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              border: '1px solid var(--line)',
              background: 'var(--bg-tint)',
              marginBottom: 14,
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Google-Anbindung noch nicht konfiguriert
            </div>
            <div style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              Die Einrichtung der Google-Kalender-Verbindung ist in der Datei
              docs/google-setup.md Schritt für Schritt beschrieben. Sobald die
              Zugangsdaten in der Umgebung hinterlegt sind, erscheint hier der
              Verbinden-Button.
            </div>
          </div>
        ) : googleAccountLabel ? (
          <div className="conn-list" style={{ marginBottom: 14 }}>
            <div className="conn is-on">
              <div
                className="logo"
                style={{
                  background: PROVIDER_COLOR.google,
                  color: '#fff',
                  fontWeight: 700,
                  fontSize: 16,
                }}
                aria-hidden="true"
              >
                G
              </div>

              <div className="grow">
                <div className="t">{PROVIDER_LABEL.google}</div>
                <div className="s">{googleAccountLabel}</div>
              </div>

              <div className="actions" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="badge-status st-conf">
                  <span className="pip" />
                  Verbunden
                </span>
                <button
                  type="button"
                  className="btn btn-sm btn-ghost"
                  onClick={handleDisconnect}
                  disabled={pending}
                >
                  Trennen
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            <a className="btn btn-primary" href="/api/google/connect">
              Google-Kalender verbinden
            </a>
          </div>
        )}

        {/* --- Bestehende Demo-Verbindungen --- */}
        {connections.length === 0 ? (
          <div className="empty">
            <div className="ic" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
              </svg>
            </div>
            <h4>Noch kein Kalender verbunden</h4>
            <p>
              Verbinde einen externen Kalender, um Termine automatisch
              abzugleichen. Die Verbindung erfolgt in Stufe 4 über OAuth.
            </p>
          </div>
        ) : (
          <div className="conn-list">
            {connections.map((connection) => {
              const isConnected = connection.status === 'verbunden';
              return (
                <div
                  key={connection.id}
                  className={`conn ${isConnected ? 'is-on' : ''}`}
                >
                  <div
                    className="logo"
                    style={{
                      background: PROVIDER_COLOR[connection.provider],
                      color: '#fff',
                      fontWeight: 700,
                      fontSize: 16,
                    }}
                    aria-hidden="true"
                  >
                    {PROVIDER_LABEL[connection.provider].charAt(0)}
                  </div>

                  <div className="grow">
                    <div className="t">{PROVIDER_LABEL[connection.provider]}</div>
                    <div className="s">{connection.accountLabel}</div>
                    {connection.subCalendars.length > 0 ? (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 6,
                          marginTop: 7,
                        }}
                      >
                        {connection.subCalendars.map((sub) => (
                          <span
                            key={sub}
                            style={{
                              fontSize: 11.5,
                              padding: '2px 8px',
                              borderRadius: 999,
                              background: 'var(--bg-tint)',
                              border: '1px solid var(--line)',
                              color: 'var(--ink-2)',
                            }}
                          >
                            {sub}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>

                  <div className="actions">
                    <span className="badge-status st-conf">
                      <span className="pip" />
                      {connection.status}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

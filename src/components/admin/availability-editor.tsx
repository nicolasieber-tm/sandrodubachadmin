'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { saveAvailabilityAction } from '@/availability/actions';
import type { Availability } from '@/db/schema';

// Wochentag-Konvention: 0=Montag … 6=Sonntag (Reihenfolge = Anzeige).
const WEEKDAY_LABELS = [
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
  'Sonntag',
];

type ActionState = { ok: true } | { error: string } | null;

// Lokaler UI-Zustand pro Wochentag.
type RowState = {
  enabled: boolean;
  startTime: string;
  endTime: string;
};

interface AvailabilityEditorProps {
  initial: Availability[];
}

export function AvailabilityEditor({ initial }: AvailabilityEditorProps) {
  const { toast } = useToast();

  const [rows, setRows] = useState<RowState[]>(() =>
    initial.map((row) => ({
      enabled: row.enabled,
      startTime: row.startTime,
      endTime: row.endTime,
    })),
  );

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveAvailabilityAction,
    null,
  );

  // Erfolg genau einmal toasten.
  const handledRef = useRef<ActionState>(null);
  useEffect(() => {
    if (state && state !== handledRef.current && 'ok' in state) {
      handledRef.current = state;
      toast('Verfügbarkeit gespeichert.');
    }
  }, [state, toast]);

  function setRow(index: number, patch: Partial<RowState>) {
    setRows((prev) =>
      prev.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  return (
    <Card style={{ marginTop: 20 }}>
      <form action={formAction}>
        <CardHeader>
          <div>
            <h3>Verfügbarkeit / Öffnungszeiten</h3>
            <div className="sub">Wann Kund:innen Termine buchen können.</div>
          </div>
          <button
            type="submit"
            className="btn btn-sm btn-primary"
            disabled={pending}
          >
            Speichern
          </button>
        </CardHeader>

        <CardBody style={{ padding: '8px 22px 16px' }}>
          {rows.map((row, weekday) => (
            <div
              key={weekday}
              className={`avail-row ${row.enabled ? '' : 'off'}`}
            >
              <div className="day">{WEEKDAY_LABELS[weekday]}</div>

              <label className="switch" aria-label={`${WEEKDAY_LABELS[weekday]} aktiv`}>
                <input
                  type="checkbox"
                  name={`enabled-${weekday}`}
                  checked={row.enabled}
                  onChange={(e) => setRow(weekday, { enabled: e.target.checked })}
                />
                <span className="slider" />
              </label>

              <div className="avail-times">
                {/* Deaktivierte Felder werden nicht gesendet; darum spiegeln
                    versteckte Felder die Zeiten, damit die Action immer
                    gültige Werte erhält. */}
                {row.enabled ? null : (
                  <>
                    <input
                      type="hidden"
                      name={`start-${weekday}`}
                      value={row.startTime}
                    />
                    <input
                      type="hidden"
                      name={`end-${weekday}`}
                      value={row.endTime}
                    />
                  </>
                )}
                <input
                  type="time"
                  name={row.enabled ? `start-${weekday}` : undefined}
                  value={row.startTime}
                  onChange={(e) => setRow(weekday, { startTime: e.target.value })}
                  disabled={!row.enabled}
                />
                <span>bis</span>
                <input
                  type="time"
                  name={row.enabled ? `end-${weekday}` : undefined}
                  value={row.endTime}
                  onChange={(e) => setRow(weekday, { endTime: e.target.value })}
                  disabled={!row.enabled}
                />
              </div>
            </div>
          ))}

          {state && 'error' in state ? (
            <p
              className="mut"
              role="alert"
              style={{ color: 'var(--red, #c0392b)', marginTop: 12 }}
            >
              {state.error}
            </p>
          ) : null}
        </CardBody>
      </form>
    </Card>
  );
}

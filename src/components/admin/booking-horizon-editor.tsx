'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { saveBookingHorizonAction } from '@/availability/booking-settings-actions';

type ActionState = { ok: true } | { error: string } | null;

export function BookingHorizonEditor({ initialMonths }: { initialMonths: number | null }) {
  const { toast } = useToast();
  const [months, setMonths] = useState<string>(
    initialMonths != null ? String(initialMonths) : '',
  );

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveBookingHorizonAction,
    null,
  );

  // Erfolg genau einmal toasten.
  const handledRef = useRef<ActionState>(null);
  useEffect(() => {
    if (state && state !== handledRef.current && 'ok' in state) {
      handledRef.current = state;
      toast('Buchungshorizont gespeichert.');
    }
  }, [state, toast]);

  return (
    <Card style={{ marginTop: 20 }}>
      <form action={formAction}>
        <CardHeader>
          <div>
            <h3>Buchungshorizont</h3>
            <div className="sub">Wie weit im Voraus können Kund:innen Termine buchen?</div>
          </div>
          <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
            Speichern
          </button>
        </CardHeader>

        <CardBody style={{ padding: '8px 22px 16px' }}>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
          >
            <span>Buchbar für die nächsten</span>
            <input
              type="number"
              name="months"
              min={0}
              max={36}
              step={1}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              placeholder="z. B. 2"
              style={{ width: 88 }}
            />
            <span>Monate</span>
          </label>
          <p className="mut" style={{ marginTop: 10 }}>
            Leer oder 0 = unbegrenzt. Beispiel: 2 = nur die nächsten 2 Monate buchbar.
          </p>

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

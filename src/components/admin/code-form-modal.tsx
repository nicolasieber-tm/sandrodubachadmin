'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { createCodeAction } from '@/discounts/actions';
import type { Offer } from '@/db/schema';

interface CodeFormModalProps {
  offers: Offer[];
  onClose: () => void;
}

type ActionState = { ok: true } | { error: string } | null;

export function CodeFormModal({ offers, onClose }: CodeFormModalProps) {
  const { toast } = useToast();
  const [valueType, setValueType] = useState<'percent' | 'fixed'>('percent');

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createCodeAction,
    null,
  );

  const handledRef = useRef(false);
  useEffect(() => {
    if (state && 'ok' in state && !handledRef.current) {
      handledRef.current = true;
      onClose();
      toast('Rabatt-Code angelegt.');
    }
  }, [state, onClose, toast]);

  return (
    <div className="overlay">
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <form action={formAction}>
          <div className="modal-h">
            <div>
              <h3>Neuer Rabatt-Code</h3>
              <div className="meta">Gutschein-Code für die Buchungsstrecke</div>
            </div>
            <button
              type="button"
              className="x"
              aria-label="Schliessen"
              onClick={onClose}
            >
              ×
            </button>
          </div>

          <div className="modal-b">
            <div className="field">
              <label htmlFor="code">Code</label>
              <input
                id="code"
                name="code"
                type="text"
                required
                minLength={3}
                placeholder="z. B. SOMMER25"
                autoComplete="off"
                style={{ textTransform: 'uppercase' }}
              />
              <small className="mut">Wird automatisch gross geschrieben.</small>
            </div>

            <div className="field-2">
              <div className="field">
                <label htmlFor="valueType">Art</label>
                <select
                  id="valueType"
                  name="valueType"
                  value={valueType}
                  onChange={(e) =>
                    setValueType(e.target.value as 'percent' | 'fixed')
                  }
                >
                  <option value="percent">Prozent</option>
                  <option value="fixed">Fixbetrag (CHF)</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="value">
                  {valueType === 'percent' ? 'Prozent (1–100)' : 'Betrag (CHF)'}
                </label>
                <input
                  id="value"
                  name="value"
                  type="number"
                  min={1}
                  max={valueType === 'percent' ? 100 : undefined}
                  step={1}
                  required
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="offerId">Angebot</label>
              <select id="offerId" name="offerId" defaultValue="">
                <option value="">Alle Angebote</option>
                {offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-2">
              <div className="field">
                <label htmlFor="validUntil">Gültig bis (optional)</label>
                <input id="validUntil" name="validUntil" type="date" />
              </div>
              <div className="field">
                <label htmlFor="maxRedemptions">Max. Einlösungen (optional)</label>
                <input
                  id="maxRedemptions"
                  name="maxRedemptions"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="unbegrenzt"
                />
              </div>
            </div>

            {state && 'error' in state ? (
              <p
                className="mut"
                role="alert"
                style={{ color: 'var(--red, #c0392b)' }}
              >
                {state.error}
              </p>
            ) : null}
          </div>

          <div className="modal-f">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {pending ? 'Wird angelegt …' : 'Code erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { createLinkAction } from '@/discounts/actions';
import { computeEffectivePrice, computeSaving } from '@/discounts/logic';
import { formatRappen } from '@/lib/money';
import type { Offer } from '@/db/schema';

interface LinkFormModalProps {
  offers: Offer[];
  onClose: () => void;
}

type ActionState = { ok: true } | { error: string } | null;

export function LinkFormModal({ offers, onClose }: LinkFormModalProps) {
  const { toast } = useToast();
  const [valueType, setValueType] = useState<'percent' | 'fixed'>('percent');
  const [offerId, setOfferId] = useState<string>(offers[0]?.id ?? '');
  const [value, setValue] = useState<string>('');

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createLinkAction,
    null,
  );

  const handledRef = useRef(false);
  useEffect(() => {
    if (state && 'ok' in state && !handledRef.current) {
      handledRef.current = true;
      onClose();
      toast('Einmal-Link angelegt.');
    }
  }, [state, onClose, toast]);

  // Live-Vorschau des Sonderpreises.
  const selectedOffer = offers.find((o) => o.id === offerId) ?? null;
  const numValue = Number(value);
  const validValue =
    Number.isFinite(numValue) &&
    numValue > 0 &&
    (valueType !== 'percent' || numValue <= 100);
  const storedValue = valueType === 'fixed' ? Math.round(numValue * 100) : Math.round(numValue);
  const preview =
    selectedOffer && validValue
      ? {
          effective: computeEffectivePrice(selectedOffer.priceRappen, {
            valueType,
            value: storedValue,
          }),
          saved: computeSaving(selectedOffer.priceRappen, {
            valueType,
            value: storedValue,
          }),
        }
      : null;

  return (
    <div className="overlay">
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <form action={formAction}>
          <div className="modal-h">
            <div>
              <h3>Neuer Einmal-Link</h3>
              <div className="meta">
                Persönlicher Buchungslink mit Sonderpreis — nur 1× gültig
              </div>
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
              <label htmlFor="label">Bezeichnung</label>
              <input
                id="label"
                name="label"
                type="text"
                required
                minLength={2}
                placeholder="z. B. Familie Meier"
                autoComplete="off"
              />
              <small className="mut">
                Nur intern sichtbar — hilft, den Link zuzuordnen.
              </small>
            </div>

            <div className="field">
              <label htmlFor="offerId">Angebot</label>
              <select
                id="offerId"
                name="offerId"
                required
                value={offerId}
                onChange={(e) => setOfferId(e.target.value)}
              >
                {offers.length === 0 ? (
                  <option value="">Keine aktiven Angebote</option>
                ) : null}
                {offers.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name} · {formatRappen(o.priceRappen)}
                  </option>
                ))}
              </select>
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
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </div>
            </div>

            {preview && selectedOffer ? (
              <div className="note" role="status">
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
                <span>
                  Sonderpreis:{' '}
                  <b className="num">{formatRappen(preview.effective)}</b> statt{' '}
                  <span style={{ textDecoration: 'line-through' }}>
                    {formatRappen(selectedOffer.priceRappen)}
                  </span>{' '}
                  — Ersparnis {formatRappen(preview.saved)}.
                </span>
              </div>
            ) : null}

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
            <button
              type="submit"
              className="btn btn-primary"
              disabled={pending || offers.length === 0}
            >
              {pending ? 'Wird angelegt …' : 'Link erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

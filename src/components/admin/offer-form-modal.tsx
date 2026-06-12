'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { useToast } from '@/components/ui/toast';
import {
  createOfferAction,
  updateOfferAction,
  deleteOfferAction,
} from '@/offers/actions';
import type { Offer, TravelRule } from '@/db/schema';
import { CustomFieldsEditor } from './custom-fields-editor';
import { StandardFieldsEditor } from './standard-fields-editor';
import { OfferMailOverrides } from './offer-mail-overrides';

interface OfferFormModalProps {
  offer?: Offer;
  travelRules: TravelRule[];
  onClose: () => void;
}

type ActionState = { ok: true } | { error: string } | null;

// Rappen → CHF-Zahl für die Vorbelegung des Preisfelds.
function rappenToChf(rappen: number): string {
  return String(Math.round(rappen / 100));
}

export function OfferFormModal({ offer, travelRules, onClose }: OfferFormModalProps) {
  const { toast } = useToast();
  const isEdit = Boolean(offer);
  // Steuert nur die Hinweis-Anzeige; massgeblich ist der Formularwert.
  const [bookingMode, setBookingMode] = useState<'termin' | 'anfrage'>(
    offer?.bookingMode ?? 'termin',
  );
  // Controlled, damit der Wert einen Wechsel der Buchungsart überlebt
  // (bei «Anfrage» ist das Feld ausgeblendet und wird hidden mitgesendet).
  const [durationMinutes, setDurationMinutes] = useState(
    String(offer?.durationMinutes ?? 60),
  );

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    isEdit ? updateOfferAction : createOfferAction,
    null,
  );

  // Zweistufiges Löschen ohne window.confirm.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePending, startDelete] = useTransition();

  // Verhindert mehrfaches Toasten/Schliessen beim selben Erfolg.
  const handledRef = useRef(false);
  useEffect(() => {
    if (state && 'ok' in state && !handledRef.current) {
      handledRef.current = true;
      onClose();
      toast(isEdit ? 'Angebot gespeichert.' : 'Angebot angelegt.');
    }
  }, [state, onClose, toast, isEdit]);

  function handleDelete() {
    if (!offer) return;
    startDelete(async () => {
      const result = await deleteOfferAction(offer.id);
      if ('ok' in result) {
        onClose();
        toast('Angebot gelöscht.');
      } else {
        toast(result.error);
      }
    });
  }

  return (
    <div className="overlay">
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <form action={formAction}>
          <div className="modal-h">
            <div>
              <h3>{isEdit ? 'Angebot bearbeiten' : 'Neues Angebot'}</h3>
              <div className="meta">
                {isEdit
                  ? 'Paket, Preis und Einstellungen anpassen'
                  : 'Paket mit Preis und Einheit anlegen'}
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
            {isEdit ? (
              <input type="hidden" name="id" value={offer!.id} />
            ) : null}

            <div className="field">
              <label htmlFor="name">Name</label>
              <input
                id="name"
                name="name"
                type="text"
                required
                minLength={2}
                defaultValue={offer?.name ?? ''}
              />
            </div>

            <div className="field">
              <label htmlFor="bookingMode">Buchungsart</label>
              <select
                id="bookingMode"
                name="bookingMode"
                value={bookingMode}
                onChange={(e) => setBookingMode(e.target.value as 'termin' | 'anfrage')}
              >
                <option value="termin">Termin buchen (mit Kalender)</option>
                <option value="anfrage">Anfrage (ohne Kalender)</option>
              </select>
              {bookingMode === 'anfrage' ? (
                <small className="mut">
                  Kund:innen beschreiben ihre Idee und senden eine Anfrage —
                  ohne Datums-/Zeitwahl. Zusätzlich werden WhatsApp- und
                  Anruf-Buttons angezeigt. Termin und Dauer vereinbarst du
                  selbst; im Widget zählen Titel, Preis und Beschreibung.
                </small>
              ) : null}
            </div>

            <div className="field-2">
              <div className="field">
                <label htmlFor="priceChf">Preis (CHF)</label>
                <input
                  id="priceChf"
                  name="priceChf"
                  type="number"
                  min={0}
                  step={1}
                  required
                  defaultValue={offer ? rappenToChf(offer.priceRappen) : ''}
                />
              </div>
              <div className="field">
                <label htmlFor="unit">Einheit</label>
                <select
                  id="unit"
                  name="unit"
                  defaultValue={offer?.unit ?? 'pauschal'}
                >
                  <option value="pauschal">Pauschal</option>
                  <option value="pro_stunde">pro Stunde</option>
                </select>
              </div>
            </div>

            {bookingMode === 'anfrage' ? (
              // Bei Anfragen gibt es keine Slots – Dauer nach Absprache.
              // Wert hidden mitsenden, damit das Schema erfüllt bleibt.
              <input type="hidden" name="durationMinutes" value={durationMinutes} />
            ) : (
              <div className="field">
                <label htmlFor="durationMinutes">Dauer (Minuten)</label>
                <input
                  id="durationMinutes"
                  name="durationMinutes"
                  type="number"
                  min={15}
                  step={15}
                  required
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                />
                <small className="mut">
                  Basis für die Termin-Slots; wird im Widget z. B. als
                  «1 Std. 30 Min.» angezeigt.
                </small>
              </div>
            )}

            <div className="field">
              <label htmlFor="description">Beschreibung</label>
              <textarea
                id="description"
                name="description"
                rows={3}
                defaultValue={offer?.description ?? ''}
              />
            </div>

            <div className="field">
              <label htmlFor="travelRuleId">Wegkosten-Regel</label>
              <select
                id="travelRuleId"
                name="travelRuleId"
                defaultValue={offer?.travelRuleId ?? ''}
              >
                <option value="">— keine —</option>
                {travelRules.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <small className="mut">
                Zeigt Kund:innen den Anfahrts-Hinweis dieser Regel. Regeln
                verwaltest du unten im Abschnitt «Wegkosten».
              </small>
            </div>

            <StandardFieldsEditor initial={offer?.standardFields ?? {}} />
            <CustomFieldsEditor initial={offer?.customFields ?? []} />

            {/* Angebotsspezifische Mail-Texte nur im Bearbeiten-Modus: ein
                Override braucht die gespeicherte Angebots-ID (FK). Speichert
                separat ueber eigene Actions. */}
            {isEdit && offer ? <OfferMailOverrides offerId={offer.id} /> : null}

            <div className="field">
              <label className="toggle-wrap" htmlFor="active">
                <span className="switch">
                  <input
                    id="active"
                    name="active"
                    type="checkbox"
                    defaultChecked={offer ? offer.active : true}
                  />
                  <span className="slider" />
                </span>
                Aktiv (im Buchungsformular sichtbar)
              </label>
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

            {isEdit ? (
              <div
                style={{
                  marginTop: 18,
                  paddingTop: 16,
                  borderTop: '1px solid var(--line-2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div className="mut" style={{ fontSize: 12.5 }}>
                  Angebot endgültig entfernen
                </div>
                {confirmDelete ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setConfirmDelete(false)}
                      disabled={deletePending}
                    >
                      Abbrechen
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={handleDelete}
                      disabled={deletePending}
                    >
                      Wirklich löschen?
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Löschen
                  </button>
                )}
              </div>
            ) : null}
          </div>

          <div className="modal-f">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Abbrechen
            </button>
            <button type="submit" className="btn btn-primary" disabled={pending}>
              {isEdit ? 'Speichern' : 'Angebot anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

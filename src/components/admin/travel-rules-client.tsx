'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { useToast } from '@/components/ui/toast';
import {
  createTravelRuleAction,
  updateTravelRuleAction,
  deleteTravelRuleAction,
} from '@/travel/actions';
import { travelRuleKurz } from '@/travel/format';
import type { Offer, TravelRule } from '@/db/schema';
import type { PinPosition } from './location-picker';

// Leaflet braucht `window` – nur im Browser laden (kein SSR).
const LocationPicker = dynamic(() => import('./location-picker'), {
  ssr: false,
  loading: () => <div className="locpick-map locpick-loading">Karte lädt…</div>,
});

interface TravelRulesClientProps {
  rules: TravelRule[];
  offers: Offer[];
}

export function TravelRulesClient({ rules, offers }: TravelRulesClientProps) {
  const [editing, setEditing] = useState<TravelRule | null>(null);
  const [creating, setCreating] = useState(false);

  function closeModal() {
    setEditing(null);
    setCreating(false);
  }

  // Welche Angebote nutzen eine Regel? (Anzeige in der Zeile)
  function offerNames(ruleId: string): string {
    const names = offers.filter((o) => o.travelRuleId === ruleId).map((o) => o.name);
    return names.length > 0 ? names.join(', ') : 'keinem Angebot zugeordnet';
  }

  return (
    <>
      <div className="sec-head" style={{ marginTop: 34 }}>
        <span className="ico" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 21s-7-5.6-7-11a7 7 0 0 1 14 0c0 5.4-7 11-7 11Z" />
            <circle cx="12" cy="10" r="2.5" />
          </svg>
        </span>
        <div>
          <h2>Wegkosten</h2>
          <div className="sub">
            Freiradius um einen Standort, darüber Ansatz pro Kilometer.
            Den effektiven Betrag setzt du beim Bestätigen im Termindetail.
          </div>
        </div>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => setCreating(true)}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Regel erstellen
        </button>
      </div>
      <div className="card">
        <div className="card-b" style={{ padding: '8px 22px' }}>
          {rules.length === 0 ? (
            <div className="empty">
              <h4>Noch keine Wegkosten-Regeln</h4>
              <p>
                Lege z. B. «Region Bern» an: 30 km um Bern Bahnhof frei,
                danach 0.90 CHF pro Kilometer.
              </p>
            </div>
          ) : (
            <div className="trules">
              {rules.map((r) => (
                <div className="trule-row" key={r.id}>
                  <div className="trule-info">
                    <div className="v">{travelRuleKurz(r)}</div>
                    <div className="s">Gilt für: {offerNames(r.id)}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setEditing(r)}
                  >
                    Bearbeiten
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {editing || creating ? (
        <TravelRuleFormModal rule={editing ?? undefined} onClose={closeModal} />
      ) : null}
    </>
  );
}

type ActionState = { ok: true } | { error: string } | null;

function TravelRuleFormModal({
  rule,
  onClose,
}: {
  rule?: TravelRule;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const isEdit = Boolean(rule);

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    isEdit ? updateTravelRuleAction : createTravelRuleAction,
    null,
  );

  // Karte und Felder teilen sich den Zustand: Pin-Klick setzt Koordinaten
  // (+ Ortsnamen-Vorschlag), das Radius-Feld steuert den Kreis live.
  const [pin, setPin] = useState<PinPosition | null>(
    rule?.baseLat != null && rule?.baseLng != null
      ? { lat: rule.baseLat, lng: rule.baseLng }
      : null,
  );
  const [baseLocation, setBaseLocation] = useState(rule?.baseLocation ?? '');
  const [radiusKm, setRadiusKm] = useState(String(rule?.freeRadiusKm ?? 30));

  // Zweistufiges Löschen ohne window.confirm.
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deletePending, startDelete] = useTransition();

  // Verhindert mehrfaches Toasten/Schliessen beim selben Erfolg.
  const handledRef = useRef(false);
  useEffect(() => {
    if (state && 'ok' in state && !handledRef.current) {
      handledRef.current = true;
      onClose();
      toast(isEdit ? 'Regel gespeichert.' : 'Regel angelegt.');
    }
  }, [state, onClose, toast, isEdit]);

  function handleDelete() {
    if (!rule) return;
    startDelete(async () => {
      const result = await deleteTravelRuleAction(rule.id);
      if ('ok' in result) {
        onClose();
        toast('Regel gelöscht.');
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
              <h3>{isEdit ? 'Wegkosten-Regel bearbeiten' : 'Neue Wegkosten-Regel'}</h3>
              <div className="meta">
                Standort, Freiradius und Ansatz pro Kilometer
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
            {isEdit ? <input type="hidden" name="id" value={rule!.id} /> : null}

            <div className="field">
              <label htmlFor="tr-name">Name</label>
              <input
                id="tr-name"
                name="name"
                type="text"
                required
                minLength={2}
                placeholder="z. B. Region Bern"
                defaultValue={rule?.name ?? ''}
              />
            </div>

            <div className="field">
              <label>Standort auf der Karte</label>
              <LocationPicker
                value={pin}
                radiusKm={Number(radiusKm) || 0}
                onPick={setPin}
                onLocationName={setBaseLocation}
              />
              <input type="hidden" name="baseLat" value={pin ? String(pin.lat) : ''} />
              <input type="hidden" name="baseLng" value={pin ? String(pin.lng) : ''} />
            </div>

            <div className="field">
              <label htmlFor="tr-baseLocation">Standort (Bezugspunkt)</label>
              <input
                id="tr-baseLocation"
                name="baseLocation"
                type="text"
                required
                minLength={2}
                placeholder="z. B. Bern Bahnhof"
                value={baseLocation}
                onChange={(e) => setBaseLocation(e.target.value)}
              />
              <small className="mut">
                Wird beim Karten-Klick vorgeschlagen – so erscheint der Ort im
                Buchungs-Hinweis. Anpassen jederzeit möglich.
              </small>
            </div>

            <div className="field-2">
              <div className="field">
                <label htmlFor="tr-freeRadiusKm">Freiradius (km)</label>
                <input
                  id="tr-freeRadiusKm"
                  name="freeRadiusKm"
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={radiusKm}
                  onChange={(e) => setRadiusKm(e.target.value)}
                />
                <small className="mut">Innerhalb: keine Wegkosten.</small>
              </div>
              <div className="field">
                <label htmlFor="tr-ratePerKmChf">Ansatz pro km (CHF)</label>
                <input
                  id="tr-ratePerKmChf"
                  name="ratePerKmChf"
                  type="number"
                  min={0}
                  step="0.05"
                  required
                  defaultValue={rule ? rule.ratePerKmRappen / 100 : 0.9}
                />
                <small className="mut">Ausserhalb des Freiradius.</small>
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
                  Zugeordnete Angebote verlieren nur die Regel
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
              {isEdit ? 'Speichern' : 'Regel anlegen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

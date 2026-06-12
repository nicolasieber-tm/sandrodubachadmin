'use client';

import { useState, useTransition } from 'react';
import { useToast } from '@/components/ui/toast';
import {
  getOfferTemplateAction,
  saveOfferTemplateAction,
  deleteOfferTemplateAction,
  listOfferTemplateOverridesAction,
} from '@/notify/actions';
import { OFFER_TEMPLATE_KEYS, TEMPLATE_LABELS } from '@/notify/default-templates';
import type { EmailTemplateKeyValue } from '@/db/schema';
import {
  PlaceholderLegend,
  TemplatePreview,
  useTemplateDraft,
} from './template-editor-parts';

interface OfferMailOverridesProps {
  // Nur im Bearbeiten-Modus verfuegbar: ein Override braucht eine gespeicherte
  // Angebots-ID (FK). Beim Neu-Anlegen wird die Sektion nicht gerendert.
  offerId: string;
}

// Angebotsspezifische Mail-Overrides: listet die kundenseitigen Mail-Typen
// (OFFER_TEMPLATE_KEYS – ohne 'admin_new') als kompakte aufklappbare Zeilen.
// Aufklappen laedt lazy die aufgeloeste Vorlage (Override, sonst global/
// Standard als Vorbefuellung); Speichern legt den Override an, «Zuruecksetzen»
// loescht ihn (zurueck auf die globale Vorlage im Tab «E-Mails»).
//
// Hinweis: Bewusst NICHT Teil des Offer-<form>: Diese Sektion speichert ueber
// eigene Server-Actions (separat vom Angebots-Speichern), damit sie auch ohne
// Aenderungen am restlichen Formular wirkt und das Offer-Schema unberuehrt bleibt.
export function OfferMailOverrides({ offerId }: OfferMailOverridesProps) {
  // null = Badges noch nicht geladen (lazy beim ersten Aufklappen der Sektion).
  const [overrideKeys, setOverrideKeys] = useState<Set<EmailTemplateKeyValue> | null>(null);
  const [loadPending, startLoad] = useTransition();

  // Lazy: erst beim Aufklappen die Override-Keys fuer die Badges laden.
  function ensureLoaded() {
    if (overrideKeys !== null || loadPending) return;
    startLoad(async () => {
      const keys = await listOfferTemplateOverridesAction(offerId);
      setOverrideKeys(new Set(keys));
    });
  }

  // Badge-Status einer Zeile nachziehen (nach Speichern/Zuruecksetzen).
  function setOverride(key: EmailTemplateKeyValue, has: boolean) {
    setOverrideKeys((prev) => {
      const next = new Set(prev ?? []);
      if (has) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
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
        E-Mails für dieses Angebot
      </summary>

      <div style={{ paddingBottom: 14 }}>
        <p className="mut" style={{ fontSize: 12.5, marginBottom: 12 }}>
          Eigene Texte nur für dieses Angebot. Nicht angepasste Typen verwenden
          die allgemeinen Vorlagen aus dem Tab «E-Mails».
        </p>

        {overrideKeys === null ? (
          <p className="mut" style={{ fontSize: 12.5 }}>Lädt…</p>
        ) : (
          OFFER_TEMPLATE_KEYS.map((key) => (
            <OverrideRow
              key={key}
              offerId={offerId}
              templateKey={key}
              hasOverride={overrideKeys.has(key)}
              onOverrideChange={(has) => setOverride(key, has)}
            />
          ))
        )}
      </div>
    </details>
  );
}

interface OverrideRowProps {
  offerId: string;
  templateKey: EmailTemplateKeyValue;
  hasOverride: boolean;
  onOverrideChange: (has: boolean) => void;
}

function OverrideRow({ offerId, templateKey, hasOverride, onOverrideChange }: OverrideRowProps) {
  const { toast } = useToast();
  // Gemeinsamer Entwurfs-Zustand (Betreff/Text + Platzhalter-Einfuegen);
  // Inhalt wird lazy beim Aufklappen der Zeile geladen.
  const draft = useTemplateDraft();
  const [loaded, setLoaded] = useState(false);
  const [loadPending, startLoad] = useTransition();
  const [savePending, startSave] = useTransition();

  // Aufgeloeste Vorlage laden: Override falls vorhanden, sonst global/Standard
  // als Vorbefuellung. Auch nach «Zuruecksetzen» zum Neu-Befuellen genutzt.
  function loadContent() {
    startLoad(async () => {
      const res = await getOfferTemplateAction(offerId, templateKey);
      if ('ok' in res) {
        draft.setSubject(res.subject);
        draft.setBody(res.body);
        onOverrideChange(res.hasOverride);
        setLoaded(true);
      } else {
        toast(res.error);
      }
    });
  }

  function ensureLoaded() {
    if (!loaded && !loadPending) loadContent();
  }

  function handleSave() {
    startSave(async () => {
      const res = await saveOfferTemplateAction(offerId, templateKey, draft.subject, draft.body);
      if ('ok' in res) {
        onOverrideChange(true);
        toast('Vorlage für dieses Angebot gespeichert.');
      } else {
        toast(res.error);
      }
    });
  }

  function handleReset() {
    startSave(async () => {
      const res = await deleteOfferTemplateAction(offerId, templateKey);
      if ('ok' in res) {
        onOverrideChange(false);
        toast('Zurückgesetzt – es gilt wieder die allgemeine Vorlage.');
        // Felder mit der nun gueltigen globalen/Standard-Vorlage neu befuellen.
        loadContent();
      } else {
        toast(res.error);
      }
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
        padding: '0 12px',
        marginBottom: 10,
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          padding: '11px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          fontWeight: 600,
          fontSize: 13,
        }}
      >
        <span>{TEMPLATE_LABELS[templateKey]}</span>
        <span
          className="mut"
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: hasOverride ? 'var(--accent-ink)' : 'var(--ink-2)',
          }}
        >
          {hasOverride ? 'Angepasst' : 'Standard'}
        </span>
      </summary>

      <div style={{ paddingBottom: 14 }}>
        {!loaded ? (
          <p className="mut" style={{ fontSize: 12.5 }}>Lädt…</p>
        ) : (
          <>
            <div className="field">
              <label>Betreff</label>
              <input
                ref={draft.subjectRef}
                type="text"
                value={draft.subject}
                onFocus={() => (draft.lastFocus.current = 'subject')}
                onChange={(e) => draft.setSubject(e.target.value)}
              />
            </div>

            <div className="field">
              <label>Text</label>
              <textarea
                ref={draft.bodyRef}
                rows={9}
                value={draft.body}
                onFocus={() => (draft.lastFocus.current = 'body')}
                onChange={(e) => draft.setBody(e.target.value)}
                style={{ fontFamily: 'inherit' }}
              />
            </div>

            <PlaceholderLegend onInsert={draft.insertPlaceholder} />

            <div style={{ marginTop: 12 }}>
              <TemplatePreview subject={draft.subject} body={draft.body} />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                marginTop: 12,
              }}
            >
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={handleReset}
                disabled={savePending || !hasOverride}
              >
                Zurücksetzen
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSave}
                disabled={savePending}
              >
                Für dieses Angebot speichern
              </button>
            </div>
          </>
        )}
      </div>
    </details>
  );
}

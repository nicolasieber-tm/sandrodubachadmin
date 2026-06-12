'use client';

// Gemeinsame Bausteine der Vorlagen-Editoren (globaler Tab «E-Mails» und
// Mail-Overrides im Angebots-Modal): Entwurfs-Zustand mit Platzhalter-
// Einfuegen, klickbare Platzhalter-Chips und die Live-Vorschau mit
// Beispieldaten. Eine Quelle statt Duplikate in beiden Editoren.

import { useRef, useState } from 'react';
import { renderTemplate, TEMPLATE_PLACEHOLDERS } from '@/notify/template';
import { PREVIEW_SAMPLE } from '@/notify/preview-sample';

/**
 * Entwurfs-Zustand fuer Betreff + Text. insertPlaceholder fuegt einen Token an
 * der Cursor-Position des zuletzt fokussierten Felds ein (lastFocus ueber die
 * onFocus-Handler der Felder setzen).
 */
export function useTemplateDraft(initialSubject = '', initialBody = '') {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // Welches Feld zuletzt fokussiert war – dorthin fuegt ein Chip den Platzhalter.
  const lastFocus = useRef<'subject' | 'body'>('body');

  function insertPlaceholder(token: string) {
    const isSubject = lastFocus.current === 'subject';
    const el = isSubject ? subjectRef.current : bodyRef.current;
    const value = isSubject ? subject : body;
    const setValue = isSubject ? setSubject : setBody;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    setValue(value.slice(0, start) + token + value.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + token.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  return {
    subject,
    setSubject,
    body,
    setBody,
    subjectRef,
    bodyRef,
    lastFocus,
    insertPlaceholder,
  };
}

/** Klickbare Platzhalter-Chips: fuegen den Token ins zuletzt fokussierte Feld ein. */
export function PlaceholderLegend({ onInsert }: { onInsert: (token: string) => void }) {
  return (
    <div>
      <div
        className="mut"
        style={{ fontSize: 11, fontWeight: 600, marginBottom: 7, color: 'var(--ink-2)' }}
      >
        Platzhalter (klicken zum Einfügen)
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {TEMPLATE_PLACEHOLDERS.map((p) => (
          <button
            key={p.token}
            type="button"
            title={p.beschreibung}
            onClick={() => onInsert(p.token)}
            style={{
              border: '1px solid var(--line-strong)',
              background: 'var(--surface-2)',
              color: 'var(--ink-2)',
              borderRadius: 999,
              padding: '4px 10px',
              fontSize: 12,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            {p.token}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Live-Vorschau (rein client-seitig, gleiche renderTemplate wie der Versand). */
export function TemplatePreview({ subject, body }: { subject: string; body: string }) {
  return (
    <div
      style={{
        padding: 14,
        background: 'var(--accent-soft)',
        border: '1px solid var(--accent-line)',
        borderRadius: 'var(--r)',
      }}
    >
      <div
        className="mut"
        style={{ fontSize: 11, fontWeight: 600, marginBottom: 8, color: 'var(--ink-2)' }}
      >
        Vorschau (mit Beispieldaten)
      </div>
      <div style={{ fontWeight: 600, fontSize: 13.5, marginBottom: 6 }}>
        {renderTemplate(subject, PREVIEW_SAMPLE)}
      </div>
      <pre
        style={{
          whiteSpace: 'pre-wrap',
          fontFamily: 'inherit',
          fontSize: 13,
          margin: 0,
          color: 'var(--ink-2)',
        }}
      >
        {renderTemplate(body, PREVIEW_SAMPLE)}
      </pre>
    </div>
  );
}

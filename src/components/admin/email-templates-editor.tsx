'use client';

import { useRef, useState, useTransition } from 'react';
import { useToast } from '@/components/ui/toast';
import { saveTemplateAction, resetTemplateAction } from '@/notify/actions';
import { renderTemplate } from '@/notify/template';
import { TEMPLATE_PLACEHOLDERS } from '@/notify/template';
import { PREVIEW_SAMPLE } from '@/notify/preview-sample';
import type { ResolvedTemplateRow } from '@/app/admin/emails/page';

interface EmailTemplatesEditorProps {
  templates: ResolvedTemplateRow[];
}

export function EmailTemplatesEditor({ templates }: EmailTemplatesEditorProps) {
  return (
    <div className="card" style={{ marginTop: 22 }}>
      <div className="card-h">
        <h3>E-Mail-Vorlagen</h3>
        <div className="sub">
          Betreff und Text der automatischen Nachrichten. Platzhalter wie{' '}
          <code>{'{{name}}'}</code> werden beim Versand ersetzt.
        </div>
      </div>
      <div className="card-b">
        {templates.map((t) => (
          <TemplateRow key={t.key} template={t} />
        ))}
      </div>
    </div>
  );
}

function TemplateRow({ template }: { template: ResolvedTemplateRow }) {
  const { toast } = useToast();
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [angepasst, setAngepasst] = useState(template.angepasst);
  const [savePending, startSave] = useTransition();
  const [resetPending, startReset] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  // Welches Feld zuletzt fokussiert war – dorthin fuegt ein Chip den Platzhalter.
  const lastFocus = useRef<'subject' | 'body'>('body');

  function insertPlaceholder(token: string) {
    if (lastFocus.current === 'subject') {
      const el = subjectRef.current;
      const start = el?.selectionStart ?? subject.length;
      const end = el?.selectionEnd ?? subject.length;
      const next = subject.slice(0, start) + token + subject.slice(end);
      setSubject(next);
      requestAnimationFrame(() => {
        el?.focus();
        const pos = start + token.length;
        el?.setSelectionRange(pos, pos);
      });
    } else {
      const el = bodyRef.current;
      const start = el?.selectionStart ?? body.length;
      const end = el?.selectionEnd ?? body.length;
      const next = body.slice(0, start) + token + body.slice(end);
      setBody(next);
      requestAnimationFrame(() => {
        el?.focus();
        const pos = start + token.length;
        el?.setSelectionRange(pos, pos);
      });
    }
  }

  function handleSave() {
    const fd = new FormData();
    fd.set('templateKey', template.key);
    fd.set('subject', subject);
    fd.set('body', body);
    startSave(async () => {
      const res = await saveTemplateAction(null, fd);
      if ('ok' in res) {
        setAngepasst(true);
        toast('Vorlage gespeichert.');
      } else {
        toast(res.error);
      }
    });
  }

  function handleReset() {
    startReset(async () => {
      const res = await resetTemplateAction(template.key);
      if ('ok' in res) {
        toast('Auf Standard zurückgesetzt. Lade die Seite neu, um den Standardtext zu sehen.');
        setAngepasst(false);
      } else {
        toast(res.error);
      }
    });
  }

  const previewSubject = renderTemplate(subject, PREVIEW_SAMPLE);
  const previewBody = renderTemplate(body, PREVIEW_SAMPLE);

  return (
    <details
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--r)',
        padding: '0 16px',
        marginBottom: 12,
      }}
    >
      <summary
        style={{
          cursor: 'pointer',
          padding: '14px 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          fontWeight: 600,
          fontSize: 14,
        }}
      >
        <span>{template.label}</span>
        <span
          className="mut"
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: angepasst ? 'var(--accent-ink)' : 'var(--ink-2)',
          }}
        >
          {angepasst ? 'Angepasst' : 'Standard'}
        </span>
      </summary>

      <div style={{ paddingBottom: 16 }}>
        <div className="field">
          <label>Betreff</label>
          <input
            ref={subjectRef}
            type="text"
            value={subject}
            onFocus={() => (lastFocus.current = 'subject')}
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        <div className="field">
          <label>Text</label>
          <textarea
            ref={bodyRef}
            rows={10}
            value={body}
            onFocus={() => (lastFocus.current = 'body')}
            onChange={(e) => setBody(e.target.value)}
            style={{ fontFamily: 'inherit' }}
          />
        </div>

        <PlaceholderLegend onInsert={insertPlaceholder} />

        <div
          style={{
            marginTop: 14,
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
            {previewSubject}
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
            {previewBody}
          </pre>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            marginTop: 14,
          }}
        >
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleReset}
            disabled={resetPending || !angepasst}
          >
            Auf Standard zurücksetzen
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={savePending}
          >
            Speichern
          </button>
        </div>
      </div>
    </details>
  );
}

// Klickbare Platzhalter-Chips: fuegen den Token ins zuletzt fokussierte Feld ein.
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

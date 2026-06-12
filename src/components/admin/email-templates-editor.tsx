'use client';

import { useState, useTransition } from 'react';
import { useToast } from '@/components/ui/toast';
import { saveTemplateAction, resetTemplateAction } from '@/notify/actions';
import type { ResolvedTemplateRow } from '@/app/admin/emails/page';
import {
  PlaceholderLegend,
  TemplatePreview,
  useTemplateDraft,
} from './template-editor-parts';

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
  // Gemeinsamer Entwurfs-Zustand (Betreff/Text + Platzhalter-Einfuegen).
  const draft = useTemplateDraft(template.subject, template.body);
  const [angepasst, setAngepasst] = useState(template.angepasst);
  const [savePending, startSave] = useTransition();
  const [resetPending, startReset] = useTransition();

  function handleSave() {
    const fd = new FormData();
    fd.set('templateKey', template.key);
    fd.set('subject', draft.subject);
    fd.set('body', draft.body);
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
            rows={10}
            value={draft.body}
            onFocus={() => (draft.lastFocus.current = 'body')}
            onChange={(e) => draft.setBody(e.target.value)}
            style={{ fontFamily: 'inherit' }}
          />
        </div>

        <PlaceholderLegend onInsert={draft.insertPlaceholder} />

        <div style={{ marginTop: 14 }}>
          <TemplatePreview subject={draft.subject} body={draft.body} />
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

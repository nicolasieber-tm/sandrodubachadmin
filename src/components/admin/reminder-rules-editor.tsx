'use client';

import { useState, useTransition } from 'react';
import { useToast } from '@/components/ui/toast';
import {
  createReminderRuleAction,
  updateReminderRuleAction,
  deleteReminderRuleAction,
} from '@/notify/actions';
import type { ReminderRule } from '@/db/schema';

interface ReminderRulesEditorProps {
  rules: ReminderRule[];
}

// Wandelt offsetHours in {wert, einheit} fuer die UI: glatte Vielfache von 24
// werden als Tage angezeigt, sonst als Stunden.
function splitOffset(offsetHours: number): { wert: number; einheit: 'stunden' | 'tage' } {
  if (offsetHours % 24 === 0 && offsetHours >= 24) {
    return { wert: offsetHours / 24, einheit: 'tage' };
  }
  return { wert: offsetHours, einheit: 'stunden' };
}

function toHours(wert: number, einheit: 'stunden' | 'tage'): number {
  return einheit === 'tage' ? wert * 24 : wert;
}

export function ReminderRulesEditor({ rules }: ReminderRulesEditorProps) {
  return (
    <div className="card">
      <div className="card-h">
        <h3>Erinnerungen</h3>
        <div className="sub">
          Automatische Erinnerungs-Mails vor dem Termin. Mehrere Vorläufe möglich
          (z. B. 1 Woche und 24 Stunden vorher).
        </div>
      </div>
      <div className="card-b">
        {rules.length === 0 ? (
          <p className="mut" style={{ fontSize: 13.5 }}>
            Noch keine Erinnerungen konfiguriert.
          </p>
        ) : (
          rules.map((rule) => <RuleRow key={rule.id} rule={rule} />)
        )}
        <NewRuleRow />
      </div>
    </div>
  );
}

function RuleRow({ rule }: { rule: ReminderRule }) {
  const { toast } = useToast();
  const initial = splitOffset(rule.offsetHours);
  const [wert, setWert] = useState(String(initial.wert));
  const [einheit, setEinheit] = useState<'stunden' | 'tage'>(initial.einheit);
  const [enabled, setEnabled] = useState(rule.enabled);
  const [subject, setSubject] = useState(rule.subject ?? '');
  const [body, setBody] = useState(rule.body ?? '');
  const [savePending, startSave] = useTransition();
  const [deletePending, startDelete] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  function handleSave() {
    const fd = new FormData();
    fd.set('id', rule.id);
    fd.set('offsetHours', String(toHours(Number(wert), einheit)));
    if (enabled) fd.set('enabled', 'on');
    fd.set('subject', subject);
    fd.set('body', body);
    startSave(async () => {
      const res = await updateReminderRuleAction(null, fd);
      toast('ok' in res ? 'Erinnerung gespeichert.' : res.error);
    });
  }

  function handleDelete() {
    startDelete(async () => {
      const res = await deleteReminderRuleAction(rule.id);
      toast('ok' in res ? 'Erinnerung gelöscht.' : ('error' in res ? res.error : 'Fehler.'));
    });
  }

  return (
    <div
      style={{
        border: '1px solid var(--line)',
        borderRadius: 'var(--r)',
        padding: 14,
        marginBottom: 12,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div className="field" style={{ marginBottom: 0, width: 90 }}>
          <label>Vorlauf</label>
          <input
            type="number"
            min={1}
            value={wert}
            onChange={(e) => setWert(e.target.value)}
          />
        </div>
        <div className="field" style={{ marginBottom: 0, width: 130 }}>
          <label>Einheit</label>
          <select value={einheit} onChange={(e) => setEinheit(e.target.value as 'stunden' | 'tage')}>
            <option value="stunden">Stunden</option>
            <option value="tage">Tage</option>
          </select>
        </div>

        <label className="toggle-wrap" style={{ marginBottom: 6 }}>
          <span className="switch">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            <span className="slider" />
          </span>
          Aktiv
        </label>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {confirmDelete ? (
            <>
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
            </>
          ) : (
            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => setConfirmDelete(true)}
            >
              Löschen
            </button>
          )}
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

      <details style={{ marginTop: 12 }}>
        <summary
          style={{ cursor: 'pointer', fontSize: 12.5, color: 'var(--ink-2)', fontWeight: 600 }}
        >
          Eigener Text (optional)
        </summary>
        <div style={{ marginTop: 10 }}>
          <p className="mut" style={{ fontSize: 12, marginBottom: 10 }}>
            Leer lassen, um die Standard-Erinnerungs-Vorlage zu verwenden. Es
            werden dieselben Platzhalter wie bei den Vorlagen unterstützt.
          </p>
          <div className="field">
            <label>Betreff</label>
            <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Text</label>
            <textarea
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              style={{ fontFamily: 'inherit' }}
            />
          </div>
        </div>
      </details>
    </div>
  );
}

function NewRuleRow() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [wert, setWert] = useState('48');
  const [einheit, setEinheit] = useState<'stunden' | 'tage'>('stunden');
  const [pending, startSave] = useTransition();

  function handleCreate() {
    const fd = new FormData();
    fd.set('offsetHours', String(toHours(Number(wert), einheit)));
    fd.set('enabled', 'on');
    startSave(async () => {
      const res = await createReminderRuleAction(null, fd);
      if ('ok' in res) {
        toast('Erinnerung hinzugefügt.');
        setOpen(false);
        setWert('48');
        setEinheit('stunden');
      } else {
        toast(res.error);
      }
    });
  }

  if (!open) {
    return (
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
        + Erinnerung hinzufügen
      </button>
    );
  }

  return (
    <div
      style={{
        border: '1px dashed var(--line-strong)',
        borderRadius: 'var(--r)',
        padding: 14,
        display: 'flex',
        alignItems: 'flex-end',
        flexWrap: 'wrap',
        gap: 12,
      }}
    >
      <div className="field" style={{ marginBottom: 0, width: 90 }}>
        <label>Vorlauf</label>
        <input type="number" min={1} value={wert} onChange={(e) => setWert(e.target.value)} />
      </div>
      <div className="field" style={{ marginBottom: 0, width: 130 }}>
        <label>Einheit</label>
        <select value={einheit} onChange={(e) => setEinheit(e.target.value as 'stunden' | 'tage')}>
          <option value="stunden">Stunden</option>
          <option value="tage">Tage</option>
        </select>
      </div>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(false)}
          disabled={pending}
        >
          Abbrechen
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={handleCreate}
          disabled={pending}
        >
          Hinzufügen
        </button>
      </div>
    </div>
  );
}

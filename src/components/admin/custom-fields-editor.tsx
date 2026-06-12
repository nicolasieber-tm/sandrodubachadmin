'use client';

import { useRef, useState } from 'react';
import {
  customFieldTypes,
  type CustomFieldDef,
  type CustomFieldType,
} from '@/offers/custom-fields';

// Vergibt einen stabilen, kollisionsfreien Schlüssel field_<n>.
function nextKey(fields: CustomFieldDef[], counterRef: { current: number }): string {
  const used = new Set(fields.map((f) => f.key));
  let n = counterRef.current;
  let key = `field_${n}`;
  while (used.has(key)) {
    n += 1;
    key = `field_${n}`;
  }
  counterRef.current = n + 1;
  return key;
}

export function CustomFieldsEditor({ initial }: { initial: CustomFieldDef[] }) {
  const [fields, setFields] = useState<CustomFieldDef[]>(initial);
  // Zähler startet hinter der höchsten vorhandenen field_<n>-Nummer.
  const counterRef = useRef<number>(
    initial.reduce((max, f) => {
      const m = /^field_(\d+)$/.exec(f.key);
      return m ? Math.max(max, Number(m[1]) + 1) : max;
    }, 1),
  );

  function update(index: number, patch: Partial<CustomFieldDef>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function addField() {
    setFields((prev) => [
      ...prev,
      { key: nextKey(prev, counterRef), label: '', type: 'text', required: false },
    ]);
  }

  function removeField(index: number) {
    setFields((prev) => prev.filter((_, i) => i !== index));
  }

  function move(index: number, delta: number) {
    setFields((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="field">
      <label>Zusätzliche Abfragen</label>
      <small className="mut" style={{ display: 'block', marginBottom: 8 }}>
        Felder, die Kund:innen bei diesem Angebot zusätzlich ausfüllen.
      </small>

      {fields.map((f, i) => (
        <div
          key={f.key}
          style={{
            border: '1px solid var(--line-2)',
            borderRadius: 10,
            padding: 12,
            marginBottom: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div className="field-2">
            <div className="field">
              <label>Beschriftung</label>
              <input
                type="text"
                value={f.label}
                placeholder="z. B. Anzahl Gäste"
                onChange={(e) => update(i, { label: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Typ</label>
              <select
                value={f.type}
                onChange={(e) =>
                  update(i, {
                    type: e.target.value as CustomFieldType,
                    options: undefined,
                    min: undefined,
                    max: undefined,
                  })
                }
              >
                {customFieldTypes.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {f.type === 'select' ? (
            <OptionsEditor
              options={f.options ?? ['']}
              onChange={(options) => update(i, { options })}
            />
          ) : null}

          {f.type === 'number' ? (
            <div className="field-2">
              <div className="field">
                <label>Min</label>
                <input
                  type="number"
                  value={f.min ?? ''}
                  onChange={(e) =>
                    update(i, { min: e.target.value === '' ? undefined : Number(e.target.value) })
                  }
                />
              </div>
              <div className="field">
                <label>Max</label>
                <input
                  type="number"
                  value={f.max ?? ''}
                  onChange={(e) =>
                    update(i, { max: e.target.value === '' ? undefined : Number(e.target.value) })
                  }
                />
              </div>
            </div>
          ) : null}

          <div className="field">
            <label>Platzhalter (optional)</label>
            <input
              type="text"
              value={f.placeholder ?? ''}
              onChange={(e) => update(i, { placeholder: e.target.value || undefined })}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <label className="toggle-wrap" style={{ margin: 0 }}>
              <span className="switch">
                <input
                  type="checkbox"
                  checked={f.required}
                  onChange={(e) => update(i, { required: e.target.checked })}
                />
                <span className="slider" />
              </span>
              Pflichtfeld
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label="Nach oben"
              >
                ↑
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => move(i, 1)}
                disabled={i === fields.length - 1}
                aria-label="Nach unten"
              >
                ↓
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => removeField(i)}
              >
                Entfernen
              </button>
            </div>
          </div>
        </div>
      ))}

      <button type="button" className="btn btn-ghost btn-sm" onClick={addField}>
        + Feld hinzufügen
      </button>

      {/* Serialisiert für die Server-Action (createOfferAction/updateOfferAction). */}
      <input type="hidden" name="customFields" value={JSON.stringify(fields)} />
    </div>
  );
}

export function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  return (
    <div className="field">
      <label>Auswahlmöglichkeiten</label>
      {options.map((opt, i) => (
        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input
            type="text"
            value={opt}
            placeholder={`Option ${i + 1}`}
            onChange={(e) => onChange(options.map((o, j) => (j === i ? e.target.value : o)))}
          />
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            disabled={options.length <= 1}
            aria-label="Option entfernen"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => onChange([...options, ''])}
      >
        + Option
      </button>
    </div>
  );
}

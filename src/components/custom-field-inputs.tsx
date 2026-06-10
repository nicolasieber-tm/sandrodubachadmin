'use client';

import type { CustomFieldDef } from '@/offers/custom-fields';

// Rendert die Zusatzfelder eines Angebots als Formular-Inputs. `wrapperClass`
// erlaubt zwei Stil-Kontexte: 'bookx-field' (Buchungsstrecke) und 'field' (Admin).
export function CustomFieldInputs({
  fields,
  wrapperClass = 'bookx-field',
}: {
  fields: CustomFieldDef[];
  wrapperClass?: string;
}) {
  if (!fields || fields.length === 0) return null;

  return (
    <>
      {fields.map((f) => {
        const id = `cf_${f.key}`;
        const name = `cf_${f.key}`;
        const labelText = f.required ? `${f.label} *` : f.label;
        const help = f.helpText ? (
          <small style={{ opacity: 0.7, fontSize: 12.5 }}>{f.helpText}</small>
        ) : null;

        if (f.type === 'checkbox') {
          return (
            <div className={wrapperClass} key={f.key}>
              <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input id={id} name={name} type="checkbox" value="on" />
                {labelText}
              </label>
              {help}
            </div>
          );
        }

        return (
          <div className={wrapperClass} key={f.key}>
            <label htmlFor={id}>{labelText}</label>
            {f.type === 'textarea' ? (
              <textarea id={id} name={name} rows={3} required={f.required} placeholder={f.placeholder ?? ''} />
            ) : f.type === 'select' ? (
              <select id={id} name={name} required={f.required} defaultValue="">
                <option value="" disabled={f.required}>
                  Bitte wählen
                </option>
                {(f.options ?? []).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id={id}
                name={name}
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                required={f.required}
                placeholder={f.placeholder ?? ''}
                min={f.type === 'number' && f.min !== undefined ? f.min : undefined}
                max={f.type === 'number' && f.max !== undefined ? f.max : undefined}
              />
            )}
            {help}
          </div>
        );
      })}
    </>
  );
}

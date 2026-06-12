'use client';

import { useState } from 'react';
import {
  standardFieldDefaults,
  standardFieldOrder,
  type StandardFieldKey,
  type StandardFieldOverride,
  type StandardFieldsConfig,
} from '@/offers/standard-fields';
import { OptionsEditor } from '@/components/admin/custom-fields-editor';

// Kurzname pro Feld als Zeilen-Überschrift im Editor.
const SHORT_NAME: Record<StandardFieldKey, string> = {
  name: 'Name',
  email: 'E-Mail',
  phone: 'Telefon',
  location: 'Ort des Shootings',
  message: 'Nachricht',
  discount: 'Rabatt-Code',
};

export function StandardFieldsEditor({ initial }: { initial: StandardFieldsConfig }) {
  const [config, setConfig] = useState<StandardFieldsConfig>(initial ?? {});

  // Mergt einen Patch in ein Feld und hält die Config sparse: nur visible:false,
  // nicht-leere Texte und der Auswahl-Modus (mit Optionen) werden gespeichert;
  // ist alles Default, fliegt der Eintrag raus.
  function setField(key: StandardFieldKey, patch: StandardFieldOverride) {
    setConfig((prev) => {
      const merged: StandardFieldOverride = { ...(prev[key] ?? {}), ...patch };
      const cleaned: StandardFieldOverride = {};
      if (merged.visible === false) cleaned.visible = false;
      if (merged.label && merged.label.trim() !== '') cleaned.label = merged.label;
      if (merged.placeholder && merged.placeholder.trim() !== '') {
        cleaned.placeholder = merged.placeholder;
      }
      if (merged.mode === 'select') {
        cleaned.mode = 'select';
        if (merged.options && merged.options.length > 0) {
          cleaned.options = merged.options;
        }
      }
      const next = { ...prev };
      if (Object.keys(cleaned).length === 0) {
        delete next[key];
      } else {
        next[key] = cleaned;
      }
      return next;
    });
  }

  return (
    <div className="field">
      <label>Standard-Abfragen</label>
      <small className="mut" style={{ display: 'block', marginBottom: 8 }}>
        Welche festen Felder beim Buchen erscheinen und wie sie heissen. Name und
        E-Mail sind immer dabei. Leer lassen = Standardtext.
      </small>

      {standardFieldOrder.map((key) => {
        const def = standardFieldDefaults[key];
        const ov = config[key] ?? {};
        const visible = def.hideable ? ov.visible !== false : true;

        return (
          <div
            key={key}
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
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
              }}
            >
              <strong style={{ fontSize: 13.5 }}>{SHORT_NAME[key]}</strong>
              {def.hideable ? (
                <label className="toggle-wrap" style={{ margin: 0 }}>
                  <span className="switch">
                    <input
                      type="checkbox"
                      checked={visible}
                      onChange={(e) => setField(key, { visible: e.target.checked })}
                    />
                    <span className="slider" />
                  </span>
                  {visible ? 'An' : 'Aus'}
                </label>
              ) : (
                <span className="mut" style={{ fontSize: 12 }}>
                  immer an
                </span>
              )}
            </div>

            <div className="field">
              <label>Beschriftung</label>
              <input
                type="text"
                value={ov.label ?? ''}
                placeholder={def.label}
                disabled={!visible}
                onChange={(e) => setField(key, { label: e.target.value })}
              />
            </div>

            {key === 'location' ? (
              <div className="field">
                <label>Eingabe-Art</label>
                <select
                  value={ov.mode === 'select' ? 'select' : 'text'}
                  disabled={!visible}
                  onChange={(e) =>
                    setField(key, {
                      mode: e.target.value === 'select' ? 'select' : undefined,
                      options:
                        e.target.value === 'select' ? (ov.options ?? ['']) : undefined,
                    })
                  }
                >
                  <option value="text">Freitext</option>
                  <option value="select">Auswahl (feste Orte)</option>
                </select>
                {ov.mode === 'select' ? (
                  <>
                    <OptionsEditor
                      options={ov.options ?? ['']}
                      onChange={(options) => setField(key, { options })}
                    />
                    <small className="mut">
                      Bei «Auswahl» ist die Ort-Angabe beim Buchen Pflicht und
                      erscheint so in Mails und im Termindetail.
                    </small>
                  </>
                ) : null}
              </div>
            ) : null}

            {def.hasPlaceholder && !(key === 'location' && ov.mode === 'select') ? (
              <div className="field">
                <label>Platzhalter</label>
                <input
                  type="text"
                  value={ov.placeholder ?? ''}
                  placeholder={def.placeholder}
                  disabled={!visible}
                  onChange={(e) => setField(key, { placeholder: e.target.value })}
                />
              </div>
            ) : null}
          </div>
        );
      })}

      {/* Serialisiert für die Server-Action (createOfferAction/updateOfferAction). */}
      <input type="hidden" name="standardFields" value={JSON.stringify(config)} />
    </div>
  );
}

# Konfigurierbare Abfragen pro Angebot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Admin kann pro Angebot eigene Zusatzfelder definieren (Text, langer Text, Zahl, Auswahl, Ja/Nein, Datum, je Pflicht/Optional); Kund:innen füllen sie beim Buchen aus; die Antworten erscheinen im Termindetail und in der Admin-Mail.

**Architecture:** JSONB-Spalten ohne neue Tabellen — `offers.custom_fields` (Definition) und `bookings.custom_fields` (Antworten als Snapshot). Ein gemeinsames, vollständig unit-getestetes Modul `src/offers/custom-fields.ts` ist die einzige Quelle für Typen und Validierung (Admin-Definition + serverseitige Antwort-Prüfung). UI in Admin-Angebotsformular, öffentlicher Buchungsstrecke und manuellem Buchungsformular nutzt eine gemeinsame Render-Komponente.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Drizzle ORM + PostgreSQL, Zod v4, Vitest, Tailwind v4 + custom CSS.

---

## File Structure

**Neu:**
- `src/offers/custom-fields.ts` — Typen (`CustomFieldDef`, `CustomFieldAnswer`, `CustomFieldType`, `AnswerValue`), Zod-Schemas (`customFieldDefSchema`, `customFieldsDefSchema`), Laufzeit-Validierung (`buildAnswerSchema`), FormData-Parsing (`parseAnswers`), Snapshots (`toAnswerSnapshots`), Anzeige (`formatAnswerValue`), UI-Liste (`customFieldTypes`).
- `src/offers/custom-fields.test.ts` — Unit-Tests für das Modul.
- `src/components/admin/custom-fields-editor.tsx` — Admin-Editor zum Definieren der Felder (Client-Komponente).
- `src/components/custom-field-inputs.tsx` — gemeinsame Render-Komponente der Felder für Buchungsformulare (Client).

**Geändert:**
- `src/db/schema.ts` — zwei JSONB-Spalten + Typ-Import.
- `src/offers/repository.ts` — `NewOfferData.customFields`.
- `src/offers/actions.ts` — Definition aus FormData parsen/validieren/durchreichen.
- `src/components/admin/offer-form-modal.tsx` — Editor einbinden.
- `src/components/book/booking-flow.tsx` — Zusatzfelder im Kontakt-Schritt rendern.
- `src/bookings/public-actions.ts` — Antworten validieren + speichern.
- `src/bookings/repository.ts` — `CreateBookingInput.customFields`.
- `src/bookings/actions.ts` — manuelle Buchung: Antworten validieren + speichern.
- `src/components/admin/new-booking-modal.tsx` — Zusatzfelder im manuellen Formular.
- `src/components/admin/booking-detail-modal.tsx` — Block „Weitere Angaben".
- `src/notify/index.ts` — Antworten in der Admin-Mail.
- `src/notify/index.test.ts` + weitere Testdoubles — `customFields: []` ergänzen.

**Bewusst NICHT geändert:** `src/offers/offer-input.ts` und `src/bookings/public-input.ts`/`booking-input.ts`. Die Felddefinition kommt als JSON-String und wird in der Server-Action separat gegen `customFieldsDefSchema` validiert — das hält die bestehenden Skalar-Schemas frei von JSON-Parsing und ist genauso server-autoritativ.

---

### Task 1: Gemeinsames Modul `custom-fields.ts` (Logik, TDD)

**Files:**
- Create: `src/offers/custom-fields.ts`
- Test: `src/offers/custom-fields.test.ts`

- [ ] **Step 1: Modul mit Typen, Schemas und Helfern anlegen**

Create `src/offers/custom-fields.ts`:

```ts
// Einzige Quelle der Wahrheit für konfigurierbare Zusatzfelder pro Angebot.
// KEIN server-only: wird im Admin-Editor, in der Buchungsstrecke (Client) und
// in den Server-Actions (autoritative Prüfung) verwendet.
import { z } from 'zod';

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'checkbox'
  | 'date';

// Definition eines Feldes (gespeichert in offers.custom_fields).
export type CustomFieldDef = {
  key: string; // stabil & eindeutig pro Angebot, z. B. "field_1"
  label: string;
  type: CustomFieldType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: string[]; // nur type === 'select'
  min?: number; // nur type === 'number'
  max?: number; // nur type === 'number'
};

export type AnswerValue = string | number | boolean;

// Antwort als Snapshot (gespeichert in bookings.custom_fields).
export type CustomFieldAnswer = {
  key: string;
  label: string;
  type: CustomFieldType;
  value: AnswerValue;
};

// Auswahl der Typen für das Admin-Dropdown (Reihenfolge = Anzeige).
export const customFieldTypes = [
  { value: 'text', label: 'Text (einzeilig)' },
  { value: 'textarea', label: 'Langer Text' },
  { value: 'number', label: 'Zahl' },
  { value: 'select', label: 'Auswahl' },
  { value: 'checkbox', label: 'Ja/Nein' },
  { value: 'date', label: 'Datum' },
] as const;

// --- Validierung der Definition (Admin) ---

export const customFieldDefSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().trim().min(1, 'Beschriftung fehlt.'),
    type: z.enum(['text', 'textarea', 'number', 'select', 'checkbox', 'date']),
    required: z.boolean().default(false),
    placeholder: z.string().optional(),
    helpText: z.string().optional(),
    options: z.array(z.string().trim().min(1)).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .refine((f) => f.type !== 'select' || (f.options?.length ?? 0) >= 1, {
    message: 'Auswahl-Felder brauchen mindestens eine Option.',
    path: ['options'],
  })
  .refine(
    (f) =>
      f.type !== 'number' ||
      f.min === undefined ||
      f.max === undefined ||
      f.min <= f.max,
    { message: 'Min darf nicht grösser als Max sein.', path: ['min'] },
  );

export const customFieldsDefSchema = z
  .array(customFieldDefSchema)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((f, i) => {
      if (seen.has(f.key)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Doppelter Feld-Schlüssel.',
          path: [i, 'key'],
        });
      }
      seen.add(f.key);
    });
  });

// --- Laufzeit-Validierung der Antworten (Server) ---

function fieldValueSchema(f: CustomFieldDef): z.ZodTypeAny {
  switch (f.type) {
    case 'number': {
      let s = z.coerce.number();
      if (typeof f.min === 'number') s = s.min(f.min);
      if (typeof f.max === 'number') s = s.max(f.max);
      return s;
    }
    case 'select':
      return f.options && f.options.length > 0
        ? z.enum(f.options as [string, ...string[]])
        : z.string();
    case 'checkbox':
      return z.boolean();
    case 'date':
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    case 'textarea':
    case 'text':
    default:
      return z.string().min(1);
  }
}

// Baut ein Zod-Objektschema über die Antworten. Pflichtfelder müssen vorhanden
// sein; optionale Felder dürfen fehlen; Checkboxen sind immer boolean.
export function buildAnswerSchema(fields: CustomFieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let v = fieldValueSchema(f);
    if (f.type === 'checkbox') {
      v = v.default(false);
    } else if (!f.required) {
      v = v.optional();
    }
    shape[f.key] = v;
  }
  return z.object(shape);
}

// Baut die Snapshots aus validierten Werten. Checkboxen immer (Ja/Nein),
// andere Felder nur, wenn ein Wert vorhanden ist.
export function toAnswerSnapshots(
  fields: CustomFieldDef[],
  values: Record<string, AnswerValue | undefined>,
): CustomFieldAnswer[] {
  const out: CustomFieldAnswer[] = [];
  for (const f of fields) {
    const value = values[f.key];
    if (f.type === 'checkbox') {
      out.push({ key: f.key, label: f.label, type: f.type, value: Boolean(value) });
    } else if (value !== undefined && value !== '') {
      out.push({ key: f.key, label: f.label, type: f.type, value });
    }
  }
  return out;
}

// Liest die cf_*-Werte aus FormData, validiert sie und liefert Snapshots.
export function parseAnswers(
  fields: CustomFieldDef[],
  formData: FormData,
): { ok: true; answers: CustomFieldAnswer[] } | { ok: false; error: string } {
  const raw: Record<string, unknown> = {};
  for (const f of fields) {
    const v = formData.get(`cf_${f.key}`);
    if (f.type === 'checkbox') {
      raw[f.key] = v === 'on' || v === 'true';
    } else if (typeof v === 'string' && v.trim() !== '') {
      raw[f.key] = v.trim();
    }
    // sonst: weglassen (optional/leer)
  }
  const parsed = buildAnswerSchema(fields).safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Bitte die Zusatzfelder prüfen.' };
  }
  return {
    ok: true,
    answers: toAnswerSnapshots(fields, parsed.data as Record<string, AnswerValue>),
  };
}

// Menschlesbare Darstellung eines Antwortwerts (Termindetail + Mail).
export function formatAnswerValue(a: CustomFieldAnswer): string {
  if (a.type === 'checkbox') return a.value ? 'Ja' : 'Nein';
  return String(a.value);
}
```

- [ ] **Step 2: Tests schreiben**

Create `src/offers/custom-fields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  customFieldsDefSchema,
  buildAnswerSchema,
  toAnswerSnapshots,
  parseAnswers,
  formatAnswerValue,
  type CustomFieldDef,
} from './custom-fields';

describe('customFieldsDefSchema', () => {
  it('lehnt ein Auswahlfeld ohne Optionen ab', () => {
    const r = customFieldsDefSchema.safeParse([
      { key: 'field_1', label: 'Stil', type: 'select', required: true },
    ]);
    expect(r.success).toBe(false);
  });

  it('lehnt doppelte Schlüssel ab', () => {
    const r = customFieldsDefSchema.safeParse([
      { key: 'field_1', label: 'A', type: 'text', required: false },
      { key: 'field_1', label: 'B', type: 'text', required: false },
    ]);
    expect(r.success).toBe(false);
  });

  it('lehnt min > max bei Zahl ab', () => {
    const r = customFieldsDefSchema.safeParse([
      { key: 'field_1', label: 'Gäste', type: 'number', required: false, min: 10, max: 2 },
    ]);
    expect(r.success).toBe(false);
  });

  it('akzeptiert ein gültiges Auswahlfeld', () => {
    const r = customFieldsDefSchema.safeParse([
      { key: 'field_1', label: 'Stil', type: 'select', required: true, options: ['Indoor', 'Outdoor'] },
    ]);
    expect(r.success).toBe(true);
  });
});

const NUM_FIELD: CustomFieldDef = {
  key: 'g',
  label: 'Gäste',
  type: 'number',
  required: true,
  min: 1,
  max: 5,
};

describe('buildAnswerSchema', () => {
  it('erzwingt Pflichtfelder', () => {
    const schema = buildAnswerSchema([
      { key: 't', label: 'Ort', type: 'text', required: true },
    ]);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ t: 'Bern' }).success).toBe(true);
  });

  it('prüft Min/Max bei Zahlen', () => {
    const schema = buildAnswerSchema([NUM_FIELD]);
    expect(schema.safeParse({ g: 0 }).success).toBe(false);
    expect(schema.safeParse({ g: 6 }).success).toBe(false);
    expect(schema.safeParse({ g: 3 }).success).toBe(true);
  });

  it('lässt ungültige Auswahloptionen nicht zu', () => {
    const schema = buildAnswerSchema([
      { key: 's', label: 'Stil', type: 'select', required: true, options: ['Indoor', 'Outdoor'] },
    ]);
    expect(schema.safeParse({ s: 'Mond' }).success).toBe(false);
    expect(schema.safeParse({ s: 'Indoor' }).success).toBe(true);
  });

  it('lässt optionale Felder weg', () => {
    const schema = buildAnswerSchema([
      { key: 'o', label: 'Wunsch', type: 'text', required: false },
    ]);
    expect(schema.safeParse({}).success).toBe(true);
  });
});

describe('toAnswerSnapshots', () => {
  it('übernimmt Label/Typ und überspringt leere Nicht-Checkboxen', () => {
    const fields: CustomFieldDef[] = [
      { key: 'a', label: 'Ort', type: 'text', required: false },
      { key: 'b', label: 'Anfahrt', type: 'checkbox', required: false },
    ];
    const snaps = toAnswerSnapshots(fields, { b: true });
    expect(snaps).toEqual([
      { key: 'b', label: 'Anfahrt', type: 'checkbox', value: true },
    ]);
  });
});

describe('parseAnswers', () => {
  it('liest Checkbox und Text aus FormData', () => {
    const fields: CustomFieldDef[] = [
      { key: 'ort', label: 'Ort', type: 'text', required: true },
      { key: 'anfahrt', label: 'Anfahrt', type: 'checkbox', required: false },
    ];
    const fd = new FormData();
    fd.set('cf_ort', 'Bern');
    fd.set('cf_anfahrt', 'on');
    const r = parseAnswers(fields, fd);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answers).toContainEqual({ key: 'ort', label: 'Ort', type: 'text', value: 'Bern' });
      expect(r.answers).toContainEqual({ key: 'anfahrt', label: 'Anfahrt', type: 'checkbox', value: true });
    }
  });

  it('meldet Fehler bei fehlendem Pflichtfeld', () => {
    const fields: CustomFieldDef[] = [
      { key: 'ort', label: 'Ort', type: 'text', required: true },
    ];
    const r = parseAnswers(fields, new FormData());
    expect(r.ok).toBe(false);
  });
});

describe('formatAnswerValue', () => {
  it('zeigt Checkbox als Ja/Nein', () => {
    expect(formatAnswerValue({ key: 'a', label: 'X', type: 'checkbox', value: true })).toBe('Ja');
    expect(formatAnswerValue({ key: 'a', label: 'X', type: 'checkbox', value: false })).toBe('Nein');
  });
});
```

- [ ] **Step 3: Tests laufen lassen**

Run: `npm test -- src/offers/custom-fields.test.ts`
Expected: alle Tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/offers/custom-fields.ts src/offers/custom-fields.test.ts
git commit -m "feat(offers): Modul für konfigurierbare Zusatzfelder (Typen, Validierung)"
```

---

### Task 2: Schema-Spalten + Migration

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `src/notify/index.test.ts` (Testdouble) und weitere Testdoubles, die tsc meldet

- [ ] **Step 1: Typ-Import oben in `schema.ts` ergänzen**

In `src/db/schema.ts` direkt nach Zeile 1 (`import { pgTable, ... } from 'drizzle-orm/pg-core';`) einfügen:

```ts
import type { CustomFieldDef, CustomFieldAnswer } from '../offers/custom-fields';
```

- [ ] **Step 2: Spalte an `offers` anhängen**

In `src/db/schema.ts`, in der `offers`-Tabelle nach der Zeile `sortOrder: integer('sort_order').notNull().default(0),` einfügen:

```ts
  customFields: jsonb('custom_fields').$type<CustomFieldDef[]>().notNull().default([]),
```

- [ ] **Step 3: Spalte an `bookings` anhängen**

In `src/db/schema.ts`, in der `bookings`-Tabelle nach der Zeile `discountId: uuid('discount_id').references(() => discounts.id, { onDelete: 'set null' }),` einfügen:

```ts
  customFields: jsonb('custom_fields').$type<CustomFieldAnswer[]>().notNull().default([]),
```

- [ ] **Step 4: Migration generieren**

Run: `npm run db:generate`
Expected: eine neue Datei unter `migrations/` mit zwei `ADD COLUMN ... jsonb ... DEFAULT '[]'::jsonb NOT NULL`.

- [ ] **Step 5: Testdoubles anpassen (Typprüfung)**

Run: `npx tsc --noEmit`
Expected: Fehler in Testdoubles, die ein vollständiges `Booking`/`Offer`-Objekt bauen, weil `customFields` fehlt.

Bekannt: in `src/notify/index.test.ts` in `makeBooking()` nach `googleCalendarId: null,` einfügen:

```ts
    customFields: [],
```

Danach erneut `npx tsc --noEmit` und in JEDER weiteren von tsc gemeldeten Datei (Kandidaten: `src/bookings/repository.test.ts`, `src/google/sync.test.ts`, `src/google/calendar-logic.test.ts`, `src/discounts/redeem.test.ts`, `src/availability/slots.test.ts`, `src/scripts/seed-demo.ts`) am betroffenen Objektliteral `customFields: []` ergänzen. (Inserts über `db.insert(...).values({...})` brauchen NICHTS, weil die Spalte einen Default hat — nur vollständige `Offer`/`Booking`-Literale.)

- [ ] **Step 6: Typprüfung + Tests grün**

Run: `npx tsc --noEmit && npm test`
Expected: keine Typfehler, alle Tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts migrations/ src/
git commit -m "feat(db): JSONB-Spalten custom_fields für offers und bookings"
```

> **Hinweis zum Anwenden auf die DB:** Lokal mit gesetzter `DATABASE_URL` via `npm run db:push` (oder `npm run db:migrate`) ausführen. Die Unit-Tests benötigen keine DB.

---

### Task 3: Felddefinition speichern (Repository + Action)

**Files:**
- Modify: `src/offers/repository.ts:24-34` (`NewOfferData`)
- Modify: `src/offers/actions.ts`

- [ ] **Step 1: `NewOfferData` um `customFields` erweitern**

In `src/offers/repository.ts` den Typ `NewOfferData` (ab Zeile 24) anpassen — nach `active: boolean;` einfügen:

```ts
  customFields?: CustomFieldDef[];
```

Und den Import oben (Zeile 4) erweitern:

```ts
import { offers, type Offer } from '@/db/schema';
import type { CustomFieldDef } from './custom-fields';
```

(`createOffer`/`updateOffer` brauchen keine weitere Änderung — `data` wird unverändert an `.values(...)`/`.set(...)` durchgereicht.)

- [ ] **Step 2: Definition in der Action parsen und durchreichen**

In `src/offers/actions.ts` den Import-Block (Zeilen 5–11) erweitern:

```ts
import {
  createOffer,
  updateOffer,
  deleteOffer,
  setOfferActive,
} from './repository';
import { offerSchema } from './offer-input';
import { customFieldsDefSchema, type CustomFieldDef } from './custom-fields';
```

Direkt nach der Funktion `parseOfferForm` (nach Zeile 36) eine Helferfunktion einfügen:

```ts
// Liest die als JSON serialisierte Felddefinition aus dem Formular und prüft
// sie server-autoritativ. Rückgabe null = ungültig (Action soll abbrechen).
function parseCustomFieldsField(formData: FormData): CustomFieldDef[] | null {
  const raw = formData.get('customFields');
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = customFieldsDefSchema.safeParse(json);
  return parsed.success ? (parsed.data as CustomFieldDef[]) : null;
}
```

In `createOfferAction` nach `const data = parsed.data;` (Zeile 47) einfügen:

```ts
  const customFields = parseCustomFieldsField(formData);
  if (customFields === null) {
    return { error: 'Zusätzliche Abfragen sind ungültig.' };
  }
```

und im `createOffer({...})`-Aufruf nach `active: data.active,` ergänzen:

```ts
    customFields,
```

In `updateOfferAction` nach `const data = parsed.data;` (Zeile 78) dieselben drei Zeilen (`const customFields = ...`) einfügen und im `updateOffer(id, {...})`-Aufruf nach `active: data.active,` ebenfalls `customFields,` ergänzen.

- [ ] **Step 3: Typprüfung**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/offers/repository.ts src/offers/actions.ts
git commit -m "feat(offers): Felddefinition aus Formular validieren und speichern"
```

---

### Task 4: Admin-Editor-Komponente

**Files:**
- Create: `src/components/admin/custom-fields-editor.tsx`

- [ ] **Step 1: Editor-Komponente anlegen**

Create `src/components/admin/custom-fields-editor.tsx`:

```tsx
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
                onChange={(e) => update(i, { type: e.target.value as CustomFieldType })}
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
            <label>Hinweis / Platzhalter (optional)</label>
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

function OptionsEditor({
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
```

- [ ] **Step 2: Typprüfung**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/custom-fields-editor.tsx
git commit -m "feat(admin): Editor-Komponente für konfigurierbare Zusatzfelder"
```

---

### Task 5: Editor ins Angebots-Formular einbinden

**Files:**
- Modify: `src/components/admin/offer-form-modal.tsx`

- [ ] **Step 1: Import ergänzen**

In `src/components/admin/offer-form-modal.tsx` nach Zeile 10 (`import type { Offer } from '@/db/schema';`) einfügen:

```ts
import { CustomFieldsEditor } from './custom-fields-editor';
```

- [ ] **Step 2: Editor im Formular rendern**

In `src/components/admin/offer-form-modal.tsx` direkt NACH dem Beschreibungs-Feld-Block (der schliessende `</div>` der `<div className="field">` mit der `textarea#description`, Zeile 163) und VOR dem `active`-Toggle-Block (Zeile 165) einfügen:

```tsx
            <CustomFieldsEditor initial={offer?.customFields ?? []} />
```

- [ ] **Step 3: Typprüfung**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Manuelle Sichtprüfung**

Run: `npm run dev`, dann im Admin `/admin/angebote` ein Angebot öffnen/anlegen. Erwartung: Sektion „Zusätzliche Abfragen" mit „+ Feld hinzufügen"; Feld anlegen, Typ wechseln (bei „Auswahl" erscheinen Optionen, bei „Zahl" Min/Max), Pflicht-Schalter, Sortier-Pfeile, Entfernen. Speichern → erneut öffnen → Felder sind vorhanden.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/offer-form-modal.tsx
git commit -m "feat(admin): Zusatzfelder-Editor im Angebotsformular einbinden"
```

---

### Task 6: Gemeinsame Render-Komponente der Felder

**Files:**
- Create: `src/components/custom-field-inputs.tsx`

- [ ] **Step 1: Komponente anlegen**

Create `src/components/custom-field-inputs.tsx`:

```tsx
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
```

- [ ] **Step 2: Typprüfung**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/components/custom-field-inputs.tsx
git commit -m "feat(book): gemeinsame Render-Komponente für Zusatzfelder"
```

---

### Task 7: Zusatzfelder in der öffentlichen Buchungsstrecke

**Files:**
- Modify: `src/components/book/booking-flow.tsx`

- [ ] **Step 1: Import ergänzen**

In `src/components/book/booking-flow.tsx` nach Zeile 17 (`import type { Offer } from '@/db/schema';`) einfügen:

```ts
import { CustomFieldInputs } from '@/components/custom-field-inputs';
```

- [ ] **Step 2: Felder im Kontakt-Schritt rendern**

In `src/components/book/booking-flow.tsx`, in `ContactStep`, direkt NACH dem schliessenden `</div>` des Standard-Felder-Blocks `<div className="bookx-fields"> … </div>` (Zeile 514) und VOR `<div className="bookx-folds">` (Zeile 516) einfügen:

```tsx
      <div className="bookx-fields">
        <CustomFieldInputs fields={offer.customFields} wrapperClass="bookx-field" />
      </div>
```

- [ ] **Step 3: Typprüfung + manuelle Sichtprüfung**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

Dann `npm run dev`, ein Angebot mit Zusatzfeldern über `/book` durchbuchen. Erwartung: die definierten Felder erscheinen im Kontakt-Schritt mit korrektem Eingabetyp; Pflichtfelder sind mit `*` markiert und blockieren das Absenden, wenn leer.

- [ ] **Step 4: Commit**

```bash
git add src/components/book/booking-flow.tsx
git commit -m "feat(book): Zusatzfelder im Kontakt-Schritt der Buchungsstrecke"
```

---

### Task 8: Antworten speichern (öffentliche Buchung)

**Files:**
- Modify: `src/bookings/repository.ts:7-21` (`CreateBookingInput`) und `createBooking` (Zeilen 31-51)
- Modify: `src/bookings/public-actions.ts`

- [ ] **Step 1: `CreateBookingInput` + Insert erweitern**

In `src/bookings/repository.ts` den Import oben (Zeile 4) erweitern:

```ts
import { bookings, type Booking } from '@/db/schema';
import type { CustomFieldAnswer } from '@/offers/custom-fields';
```

In `CreateBookingInput` (ab Zeile 7) nach `discountId?: string | null;` einfügen:

```ts
  customFields?: CustomFieldAnswer[];
```

In `createBooking` im `.values({...})`-Objekt nach `discountId: input.discountId ?? null,` (Zeile 47) einfügen:

```ts
      customFields: input.customFields ?? [],
```

- [ ] **Step 2: In der öffentlichen Action validieren + durchreichen**

In `src/bookings/public-actions.ts` den Import-Block (Zeilen 10–11) erweitern:

```ts
import { createBooking, updateBookingPricing } from './repository';
import { publicBookingSchema } from './public-input';
import { parseAnswers } from '@/offers/custom-fields';
```

Nach dem Block, der das Angebot prüft (nach Zeile 91, dem schliessenden `}` von `if (!offer || !offer.active) { ... }`), einfügen:

```ts
  const cf = parseAnswers(offer.customFields, formData);
  if (!cf.ok) {
    return { error: cf.error };
  }
```

Im `createBooking({...})`-Aufruf nach `status: 'neu',` (Zeile 132) einfügen:

```ts
    customFields: cf.answers,
```

- [ ] **Step 3: Typprüfung + Tests**

Run: `npx tsc --noEmit && npm test`
Expected: keine Typfehler, alle Tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/bookings/repository.ts src/bookings/public-actions.ts
git commit -m "feat(book): Antworten der Zusatzfelder validieren und speichern"
```

---

### Task 9: Manuelle Buchung (Admin) — Felder rendern + speichern

**Files:**
- Modify: `src/components/admin/new-booking-modal.tsx`
- Modify: `src/bookings/actions.ts` (`createManualBooking`, Zeilen 77-119)

- [ ] **Step 1: Felder im manuellen Formular rendern**

In `src/components/admin/new-booking-modal.tsx` nach Zeile 6 (`import type { Offer } from '@/db/schema';`) einfügen:

```ts
import { CustomFieldInputs } from '@/components/custom-field-inputs';
```

Nach `function handleOfferChange(...) { ... }` (nach Zeile 46) die Ableitung des gewählten Angebots ergänzen:

```ts
  const selectedOffer = offers.find((o) => o.id === offerId);
```

Im Formular direkt NACH dem Nachricht-Feld-Block `<div className="field"> … <textarea id="message" … /> </div>` (nach Zeile 150) und VOR dem Fehler-Block (Zeile 152) einfügen:

```tsx
            <CustomFieldInputs
              fields={selectedOffer?.customFields ?? []}
              wrapperClass="field"
            />
```

- [ ] **Step 2: In der manuellen Action validieren + durchreichen**

In `src/bookings/actions.ts` den Import-Block (Zeilen 7–13) erweitern:

```ts
import {
  createBooking,
  getBooking,
  setBookingStatus,
} from './repository';
import { canTransition, type BookingStatusValue } from './status';
import { manualBookingSchema } from './booking-input';
import { parseAnswers } from '@/offers/custom-fields';
```

In `createManualBooking` nach `const offerNameSnapshot = offer?.name ?? '';` (Zeile 99) einfügen:

```ts
  const cf = parseAnswers(offer?.customFields ?? [], formData);
  if (!cf.ok) {
    return { error: cf.error };
  }
```

Im `createBooking({...})`-Aufruf nach `status: 'neu',` (Zeile 113) einfügen:

```ts
    customFields: cf.answers,
```

- [ ] **Step 3: Typprüfung + manuelle Sichtprüfung**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

Dann `npm run dev`, im Admin „Neue Buchung" öffnen, ein Angebot mit Zusatzfeldern wählen → die Felder erscheinen und passen sich beim Wechsel des Angebots an.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/new-booking-modal.tsx src/bookings/actions.ts
git commit -m "feat(admin): Zusatzfelder im manuellen Buchungsformular"
```

---

### Task 10: Antworten im Termindetail anzeigen

**Files:**
- Modify: `src/components/admin/booking-detail-modal.tsx`

- [ ] **Step 1: Import ergänzen**

In `src/components/admin/booking-detail-modal.tsx` nach Zeile 4 (`import { formatRappen } from '@/lib/money';`) einfügen:

```ts
import { formatAnswerValue } from '@/offers/custom-fields';
```

- [ ] **Step 2: Block „Weitere Angaben" rendern**

In `src/components/admin/booking-detail-modal.tsx` direkt NACH dem Nachricht-Block (`{booking.message ? ( … ) : null}`, Zeilen 122-127) und VOR dem schliessenden `</div>` der `.modal-b` (Zeile 128) einfügen:

```tsx
          {booking.customFields.length > 0 ? (
            <div className="det-card" style={{ marginTop: 12 }}>
              {booking.customFields.map((a) => (
                <div className="det-row" key={a.key}>
                  <span className="k">{a.label}</span>
                  <span className="v">{formatAnswerValue(a)}</span>
                </div>
              ))}
            </div>
          ) : null}
```

- [ ] **Step 3: Typprüfung**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/booking-detail-modal.tsx
git commit -m "feat(admin): Block für Zusatzfeld-Antworten im Termindetail"
```

---

### Task 11: Antworten in der Admin-Mail

**Files:**
- Modify: `src/notify/index.ts` (`notifyAdminNewBooking`, Zeilen 50-73)
- Modify: `src/notify/index.test.ts`

- [ ] **Step 1: Failing-Test schreiben**

In `src/notify/index.test.ts` im `describe('notifyAdminNewBooking', ...)`-Block (nach Zeile 85) ergänzen:

```ts
  it('listet die Antworten der Zusatzfelder auf', async () => {
    const { transport, sent } = captureTransport();
    const b = makeBooking({
      customFields: [
        { key: 'g', label: 'Anzahl Gäste', type: 'number', value: 12 },
        { key: 'a', label: 'Anfahrt', type: 'checkbox', value: true },
      ],
    });

    await notifyAdminNewBooking(b, transport);

    expect(sent[0].text).toContain('Anzahl Gäste: 12');
    expect(sent[0].text).toContain('Anfahrt: Ja');
  });
```

- [ ] **Step 2: Test laufen lassen (muss fehlschlagen)**

Run: `npm test -- src/notify/index.test.ts`
Expected: FAIL — der neue Test, weil die Antworten noch nicht im Text stehen.

- [ ] **Step 3: `notifyAdminNewBooking` erweitern**

In `src/notify/index.ts` den Import-Block oben (nach Zeile 2) ergänzen:

```ts
import { formatAnswerValue } from '@/offers/custom-fields';
```

In `notifyAdminNewBooking` das `text`-Array (Zeilen 54-66) so anpassen, dass die Antworten vor `.filter(Boolean)` eingefügt werden — die Zeile `b.message ? \`Nachricht: ${b.message}\` : '',` bleibt, danach ergänzen:

```ts
    b.message ? `Nachricht: ${b.message}` : '',
    ...b.customFields.map((a) => `${a.label}: ${formatAnswerValue(a)}`),
  ]
    .filter(Boolean)
    .join('\n');
```

- [ ] **Step 4: Tests grün**

Run: `npm test -- src/notify/index.test.ts`
Expected: alle Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/notify/index.ts src/notify/index.test.ts
git commit -m "feat(notify): Zusatzfeld-Antworten in der Admin-Mail auflisten"
```

---

### Task 12: Abschluss — Gesamtprüfung

- [ ] **Step 1: Vollständige Prüfung**

Run: `npx tsc --noEmit && npm test && npm run lint`
Expected: keine Typfehler, alle Tests PASS, kein Lint-Fehler.

- [ ] **Step 2: Build**

Run: `npm run build`
Expected: Build erfolgreich (type-checkt die gesamte App).

- [ ] **Step 3: End-to-End-Sichtprüfung (mit lokaler DB)**

`npm run db:push` (Spalten anlegen), dann `npm run dev`:
1. Angebot mit je einem Feld pro Typ anlegen (Text, langer Text, Zahl mit Min/Max, Auswahl, Ja/Nein, Datum), einige als Pflicht.
2. Über `/book` buchen: Felder erscheinen, Pflicht wird erzwungen, Zahl ausserhalb Min/Max wird serverseitig abgelehnt.
3. Im Admin-Termindetail erscheinen die Antworten unter „Weitere Angaben".
4. Konsole/Log zeigt die Admin-Mail mit den aufgelisteten Antworten.
```

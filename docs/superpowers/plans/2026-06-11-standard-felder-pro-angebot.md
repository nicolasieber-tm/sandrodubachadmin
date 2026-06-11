# Konfigurierbare Standardfelder pro Angebot — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der Admin kann pro Angebot die fest eingebauten Standardfelder der Buchungsstrecke (Name, E-Mail, Telefon, Ortsfrage, Nachricht, Rabatt-Code) umbenennen und — ausser Name/E-Mail — ein-/ausschalten.

**Architecture:** Eine neue JSONB-Spalte `offers.standard_fields` speichert nur die Abweichungen vom Standard (sparse). Ein gemeinsames Modul `src/offers/standard-fields.ts` (Typen, Defaults, Zod-Schema, `resolveStandardFields`) ist die einzige Quelle der Wahrheit für Admin-Editor, Buchungsstrecke und Server-Action — exakt das Muster der bestehenden `customFields`.

**Tech Stack:** Next.js (App Router, Server Actions), Drizzle ORM (Postgres), Zod v4, React (Client Components), Vitest.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-11-standard-felder-pro-angebot-design.md`

**Konventionen aus dem Projekt:**
- Schema-Sync via `npm run db:push` (keine generierten Migrationen).
- Tests: `npm test` (vitest run). Typecheck: `npx tsc --noEmit`. Lint: `npm run lint`.
- Commits direkt auf `main` (wie die bestehende Historie).

---

## Dateiübersicht

| Datei | Verantwortung |
|---|---|
| `src/offers/standard-fields.ts` | **neu** — Typen, Defaults, Reihenfolge, Zod-Schema, `resolveStandardFields` |
| `src/offers/standard-fields.test.ts` | **neu** — Unit-Tests für Defaults/Resolve/Schema |
| `src/db/schema.ts` | JSONB-Spalte `standard_fields` + Typ-Import |
| `src/offers/repository.ts` | `NewOfferData` um `standardFields` erweitern |
| `src/offers/actions.ts` | `parseStandardFieldsField` + in create/update durchreichen |
| `src/components/admin/standard-fields-editor.tsx` | **neu** — Editor „Standard-Abfragen" |
| `src/components/admin/offer-form-modal.tsx` | Editor einbinden |
| `src/components/book/booking-flow.tsx` | Felder dynamisch rendern/verstecken + Labels |
| `src/bookings/public-input.ts` | `customerPhone` optional |
| `src/bookings/public-actions.ts` | autoritative Telefon-Pflichtprüfung aus Config |

---

## Task 1: Modul `standard-fields.ts` (Logik + Tests)

**Files:**
- Create: `src/offers/standard-fields.ts`
- Test: `src/offers/standard-fields.test.ts`

- [ ] **Step 1: Modul schreiben**

Create `src/offers/standard-fields.ts`:

```ts
// Einzige Quelle der Wahrheit für die konfigurierbaren Standardfelder der
// Buchungsstrecke. KEIN server-only: Admin-Editor, Buchungsstrecke (Client) und
// Server-Action nutzen dasselbe Modul (Muster wie custom-fields.ts).
import { z } from 'zod';

export type StandardFieldKey =
  | 'name'
  | 'email'
  | 'phone'
  | 'location'
  | 'message'
  | 'discount';

// Nur Abweichungen vom Default werden gespeichert (sparse). Bei 'name'/'email'
// wird `visible` ignoriert (immer sichtbar). `placeholder` nur location/message.
export type StandardFieldOverride = {
  visible?: boolean;
  label?: string;
  placeholder?: string;
};

export type StandardFieldsConfig = Partial<
  Record<StandardFieldKey, StandardFieldOverride>
>;

// Vollständig aufgelöstes Feld für Rendering + Validierung.
export type ResolvedStandardField = {
  key: StandardFieldKey;
  visible: boolean;
  label: string;
  placeholder: string;
  required: boolean;
  hideable: boolean;
  hasPlaceholder: boolean;
};

type StandardFieldDefault = {
  label: string;
  placeholder: string;
  hideable: boolean; // false = immer sichtbar (name/email)
  required: boolean; // feste Pflicht-Logik (nicht konfigurierbar)
  hasPlaceholder: boolean;
};

// Default-Texte 1:1 aus dem heutigen booking-flow.tsx.
export const standardFieldDefaults: Record<StandardFieldKey, StandardFieldDefault> = {
  name: { label: 'Name', placeholder: '', hideable: false, required: true, hasPlaceholder: false },
  email: { label: 'E-Mail', placeholder: '', hideable: false, required: true, hasPlaceholder: false },
  phone: { label: 'Telefon', placeholder: '', hideable: true, required: true, hasPlaceholder: false },
  location: {
    label: 'Wo soll das Shooting stattfinden? (Ort/Region, optional)',
    placeholder: 'z. B. Bern, Thun, bei dir zu Hause …',
    hideable: true,
    required: false,
    hasPlaceholder: true,
  },
  message: {
    label: 'Nachricht hinzufügen',
    placeholder: 'Wünsche, Anlass, Personenzahl …',
    hideable: true,
    required: false,
    hasPlaceholder: true,
  },
  discount: { label: 'Rabatt-Code?', placeholder: '', hideable: true, required: false, hasPlaceholder: false },
};

// Feste Reihenfolge für Editor + Rendering.
export const standardFieldOrder: StandardFieldKey[] = [
  'name',
  'email',
  'phone',
  'location',
  'message',
  'discount',
];

// Validierung der gespeicherten Config (Admin-Action, autoritativ). Unbekannte
// Keys werden von z.object standardmässig verworfen (strip).
const overrideSchema = z.object({
  visible: z.boolean().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
});

export const standardFieldsConfigSchema = z.object({
  name: overrideSchema.optional(),
  email: overrideSchema.optional(),
  phone: overrideSchema.optional(),
  location: overrideSchema.optional(),
  message: overrideSchema.optional(),
  discount: overrideSchema.optional(),
});

function resolveOne(
  key: StandardFieldKey,
  config: StandardFieldsConfig,
): ResolvedStandardField {
  const def = standardFieldDefaults[key];
  const ov = config[key] ?? {};
  const label = ov.label && ov.label.trim() !== '' ? ov.label.trim() : def.label;
  const placeholder =
    def.hasPlaceholder && ov.placeholder && ov.placeholder.trim() !== ''
      ? ov.placeholder.trim()
      : def.placeholder;
  // name/email immer sichtbar; sonst Override oder Default (true).
  const visible = def.hideable ? ov.visible !== false : true;
  return {
    key,
    visible,
    label,
    placeholder,
    required: def.required,
    hideable: def.hideable,
    hasPlaceholder: def.hasPlaceholder,
  };
}

export function resolveStandardFields(
  config: StandardFieldsConfig | null | undefined,
): Record<StandardFieldKey, ResolvedStandardField> {
  const cfg = config ?? {};
  return {
    name: resolveOne('name', cfg),
    email: resolveOne('email', cfg),
    phone: resolveOne('phone', cfg),
    location: resolveOne('location', cfg),
    message: resolveOne('message', cfg),
    discount: resolveOne('discount', cfg),
  };
}
```

- [ ] **Step 2: Testdatei schreiben**

Create `src/offers/standard-fields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  resolveStandardFields,
  standardFieldsConfigSchema,
  standardFieldDefaults,
} from './standard-fields';

describe('resolveStandardFields', () => {
  it('liefert für leere Config alle Defaults', () => {
    const r = resolveStandardFields({});
    expect(r.name.visible).toBe(true);
    expect(r.email.visible).toBe(true);
    expect(r.phone.visible).toBe(true);
    expect(r.phone.required).toBe(true);
    expect(r.name.label).toBe('Name');
    expect(r.location.placeholder).toBe(standardFieldDefaults.location.placeholder);
  });

  it('akzeptiert null/undefined wie eine leere Config', () => {
    expect(resolveStandardFields(null).phone.visible).toBe(true);
    expect(resolveStandardFields(undefined).discount.visible).toBe(true);
  });

  it('schaltet schaltbare Felder per visible:false aus', () => {
    const r = resolveStandardFields({
      phone: { visible: false },
      location: { visible: false },
      message: { visible: false },
      discount: { visible: false },
    });
    expect(r.phone.visible).toBe(false);
    expect(r.location.visible).toBe(false);
    expect(r.message.visible).toBe(false);
    expect(r.discount.visible).toBe(false);
  });

  it('hält name und email immer sichtbar, auch bei visible:false', () => {
    const r = resolveStandardFields({
      name: { visible: false },
      email: { visible: false },
    });
    expect(r.name.visible).toBe(true);
    expect(r.email.visible).toBe(true);
  });

  it('übernimmt Label-Override, fällt bei leerem String auf Default zurück', () => {
    const r = resolveStandardFields({
      phone: { label: 'Handynummer' },
      name: { label: '   ' },
    });
    expect(r.phone.label).toBe('Handynummer');
    expect(r.name.label).toBe('Name');
  });

  it('übernimmt Placeholder-Override nur für Felder mit Platzhalter', () => {
    const r = resolveStandardFields({
      location: { placeholder: 'z. B. dein Atelier' },
      phone: { placeholder: 'ignoriert' },
    });
    expect(r.location.placeholder).toBe('z. B. dein Atelier');
    expect(r.phone.placeholder).toBe('');
  });
});

describe('standardFieldsConfigSchema', () => {
  it('akzeptiert eine gültige Config', () => {
    const r = standardFieldsConfigSchema.safeParse({
      phone: { visible: false, label: 'Handy' },
      location: { placeholder: 'Ort' },
    });
    expect(r.success).toBe(true);
  });

  it('verwirft unbekannte Keys (strip), bleibt aber gültig', () => {
    const r = standardFieldsConfigSchema.safeParse({ foo: { visible: false } });
    expect(r.success).toBe(true);
    if (r.success) expect('foo' in r.data).toBe(false);
  });

  it('lehnt falsche Typen ab', () => {
    const r = standardFieldsConfigSchema.safeParse({ phone: { visible: 'yes' } });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 3: Tests laufen lassen**

Run: `npm test -- src/offers/standard-fields.test.ts`
Expected: PASS (alle 9 Tests grün).

- [ ] **Step 4: Commit**

```bash
git add src/offers/standard-fields.ts src/offers/standard-fields.test.ts
git commit -m "feat(offers): standard-fields Modul (Defaults, Schema, resolveStandardFields)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 2: DB-Spalte `standard_fields`

**Files:**
- Modify: `src/db/schema.ts:2` (Import) und `src/db/schema.ts:73` (Spalte in `offers`)

- [ ] **Step 1: Typ-Import ergänzen**

In `src/db/schema.ts`, direkt unter der bestehenden Zeile 2:

```ts
import type { CustomFieldDef, CustomFieldAnswer } from '../offers/custom-fields';
import type { StandardFieldsConfig } from '../offers/standard-fields';
```

- [ ] **Step 2: Spalte in der `offers`-Tabelle ergänzen**

In `src/db/schema.ts` in `export const offers = pgTable('offers', { ... })` direkt **nach** der bestehenden Zeile

```ts
  customFields: jsonb('custom_fields').$type<CustomFieldDef[]>().notNull().default([]),
```

diese Zeile einfügen:

```ts
  standardFields: jsonb('standard_fields').$type<StandardFieldsConfig>().notNull().default({}),
```

- [ ] **Step 3: Schema in die DB pushen**

Run: `npm run db:push`
Expected: drizzle-kit meldet das Hinzufügen der Spalte `standard_fields` und schliesst ohne Fehler ab. (Bestätigt die additive Änderung, falls interaktiv gefragt.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(db): offers.standard_fields (JSONB) fuer konfigurierbare Standardfelder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 3: Angebots-Action & Repository

**Files:**
- Modify: `src/offers/repository.ts:5` (Import), `src/offers/repository.ts:25-37` (`NewOfferData`)
- Modify: `src/offers/actions.ts:12` (Import), `:42-53` (neue Parse-Funktion), `:71-81` und `:109-119` (durchreichen)

- [ ] **Step 1: Repository-Typ erweitern**

In `src/offers/repository.ts` den Import (nach Zeile 5) ergänzen:

```ts
import type { CustomFieldDef } from './custom-fields';
import type { StandardFieldsConfig } from './standard-fields';
```

In `export type NewOfferData = { ... }` (nach `customFields?: CustomFieldDef[];`) ergänzen:

```ts
  standardFields?: StandardFieldsConfig;
```

(`createOffer`/`updateOffer` spreaden `data` bereits — keine weitere Änderung nötig.)

- [ ] **Step 2: Import in der Action ergänzen**

In `src/offers/actions.ts`, nach der bestehenden Zeile 12:

```ts
import { customFieldsDefSchema, type CustomFieldDef } from './custom-fields';
import { standardFieldsConfigSchema, type StandardFieldsConfig } from './standard-fields';
```

- [ ] **Step 2b: Parse-Funktion ergänzen**

In `src/offers/actions.ts` direkt **nach** `parseCustomFieldsField` (nach Zeile 53) einfügen:

```ts
// Liest die als JSON serialisierte Standardfeld-Konfiguration aus dem Formular
// und prüft sie server-autoritativ. Rückgabe null = ungültig (Action abbrechen).
function parseStandardFieldsField(formData: FormData): StandardFieldsConfig | null {
  const raw = formData.get('standardFields');
  if (typeof raw !== 'string' || raw.trim() === '') return {};
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = standardFieldsConfigSchema.safeParse(json);
  return parsed.success ? (parsed.data as StandardFieldsConfig) : null;
}
```

- [ ] **Step 3: In `createOfferAction` durchreichen**

In `src/offers/actions.ts`, in `createOfferAction` direkt **nach** dem `customFields`-Block (nach Zeile 69):

```ts
  const standardFields = parseStandardFieldsField(formData);
  if (standardFields === null) {
    return { error: 'Standard-Abfragen sind ungültig.' };
  }
```

Im darauffolgenden `await createOffer({ ... })`-Objekt nach `customFields,` ergänzen:

```ts
    customFields,
    standardFields,
```

- [ ] **Step 4: In `updateOfferAction` durchreichen**

In `src/offers/actions.ts`, in `updateOfferAction` direkt **nach** dem `customFields`-Block (nach Zeile 107):

```ts
  const standardFields = parseStandardFieldsField(formData);
  if (standardFields === null) {
    return { error: 'Standard-Abfragen sind ungültig.' };
  }
```

Im darauffolgenden `await updateOffer(id, { ... })`-Objekt nach `customFields,` ergänzen:

```ts
    customFields,
    standardFields,
```

- [ ] **Step 5: Typecheck + bestehende Tests**

Run: `npx tsc --noEmit && npm test`
Expected: keine Typfehler; alle Tests grün.

- [ ] **Step 6: Commit**

```bash
git add src/offers/repository.ts src/offers/actions.ts
git commit -m "feat(offers): standardFields aus Angebots-Formular validieren & speichern

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 4: Admin-Editor „Standard-Abfragen"

**Files:**
- Create: `src/components/admin/standard-fields-editor.tsx`
- Modify: `src/components/admin/offer-form-modal.tsx:11` (Import), `:213` (Einbindung)

- [ ] **Step 1: Editor-Komponente schreiben**

Create `src/components/admin/standard-fields-editor.tsx`:

```tsx
'use client';

import { useState } from 'react';
import {
  standardFieldDefaults,
  standardFieldOrder,
  type StandardFieldKey,
  type StandardFieldOverride,
  type StandardFieldsConfig,
} from '@/offers/standard-fields';

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

  // Mergt einen Patch in ein Feld und hält die Config sparse: nur visible:false
  // und nicht-leere Texte werden gespeichert; ist alles Default, fliegt der
  // Eintrag raus.
  function setField(key: StandardFieldKey, patch: StandardFieldOverride) {
    setConfig((prev) => {
      const merged: StandardFieldOverride = { ...(prev[key] ?? {}), ...patch };
      const cleaned: StandardFieldOverride = {};
      if (merged.visible === false) cleaned.visible = false;
      if (merged.label && merged.label.trim() !== '') cleaned.label = merged.label;
      if (merged.placeholder && merged.placeholder.trim() !== '') {
        cleaned.placeholder = merged.placeholder;
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

            {def.hasPlaceholder ? (
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
```

- [ ] **Step 2: Editor im Angebots-Formular einbinden**

In `src/components/admin/offer-form-modal.tsx`, den Import (nach Zeile 11) ergänzen:

```tsx
import { CustomFieldsEditor } from './custom-fields-editor';
import { StandardFieldsEditor } from './standard-fields-editor';
```

Die bestehende Zeile 213

```tsx
            <CustomFieldsEditor initial={offer?.customFields ?? []} />
```

ersetzen durch:

```tsx
            <StandardFieldsEditor initial={offer?.standardFields ?? {}} />
            <CustomFieldsEditor initial={offer?.customFields ?? []} />
```

- [ ] **Step 3: Typecheck + Lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/standard-fields-editor.tsx src/components/admin/offer-form-modal.tsx
git commit -m "feat(admin): Editor 'Standard-Abfragen' im Angebots-Formular

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 5: Buchungsstrecke dynamisch rendern

**Files:**
- Modify: `src/components/book/booking-flow.tsx` (Import; `ContactStep`; `DiscountCodeField`)

- [ ] **Step 1: Import ergänzen**

In `src/components/book/booking-flow.tsx`, nach der bestehenden Zeile 20 (`import { CustomFieldInputs } ...`):

```tsx
import { CustomFieldInputs } from '@/components/custom-field-inputs';
import { resolveStandardFields } from '@/offers/standard-fields';
```

- [ ] **Step 2: Aufgelöste Config im `ContactStep` berechnen**

In `src/components/book/booking-flow.tsx`, in der Funktion `ContactStep`, direkt nach `const [showMsg, setShowMsg] = useState(false);`:

```tsx
  const [showMsg, setShowMsg] = useState(false);
  const sf = resolveStandardFields(offer.standardFields);
```

- [ ] **Step 3: Standardfelder im Formular ersetzen**

In `ContactStep` den bestehenden Block (Name, E-Mail, Telefon, Ort) — heute die `<div className="bookx-fields">` mit den vier `<div className="bookx-field">` (Name/E-Mail/Telefon/Ort) — ersetzen durch:

```tsx
        <div className="bookx-field">
          <label htmlFor="customerName">{sf.name.label}</label>
          <input id="customerName" name="customerName" type="text" required minLength={2} autoComplete="name" />
        </div>
        <div className="bookx-field">
          <label htmlFor="customerEmail">{sf.email.label}</label>
          <input id="customerEmail" name="customerEmail" type="email" required autoComplete="email" />
        </div>
        {sf.phone.visible ? (
          <div className="bookx-field">
            <label htmlFor="customerPhone">{sf.phone.label}</label>
            <input
              id="customerPhone"
              name="customerPhone"
              type="tel"
              required={sf.phone.required}
              minLength={6}
              autoComplete="tel"
            />
          </div>
        ) : null}
        {sf.location.visible ? (
          <div className="bookx-field">
            <label htmlFor="location">{sf.location.label}</label>
            <input
              id="location"
              name="location"
              type="text"
              autoComplete="off"
              placeholder={sf.location.placeholder}
            />
            {travelRule ? (
              <small className="bookx-travelnote">{travelRuleHint(travelRule)}</small>
            ) : null}
          </div>
        ) : null}
```

(Das `anfrage ? (<div ...Idee...>) : null`-Feld davor bleibt unverändert.)

- [ ] **Step 4: Nachricht-Aufklappfeld an die Config koppeln**

In `ContactStep` den `bookx-folds`-Block für die Nachricht anpassen. Den bestehenden Teil

```tsx
        {anfrage ? null : (
          <div>
            <button
              type="button"
              className="bookx-fold-toggle"
              aria-expanded={showMsg}
              onClick={() => setShowMsg((v) => !v)}
            >
              <Chevron className="chev" />
              Nachricht hinzufügen
            </button>
            {showMsg ? (
              <div className="bookx-fold-body">
                <textarea name="message" rows={2} placeholder="Wünsche, Anlass, Personenzahl …" />
              </div>
            ) : null}
          </div>
        )}
```

ersetzen durch:

```tsx
        {!anfrage && sf.message.visible ? (
          <div>
            <button
              type="button"
              className="bookx-fold-toggle"
              aria-expanded={showMsg}
              onClick={() => setShowMsg((v) => !v)}
            >
              <Chevron className="chev" />
              {sf.message.label}
            </button>
            {showMsg ? (
              <div className="bookx-fold-body">
                <textarea name="message" rows={2} placeholder={sf.message.placeholder} />
              </div>
            ) : null}
          </div>
        ) : null}
```

- [ ] **Step 5: Rabatt-Code an die Config koppeln**

In `ContactStep` die bestehende Zeile

```tsx
        {prefill ? null : <DiscountCodeField offer={offer} />}
```

ersetzen durch:

```tsx
        {!prefill && sf.discount.visible ? (
          <DiscountCodeField offer={offer} label={sf.discount.label} />
        ) : null}
```

- [ ] **Step 6: `DiscountCodeField` um den Label-Prop erweitern**

In `src/components/book/booking-flow.tsx` die Signatur von `DiscountCodeField` ändern:

```tsx
function DiscountCodeField({ offer, label }: { offer: Offer; label: string }) {
```

und im JSX den fest verdrahteten Toggle-Text

```tsx
        <Chevron className="chev" />
        Rabatt-Code?
```

ersetzen durch:

```tsx
        <Chevron className="chev" />
        {label}
```

- [ ] **Step 7: Typecheck + Lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: keine Fehler.

- [ ] **Step 8: Commit**

```bash
git add src/components/book/booking-flow.tsx
git commit -m "feat(book): Standardfelder dynamisch aus offer.standardFields rendern

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 6: Server-Validierung (Telefon-Pflicht aus Config)

**Files:**
- Modify: `src/bookings/public-input.ts:10` (`customerPhone` optional)
- Modify: `src/bookings/public-actions.ts:11-12` (Import), `:90-104` (Telefon-Gate)

- [ ] **Step 1: `customerPhone` im öffentlichen Schema optional machen**

In `src/bookings/public-input.ts` die Zeile

```ts
  customerPhone: z.string().min(6),
```

ersetzen durch:

```ts
  // Telefon kann pro Angebot ausgeschaltet sein; ob es Pflicht ist, entscheidet
  // die Server-Action autoritativ aus offer.standardFields (resolveStandardFields).
  customerPhone: z.string().optional().default(''),
```

- [ ] **Step 2: Import in der Action ergänzen**

In `src/bookings/public-actions.ts`, nach der bestehenden Zeile 12 (`import { parseAnswers } ...`):

```ts
import { parseAnswers } from '@/offers/custom-fields';
import { resolveStandardFields } from '@/offers/standard-fields';
```

- [ ] **Step 3: Telefon-Gate nach dem Angebots-Load einsetzen**

In `src/bookings/public-actions.ts`, in `submitBookingRequest` direkt **nach** dem bestehenden anfrage/date-Block (nach Zeile 104, also nach `} else if (data.requestedDate.trim() === '') { ... }`):

```ts
  // Telefon nur erzwingen, wenn das Feld bei diesem Angebot sichtbar ist.
  const sf = resolveStandardFields(offer.standardFields);
  if (sf.phone.visible && sf.phone.required && data.customerPhone.trim().length < 6) {
    return { error: 'Bitte gib deine Telefonnummer an.' };
  }
```

(`data.customerPhone` ist jetzt immer ein String — bei ausgeschaltetem Feld `''`. `createBooking` erhält ihn unverändert; die DB-Spalte `customer_phone` ist `NOT NULL DEFAULT ''`.)

- [ ] **Step 4: Typecheck + alle Tests**

Run: `npx tsc --noEmit && npm test`
Expected: keine Typfehler; alle Tests grün.

- [ ] **Step 5: Commit**

```bash
git add src/bookings/public-input.ts src/bookings/public-actions.ts
git commit -m "feat(book): Telefon-Pflicht server-autoritativ aus standardFields

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Task 7: Gesamt-Verifikation

**Files:** keine (nur Prüfen)

- [ ] **Step 1: Voller Lauf**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run build`
Expected: Tests grün, kein Typfehler, kein Lint-Fehler, Build erfolgreich.

- [ ] **Step 2: Manueller Smoke-Test (Admin)**

Run: `npm run dev`, dann im Browser unter `/admin/angebote` ein Angebot bearbeiten:
- Sektion „Standard-Abfragen" ist sichtbar, 6 Felder in der Reihenfolge Name, E-Mail, Telefon, Ort, Nachricht, Rabatt-Code.
- Name/E-Mail haben „immer an", die übrigen einen An/Aus-Schalter.
- Telefon ausschalten, Ort-Beschriftung ändern, speichern → Toast „Angebot gespeichert".
- Angebot erneut öffnen → die Änderungen sind erhalten (Telefon aus, neue Ort-Beschriftung).

Expected: alle Punkte erfüllt.

- [ ] **Step 3: Manueller Smoke-Test (Buchungsstrecke)**

Im Browser `/book` öffnen, dasselbe Angebot wählen, bis zum Schritt „Deine Angaben":
- Telefon-Feld fehlt; die geänderte Ort-Beschriftung erscheint.
- Buchung ohne Telefon lässt sich absenden (kein „Bitte gib deine Telefonnummer an.").
- Bei einem Angebot mit Telefon **an**: leeres Telefon → Absenden zeigt die Pflicht-Meldung.

Expected: alle Punkte erfüllt.

- [ ] **Step 4: Abschluss-Commit (falls noch ungetrackte Änderungen)**

```bash
git status
# nur falls noch etwas offen ist:
git add -A && git commit -m "chore: Abschluss konfigurierbare Standardfelder

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

## Self-Review (vom Plan-Autor durchgeführt)

**Spec-Abdeckung:**
- Texte ändern + ein/aus pro Angebot → Task 1 (Modul), Task 4 (Editor), Task 5 (Rendering). ✓
- Name/E-Mail immer an → `resolveOne` erzwingt `visible:true`; Editor zeigt „immer an"; Test deckt es ab. ✓
- Sparse Overrides → `setField` prunt Defaults; `parseStandardFieldsField` Default `{}`. ✓
- Datenmodell JSONB `standard_fields` Default `{}` → Task 2. ✓
- Telefon Pflicht wenn sichtbar, autoritativ server-seitig → Task 6. ✓
- Anfahrts-Hinweis bleibt an Ortsfrage gekoppelt → Task 5 Step 3 (travelRule innerhalb des Orts-Blocks). ✓
- Anfrage-Idee-Feld + manuelles Admin-Formular unverändert → nicht angefasst. ✓
- Antworten-Anzeige unverändert (echte Spalten) → keine Task nötig. ✓

**Platzhalter-Scan:** keine TBD/TODO/„appropriate"-Phrasen; jeder Code-Step enthält vollständigen Code. ✓

**Typ-Konsistenz:** `StandardFieldsConfig`, `StandardFieldOverride`, `StandardFieldKey`, `resolveStandardFields`, `standardFieldsConfigSchema`, `standardFieldDefaults`, `standardFieldOrder` durchgängig identisch benannt in Tasks 1–6. `DiscountCodeField`-Prop `label` in Task 5 Step 5 (Aufruf) und Step 6 (Definition) konsistent. ✓

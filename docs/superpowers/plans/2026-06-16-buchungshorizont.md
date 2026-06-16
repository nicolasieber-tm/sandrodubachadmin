# Buchungshorizont Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sandro stellt im Admin-Kalender-Tab ein, wie weit im Voraus (in Monaten) Termine buchbar sind; der öffentliche Kalender zeigt nur diesen Zeitraum und der Server lehnt Buchungen ausserhalb ab.

**Architecture:** Eine pure, getestete Logik-Datei (`booking-horizon.ts`) berechnet `maxDate`/`isWithinHorizon`. Eine Singleton-Tabelle `booking_settings` hält den Monatswert (null = unbegrenzt), gelesen/geschrieben über ein Repository und gesetzt über eine Server-Action mit Zod-Validierung. Die Admin-UI spiegelt das Muster von `availability-editor.tsx`; der öffentliche `Calendar` sperrt Tage/Pfeil über dem Limit; `public-actions.ts` validiert serverseitig.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Drizzle ORM (Postgres), Zod 4, Vitest 4.

**Branch:** `beta` (erst auf Beta testen, später nach `main`/Production mergen).

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/availability/booking-horizon.ts` | **neu** — pure Logik: `addMonths`, `maxBookingDate`, `isWithinHorizon` |
| `src/availability/booking-horizon.test.ts` | **neu** — Vitest-Unit-Tests der pure Logik |
| `src/db/schema.ts` | Tabelle `bookingSettings` + Typ |
| `src/availability/booking-settings-repository.ts` | **neu** — Singleton load/save |
| `src/availability/booking-settings-actions.ts` | **neu** — Server-Action `saveBookingHorizonAction` |
| `src/components/admin/booking-horizon-editor.tsx` | **neu** — Admin-Karte (UI) |
| `src/app/admin/kalender/page.tsx` | Wert laden + Editor rendern |
| `src/app/book/page.tsx` | `maxAdvanceMonths` laden + an `BookingFlow` durchreichen |
| `src/components/book/booking-flow.tsx` | Prop bis `Calendar` durchreichen; Tag- + „Weiter"-Pfeil-Sperre |
| `src/bookings/public-actions.ts` | Horizont-Validierung im Termin-Zweig |

---

## Task 1: Pure Horizont-Logik (TDD)

**Files:**
- Create: `src/availability/booking-horizon.ts`
- Test: `src/availability/booking-horizon.test.ts`

- [ ] **Step 1: Failing test schreiben**

Datei `src/availability/booking-horizon.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { addMonths, maxBookingDate, isWithinHorizon } from './booking-horizon';

// Hinweis: Monat ist 0-basiert (5 = Juni).
describe('addMonths', () => {
  it('verschiebt im Normalfall um N Monate', () => {
    const r = addMonths(new Date(2026, 5, 16), 2); // 16.06.2026 + 2
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2026, 7, 16]); // 16.08.2026
  });

  it('rechnet über den Jahreswechsel', () => {
    const r = addMonths(new Date(2026, 10, 30), 3); // 30.11.2026 + 3
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2027, 1, 28]); // 28.02.2027 (geklammert)
  });

  it('klemmt auf das Monatsende (kein Schaltjahr)', () => {
    const r = addMonths(new Date(2026, 0, 31), 1); // 31.01.2026 + 1
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2026, 1, 28]); // 28.02.2026
  });

  it('klemmt auf das Monatsende (Schaltjahr)', () => {
    const r = addMonths(new Date(2028, 0, 31), 1); // 31.01.2028 + 1
    expect([r.getFullYear(), r.getMonth(), r.getDate()]).toEqual([2028, 1, 29]); // 29.02.2028
  });
});

describe('maxBookingDate', () => {
  it('liefert null bei unbegrenzt (null/0/negativ)', () => {
    const now = new Date(2026, 5, 16);
    expect(maxBookingDate(now, null)).toBeNull();
    expect(maxBookingDate(now, 0)).toBeNull();
    expect(maxBookingDate(now, -1)).toBeNull();
  });

  it('liefert die lokale Mitternacht des Zieltags', () => {
    const r = maxBookingDate(new Date(2026, 5, 16, 14, 30), 2);
    expect(r).not.toBeNull();
    expect([r!.getFullYear(), r!.getMonth(), r!.getDate(), r!.getHours()]).toEqual([2026, 7, 16, 0]);
  });
});

describe('isWithinHorizon', () => {
  const now = new Date(2026, 5, 16); // 16.06.2026

  it('erlaubt Datum vor dem Limit', () => {
    expect(isWithinHorizon('2026-07-01', now, 2)).toBe(true);
  });

  it('erlaubt das Limit-Datum exakt', () => {
    expect(isWithinHorizon('2026-08-16', now, 2)).toBe(true);
  });

  it('lehnt Datum nach dem Limit ab', () => {
    expect(isWithinHorizon('2026-08-17', now, 2)).toBe(false);
  });

  it('erlaubt alles bei unbegrenzt (null)', () => {
    expect(isWithinHorizon('2027-01-01', now, null)).toBe(true);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `npm run test -- src/availability/booking-horizon.test.ts`
Expected: FAIL — `Failed to resolve import "./booking-horizon"` bzw. „is not a function".

- [ ] **Step 3: Implementierung schreiben**

Datei `src/availability/booking-horizon.ts`:

```ts
// Pure Logik für den Buchungshorizont (max. Vorlaufzeit in Monaten).
// KEIN server-only: wird von der öffentlichen Calendar-Komponente (Client)
// UND von der Server-Validierung genutzt. Alles in lokaler Zeitzone, ohne
// toISOString (kein UTC-Versatz) — konsistent mit booking-flow.tsx.

// Datum um `months` verschieben. Klemmt auf den letzten Tag des Zielmonats,
// falls der Ursprungstag dort nicht existiert (z. B. 31.01. + 1 → 28./29.02.).
// Rückgabe ist die lokale Mitternacht des Zieltags.
export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const y = target.getFullYear();
  const m = target.getMonth();
  const lastDay = new Date(y, m + 1, 0).getDate();
  const day = Math.min(date.getDate(), lastDay);
  return new Date(y, m, day);
}

// Spätestes buchbares Datum (lokale Mitternacht) oder null bei unbegrenzt.
// months null/0/negativ → null.
export function maxBookingDate(now: Date, months: number | null): Date | null {
  if (months === null || months <= 0) return null;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return addMonths(startOfToday, months);
}

// Liegt requestedDate ('YYYY-MM-DD') innerhalb des Horizonts?
// null-Horizont → immer true. Vergangenheit wird hier NICHT geprüft.
export function isWithinHorizon(
  requestedDate: string,
  now: Date,
  months: number | null,
): boolean {
  const max = maxBookingDate(now, months);
  if (!max) return true;
  const req = new Date(`${requestedDate}T00:00:00`);
  return req.getTime() <= max.getTime();
}
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `npm run test -- src/availability/booking-horizon.test.ts`
Expected: PASS — alle 10 Tests grün.

- [ ] **Step 5: Commit**

```bash
git add src/availability/booking-horizon.ts src/availability/booking-horizon.test.ts
git commit -m "feat(book): Buchungshorizont – pure Logik (addMonths/maxBookingDate/isWithinHorizon)"
```

---

## Task 2: DB-Schema `booking_settings`

**Files:**
- Modify: `src/db/schema.ts` (Tabelle nach `availability`, Typ-Export ans Ende)

- [ ] **Step 1: Tabelle ergänzen**

In `src/db/schema.ts` direkt nach der `availability`-Tabelle (nach Zeile 147) einfügen:

```ts
// Globale Buchungs-Einstellungen (Singleton: höchstens eine Zeile).
// max_advance_months = wie viele Monate im Voraus maximal gebucht werden
// darf; null = unbegrenzt.
export const bookingSettings = pgTable('booking_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  maxAdvanceMonths: integer('max_advance_months'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Typ-Export ergänzen**

In `src/db/schema.ts` bei den `$inferSelect`-Typen (nach `export type Availability = …`, Zeile 245) einfügen:

```ts
export type BookingSettings = typeof bookingSettings.$inferSelect;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (insb. keine „pgTable/integer/timestamp/uuid not defined" — alle sind in Zeile 1 bereits importiert).

- [ ] **Step 4: Schema in die Beta-DB pushen**

Run (pusht in die **Beta**-Postgres über den öffentlichen TCP-Proxy — NICHT Production):

```bash
railway run --environment beta --service Postgres -- bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npx drizzle-kit push'
```

Expected: drizzle-kit meldet das Anlegen der Tabelle `booking_settings` und „Changes applied". Bei Prompt „create table" mit Ja bestätigen.

> Hinweis: NICHT gegen Production pushen. Der Production-Push passiert erst nach dem Merge `beta` → `main` (separater, vom Nutzer freigegebener Schritt).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(book): Buchungshorizont – Tabelle booking_settings"
```

---

## Task 3: Repository (Singleton load/save)

**Files:**
- Create: `src/availability/booking-settings-repository.ts`

- [ ] **Step 1: Repository schreiben**

Datei `src/availability/booking-settings-repository.ts`:

```ts
import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { bookingSettings, type BookingSettings } from '@/db/schema';

// Liest die Singleton-Zeile (oder null, wenn noch keine existiert).
export async function getBookingSettings(): Promise<BookingSettings | null> {
  const rows = await db.select().from(bookingSettings).limit(1);
  return rows[0] ?? null;
}

// Komfort: nur der Monatswert. Kein Eintrag / null → unbegrenzt.
export async function getMaxAdvanceMonths(): Promise<number | null> {
  const row = await getBookingSettings();
  return row?.maxAdvanceMonths ?? null;
}

// Upsert der einzelnen Singleton-Zeile. months = null → unbegrenzt.
export async function setMaxAdvanceMonths(months: number | null): Promise<void> {
  const existing = await getBookingSettings();
  if (existing) {
    await db
      .update(bookingSettings)
      .set({ maxAdvanceMonths: months, updatedAt: new Date() })
      .where(eq(bookingSettings.id, existing.id));
  } else {
    await db.insert(bookingSettings).values({ maxAdvanceMonths: months });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/availability/booking-settings-repository.ts
git commit -m "feat(book): Buchungshorizont – Repository (Singleton load/save)"
```

---

## Task 4: Server-Action

**Files:**
- Create: `src/availability/booking-settings-actions.ts`

- [ ] **Step 1: Action schreiben**

Datei `src/availability/booking-settings-actions.ts` (Muster wie `src/availability/actions.ts`):

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { logAudit } from '@/lib/audit';
import { setMaxAdvanceMonths } from './booking-settings-repository';

type ActionResult = { ok: true } | { error: string };

// 0–36 Monate; 0 = unbegrenzt (wird als null gespeichert). 36 als Sanity-Limit
// gegen Tippfehler.
const schema = z.object({
  months: z.coerce.number().int().min(0).max(36),
});

export async function saveBookingHorizonAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Leeres Feld → 0 (= unbegrenzt).
  const raw = String(formData.get('months') ?? '').trim();
  const parsed = schema.safeParse({ months: raw === '' ? 0 : raw });
  if (!parsed.success) {
    return { error: 'Bitte eine ganze Zahl zwischen 0 und 36 eingeben.' };
  }

  const months = parsed.data.months === 0 ? null : parsed.data.months;
  await setMaxAdvanceMonths(months);
  await logAudit({ action: 'booking_settings.updated' });
  revalidatePath('/admin/kalender');
  revalidatePath('/book');
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Commit**

```bash
git add src/availability/booking-settings-actions.ts
git commit -m "feat(book): Buchungshorizont – Server-Action saveBookingHorizonAction"
```

---

## Task 5: Admin-UI (Editor-Karte + Einbindung)

**Files:**
- Create: `src/components/admin/booking-horizon-editor.tsx`
- Modify: `src/app/admin/kalender/page.tsx`

- [ ] **Step 1: Editor-Komponente schreiben**

Datei `src/components/admin/booking-horizon-editor.tsx` (Muster wie `availability-editor.tsx`):

```tsx
'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { saveBookingHorizonAction } from '@/availability/booking-settings-actions';

type ActionState = { ok: true } | { error: string } | null;

export function BookingHorizonEditor({ initialMonths }: { initialMonths: number | null }) {
  const { toast } = useToast();
  const [months, setMonths] = useState<string>(
    initialMonths != null ? String(initialMonths) : '',
  );

  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveBookingHorizonAction,
    null,
  );

  // Erfolg genau einmal toasten.
  const handledRef = useRef<ActionState>(null);
  useEffect(() => {
    if (state && state !== handledRef.current && 'ok' in state) {
      handledRef.current = state;
      toast('Buchungshorizont gespeichert.');
    }
  }, [state, toast]);

  return (
    <Card style={{ marginTop: 20 }}>
      <form action={formAction}>
        <CardHeader>
          <div>
            <h3>Buchungshorizont</h3>
            <div className="sub">Wie weit im Voraus können Kund:innen Termine buchen?</div>
          </div>
          <button type="submit" className="btn btn-sm btn-primary" disabled={pending}>
            Speichern
          </button>
        </CardHeader>

        <CardBody style={{ padding: '8px 22px 16px' }}>
          <label
            style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}
          >
            <span>Buchbar für die nächsten</span>
            <input
              type="number"
              name="months"
              min={0}
              max={36}
              step={1}
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              placeholder="z. B. 2"
              style={{ width: 88 }}
            />
            <span>Monate</span>
          </label>
          <p className="mut" style={{ marginTop: 10 }}>
            Leer oder 0 = unbegrenzt. Beispiel: 2 = nur die nächsten 2 Monate buchbar.
          </p>

          {state && 'error' in state ? (
            <p
              className="mut"
              role="alert"
              style={{ color: 'var(--red, #c0392b)', marginTop: 12 }}
            >
              {state.error}
            </p>
          ) : null}
        </CardBody>
      </form>
    </Card>
  );
}
```

- [ ] **Step 2: Wert in der Kalender-Page laden**

In `src/app/admin/kalender/page.tsx`:

Import ergänzen (nach Zeile 1, bei den `@/availability`-Imports):

```ts
import { getMaxAdvanceMonths } from '@/availability/booking-settings-repository';
import { BookingHorizonEditor } from '@/components/admin/booking-horizon-editor';
```

Wert laden — direkt nach `const rows = await getAvailability();` (Zeile 65):

```ts
const maxAdvanceMonths = await getMaxAdvanceMonths();
```

- [ ] **Step 3: Editor rendern**

In `src/app/admin/kalender/page.tsx` direkt nach `<AvailabilityEditor initial={seven} />` (Zeile 145):

```tsx
<BookingHorizonEditor initialMonths={maxAdvanceMonths} />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/booking-horizon-editor.tsx src/app/admin/kalender/page.tsx
git commit -m "feat(admin): Buchungshorizont – Editor-Karte im Kalender-Tab"
```

---

## Task 6: Öffentlicher Kalender (Durchreichen + Tag-/Pfeil-Sperre)

**Files:**
- Modify: `src/app/book/page.tsx`
- Modify: `src/components/book/booking-flow.tsx`

- [ ] **Step 1: `maxAdvanceMonths` serverseitig laden und durchreichen**

In `src/app/book/page.tsx`:

Import ergänzen (nach dem `getMonthSlotAvailabilityForOffers`-Import, Zeile 8):

```ts
import { getMaxAdvanceMonths } from '@/availability/booking-settings-repository';
```

Wert laden — nach `const offers = await listActiveOffers();` (Zeile 22):

```ts
const maxAdvanceMonths = await getMaxAdvanceMonths();
```

Prop an `BookingFlow` ergänzen (im JSX ab Zeile 89), z. B. nach `monthYM={monthYM}`:

```tsx
maxAdvanceMonths={maxAdvanceMonths}
```

- [ ] **Step 2: Prop in `BookingFlowProps` und Funktions-Destructuring aufnehmen**

In `src/components/book/booking-flow.tsx`:

In `interface BookingFlowProps` (nach `monthYM?…`, Zeile 57):

```ts
  // Max. Vorlaufzeit in Monaten (null = unbegrenzt). Steuert Tag-/Pfeil-Sperre.
  maxAdvanceMonths?: number | null;
```

Im Destructuring von `export function BookingFlow({ … })` (nach `monthYM,`, Zeile 96):

```ts
  maxAdvanceMonths,
```

- [ ] **Step 3: Prop bis `Calendar` durchreichen (über `DateStep`)**

In `src/components/book/booking-flow.tsx`:

Beim `<DateStep …>`-Aufruf (nach `initialYM={monthYM ?? null}`, Zeile 179):

```tsx
maxAdvanceMonths={maxAdvanceMonths ?? null}
```

In der `DateStep`-Signatur — sowohl Destructuring als auch Typ (Zeilen 352–367):

```tsx
function DateStep({
  value,
  onPick,
  onBack,
  offerId,
  initialAvailability,
  initialYM,
  maxAdvanceMonths,
}: {
  value: string;
  onPick: (d: string) => void;
  onBack: (() => void) | null;
  offerId: string | null;
  initialAvailability: MonthOfferAvailability | null;
  initialYM: { y: number; m: number } | null;
  maxAdvanceMonths: number | null;
}) {
```

Beim `<Calendar …>`-Aufruf in `DateStep` (nach `initialYM={initialYM}`, Zeile 375):

```tsx
maxAdvanceMonths={maxAdvanceMonths}
```

- [ ] **Step 4: `Calendar` erweitern (Import, Prop, Tag-/Pfeil-Sperre)**

In `src/components/book/booking-flow.tsx`:

Import der pure Logik oben bei den Imports ergänzen:

```ts
import { maxBookingDate } from '@/availability/booking-horizon';
```

`Calendar`-Signatur erweitern (Destructuring + Typ, Zeilen 402–416) — `maxAdvanceMonths` aufnehmen:

```tsx
function Calendar({
  value,
  onSelect,
  offerId,
  initialAvailability,
  initialYM,
  maxAdvanceMonths,
}: {
  value: string;
  onSelect: (d: string) => void;
  offerId: string | null;
  initialAvailability: MonthOfferAvailability | null;
  initialYM: { y: number; m: number } | null;
  maxAdvanceMonths: number | null;
}) {
```

Nach dem Guard `if (!today || !view) { … }` (nach Zeile 491) das Limit aus dem **Client-`today`** berechnen:

```tsx
  // Max. buchbares Datum aus dem clientseitigen „today" (lokale Mitternacht).
  const maxDate = maxBookingDate(today, maxAdvanceMonths);
  // „Weiter" sperren, sobald der komplette Folgemonat hinter dem Limit liegt.
  const nextDisabled = !!maxDate && new Date(view.y, view.m + 1, 1) > maxDate;
```

Beim „Nächster Monat"-Button (Zeilen 529–538) das `disabled` ergänzen:

```tsx
        <button
          type="button"
          className="bookx-cal-navbtn"
          aria-label="Nächster Monat"
          onClick={() => shift(1)}
          disabled={nextDisabled}
        >
```

In der Tageszelle (Zeilen 550–564) die `beyond`-Bedingung ergänzen und in `disabled` aufnehmen:

```tsx
          const past = d < today;
          // Über dem Buchungshorizont: ausgegraut/gesperrt (erbt :disabled-Optik).
          const beyond = !!maxDate && d > maxDate;
```

und beim Button:

```tsx
              disabled={past || voll || zu || beyond}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/app/book/page.tsx src/components/book/booking-flow.tsx
git commit -m "feat(book): Buchungshorizont – Kalender sperrt Tage/Pfeil über dem Limit"
```

---

## Task 7: Server-Validierung in `public-actions.ts`

**Files:**
- Modify: `src/bookings/public-actions.ts`

- [ ] **Step 1: Imports ergänzen**

In `src/bookings/public-actions.ts` bei den Imports (nach `import { resolveStandardFields } from '@/offers/standard-fields';`, Zeile 13):

```ts
import { getMaxAdvanceMonths } from '@/availability/booking-settings-repository';
import { isWithinHorizon } from '@/availability/booking-horizon';
```

- [ ] **Step 2: Termin-Zweig um Horizont-Prüfung erweitern**

In `src/bookings/public-actions.ts` den bestehenden Block (Zeilen 105–112)

```ts
  const istAnfrage = offer.bookingMode === 'anfrage';
  if (istAnfrage) {
    if (data.message.trim() === '') {
      return { error: 'Bitte beschreibe kurz deine Idee.' };
    }
  } else if (data.requestedDate.trim() === '') {
    return { error: 'Bitte wähle einen Termin.' };
  }
```

ersetzen durch:

```ts
  const istAnfrage = offer.bookingMode === 'anfrage';
  if (istAnfrage) {
    if (data.message.trim() === '') {
      return { error: 'Bitte beschreibe kurz deine Idee.' };
    }
  } else {
    if (data.requestedDate.trim() === '') {
      return { error: 'Bitte wähle einen Termin.' };
    }
    // Buchungshorizont auch serverseitig erzwingen (falls das Frontend
    // umgangen wird). null = unbegrenzt.
    const months = await getMaxAdvanceMonths();
    if (months !== null && !isWithinHorizon(data.requestedDate, new Date(), months)) {
      return {
        error: `Termine können höchstens ${months} Monate im Voraus gebucht werden.`,
      };
    }
  }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/bookings/public-actions.ts
git commit -m "feat(book): Buchungshorizont – serverseitige Validierung der Wunschtermine"
```

---

## Task 8: Gesamt-Verifikation

**Files:** keine

- [ ] **Step 1: Unit-Tests**

Run: `npm run test`
Expected: PASS — inkl. der neuen `booking-horizon.test.ts`; keine bestehenden Tests gebrochen.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: keine Fehler/Warnungen in den neuen/geänderten Dateien.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: erfolgreicher Production-Build (Typprüfung von Next inklusive).

- [ ] **Step 4: Manueller Smoke-Test gegen Beta**

Nach `git push origin beta` (Beta-Auto-Deploy) im Beta-Admin testen:
1. Kalender-Tab → „Buchungshorizont" auf `2` setzen, speichern → Toast erscheint.
2. `/book` öffnen → ein Termin-Angebot wählen → Kalender: „Weiter" stoppt am Monat von heute+2; Tage danach ausgegraut/gesperrt.
3. Horizont auf leer (unbegrenzt) zurücksetzen → Kalender wieder ohne Obergrenze.

> Push nach `beta` und späterer Merge `beta` → `main` (Production, inkl. Schema-Push gegen Production) sind eigene, vom Nutzer freizugebende Schritte.

---

## Self-Review (durchgeführt)

- **Spec-Abdeckung:** Datenhaltung→T2; pure Logik→T1; Repository→T3; Action→T4; Admin-UI→T5; öffentlicher Kalender (Tag+Pfeil)→T6; Server-Validierung→T7; Tests→T1/T8. Alle Spec-Abschnitte abgedeckt.
- **Platzhalter:** keine („…" nur in erläuternden Spec-Sätzen, nicht in Code-Schritten).
- **Typ-Konsistenz:** `maxAdvanceMonths: number | null` durchgängig (page → BookingFlow → DateStep → Calendar); `getMaxAdvanceMonths(): number | null`; `setMaxAdvanceMonths(number|null)`; `isWithinHorizon(string, Date, number|null)`; `maxBookingDate(Date, number|null)`. Funktionsnamen identisch in allen Tasks.

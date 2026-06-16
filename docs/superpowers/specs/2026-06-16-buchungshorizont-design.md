# Buchungshorizont — Design

**Datum:** 2026-06-16
**Status:** freigegeben (Brainstorming)

## Ziel

Sandro soll im Admin **Kalender-Tab** einstellen können, wie weit im Voraus
Termine gebucht werden dürfen (z. B. „nur die nächsten 2 Monate buchbar"). Der
öffentliche Buchungs-Kalender (`/book`) zeigt dann nur diesen Zeitraum an;
spätere Tage sind weder sicht- noch buchbar.

Heutiges Verhalten: Der Kalender sperrt nur die **Vergangenheit** (`d < today`),
es gibt keine Obergrenze nach vorne. Diese Obergrenze wird ergänzt.

## Entscheidungen (mit Nutzer abgestimmt)

- **Eingabe in Monaten.** Sandro tippt eine Zahl N → buchbar bis zum gleichen
  Tag in N Monaten ab heute. Beispiel: heute 16.06. + 2 → buchbar bis **16.08.**
- **Spätere Monate gar nicht zeigen.** Der „Weiter"-Pfeil stoppt am letzten
  erreichbaren Monat (= Monat von `maxDate`); Tage nach `maxDate` im letzten
  Monat sind ausgegraut/gesperrt (gleiche Optik wie geschlossene Tage).
- **Leer / 0 = unbegrenzt** (heutiges Verhalten, kein Limit).
- **Ein globaler Wert** — kein Pro-Angebot-Horizont, kein Minimum-Vorlauf (YAGNI).

## Architektur

### 1. Datenhaltung — neue Singleton-Tabelle

`src/db/schema.ts`, neue Tabelle nach `availability`:

```ts
export const bookingSettings = pgTable('booking_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Wie viele Monate im Voraus maximal gebucht werden darf.
  // null = unbegrenzt.
  maxAdvanceMonths: integer('max_advance_months'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BookingSettings = typeof bookingSettings.$inferSelect;
```

Singleton: Es existiert höchstens eine Zeile. Fehlt sie, gilt „unbegrenzt".
Schema wird per `drizzle-kit push` in die DB gebracht (Projekt-Konvention, keine
Migrationen) — zuerst Beta, später Production.

### 2. Pure Logik — testbarer Kern

Neue Datei `src/availability/booking-horizon.ts` (KEIN `server-only`, von Client
und Server nutzbar):

```ts
// Datum um N Monate verschieben; klemmt auf den letzten Tag des Zielmonats,
// falls der Ursprungstag dort nicht existiert (z. B. 31.01. + 1 → 28./29.02.).
export function addMonths(date: Date, months: number): Date { … }

// Spätestes buchbares Datum (lokale Mitternacht) oder null bei unbegrenzt.
// months <= 0 oder null → null.
export function maxBookingDate(now: Date, months: number | null): Date | null { … }

// Liegt requestedDate (ISO 'YYYY-MM-DD') innerhalb des Horizonts?
// null-Horizont → immer true. Vergangenheit wird hier NICHT geprüft
// (das macht die bestehende Pflichtfeld-/Kalenderlogik).
export function isWithinHorizon(
  requestedDate: string,
  now: Date,
  months: number | null,
): boolean { … }
```

### 3. Repository

Neue Datei `src/availability/booking-settings-repository.ts` (`server-only`),
analog zu `repository.ts`:

```ts
export async function getBookingSettings(): Promise<BookingSettings | null>;
// Upsert der einzelnen Singleton-Zeile.
export async function setMaxAdvanceMonths(months: number | null): Promise<void>;
```

`getMaxAdvanceMonths()` als Komfort-Helfer: liest die Zeile, gibt
`row?.maxAdvanceMonths ?? null` zurück.

### 4. Server-Action

Neue Datei `src/availability/booking-settings-actions.ts` (`'use server'`),
exakt im Muster von `actions.ts`:

```ts
const schema = z.object({
  months: z.coerce.number().int().min(0).max(36),
});

export async function saveBookingHorizonAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  // Leeres Feld → null (unbegrenzt). '0' → null.
  const raw = String(formData.get('months') ?? '').trim();
  const months = raw === '' ? 0 : Number(raw);
  const parsed = schema.safeParse({ months });
  if (!parsed.success) return { error: 'Bitte eine Zahl zwischen 0 und 36 eingeben.' };

  await setMaxAdvanceMonths(parsed.data.months === 0 ? null : parsed.data.months);
  await logAudit({ action: 'booking_settings.updated' });
  revalidatePath('/admin/kalender');
  revalidatePath('/book');
  return { ok: true };
}
```

Obergrenze 36 Monate als Sanity-Limit (keine Tippfehler wie „200").

### 5. Admin-UI

Neue Komponente `src/components/admin/booking-horizon-editor.tsx`
(`'use client'`), Aufbau 1:1 wie `availability-editor.tsx` (`Card` /
`CardHeader` / `CardBody`, `useActionState`, `useToast`, Erfolg via `handledRef`
genau einmal toasten):

- Karte **„Buchungshorizont"**, Sub: „Wie weit im Voraus können Termine gebucht werden?"
- Ein Zahlenfeld `name="months"` (`type="number"`, `min=0`, `max=36`),
  Label „Buchbar für die nächsten … Monate".
- Hilfetext: „Leer oder 0 = unbegrenzt. Beispiel: 2 = nur die nächsten 2 Monate buchbar."
- Speichern-Button (`btn btn-sm btn-primary`), Toast „Buchungshorizont gespeichert."

Einbindung in `src/app/admin/kalender/page.tsx`: Wert serverseitig laden
(`getMaxAdvanceMonths()`) und `<BookingHorizonEditor initialMonths={…} />`
direkt nach `<AvailabilityEditor>` rendern.

### 6. Öffentlicher Kalender (`/book`)

**`src/app/book/page.tsx`:** `const maxAdvanceMonths = await getMaxAdvanceMonths();`
und als Prop an `BookingFlow` durchreichen. (Die bestehende Vorladung des
aktuellen Monats bleibt unverändert.)

**`src/components/book/booking-flow.tsx`:** Prop `maxAdvanceMonths: number | null`
bis zur `Calendar`-Komponente durchreichen. Dort, sobald `today` (clientseitig)
gesetzt ist:

- `const max = maxBookingDate(today, maxAdvanceMonths);` (aus der pure-Logik —
  bewusst aus dem **Client-`today`** berechnet, nicht aus Server-`now`, damit das
  Limit zur lokal angezeigten Mitternacht passt).
- **Tag sperren:** `const beyond = !!max && d > max;` → in die bestehende
  `disabled`-Bedingung aufnehmen: `disabled={past || voll || zu || beyond}`.
  Beyond-Tage erben die graue `:disabled`-Optik (wie `past`/`zu`) — kein neuer Stil.
- **„Weiter"-Pfeil sperren:** Der Button bekommt
  `disabled={!!max && view.y === maxView.y && view.m === maxView.m}` (wenn der
  angezeigte Monat bereits der Monat von `max` ist), wobei
  `maxView = { y: max.getFullYear(), m: max.getMonth() }`. So lässt sich nicht in
  einen vollständig gesperrten Folgemonat blättern.

### 7. Server-Validierung (Sicherheit)

`src/bookings/public-actions.ts`, im Termin-Zweig (nach der bestehenden
`requestedDate`-Pflichtprüfung, ~Zeile 110–112):

```ts
} else if (data.requestedDate.trim() === '') {
  return { error: 'Bitte wähle einen Termin.' };
} else {
  const months = await getMaxAdvanceMonths();
  if (!isWithinHorizon(data.requestedDate, new Date(), months)) {
    return { error: `Termine können höchstens ${months} Monate im Voraus gebucht werden.` };
  }
}
```

So greift das Limit auch, wenn jemand das Frontend umgeht.

## Tests (Vitest)

Neue Datei `src/availability/booking-horizon.test.ts` (pure, ohne DB — Muster wie
`input.test.ts` / `slots.test.ts`):

- `addMonths`: normaler Fall (16.06. +2 → 16.08.); Jahreswechsel (Nov +3 → Feb);
  Monatsende-Klammerung (31.01. +1 → 28.02. bzw. 29.02. im Schaltjahr).
- `maxBookingDate`: `null`/`0`/negativ → `null`; positiver Wert → korrektes Datum.
- `isWithinHorizon`: Datum vor `max` → true; exakt `max` → true; nach `max` →
  false; `months = null` → immer true.

Repository/Action laufen gegen die echte DB (Projekt-Konvention) und werden nicht
gesondert unit-getestet; die sicherheitsrelevante Grenzlogik ist über
`isWithinHorizon` vollständig abgedeckt.

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/db/schema.ts` | Tabelle `bookingSettings` + Typ |
| `src/availability/booking-horizon.ts` | **neu** — pure Logik |
| `src/availability/booking-horizon.test.ts` | **neu** — Tests |
| `src/availability/booking-settings-repository.ts` | **neu** — load/save Singleton |
| `src/availability/booking-settings-actions.ts` | **neu** — Server-Action |
| `src/components/admin/booking-horizon-editor.tsx` | **neu** — Admin-UI |
| `src/app/admin/kalender/page.tsx` | Wert laden + Editor rendern |
| `src/app/book/page.tsx` | `maxAdvanceMonths` laden + durchreichen |
| `src/components/book/booking-flow.tsx` | Prop durchreichen; Tag- + Pfeil-Sperre im `Calendar` |
| `src/bookings/public-actions.ts` | Horizont-Validierung im Termin-Zweig |

## Nicht im Scope (YAGNI)

- Minimum-Vorlauf („nicht heute / nicht in den nächsten X Stunden buchbar").
- Pro-Angebot-Horizonte.
- Datums-Bereich statt Monatszahl (fixer Start-/Enddatum-Kalender).

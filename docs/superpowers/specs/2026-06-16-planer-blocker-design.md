# Planer-Blocker — Design

**Datum:** 2026-06-16
**Status:** freigegeben (Brainstorming)

## Ziel

Sandro soll im **Planer** einzelne Zeiten/Tage blockieren können, an denen keine
öffentlichen Termin-Buchungen möglich sind:
- **Ganztägig**: „Mo 22.06. keine Termine" (z. B. Ferien).
- **Zeitfenster**: „22.06. 9:00–17:00 blockiert".

Blocker reduzieren die im öffentlichen Buchungs-Kalender (`/book`) angebotene
Verfügbarkeit. Heute gibt es kein Blocker-/Sperr-Konzept; Verfügbarkeit ergibt
sich aus Wochentags-Öffnungszeiten (`availability`) minus belegte Intervalle
(Buchungen + Google-„busy"). Blocker reihen sich als zusätzliche belegte
Intervalle bzw. geschlossene Tage ein.

## Entscheidungen (mit Nutzer abgestimmt)

- **Nur einzelne Daten** — keine wiederkehrenden Wochentags-Regeln. Wiederkehrende
  Öffnungszeiten/Schliessungen laufen weiterhin über den Kalender-Tab
  (`availability`). [[railway-beta-environment]]
- **Ganztägig ODER Zeitfenster** — beide Zeiten leer = ganztägig; sonst Von/Bis.
- **Eingabe direkt im Planer-Wochenraster**: in freien Bereich ziehen/klicken →
  Auswahl „Termin anlegen | Zeit blockieren"; Klick auf den Tages-Kopf → „Ganzen
  Tag blockieren?". Blocker werden als graue, schraffierte Balken mit Label
  „Blockiert" und **Lösch-×** dargestellt (ganztägig = volle Spaltenhöhe).
- **Nicht bindend für Sandro** (wie Google-„busy"): im Planer sichtbar, hindern
  ihn aber nicht daran, manuell etwas einzutragen. Sie steuern nur das
  öffentliche Angebot.
- **Keine serverseitige Slot-Nachprüfung beim Buchen** — konsistent mit heute
  (der Submit re-validiert auch Buchungen/Google nicht; die UI bietet nur freie
  Slots an).

## Architektur

### 1. Tabelle `time_blocks`

`src/db/schema.ts`, neue Tabelle nach `availability`:

```ts
export const timeBlocks = pgTable('time_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockDate: date('block_date').notNull(),
  // Beide null = ganztägig; beide gesetzt = Zeitfenster ('HH:MM').
  startTime: text('start_time'),
  endTime: text('end_time'),
  reason: text('reason'), // optionale interne Notiz, z. B. „Ferien"
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type TimeBlock = typeof timeBlocks.$inferSelect;
```

Schema per `drizzle-kit push` zuerst in die **Beta**-DB, später Production (wie
[[railway-beta-environment]] für `booking_settings`).

### 2. Pure Logik — testbarer Kern

Neue Datei `src/time-blocks/logic.ts` (KEIN `server-only`). Nutzt den
`BusyInterval`-Typ aus `@/availability/slots`.

```ts
import type { BusyInterval } from '@/availability/slots';

type BlockTimes = { startTime: string | null; endTime: string | null };

// 'HH:MM' → Minuten seit Mitternacht.
export function hhmmToMinutes(t: string): number { … }

// Ganztägig, wenn keine Start-/Endzeit gesetzt ist.
export function isWholeDay(b: BlockTimes): boolean {
  return !b.startTime || !b.endTime;
}

// Aggregiert die Blocks EINES Tages:
// - closed: true, sobald ein Ganztags-Block vorhanden ist.
// - busy:   ein BusyInterval je Zeitfenster-Block.
export function summarizeDayBlocks(blocks: BlockTimes[]): {
  closed: boolean;
  busy: BusyInterval[];
} { … }
```

`summarizeDayBlocks` ist das Bindeglied zur Slot-Logik: ganztägig → Tag
geschlossen; Zeitfenster → belegte Intervalle (`durationMinutes =
hhmmToMinutes(end) - hhmmToMinutes(start)`).

### 3. Repository

Neue Datei `src/time-blocks/repository.ts` (`server-only`):

```ts
export async function listBlocksInRange(fromIso: string, toIso: string): Promise<TimeBlock[]>;
export async function getBlocksOnDate(dateIso: string): Promise<TimeBlock[]>;
export async function createTimeBlock(input: {
  blockDate: string; startTime: string | null; endTime: string | null; reason: string | null;
}): Promise<void>;
export async function deleteTimeBlock(id: string): Promise<void>;
```

### 4. Validierung

Neue Datei `src/time-blocks/input.ts` (Zod, KEIN `server-only`):

- `blockDate`: `/^\d{4}-\d{2}-\d{2}$/`.
- `startTime`/`endTime`: beide leer (→ null/ganztägig) **oder** beide `HH:MM`
  mit `end > start`. „Nur eines gesetzt" wird abgelehnt.
- `reason`: optionaler String, getrimmt, max. 200 Zeichen.

### 5. Server-Actions

Neue Datei `src/time-blocks/actions.ts` (`'use server'`, Muster wie
`src/availability/actions.ts`):

```ts
export async function createTimeBlockAction(_prev, formData): Promise<ActionResult>;
export async function deleteTimeBlockAction(_prev, formData): Promise<ActionResult>; // id aus formData
```

Beide: validieren → Repository → `logAudit({ action: 'time_block.created' | 'time_block.deleted' })`
→ `revalidatePath('/admin/planer')` **und** `revalidatePath('/book')` → `{ ok: true }`.

### 6. Verfügbarkeit reduzieren (`src/availability/slots-actions.ts`)

**`getFreeSlots(offerId, dateStr)`:** nach Bestimmen der Wochentags-Zeile die
Blocks des Tages laden (`getBlocksOnDate`). `summarizeDayBlocks`:
- `closed` → früh `{ slots: [], belegt: [] }` zurück (wie nicht-offener Wochentag).
- sonst die `busy`-Intervalle der Blocks zum bestehenden `busy`-Array hinzufügen
  (neben Buchungen + Google), bevor `computeSlotStatuses` läuft.

**`getMonthSlotAvailabilityForOffers(offerIds, year, month)`:** die Blocks des
Monats einmal laden (in das bestehende `Promise.all` aufnehmen,
`listBlocksInRange(days[0], days[last])`). Pro Tag `summarizeDayBlocks`:
- ganztägig geschlossen → Datum zu `geschlosseneTage`, aus `offeneTage` ausschliessen.
- Zeitfenster-`busy` → in `busyByDay` einmischen (fliesst in `computeFreeSlots` ein;
  fällt dadurch jeder Slot weg, wird der Tag wie gehabt `voll`).

Der öffentliche Kalender (`booking-flow.tsx`) konsumiert bereits
`geschlosseneTage`/`volleTage` — **keine Änderung am öffentlichen Kalender-UI nötig**.

### 7. Planer (`src/bookings/planner-actions.ts` + `src/components/admin/planner-calendar.tsx`)

**`getPlannerWeek`:** Blocks der Woche laden (`listBlocksInRange(days[0], days[6])`,
in das `Promise.all`/parallel) und als neues Feld zurückgeben:

```ts
export interface PlannerBlock {
  id: string;
  wholeDay: boolean;
  start: string;            // 'HH:MM' ('' bei wholeDay)
  durationMinutes: number;  // 0 bei wholeDay
  reason: string | null;
}
// in PlannerWeek:
blocks: Record<string, PlannerBlock[]>; // pro ISO-Tag
```

**`planner-calendar.tsx`:**
- **Anzeige:** Blocks als graue, schraffierte Balken (optisch von Google-„busy"
  unterscheidbar), Label „Blockiert" + ggf. `reason`, mit **Lösch-×** (ruft
  `deleteTimeBlockAction`). Ganztägig = Balken über die volle Spaltenhöhe.
- **Zeitfenster anlegen:** beim Aufziehen/Klick in einen freien Bereich statt
  direkt des Buchungs-Modals ein kleines Auswahl-Modal „**Termin anlegen** |
  **Zeit blockieren**". „Termin anlegen" = bisheriger Flow (`NewBookingModal`);
  „Zeit blockieren" ruft `createTimeBlockAction` mit Datum + Von/Bis des
  aufgezogenen Bereichs.
- **Ganzen Tag anlegen:** Klick auf den Tages-Kopf (Datum) → Bestätigungs-Modal
  „Ganzen Tag blockieren?" → `createTimeBlockAction` mit leeren Zeiten.
- Aktionen laufen über `useActionState`/`useTransition` wie die bestehenden
  Planer-Aktionen; nach Erfolg Woche neu laden (Server-Action-Refresh, wie beim
  Verschieben/Anlegen heute).

## Tests (Vitest)

Neue Datei `src/time-blocks/logic.test.ts` (pure, ohne DB):
- `hhmmToMinutes`: '09:00' → 540; '17:30' → 1050.
- `isWholeDay`: beide null → true; nur start → true; beide gesetzt → false.
- `blockToBusy`/`summarizeDayBlocks`:
  - Zeitfenster 09:00–17:00 → 1 busy-Intervall, `durationMinutes = 480`.
  - ganztägig → `closed: true`, keine busy.
  - mehrere Zeitfenster am selben Tag → mehrere busy-Intervalle, `closed: false`.
  - Mix (ganztägig + Zeitfenster) → `closed: true`.
  - leere Liste → `closed: false`, `busy: []`.

Repository/Actions/Planer-UI laufen gegen die echte DB bzw. sind interaktiv und
werden nicht gesondert unit-getestet; die verfügbarkeitsrelevante Logik ist über
`summarizeDayBlocks` vollständig abgedeckt.

## Betroffene Dateien

| Datei | Änderung |
|---|---|
| `src/db/schema.ts` | Tabelle `timeBlocks` + Typ |
| `src/time-blocks/logic.ts` | **neu** — pure Logik |
| `src/time-blocks/logic.test.ts` | **neu** — Tests |
| `src/time-blocks/input.ts` | **neu** — Zod-Validierung |
| `src/time-blocks/repository.ts` | **neu** — CRUD |
| `src/time-blocks/actions.ts` | **neu** — Server-Actions create/delete |
| `src/availability/slots-actions.ts` | Blocks in `getFreeSlots` + `getMonthSlotAvailabilityForOffers` einrechnen |
| `src/bookings/planner-actions.ts` | `getPlannerWeek` lädt + liefert `blocks` |
| `src/components/admin/planner-calendar.tsx` | Blocks anzeigen + anlegen (Raster/Tages-Kopf) + löschen |

## Nicht im Scope (YAGNI)

- Wiederkehrende Wochentags-Blocker (bewusst ausgeschlossen; via `availability`).
- Serverseitige Slot-Nachprüfung beim öffentlichen Buchen.
- Bearbeiten bestehender Blocks (nur anlegen + löschen — zum Ändern löschen & neu).
- Block-Kategorien, Farben, Wiederholungen.

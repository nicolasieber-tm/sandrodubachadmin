# Planer-Blocker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sandro blockiert im Planer einzelne Tage (ganztägig) oder Zeitfenster; diese Blocker reduzieren die im öffentlichen Buchungs-Kalender angebotene Verfügbarkeit.

**Architecture:** Eine pure, getestete Funktion `summarizeDayBlocks` wandelt die Blocks eines Tages in `{ closed, busy[] }` um. Eine Tabelle `time_blocks` (Datum + optionale Start/Endzeit) hält die Blocker, gelesen/geschrieben über Repository + Server-Actions. Die bestehende Slot-Logik bezieht Blocks ein (ganztägig → geschlossener Tag; Zeitfenster → belegtes Intervall). Der Planer lädt Blocks mit der Woche und erlaubt Anlegen (Raster-Auswahl bzw. Tages-Kopf) und Löschen.

**Tech Stack:** Next.js 16 (Server Actions), React 19, Drizzle ORM (Postgres), Zod 4, Vitest 4.

**Branch:** `beta` (erst auf Beta testen, später nach `main`/Production mergen).

---

## File Structure

| Datei | Verantwortung |
|---|---|
| `src/time-blocks/logic.ts` | **neu** — pure Logik: `hhmmToMinutes`, `isWholeDay`, `summarizeDayBlocks` |
| `src/time-blocks/logic.test.ts` | **neu** — Vitest-Unit-Tests |
| `src/db/schema.ts` | Tabelle `timeBlocks` + Typ |
| `src/time-blocks/repository.ts` | **neu** — CRUD (Singleton-frei) |
| `src/time-blocks/input.ts` | **neu** — Zod-Schema |
| `src/time-blocks/actions.ts` | **neu** — Server-Actions create/delete (plain-arg, da der Planer sie imperativ aufruft — wie `planner-actions.ts`) |
| `src/availability/slots-actions.ts` | Blocks in `getFreeSlots` + `getMonthSlotAvailabilityForOffers` einrechnen |
| `src/bookings/planner-actions.ts` | `getPlannerWeek` lädt + liefert `blocks` (+ `PlannerBlock`) |
| `src/components/admin/planner-calendar.tsx` | Blocks anzeigen + anlegen + löschen |
| `src/app/globals.css` | `.pl-blocked` + `.pl-blocked-x` Styles |

---

## Task 1: Pure Logik (TDD)

**Files:**
- Create: `src/time-blocks/logic.ts`
- Test: `src/time-blocks/logic.test.ts`

- [ ] **Step 1: Failing test schreiben** — `src/time-blocks/logic.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { hhmmToMinutes, isWholeDay, summarizeDayBlocks } from './logic';

describe('hhmmToMinutes', () => {
  it('rechnet HH:MM in Minuten um', () => {
    expect(hhmmToMinutes('09:00')).toBe(540);
    expect(hhmmToMinutes('17:30')).toBe(1050);
  });
});

describe('isWholeDay', () => {
  it('ist ganztägig, wenn keine Zeiten gesetzt sind', () => {
    expect(isWholeDay({ startTime: null, endTime: null })).toBe(true);
  });
  it('ist ganztägig, wenn nur eine Zeit fehlt', () => {
    expect(isWholeDay({ startTime: '09:00', endTime: null })).toBe(true);
  });
  it('ist KEIN Ganztag bei gesetztem Fenster', () => {
    expect(isWholeDay({ startTime: '09:00', endTime: '17:00' })).toBe(false);
  });
});

describe('summarizeDayBlocks', () => {
  it('macht aus einem Zeitfenster ein busy-Intervall', () => {
    const r = summarizeDayBlocks([{ startTime: '09:00', endTime: '17:00' }]);
    expect(r.closed).toBe(false);
    expect(r.busy).toEqual([{ start: '09:00', durationMinutes: 480 }]);
  });
  it('schliesst den Tag bei einem Ganztags-Block', () => {
    const r = summarizeDayBlocks([{ startTime: null, endTime: null }]);
    expect(r.closed).toBe(true);
    expect(r.busy).toEqual([]);
  });
  it('sammelt mehrere Zeitfenster am selben Tag', () => {
    const r = summarizeDayBlocks([
      { startTime: '09:00', endTime: '10:00' },
      { startTime: '14:00', endTime: '15:30' },
    ]);
    expect(r.closed).toBe(false);
    expect(r.busy).toEqual([
      { start: '09:00', durationMinutes: 60 },
      { start: '14:00', durationMinutes: 90 },
    ]);
  });
  it('Mix aus Ganztag und Fenster schliesst den Tag', () => {
    const r = summarizeDayBlocks([
      { startTime: null, endTime: null },
      { startTime: '14:00', endTime: '15:00' },
    ]);
    expect(r.closed).toBe(true);
  });
  it('leere Liste: kein Block', () => {
    const r = summarizeDayBlocks([]);
    expect(r).toEqual({ closed: false, busy: [] });
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run: `npm run test -- src/time-blocks/logic.test.ts`
Expected: FAIL — `Failed to resolve import "./logic"`.

- [ ] **Step 3: Implementierung schreiben** — `src/time-blocks/logic.ts`:

```ts
// Pure Logik für Planer-Blocker. KEIN server-only: wird vom Repository-nahen
// Server-Code UND (für Dauer-Berechnung) von planner-actions genutzt.
// Lokale Zeit-Strings 'HH:MM', kein UTC.
import type { BusyInterval } from '@/availability/slots';

type BlockTimes = { startTime: string | null; endTime: string | null };

// 'HH:MM' → Minuten seit Mitternacht.
export function hhmmToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

// Ganztägig, sobald Start- ODER Endzeit fehlt (Validierung erlaubt nur
// „beide leer" oder „beide gesetzt"; das `||` ist defensiv).
export function isWholeDay(b: BlockTimes): boolean {
  return !b.startTime || !b.endTime;
}

// Aggregiert die Blocks EINES Tages:
// - closed: true, sobald ein Ganztags-Block dabei ist.
// - busy:   ein BusyInterval je Zeitfenster-Block.
export function summarizeDayBlocks(blocks: BlockTimes[]): {
  closed: boolean;
  busy: BusyInterval[];
} {
  let closed = false;
  const busy: BusyInterval[] = [];
  for (const b of blocks) {
    if (isWholeDay(b)) {
      closed = true;
      continue;
    }
    const start = b.startTime as string;
    busy.push({
      start,
      durationMinutes: hhmmToMinutes(b.endTime as string) - hhmmToMinutes(start),
    });
  }
  return { closed, busy };
}
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run: `npm run test -- src/time-blocks/logic.test.ts`
Expected: PASS — alle Tests grün.

- [ ] **Step 5: Commit**

```bash
git add src/time-blocks/logic.ts src/time-blocks/logic.test.ts
git commit -m "feat(planer): Blocker – pure Logik (summarizeDayBlocks)"
```

---

## Task 2: DB-Schema `time_blocks`

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Tabelle ergänzen**

Lies `src/db/schema.ts`. Füge die Tabelle direkt NACH der `bookingSettings`-Tabelle (vor dem `calendarProvider`-pgEnum) ein:

```ts
// Planer-Blocker: einzelne gesperrte Tage/Zeitfenster (keine öffentlichen
// Buchungen). Beide Zeiten null = ganztägig; beide gesetzt = Zeitfenster.
export const timeBlocks = pgTable('time_blocks', {
  id: uuid('id').primaryKey().defaultRandom(),
  blockDate: date('block_date').notNull(),
  startTime: text('start_time'),
  endTime: text('end_time'),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Typ-Export ergänzen**

Bei den `$inferSelect`-Typen (nach `export type BookingSettings = …`) einfügen:

```ts
export type TimeBlock = typeof timeBlocks.$inferSelect;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (`pgTable`, `uuid`, `date`, `text`, `timestamp` sind in Zeile 1 bereits importiert).

- [ ] **Step 4: Schema in die Beta-DB pushen** *(Controller-Schritt — wird vom Orchestrator ausgeführt, nicht vom Implementer-Subagent)*

```bash
railway run --environment beta --service Postgres -- bash -c 'DATABASE_URL="$DATABASE_PUBLIC_URL" npx drizzle-kit push'
```
Expected: `time_blocks` wird angelegt, „Changes applied". **NICHT** gegen Production pushen (separater, freigegebener Schritt beim Merge).

- [ ] **Step 5: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(planer): Blocker – Tabelle time_blocks"
```

---

## Task 3: Repository

**Files:**
- Create: `src/time-blocks/repository.ts`

- [ ] **Step 1: Repository schreiben**

```ts
import 'server-only';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db';
import { timeBlocks, type TimeBlock } from '@/db/schema';

// Alle Blocks im (inklusiven) Datumsbereich, sortiert nach Datum/Startzeit.
export async function listBlocksInRange(
  fromIso: string,
  toIso: string,
): Promise<TimeBlock[]> {
  return db
    .select()
    .from(timeBlocks)
    .where(and(gte(timeBlocks.blockDate, fromIso), lte(timeBlocks.blockDate, toIso)))
    .orderBy(asc(timeBlocks.blockDate), asc(timeBlocks.startTime));
}

// Alle Blocks eines einzelnen Tages.
export async function getBlocksOnDate(dateIso: string): Promise<TimeBlock[]> {
  return db.select().from(timeBlocks).where(eq(timeBlocks.blockDate, dateIso));
}

export async function createTimeBlock(input: {
  blockDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}): Promise<void> {
  await db.insert(timeBlocks).values({
    blockDate: input.blockDate,
    startTime: input.startTime,
    endTime: input.endTime,
    reason: input.reason,
  });
}

export async function deleteTimeBlock(id: string): Promise<void> {
  await db.delete(timeBlocks).where(eq(timeBlocks.id, id));
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler. (`date`-Spalten liefern in diesem Projekt Strings 'YYYY-MM-DD' — Vergleich mit ISO-Strings ist korrekt, vgl. `bookings.requestedDate`.)

- [ ] **Step 3: Commit**

```bash
git add src/time-blocks/repository.ts
git commit -m "feat(planer): Blocker – Repository (CRUD)"
```

---

## Task 4: Validierung + Server-Actions

**Files:**
- Create: `src/time-blocks/input.ts`
- Create: `src/time-blocks/actions.ts`

- [ ] **Step 1: Zod-Schema** — `src/time-blocks/input.ts`:

```ts
// Validierung eines Blockers. KEIN server-only (Schema darf clientseitig genutzt
// werden). Entweder beide Zeiten leer (ganztägig) oder beide gesetzt mit Ende
// nach Start. 'HH:MM' ist nullbeschreibbar.
import { z } from 'zod';

const hhmm = /^\d{2}:\d{2}$/;

export const timeBlockSchema = z
  .object({
    blockDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(hhmm).nullable(),
    endTime: z.string().regex(hhmm).nullable(),
    reason: z.string().trim().max(200).nullable(),
  })
  .refine(
    (v) =>
      (v.startTime === null && v.endTime === null) ||
      (v.startTime !== null && v.endTime !== null),
    { message: 'Start und Ende müssen beide gesetzt oder beide leer sein.' },
  )
  .refine((v) => v.startTime === null || v.endTime === null || v.endTime > v.startTime, {
    message: 'Ende muss nach dem Start liegen.',
  });

export type TimeBlockInput = z.infer<typeof timeBlockSchema>;
```

(Für 'HH:MM' im 24h-Format ist der lexikografische Vergleich `endTime > startTime` zugleich der chronologische.)

- [ ] **Step 2: Server-Actions** — `src/time-blocks/actions.ts`:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { createTimeBlock, deleteTimeBlock } from './repository';
import { timeBlockSchema } from './input';

export type ActionResult = { ok: true } | { error: string };

// Plain-arg (kein FormData): der Planer ruft diese Actions imperativ auf —
// wie movePlannerBooking/finalizePlannedBooking in planner-actions.ts.
export async function createTimeBlockAction(input: {
  blockDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}): Promise<ActionResult> {
  const parsed = timeBlockSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Ungültiger Blocker.' };
  }
  await createTimeBlock(parsed.data);
  await logAudit({ action: 'time_block.created' });
  revalidatePath('/admin/planer');
  revalidatePath('/book');
  return { ok: true };
}

export async function deleteTimeBlockAction(id: string): Promise<ActionResult> {
  if (typeof id !== 'string' || id.trim() === '') {
    return { error: 'Ungültige ID.' };
  }
  await deleteTimeBlock(id);
  await logAudit({ action: 'time_block.deleted' });
  revalidatePath('/admin/planer');
  revalidatePath('/book');
  return { ok: true };
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/time-blocks/input.ts src/time-blocks/actions.ts
git commit -m "feat(planer): Blocker – Zod-Validierung + Server-Actions"
```

---

## Task 5: Verfügbarkeit reduzieren (Slot-Logik)

**Files:**
- Modify: `src/availability/slots-actions.ts`

- [ ] **Step 1: Imports ergänzen**

Nach `import { googleBusyIntervals, googleBusyIntervalsForDays } from '@/google/sync';` einfügen:

```ts
import { getBlocksOnDate, listBlocksInRange } from '@/time-blocks/repository';
import { summarizeDayBlocks } from '@/time-blocks/logic';
```

- [ ] **Step 2: `getFreeSlots` — Blocks des Tages einrechnen**

In `getFreeSlots`, direkt NACH der Wochentags-Prüfung (`if (!row || !row.enabled) { return { slots: [], belegt: [] }; }`) einfügen:

```ts
  // Planer-Blocker des Tages: ganztägig → geschlossen; Zeitfenster → belegt.
  const dayBlocks = summarizeDayBlocks(await getBlocksOnDate(dateStr));
  if (dayBlocks.closed) {
    return { slots: [], belegt: [] };
  }
```

Und unmittelbar VOR dem `computeSlotStatuses(...)`-Aufruf die Block-Intervalle zum `busy`-Array hinzufügen (nach dem Google-`for`-Loop, der `busy` füllt):

```ts
  for (const interval of dayBlocks.busy) {
    busy.push(interval);
  }
```

- [ ] **Step 3: `getMonthSlotAvailabilityForOffers` — Blocks des Monats einrechnen**

In `getMonthSlotAvailabilityForOffers` die `listBlocksInRange`-Abfrage in das bestehende `Promise.all` aufnehmen:

```ts
  const [availability, alleAngebote, rows, googleBusy, blockRows] = await Promise.all([
    getAvailability(),
    listAllOffers(),
    listBookingsInRange(days[0], days[days.length - 1]),
    googleBusyIntervalsForDays(days),
    listBlocksInRange(days[0], days[days.length - 1]),
  ]);
```

Direkt danach die Blocks pro Tag gruppieren und zusammenfassen:

```ts
  // Blocks pro Tag zusammenfassen (closed + busy-Intervalle).
  const blocksByDay = new Map<string, { startTime: string | null; endTime: string | null }[]>();
  for (const b of blockRows) {
    const list = blocksByDay.get(b.blockDate);
    if (list) list.push(b);
    else blocksByDay.set(b.blockDate, [b]);
  }
  const summaryByDay = new Map<string, ReturnType<typeof summarizeDayBlocks>>();
  for (const day of days) {
    summaryByDay.set(day, summarizeDayBlocks(blocksByDay.get(day) ?? []));
  }
```

Im Schleifenblock, der `geschlosseneTage`/`offeneTage` befüllt, die `closed`-Bedingung ergänzen:

```ts
  for (const day of days) {
    const row = availByWeekday.get(ourWeekday(day));
    const blockedAllDay = summaryByDay.get(day)?.closed ?? false;
    if (!row || !row.enabled || blockedAllDay) {
      geschlosseneTage.push(day);
    } else {
      offeneTage.push({ day, startTime: row.startTime, endTime: row.endTime });
    }
  }
```

Im `computeFreeSlots`-Aufruf (innerhalb der `for (const offerId …)`-Schleife) die Block-Busy-Intervalle des Tages mit einbeziehen:

```ts
      const frei = computeFreeSlots({
        enabled: true,
        startTime,
        endTime,
        slotMinutes,
        stepMinutes: 30,
        busy: [
          ...(busyByDay.get(day) ?? []),
          ...(googleBusy[day] ?? []),
          ...(summaryByDay.get(day)?.busy ?? []),
        ],
      });
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 5: Tests (keine Regression)**

Run: `npm run test -- src/availability`
Expected: bestehende `slots`-Tests bleiben grün.

- [ ] **Step 6: Commit**

```bash
git add src/availability/slots-actions.ts
git commit -m "feat(planer): Blocker – in öffentliche Slot-/Tages-Verfügbarkeit einrechnen"
```

---

## Task 6: Planer-Daten (`getPlannerWeek` liefert Blocks)

**Files:**
- Modify: `src/bookings/planner-actions.ts`

- [ ] **Step 1: Imports ergänzen**

Bei den Imports (z. B. nach dem `googleBusyIntervals`-Import) einfügen:

```ts
import { listBlocksInRange } from '@/time-blocks/repository';
import { hhmmToMinutes } from '@/time-blocks/logic';
```

- [ ] **Step 2: `PlannerBlock`-Typ + Feld in `PlannerWeek`**

Direkt nach der `PlannerBusy`-Interface-Definition einfügen:

```ts
export interface PlannerBlock {
  id: string;
  wholeDay: boolean;
  start: string; // 'HH:MM' ('' bei wholeDay)
  durationMinutes: number; // 0 bei wholeDay
  reason: string | null;
}
```

In `interface PlannerWeek` (nach `googleBusy: Record<string, PlannerBusy[]>;`) ergänzen:

```ts
  // Manuelle Blocker pro ISO-Tag.
  blocks: Record<string, PlannerBlock[]>;
```

- [ ] **Step 3: Blocks laden + zurückgeben**

In `getPlannerWeek` die `listBlocksInRange`-Abfrage in das bestehende `Promise.all` aufnehmen:

```ts
  const [availRows, offers, rows, blockRows] = await Promise.all([
    getAvailability(),
    listAllOffers(),
    listBookingsInRange(days[0], days[6]),
    listBlocksInRange(days[0], days[6]),
  ]);
```

Vor dem `return` die Block-Map bauen:

```ts
  // Blocker pro Tag fürs Raster (graue Balken mit Lösch-×).
  const blocks: Record<string, PlannerBlock[]> = {};
  for (const day of days) blocks[day] = [];
  for (const r of blockRows) {
    const wholeDay = !r.startTime || !r.endTime;
    (blocks[r.blockDate] ?? (blocks[r.blockDate] = [])).push({
      id: r.id,
      wholeDay,
      start: r.startTime ?? '',
      durationMinutes:
        wholeDay ? 0 : hhmmToMinutes(r.endTime as string) - hhmmToMinutes(r.startTime as string),
      reason: r.reason,
    });
  }
```

Das `return`-Objekt um `blocks` ergänzen:

```ts
  return {
    days,
    today: toIso(now),
    rangeLabel: rangeLabelFor(days[0], days[6]),
    availability,
    bookings: plannerBookings,
    googleBusy,
    blocks,
  };
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (der Planer-Client referenziert `week.blocks` erst in Task 7 — bis dahin ist das Feld nur vorhanden, ungenutzt).

- [ ] **Step 5: Commit**

```bash
git add src/bookings/planner-actions.ts
git commit -m "feat(planer): Blocker – getPlannerWeek liefert blocks"
```

---

## Task 7: Planer-UI (anzeigen + anlegen + löschen)

**Files:**
- Modify: `src/components/admin/planner-calendar.tsx`
- Modify: `src/app/globals.css`

READ `src/components/admin/planner-calendar.tsx` vollständig vor den Edits — die Zeilennummern unten sind ungefähr.

- [ ] **Step 1: Imports ergänzen**

Bei den Imports (nach `import { NewBookingModal } from './new-booking-modal';`) einfügen:

```ts
import { createTimeBlockAction, deleteTimeBlockAction } from '@/time-blocks/actions';
```

- [ ] **Step 2: State ergänzen**

Nach `const [detail, setDetail] = useState<Booking | null>(null);` einfügen (`CreateDraft` ist der bestehende Typ `{ date; time; endTime }`):

```ts
  // Auswahl nach dem Aufziehen: Termin anlegen ODER blockieren.
  const [blockChoice, setBlockChoice] = useState<CreateDraft | null>(null);
  // Tag, für den „ganzer Tag blockieren?" bestätigt werden soll.
  const [pendingDayBlock, setPendingDayBlock] = useState<string | null>(null);
```

- [ ] **Step 3: `onColumnPointerUp` — statt direkt anzulegen, Auswahl öffnen**

Im `else`-Zweig von `onColumnPointerUp` (Nicht-Planungsmodus) den `setCreateDraft({...})`-Aufruf ersetzen durch:

```ts
    } else {
      setBlockChoice({
        date,
        time,
        endTime: toHHMM(sel.startMin + sel.durationMinutes),
      });
    }
```

- [ ] **Step 4: `onColumnPointerDown` — Blocks vom Aufziehen ausnehmen**

Die bestehende Guard-Zeile

```ts
    if ((e.target as HTMLElement).closest('.pl-block')) return;
```

ersetzen durch:

```ts
    if ((e.target as HTMLElement).closest('.pl-block, .pl-blocked')) return;
```

- [ ] **Step 5: Handler ergänzen**

Nach `confirmMove()` (oder neben `openDetail`) einfügen:

```ts
  // Auswahl → bisheriger „neue Buchung"-Flow.
  function chooseCreateBooking() {
    if (!blockChoice) return;
    setCreateDraft(blockChoice);
    setBlockChoice(null);
  }

  // Auswahl → Zeitfenster blockieren.
  function chooseBlockRange() {
    const c = blockChoice;
    if (!c) return;
    startSave(async () => {
      const res = await createTimeBlockAction({
        blockDate: c.date,
        startTime: c.time,
        endTime: c.endTime,
        reason: null,
      });
      if ('ok' in res) {
        setBlockChoice(null);
        toast('Zeit blockiert.');
        loadWeek(offset);
      } else {
        toast(res.error);
      }
    });
  }

  // Tages-Kopf → ganzen Tag blockieren.
  function confirmDayBlock() {
    const date = pendingDayBlock;
    if (!date) return;
    startSave(async () => {
      const res = await createTimeBlockAction({
        blockDate: date,
        startTime: null,
        endTime: null,
        reason: null,
      });
      if ('ok' in res) {
        setPendingDayBlock(null);
        toast('Ganzer Tag blockiert.');
        loadWeek(offset);
      } else {
        toast(res.error);
      }
    });
  }

  // Blocker entfernen (×).
  function removeBlock(id: string) {
    startSave(async () => {
      const res = await deleteTimeBlockAction(id);
      if ('ok' in res) {
        toast('Blocker entfernt.');
        loadWeek(offset);
      } else {
        toast(res.error);
      }
    });
  }
```

- [ ] **Step 6: Tages-Kopf klickbar machen**

Im `planner-headrow` den Tages-Kopf-`<div className={`planner-dayhead…`}>` um Klick + Hinweis erweitern:

```tsx
                <div
                  key={day}
                  className={`planner-dayhead${isToday ? ' is-today' : ''}`}
                  onClick={() => setPendingDayBlock(day)}
                  title="Ganzen Tag blockieren"
                  style={{ cursor: 'pointer' }}
                >
                  <span className="wd">{WD[i]}</span>
                  <span className="dn num">{Number(day.split('-')[2])}</span>
                </div>
```

- [ ] **Step 7: Blocks im Raster rendern**

In der Tages-Spalte (`planner-col`), nach dem `pl-off`-Schattierungsblock und vor/zwischen den Termin-Blöcken, einfügen:

```tsx
                    {/* Manuelle Blocker (graue, schraffierte Balken) */}
                    {(week.blocks[day] ?? []).map((blk) => {
                      const top = blk.wholeDay ? 0 : (toMinutes(blk.start) - DAY_START) * PX_PER_MIN;
                      const height = blk.wholeDay
                        ? gridHeight
                        : Math.max(blk.durationMinutes * PX_PER_MIN, 18);
                      const label = blk.wholeDay
                        ? 'Ganzer Tag blockiert'
                        : `Blockiert ${blk.start}–${toHHMM(toMinutes(blk.start) + blk.durationMinutes)}`;
                      return (
                        <div
                          key={`blk-${blk.id}`}
                          className="pl-blocked"
                          style={{ top, height }}
                          title={blk.reason ?? label}
                        >
                          <span>{label}</span>
                          <button
                            type="button"
                            className="pl-blocked-x"
                            aria-label="Blocker entfernen"
                            disabled={saving}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeBlock(blk.id);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
```

- [ ] **Step 8: Auswahl- und Tages-Block-Modal rendern**

Vor dem `{createDraft ? (` -Block (NewBookingModal) einfügen:

```tsx
      {/* Auswahl nach dem Aufziehen: Termin oder Blocker */}
      {blockChoice ? (
        <div className="overlay">
          <div className="scrim" onClick={() => setBlockChoice(null)} />
          <div className="modal planner-confirm" role="dialog" aria-modal="true">
            <div className="modal-b">
              <h3 style={{ marginTop: 0 }}>
                {dayLabel(blockChoice.date)} · {blockChoice.time}–{blockChoice.endTime}
              </h3>
              <p style={{ fontSize: 14 }}>Was möchtest du in diesem Zeitraum tun?</p>
            </div>
            <div className="modal-f">
              <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setBlockChoice(null)}>
                Abbrechen
              </button>
              <button type="button" className="btn" disabled={saving} onClick={chooseBlockRange}>
                Zeit blockieren
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={chooseCreateBooking}>
                Termin anlegen
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Bestätigung: ganzen Tag blockieren */}
      {pendingDayBlock ? (
        <div className="overlay">
          <div className="scrim" onClick={() => setPendingDayBlock(null)} />
          <div className="modal planner-confirm" role="dialog" aria-modal="true">
            <div className="modal-b">
              <h3 style={{ marginTop: 0 }}>Ganzen Tag blockieren?</h3>
              <p style={{ fontSize: 14 }}>
                <strong>{dayLabel(pendingDayBlock)}</strong> wird für öffentliche Buchungen gesperrt.
              </p>
            </div>
            <div className="modal-f">
              <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setPendingDayBlock(null)}>
                Abbrechen
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={confirmDayBlock}>
                Tag blockieren
              </button>
            </div>
          </div>
        </div>
      ) : null}
```

- [ ] **Step 9: Legende ergänzen**

Im `<p className="planner-legend mut">` den Text erweitern um:

```
 · Klick aufs Datum blockiert den ganzen Tag · rot schraffiert = blockiert
```

- [ ] **Step 10: CSS ergänzen** — `src/app/globals.css`, direkt nach dem `.pl-busy { … }`-Block:

```css
/* Manuelle Planer-Blocker (volle Spaltenbreite, rot schraffiert) */
.pl-blocked {
  position: absolute;
  left: 2px;
  right: 2px;
  z-index: 3;
  border-radius: 7px;
  border: 1px solid var(--accent);
  background: repeating-linear-gradient(
    135deg,
    rgba(242, 54, 54, 0.16) 0 6px,
    rgba(242, 54, 54, 0.05) 6px 12px
  );
  color: var(--ink-2);
  font-size: 10.5px;
  font-weight: 700;
  padding: 3px 7px;
  overflow: hidden;
  user-select: none;
  -webkit-user-select: none;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 4px;
}
.pl-blocked-x {
  flex: none;
  border: none;
  background: none;
  cursor: pointer;
  color: var(--ink-3);
  font-size: 14px;
  line-height: 1;
  padding: 0 2px;
}
.pl-blocked-x:hover {
  color: var(--accent);
}
```

- [ ] **Step 11: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 12: Commit**

```bash
git add src/components/admin/planner-calendar.tsx src/app/globals.css
git commit -m "feat(planer): Blocker im Wochenraster anlegen, anzeigen und löschen"
```

---

## Task 8: Gesamt-Verifikation

**Files:** keine

- [ ] **Step 1: Unit-Tests** — Run: `npm run test` → Expected: PASS inkl. `time-blocks/logic.test.ts`, keine Regression.
- [ ] **Step 2: Lint** — Run: `npm run lint` → Expected: keine NEUEN Fehler in den geänderten/neuen Dateien (vorbestehende `set-state-in-effect`-Fehler in `booking-flow.tsx` ignorieren).
- [ ] **Step 3: Build** — Run: `npm run build` → Expected: erfolgreich, TypeScript ohne Fehler.
- [ ] **Step 4: Manueller Smoke-Test gegen Beta** (nach `git push origin beta` → Auto-Deploy):
  1. Planer öffnen → freien Bereich aufziehen → „Zeit blockieren" → grauer Balken erscheint.
  2. Auf ein Datum (Tages-Kopf) klicken → „Tag blockieren" → ganztägiger Balken.
  3. `/book` öffnen → Termin-Angebot wählen → der ganztägig blockierte Tag ist grau/geschlossen; im teilblockierten Tag fehlen die gesperrten Uhrzeiten.
  4. Im Planer den Blocker per × entfernen → Slot ist in `/book` wieder buchbar.
  > Push nach `beta` und Merge `beta` → `main` (inkl. Schema-Push gegen Production) sind eigene, vom Nutzer freizugebende Schritte.

---

## Self-Review (durchgeführt)

- **Spec-Abdeckung:** Tabelle→T2; pure Logik→T1; Repository→T3; Validierung+Actions→T4; Slot-Integration (closed/busy)→T5; Planer-Daten→T6; Planer-UI (anlegen Raster + Tages-Kopf, anzeigen, löschen)→T7; Tests→T1/T8. Alle Spec-Abschnitte abgedeckt.
- **Abweichung von der Spec (bewusst):** Server-Actions sind plain-arg statt FormData — der Planer ruft sie imperativ auf (wie `movePlannerBooking`); konsistenter als das FormData-Muster aus der Spec-Skizze.
- **Platzhalter:** keine in Code-Schritten.
- **Typ-Konsistenz:** `summarizeDayBlocks(BlockTimes[]) → { closed; busy: BusyInterval[] }` (T1) wird in T5 genutzt; `BusyInterval` aus `@/availability/slots`; `TimeBlock` aus Schema (T2) in Repository (T3); `createTimeBlockAction(input)`/`deleteTimeBlockAction(id)` (T4) in T7 aufgerufen; `PlannerBlock` (T6) als `week.blocks[day]` in T7 gerendert; `CreateDraft`-Form für `blockChoice` (T7) wiederverwendet.

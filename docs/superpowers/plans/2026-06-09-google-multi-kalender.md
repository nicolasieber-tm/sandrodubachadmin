# Google Multi-Kalender: Auswahl & Schreib-Mapping — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (empfohlen) oder superpowers:executing-plans, um diesen Plan Task für Task umzusetzen. Steps nutzen Checkbox-Syntax (`- [ ]`).

**Goal:** Sandro kann im Admin selbst einstellen, welche Google-Kalender für „belegt" zählen und wohin Buchungen geschrieben werden (Hauptkalender oder pro Angebot), mit voll-automatischem Sync und sicheren Fallbacks.

**Architecture:** Aufbau auf der bestehenden Google-Schicht (`src/google/*`). Reine, testbare Helfer (`resolveTargetCalendar`, `mergeBusyIntervals`) trennen Logik von I/O. Einstellungen liegen in `calendar_connections` (neue Spalten), das Schreib-Mapping nutzt das bereits existierende `offers.calendarKey`. Buchungen merken sich `googleCalendarId`, damit Löschen/Verschieben den richtigen Kalender trifft.

**Tech Stack:** Next.js 16 (Server Actions, RSC), Drizzle ORM + `pg` (Schema via `db:push`), Google Calendar API v3 (fetch-basierter Client), Vitest 4. Geld in Rappen, Zeiten Europe/Zurich.

**Hintergrund (bereits vorhanden, NICHT neu bauen):**
- `offers.calendarKey` (Spalte + `offerSchema` + `setOfferCalendarAction` + UI `OfferCalendarMap`) existiert, hält aktuell aber Freitext/Demo-Strings und wird von der Sync-Logik ignoriert.
- `GoogleCalendarClient` kann `listEvents/insertEvent/updateEvent/deleteEvent` — **keine** Kalenderliste.
- `googleBusyIntervals`, `pushBookingToGoogle`, `removeBookingFromGoogle` nutzen alle nur `conn.row.googleCalendarId` (Primär).
- Sync-Trigger: `transition()` in `src/bookings/actions.ts` (bestaetigt→push, abgesagt→remove).

---

## Task 1: Schema erweitern (Settings + Buchungs-Kalender)

**Files:**
- Modify: `src/db/schema.ts`
- Befehl: `npm run db:push`

- [ ] **Step 1: Enum + Spalten ergänzen**

In `src/db/schema.ts` nach den bestehenden Enums ergänzen (Enum-Konstante mit `Enum`-Suffix, damit kein Namenskonflikt zur Spalten-Property entsteht — Muster wie `offerUnit`/`bookingStatus`, aber hiess sonst gleich wie die Spalte):
```ts
export const writeModeEnum = pgEnum('write_mode', ['main', 'per_offer']);
```

In `calendarConnections` (nach `subCalendars`) ergänzen:
```ts
  // Welche Kalender für die Belegung (busy) berücksichtigt werden.
  // Leer/Default beim Verbinden: [googleCalendarId].
  busyCalendarIds: jsonb('busy_calendar_ids').$type<string[]>().notNull().default([]),
  // Schreib-Modus: 'main' = immer Hauptkalender, 'per_offer' = offers.calendarKey.
  writeMode: writeModeEnum('write_mode').notNull().default('main'),
```

In `bookings` (nach `googleEventId`) ergänzen:
```ts
  // In welchem Google-Kalender das Event liegt (für korrektes Löschen/Verschieben).
  googleCalendarId: text('google_calendar_id'),
```

- [ ] **Step 2: Schema in die Live-DB pushen**

Run: `npm run db:push`
Erwartet: drizzle-kit meldet die drei neuen Spalten/Enum, Bestätigung „Changes applied". (Interaktiv: ggf. mit Enter bestätigen.)

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(schema): busyCalendarIds + writeMode an Connection, googleCalendarId an Booking"
```

---

## Task 2: Google-Client — `listCalendars()`

**Files:**
- Modify: `src/google/client.ts`
- Test: `src/google/client.test.ts` (neu)

- [ ] **Step 1: Failing test**

`src/google/client.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { GoogleCalendarClient } from './client';

afterEach(() => vi.restoreAllMocks());

describe('listCalendars', () => {
  it('liefert die CalendarList-Items des Kontos', async () => {
    const fakeList = {
      items: [
        { id: 'primary@x.ch', summary: 'Haupt', primary: true, accessRole: 'owner' },
        { id: 'studio@group.calendar.google.com', summary: 'Studio', accessRole: 'writer' },
        { id: 'feed@import', summary: 'Abo', accessRole: 'reader' },
      ],
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(fakeList), { status: 200 }),
    );
    const client = new GoogleCalendarClient();
    const res = await client.listCalendars('token-123');
    expect(res.items?.map((c) => c.id)).toEqual([
      'primary@x.ch',
      'studio@group.calendar.google.com',
      'feed@import',
    ]);
  });
});
```

- [ ] **Step 2: Run test → FAIL**

Run: `npx vitest run src/google/client.test.ts`
Erwartet: FAIL (`listCalendars is not a function`).

- [ ] **Step 3: Implementieren**

In `src/google/client.ts` Typen ergänzen (oben bei den Interfaces):
```ts
export interface GoogleCalendarListEntry {
  id: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string; // 'owner' | 'writer' | 'reader' | 'freeBusyReader'
  [key: string]: unknown;
}
export interface GoogleCalendarList {
  items?: GoogleCalendarListEntry[];
  [key: string]: unknown;
}
```

Methode in der Klasse (nach `listEvents`):
```ts
  /** Listet die Kalender des Kontos (CalendarList.list). */
  async listCalendars(accessToken: string): Promise<GoogleCalendarList> {
    const url = `${CALENDAR_API_BASE}/users/me/calendarList`;
    const res = await this.request(accessToken, url, { method: 'GET' });
    return (await res.json()) as GoogleCalendarList;
  }
```

- [ ] **Step 4: Run test → PASS**

Run: `npx vitest run src/google/client.test.ts`
Erwartet: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/google/client.ts src/google/client.test.ts
git commit -m "feat(google): GoogleCalendarClient.listCalendars()"
```

---

## Task 3: Reine Helfer — `resolveTargetCalendar` + `mergeBusyIntervals`

**Files:**
- Create: `src/google/calendar-logic.ts`
- Test: `src/google/calendar-logic.test.ts`

- [ ] **Step 1: Failing tests**

`src/google/calendar-logic.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { resolveTargetCalendar, mergeBusyIntervals } from './calendar-logic';

describe('resolveTargetCalendar', () => {
  const main = 'main@x.ch';
  it('main-Modus → immer Hauptkalender', () => {
    expect(resolveTargetCalendar('main', 'studio@g', main)).toBe(main);
    expect(resolveTargetCalendar('main', null, main)).toBe(main);
  });
  it('per_offer-Modus → Angebots-Kalender', () => {
    expect(resolveTargetCalendar('per_offer', 'studio@g', main)).toBe('studio@g');
  });
  it('per_offer ohne Angebots-Kalender → Fallback Hauptkalender', () => {
    expect(resolveTargetCalendar('per_offer', null, main)).toBe(main);
    expect(resolveTargetCalendar('per_offer', '', main)).toBe(main);
  });
});

describe('mergeBusyIntervals', () => {
  it('führt mehrere Listen zusammen', () => {
    const a = [{ start: '08:00', durationMinutes: 60 }];
    const b = [{ start: '10:00', durationMinutes: 30 }];
    expect(mergeBusyIntervals([a, b])).toEqual([
      { start: '08:00', durationMinutes: 60 },
      { start: '10:00', durationMinutes: 30 },
    ]);
  });
  it('leere und fehlende Listen sind unkritisch', () => {
    expect(mergeBusyIntervals([[], []])).toEqual([]);
    expect(mergeBusyIntervals([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → FAIL**

Run: `npx vitest run src/google/calendar-logic.test.ts`
Erwartet: FAIL (Modul/Funktionen fehlen).

- [ ] **Step 3: Implementieren**

`src/google/calendar-logic.ts`:
```ts
// Reine, testbare Kalender-Logik — kein DB/Netz, kein server-only.
import type { BusyInterval } from '@/availability/slots';

export type WriteModeValue = 'main' | 'per_offer';

/**
 * Bestimmt den Zielkalender für eine Buchung.
 * - 'main': immer der Hauptkalender.
 * - 'per_offer': der Kalender des Angebots; fehlt er (null/leer), Fallback Hauptkalender.
 */
export function resolveTargetCalendar(
  mode: WriteModeValue,
  offerCalendarKey: string | null | undefined,
  mainCalendarId: string,
): string {
  if (mode === 'per_offer' && offerCalendarKey && offerCalendarKey.trim() !== '') {
    return offerCalendarKey;
  }
  return mainCalendarId;
}

/** Führt mehrere Busy-Listen zu einer flachen Liste zusammen. */
export function mergeBusyIntervals(lists: BusyInterval[][]): BusyInterval[] {
  return lists.flat();
}
```

- [ ] **Step 4: Run → PASS**

Run: `npx vitest run src/google/calendar-logic.test.ts`
Erwartet: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/google/calendar-logic.ts src/google/calendar-logic.test.ts
git commit -m "feat(google): reine Helfer resolveTargetCalendar + mergeBusyIntervals"
```

---

## Task 4: Connection-Settings persistieren (busyCalendarIds, writeMode) + Default beim Verbinden

**Files:**
- Modify: `src/google/tokens.ts`
- Modify: `src/app/api/google/callback/route.ts`

- [ ] **Step 1: `tokens.ts` — Settings-Updater + Default**

`SaveGoogleConnectionInput` um zwei optionale Felder erweitern:
```ts
  /** Kalender, die für Belegung zählen. Default beim Erstanlegen: [googleCalendarId]. */
  busyCalendarIds?: string[];
```
Im UPSERT (beide Zweige) beim **Insert** setzen:
```ts
      busyCalendarIds: input.busyCalendarIds ?? [input.googleCalendarId],
```
Beim **Update** `busyCalendarIds` NICHT überschreiben (Einstellung bleibt erhalten) — also dort nicht setzen.

Neue Updater am Dateiende:
```ts
/** Setzt die für Belegung berücksichtigten Kalender (provider='google'). */
export async function setBusyCalendarIds(ids: string[]): Promise<void> {
  await db
    .update(calendarConnections)
    .set({ busyCalendarIds: ids })
    .where(eq(calendarConnections.provider, 'google'));
}

/** Setzt den Schreib-Modus (provider='google'). */
export async function setWriteMode(mode: 'main' | 'per_offer'): Promise<void> {
  await db
    .update(calendarConnections)
    .set({ writeMode: mode })
    .where(eq(calendarConnections.provider, 'google'));
}
```

- [ ] **Step 2: Callback setzt Default-Busy beim Erstverbinden**

In `src/app/api/google/callback/route.ts` im `saveGoogleConnection(...)`-Aufruf ergänzen:
```ts
      busyCalendarIds: [calendarId],
```
(Hinweis: Beim erneuten Verbinden bleibt eine bereits gesetzte Auswahl via UPSERT-Update erhalten; nur das Erstanlegen nutzt den Default.)

- [ ] **Step 3: Verifizieren (kein neuer Unit-Test nötig — DB-Updater)**

Run: `npx vitest run src/google` — bestehende Google-Tests bleiben grün.

- [ ] **Step 4: Commit**

```bash
git add src/google/tokens.ts src/app/api/google/callback/route.ts
git commit -m "feat(google): busyCalendarIds/writeMode persistieren + Default beim Verbinden"
```

---

## Task 5: Belegung über mehrere Kalender

**Files:**
- Modify: `src/google/sync.ts`

- [ ] **Step 1: `googleBusyIntervals` über alle busy-Kalender**

Import oben ergänzen:
```ts
import { mergeBusyIntervals } from './calendar-logic';
```

Funktionskörper von `googleBusyIntervals` ersetzen (Kalender-Auswahl + fehlertolerantes Mergen):
```ts
    if (!isGoogleConfigured()) return [];
    const conn = await getGoogleConnection();
    if (!conn) return [];
    const main = conn.row.googleCalendarId;
    const ids =
      conn.row.busyCalendarIds && conn.row.busyCalendarIds.length > 0
        ? conn.row.busyCalendarIds
        : main
          ? [main]
          : [];
    if (ids.length === 0) return [];

    const client = new GoogleCalendarClient();
    const accessToken = await client.getValidAccessToken(conn);
    const { timeMin, timeMax } = zurichDayRangeIso(dateStr);

    const lists = await Promise.all(
      ids.map(async (calId) => {
        try {
          const list = await client.listEvents(accessToken, calId, timeMin, timeMax);
          return eventsToBusyIntervals(list.items ?? [], dateStr);
        } catch (err) {
          console.warn('[google] busy-Abruf fehlgeschlagen für', calId, err);
          return [];
        }
      }),
    );
    return mergeBusyIntervals(lists);
```
(Der äussere `try/catch` mit `return []` bleibt unverändert bestehen.)

- [ ] **Step 2: Bestehende Tests grün**

Run: `npx vitest run src/google/sync.test.ts src/availability`
Erwartet: PASS (reine `eventsToBusyIntervals`-Tests unverändert gültig).

- [ ] **Step 3: Commit**

```bash
git add src/google/sync.ts
git commit -m "feat(google): Belegung über alle ausgewählten Kalender zusammenführen"
```

---

## Task 6: Schreiben in den Zielkalender + korrektes Löschen/Verschieben

**Files:**
- Modify: `src/bookings/repository.ts` (Event-ID + Kalender speichern/zurücksetzen)
- Modify: `src/google/sync.ts` (push/remove)

- [ ] **Step 1: Repository — Event-Sync-Felder setzen/zurücksetzen**

In `src/bookings/repository.ts` `setBookingGoogleEventId` ersetzen durch:
```ts
/** Hinterlegt Event-ID und Ziel-Kalender des Google-Events an der Buchung. */
export async function setBookingGoogleSync(
  id: string,
  eventId: string,
  calendarId: string,
): Promise<Booking | undefined> {
  const [row] = await db
    .update(bookings)
    .set({ googleEventId: eventId, googleCalendarId: calendarId })
    .where(eq(bookings.id, id))
    .returning();
  return row;
}

/** Setzt die Google-Sync-Felder zurück (nach Löschen des Events). */
export async function clearBookingGoogleSync(id: string): Promise<void> {
  await db
    .update(bookings)
    .set({ googleEventId: null, googleCalendarId: null })
    .where(eq(bookings.id, id));
}
```

- [ ] **Step 2: `sync.ts` — Push mit Zielkalender + Verschiebe-Logik**

Imports in `src/google/sync.ts` anpassen:
```ts
import { setBookingGoogleSync, clearBookingGoogleSync } from '@/bookings/repository';
import { getOffer } from '@/offers/repository';
import { resolveTargetCalendar } from './calendar-logic';
```

`pushBookingToGoogle` ersetzen (Zielkalender bestimmen; vorhandenes Event im falschen Kalender löschen; dann anlegen):
```ts
export async function pushBookingToGoogle(booking: Booking): Promise<void> {
  try {
    if (!isGoogleConfigured()) return;
    const conn = await getGoogleConnection();
    if (!conn) return;
    const main = conn.row.googleCalendarId;
    if (!main) return;

    const offer = booking.offerId ? await getOffer(booking.offerId) : undefined;
    const target = resolveTargetCalendar(conn.row.writeMode, offer?.calendarKey, main);

    const client = new GoogleCalendarClient();
    const accessToken = await client.getValidAccessToken(conn);
    const payload = buildEventPayload(booking, offer?.durationMinutes ?? 60);

    // Liegt bereits ein Event im FALSCHEN Kalender, dort löschen (Verschieben).
    if (
      booking.googleEventId &&
      booking.googleCalendarId &&
      booking.googleCalendarId !== target
    ) {
      try {
        await client.deleteEvent(accessToken, booking.googleCalendarId, booking.googleEventId);
      } catch (err) {
        console.warn('[google] altes Event konnte nicht entfernt werden:', err);
      }
    }

    // Event im richtigen Kalender aktualisieren ODER neu anlegen.
    if (booking.googleEventId && booking.googleCalendarId === target) {
      await client.updateEvent(accessToken, target, booking.googleEventId, payload);
      await setBookingGoogleSync(booking.id, booking.googleEventId, target);
    } else {
      const created = await client.insertEvent(accessToken, target, payload);
      if (created.id) {
        await setBookingGoogleSync(booking.id, created.id, target);
      }
    }
  } catch (err) {
    console.warn('[google] pushBookingToGoogle fehlgeschlagen:', err instanceof Error ? err.message : String(err));
    try {
      await logAudit({ action: 'google.push.fehler', entity: 'booking', entityId: booking.id, meta: { message: err instanceof Error ? err.message : String(err) } });
    } catch { /* Audit-Fehler verschlucken */ }
  }
}
```

`removeBookingFromGoogle` ersetzen (richtigen Kalender nutzen, Felder zurücksetzen):
```ts
export async function removeBookingFromGoogle(booking: Booking): Promise<void> {
  try {
    if (!booking.googleEventId) return;
    if (!isGoogleConfigured()) return;
    const conn = await getGoogleConnection();
    if (!conn) return;
    const calendarId = booking.googleCalendarId ?? conn.row.googleCalendarId;
    if (!calendarId) return;

    const client = new GoogleCalendarClient();
    const accessToken = await client.getValidAccessToken(conn);
    await client.deleteEvent(accessToken, calendarId, booking.googleEventId);
    await clearBookingGoogleSync(booking.id);
  } catch (err) {
    console.warn('[google] removeBookingFromGoogle fehlgeschlagen:', err instanceof Error ? err.message : String(err));
    try {
      await logAudit({ action: 'google.remove.fehler', entity: 'booking', entityId: booking.id, meta: { message: err instanceof Error ? err.message : String(err) } });
    } catch { /* Audit-Fehler verschlucken */ }
  }
}
```

- [ ] **Step 3: Alte Referenz prüfen**

Run: `grep -rn "setBookingGoogleEventId" src/` — Erwartet: **keine** Treffer mehr (sonst dort auf `setBookingGoogleSync` umstellen).

- [ ] **Step 4: Tests grün**

Run: `npx vitest run src/google src/bookings`
Erwartet: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/google/sync.ts src/bookings/repository.ts
git commit -m "feat(google): Buchungen in Zielkalender schreiben, korrekt löschen/verschieben"
```

---

## Task 7: Server-Actions (Kalenderliste laden + Settings speichern)

**Files:**
- Modify: `src/google/actions.ts`
- Create: `src/google/calendars-service.ts` (Server-Helper für die Kalenderliste)

- [ ] **Step 1: Service — echte Kalenderliste holen**

`src/google/calendars-service.ts`:
```ts
import 'server-only';
import { isGoogleConfigured } from './config';
import { getGoogleConnection } from './tokens';
import { GoogleCalendarClient, type GoogleCalendarListEntry } from './client';

export interface CalendarOption {
  id: string;
  summary: string;
  primary: boolean;
  writable: boolean; // accessRole owner|writer
}

/** Lädt die Kalender des verbundenen Kontos. Bei Fehler/keine Verbindung: []. */
export async function getGoogleCalendars(): Promise<CalendarOption[]> {
  try {
    if (!isGoogleConfigured()) return [];
    const conn = await getGoogleConnection();
    if (!conn) return [];
    const client = new GoogleCalendarClient();
    const accessToken = await client.getValidAccessToken(conn);
    const list = await client.listCalendars(accessToken);
    return (list.items ?? []).map((c: GoogleCalendarListEntry) => ({
      id: c.id,
      summary: c.summary ?? c.id,
      primary: Boolean(c.primary),
      writable: c.accessRole === 'owner' || c.accessRole === 'writer',
    }));
  } catch (err) {
    console.warn('[google] getGoogleCalendars fehlgeschlagen:', err);
    return [];
  }
}
```

- [ ] **Step 2: Actions — Settings speichern**

In `src/google/actions.ts` ergänzen (Muster wie `disconnectGoogleAction`, mit `getCurrentUser`-Guard):
```ts
import { setBusyCalendarIds, setWriteMode } from '@/google/tokens';

export async function updateBusyCalendarsAction(ids: string[]): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Nicht angemeldet.' };
  await setBusyCalendarIds(ids);
  await logAudit({ actor: user.id, action: 'google.busy.update', meta: { count: ids.length } });
  revalidatePath('/admin/kalender');
  return { ok: true };
}

export async function updateWriteModeAction(mode: 'main' | 'per_offer'): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: 'Nicht angemeldet.' };
  await setWriteMode(mode);
  await logAudit({ actor: user.id, action: 'google.writemode.update', meta: { mode } });
  revalidatePath('/admin/kalender');
  return { ok: true };
}
```

- [ ] **Step 3: Build/Typecheck**

Run: `npx tsc --noEmit`
Erwartet: keine Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/google/actions.ts src/google/calendars-service.ts
git commit -m "feat(google): Kalenderliste-Service + Actions für Belegungs-Auswahl & Schreib-Modus"
```

---

## Task 8: UI — Belegungs-Auswahl + Schreib-Modus-Schalter

**Files:**
- Create: `src/components/admin/google-calendar-settings.tsx`
- Modify: `src/app/admin/kalender/page.tsx`

- [ ] **Step 1: Client-Komponente**

`src/components/admin/google-calendar-settings.tsx` — zeigt (nur wenn verbunden) zwei Blöcke: Checkbox-Liste „Belegung berücksichtigen aus" und Radio/Segment „Buchungen schreiben in". Nutzt `useTransition` + `useToast` (Muster wie `OfferCalendarMap`). Props:
```ts
interface Props {
  calendars: { id: string; summary: string; primary: boolean; writable: boolean }[];
  busyCalendarIds: string[];
  writeMode: 'main' | 'per_offer';
}
```
Verhalten:
- Checkbox-Toggle ruft `updateBusyCalendarsAction(newIds)`; bei Primär-Kalender Badge „Hauptkalender", bei `!writable` Badge „nur Lesen".
- Segment-Wechsel ruft `updateWriteModeAction(mode)`; Hinweistext: bei `per_offer` „Lege den Kalender pro Angebot unten fest."
- Leere `calendars` → Hinweis „Keine Kalender geladen (Google nicht verbunden oder Abruf fehlgeschlagen)."

Beispiel-Kern (gekürzt, vollständige Card-Struktur wie `OfferCalendarMap` übernehmen):
```tsx
'use client';
import { useTransition } from 'react';
import { useToast } from '@/components/ui/toast';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { updateBusyCalendarsAction, updateWriteModeAction } from '@/google/actions';

export function GoogleCalendarSettings({ calendars, busyCalendarIds, writeMode }: Props) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  function toggleBusy(id: string, on: boolean) {
    const next = on ? [...busyCalendarIds, id] : busyCalendarIds.filter((x) => x !== id);
    startTransition(async () => { await updateBusyCalendarsAction(next); toast('Belegungs-Auswahl gespeichert.'); });
  }
  function setMode(mode: 'main' | 'per_offer') {
    startTransition(async () => { await updateWriteModeAction(mode); toast('Schreib-Modus gespeichert.'); });
  }
  // ... Card mit Checkbox-Liste (calendars.map) + Segment (main/per_offer) ...
}
```

- [ ] **Step 2: Seite verdrahten**

In `src/app/admin/kalender/page.tsx`:
- Import: `import { getGoogleCalendars } from '@/google/calendars-service'; import { GoogleCalendarSettings } from '@/components/admin/google-calendar-settings';`
- Nach `const googleConn = await getGoogleConnection();` laden:
```ts
  const googleCalendars = googleConn ? await getGoogleCalendars() : [];
```
- Im JSX nach `<CalendarConnections .../>` einfügen (nur wenn verbunden):
```tsx
      {googleConn && (
        <GoogleCalendarSettings
          calendars={googleCalendars}
          busyCalendarIds={googleConn.row.busyCalendarIds ?? []}
          writeMode={googleConn.row.writeMode}
        />
      )}
```

- [ ] **Step 3: Visuell prüfen (dev)**

Run: `rm -rf .next && npm run dev` (separates Terminal), dann `/admin/kalender` im Browser: Belegungs-Liste + Schreib-Schalter erscheinen, Toggles speichern (Toast).

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/google-calendar-settings.tsx src/app/admin/kalender/page.tsx
git commit -m "feat(admin): UI für Belegungs-Kalender-Auswahl und Schreib-Modus"
```

---

## Task 9: `OfferCalendarMap` auf echte Kalender umstellen + Kontext klären

**Files:**
- Modify: `src/components/admin/offer-calendar-map.tsx`
- Modify: `src/app/admin/kalender/page.tsx`

- [ ] **Step 1: Komponente — echte Kalender (id→summary), nur Schreib-Ziele**

In `offer-calendar-map.tsx`:
- Props ändern: `calendars: { id: string; summary: string; writable: boolean }[]` statt `calendarKeys: string[]`; neues Prop `writeMode: 'main' | 'per_offer'`.
- `<option>`-Liste: `value={c.id}`, Label `{c.summary}`; nur `writable` Kalender anbieten.
- Wenn `writeMode === 'main'`: ganze Card mit gedämpftem Hinweis rendern „Aktiv im Modus ‚Pro Angegot'. Aktuell schreiben alle Buchungen in den Hauptkalender." und Selects `disabled`.
- Überschrift/Text korrigieren: „Angebot → Zielkalender (zum **Schreiben**)" statt „belegt".

- [ ] **Step 2: Seite — Kalenderliste statt `availableCalendarKeys` übergeben**

In `src/app/admin/kalender/page.tsx`:
- `availableCalendarKeys`-Import/Aufruf entfernen (oder belassen, falls anderweitig genutzt — vorher mit `grep -rn "availableCalendarKeys" src/` prüfen; nur hier genutzt → entfernen).
- `OfferCalendarMap` so aufrufen:
```tsx
      <OfferCalendarMap
        offers={offers}
        calendars={googleCalendars.filter((c) => c.writable)}
        writeMode={googleConn?.row.writeMode ?? 'main'}
      />
```

- [ ] **Step 3: Typecheck + visuell**

Run: `npx tsc --noEmit` → keine Fehler. Im Browser: bei Modus „Pro Angebot" echte Kalender im Dropdown; bei „Hauptkalender" deaktiviert mit Hinweis.

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/offer-calendar-map.tsx src/app/admin/kalender/page.tsx
git commit -m "feat(admin): Angebot→Zielkalender nutzt echte Google-Kalender (nur bei per_offer aktiv)"
```

---

## Task 10: Gesamt-Verifikation, manueller Smoke-Test, Merge-Vorbereitung

**Files:** keine (Verifikation)

- [ ] **Step 1: Volle Testsuite**

Run: `npm run test`
Erwartet: alle Tests grün (bei DB-Flake einmal warm wiederholen).

- [ ] **Step 2: Lint + Typecheck**

Run: `npm run lint && npx tsc --noEmit`
Erwartet: sauber.

- [ ] **Step 3: Manueller Smoke (dev gegen Live-DB)**

`rm -rf .next && npm run dev`, im Admin → Kalender:
1. Belegung: Hauptkalender + weiteren Kalender anhaken → in Google im 2. Kalender einen Termin (mit Uhrzeit) anlegen → `/book` zeigt den Slot als belegt.
2. Schreib-Modus „Pro Angebot": einem Angebot einen 2. Kalender zuweisen → Buchung anlegen + bestätigen → Event landet im richtigen Kalender; absagen → Event verschwindet.
3. Schreib-Modus „Hauptkalender": Bestätigen → Event im Hauptkalender.

- [ ] **Step 4: Branch abschliessen**

Bestehende Commits sind je Task erfolgt. Stand zusammenfassen:
```bash
git log --oneline main..HEAD
```
Dann gemäss `superpowers:finishing-a-development-branch` Merge nach `main` + Deploy (`railway up --service sandro-dubach-app --ci`) anbieten.

---

## Hinweise für Ausführende

- **Reihenfolge einhalten:** Task 1 (Schema) und Task 3 (reine Helfer) sind Grundlage für 4–9.
- **DB:** Es gibt nur EINE `provider='google'`-Zeile (UPSERT-Konvention).
- **Fehlertoleranz ist Pflicht:** Alle Google-Service-Funktionen werfen nie; bei Fehler Log + No-op/`[]`.
- **Build-Falle:** `npm run build`/`tsc` kann das laufende `next dev` stören — danach `rm -rf .next` + dev neu starten.
- **Geheimnisse:** keine Tokens/Secrets loggen oder ausgeben.

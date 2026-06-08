# Stufe 3 — Kalender (intern) · Plan

> ERFORDERLICHE SUB-SKILL: superpowers:subagent-driven-development.

**Ziel:** Verfügbarkeit/Öffnungszeiten pflegen, Buchungen intern als Kalender sehen, freie Slots automatisch berechnen (Öffnungszeiten minus bestehende Termine), Angebote Unterkalendern zuordnen. Google-2-Way-Sync bleibt Stufe 4.

**Abgrenzung:** Echte OAuth-Verbindungen = Stufe 4 (hier Verbindungs-UI als Platzhalter). Geld in Rappen, CH-Rechtschreibung. Wochentag-Konvention: **0 = Montag … 6 = Sonntag** (Anzeige- und Speicherreihenfolge identisch; JS-`getDay()` wird via `(getDay()+6)%7` gemappt).

---

## Phase 3a — Öffnungszeiten / Verfügbarkeit
**Dateien:** `src/db/schema.ts` (+ `availability`), `src/availability/repository.ts`, `src/availability/input.ts` (Zod), `src/availability/actions.ts`, `src/scripts/seed-demo.ts` (7 Wochentag-Zeilen idempotent), `src/app/admin/kalender/page.tsx` (RSC), `src/components/admin/availability-editor.tsx` (Client), `globals.css` (`.avail-row`,`.avail-times` aus 04-refined portieren).
- Schema `availability` (id uuid PK, weekday int 0–6 unique, enabled bool default true, startTime text 'HH:MM' default '09:00', endTime text 'HH:MM' default '18:00'). `db:push`.
- Seed: 7 Zeilen — Mo–Fr aktiv 09:00–18:00, Sa 10:00–14:00, So aus. Idempotent (nur wenn Tabelle leer).
- Repo: `getAvailability()` (7 Zeilen, `orderBy weekday`), `updateAvailability(rows)`.
- Editor: pro Wochentag Zeile mit Aktiv-Switch + Start/Ende-Zeitfeldern; „Speichern" → Action → revalidate. Geschlossen-Zustand sichtbar.
- Verifikation: tsc/eslint/vitest/build grün; `/admin/kalender` rendert; Speichern persistiert.

## Phase 3b — Verbindungen (Platzhalter) + Angebot→Kalender
**Dateien:** `src/db/schema.ts` (+ `calendar_connections`), `src/calendars/repository.ts`, UI auf `/admin/kalender` (Verbundene-Kalender-Liste + „Kalender hinzufügen" als Platzhalter-Dialog; Angebot→Kalender-Zuordnung über `offers.calendarKey`). CSS `.conn`,`.map-row` portieren.
- Schema `calendar_connections` (id, provider enum google|apple|outlook, accountLabel text, status text, subCalendars jsonb, createdAt). `db:push`.
- Mapping-UI: Liste der Angebote mit Select (Kalender-Schlüssel) → `updateOffer(id,{calendarKey})`.
- Hinweis-Box „Beispiel: Studio-Kalender …". Echte OAuth-Verbindung kommt Stufe 4 (Buttons als Platzhalter mit Toast).

## Phase 3c — Slot-Logik + interne Ansicht + /book-Slots
**Dateien:** `src/availability/slots.ts` + `slots.test.ts` (rein, TDD), `src/offers/schema.ts` (+ `durationMinutes` integer auf `offers`, db:push; Migration der bestehenden 3 Angebote), interne Kalenderansicht-Komponente, `/book`-Slot-Picker, `previewSlots`-Action.
- `computeFreeSlots({ availabilityForWeekday, bookingsOnDate, slotMinutes, stepMinutes })` → Liste freier 'HH:MM'-Slots; belegte Zeiten (bestätigte/neue Buchungen am Tag) werden ausgespart. Grenzfälle testen (kein Öffnungstag → [], Überlappung, Tagesrand).
- `offers.durationMinutes` (Default aus durationLabel ableiten/30er-Schritte) für Slot-Länge.
- Interne Ansicht: Wochen-/Monatsraster der Buchungen auf `/admin/kalender`.
- `/book`: Datumswahl → echte freie Slots statt freiem Zeitfeld (Server-Action `previewSlots(offerId, date)`).
- Verifikation: tsc/eslint/vitest (Slot-Grenzwerte)/build grün; /book zeigt echte Slots.

---

## Selbst-Review
Öffnungszeiten ✓ (3a) · Verbindungen-Platzhalter + Mapping ✓ (3b) · Slot-Berechnung mit TDD ✓ (3c) · interne Kalenderansicht ✓ (3c) · echte Slots im Buchungs-Flow ✓ (3c). OAuth/Sync = Stufe 4.

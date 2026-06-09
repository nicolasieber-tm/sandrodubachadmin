# Google Multi-Kalender: Auswahl & Mapping — Design

**Datum:** 2026-06-09
**Status:** Genehmigt (Design), bereit für Implementierungsplan

## Ziel

Sandro soll flexibel und selbst einstellbar steuern können:

1. **Welche** seiner Google-Kalender für die **Verfügbarkeit** ("belegt") berücksichtigt werden.
2. **Wohin** neue Buchungen geschrieben werden — alles in den Hauptkalender **oder** pro Angebot ein eigener Zielkalender.

Leitprinzip: maximale Flexibilität, aber es funktioniert **immer** (sinnvolle Fallbacks, kein Datenverlust, kein erzwungenes Neu-Verbinden).

## Nicht-Ziele (YAGNI)

- Kein Bulk-Re-Sync aller bestehenden Buchungen beim Umschalten der globalen Einstellung. Die Schreib-Einstellung wirkt auf neue Bestätigungen; bestehende Google-Einträge werden beim **nächsten Statuswechsel** der jeweiligen Buchung nachgezogen.
- Keine Mehrfach-Konten (es bleibt eine Google-Verbindung).
- Keine eigene Kalender-Erstellung in Google aus der App heraus.

## Einstellungen (UX) — Admin → Kalender

### ① Verfügbarkeit aus diesen Kalendern
- Liste **aller** Kalender des verbundenen Kontos (Name + Badge "Hauptkalender" / "nur Lesen"), je mit Häkchen "für Belegung berücksichtigen".
- **Standard:** nur der Hauptkalender angehakt.
- "Über alle Kalender" = alle anhaken; "nur Hauptkalender" = nur den einen. (Deckt den Wunsch ohne separaten Schalter ab.)
- Auch Nur-Lese-Kalender dürfen für Belegung angehakt werden.

### ② Buchungen schreiben in
- Umschalter mit zwei Modi:
  - **`main` — "Immer Hauptkalender"** (Standard): alle Buchungen landen im Hauptkalender.
  - **`per_offer` — "Pro Angebot festlegen"**: jedes Angebot bekommt im Angebots-Formular ein Kalender-**Dropdown**. Wo nichts gewählt ist → automatisch Hauptkalender (kein verlorener Eintrag).
- Das Dropdown zeigt nur Kalender, auf die Sandro **Schreibrechte** hat (accessRole `owner`/`writer`).

## Datenmodell

**`calendar_connections`** (erweitern):
- `busyCalendarIds jsonb` (string[]) — Kalender-IDs, die für Belegung zählen. Default beim Verbinden: `[googleCalendarId]`.
- `writeMode text` — `'main'` (Default) | `'per_offer'`.

**`offers`** (bereits vorhanden):
- `calendarKey text` (nullable) — hält künftig eine echte **Kalender-ID** (statt Freitext). Im Formular ein Dropdown. Nur relevant bei `writeMode='per_offer'`; leer → Fallback Hauptkalender.

**`bookings`** (erweitern):
- `googleCalendarId text` (nullable) — in **welchem** Kalender der erstellte Eintrag liegt. Zusammen mit `googleEventId` nötig, damit Absage/Verschiebung den richtigen Kalender treffen.

## Komponenten & Logik

### Google-Client — neue Methode
- `listCalendars()` → `GET /users/me/calendarList` → `{ items: [{ id, summary, primary, accessRole }] }`. Analog zu `listEvents`.

### Server-Action(s)
- `getGoogleCalendars()` — lädt die Kalenderliste (für die UI). Bei Fehler/keine Verbindung → leeres Resultat (UI zeigt Hinweis).
- `updateBusyCalendars(ids)` — speichert die Belegungs-Auswahl.
- `updateWriteMode(mode)` — speichert den Schreib-Modus.
- Angebots-`calendarKey` wird über die bestehende Offer-Action gepflegt (Dropdown statt Freitext).

### Lesen — `googleBusyIntervals(dateStr)`
- Statt nur `conn.row.googleCalendarId`: über **alle** `busyCalendarIds` iterieren (Default `[googleCalendarId]`), je `listEvents` im Zürcher Tagesbereich, alle Busy-Intervalle zusammenführen.
- Jeder einzelne Kalender-Abruf ist fehlertolerant: schlägt einer fehl, zählen die übrigen weiter; Gesamt-Fehler → `[]` (Slot-Logik läuft ohne Google).

### Schreiben — Zielkalender bestimmen
- Helfer `resolveTargetCalendar(booking, offer, conn)`:
  - `writeMode='main'` → `conn.googleCalendarId` (Hauptkalender).
  - `writeMode='per_offer'` → `offer.calendarKey ?? conn.googleCalendarId`.
- `pushBookingToGoogle`: Event im Zielkalender anlegen, `bookings.googleEventId` **und** `bookings.googleCalendarId` speichern.

## Sync-Verhalten (voll automatisch)

- **Bestätigen** → Eintrag im Zielkalender anlegen (Event-ID + Kalender-ID merken).
- **Absagen** → Eintrag via gespeicherter (`googleCalendarId`, `googleEventId`) löschen; Felder zurücksetzen.
- **Zielkalender abweichend** (z. B. Angebot neu zugeordnet / Modus geändert): beim nächsten Push der Buchung prüfen — liegt bereits ein Event im **falschen** Kalender, wird es dort **gelöscht** und im **richtigen** neu angelegt.
- Alle Google-Operationen bleiben **best-effort** (try/catch, Logging) — ein Google-Fehler darf die Buchungsverwaltung nie blockieren (bestehendes Muster).

## Robustheit / Fallbacks

- Beide Scopes (`calendar.readonly`, `calendar.events`) sind bereits erteilt → **kein** erneutes Verbinden.
- Kein Zielkalender wählbar/gewählt → Hauptkalender.
- Google nicht verbunden/Fehler → Belegung ohne Google, Schreiben übersprungen (No-op), App läuft normal.
- Schreib-Dropdown filtert auf beschreibbare Kalender; Belegungs-Auswahl erlaubt auch Nur-Lese.

## Tests

- **Rein/Unit:** `resolveTargetCalendar` (main vs. per_offer vs. Fallback); Merge mehrerer Busy-Listen (Überlappung/Sortierung); `listCalendars`-Mapping.
- **Integration (DB):** `busyCalendarIds`/`writeMode` speichern & lesen; `bookings.googleCalendarId` wird beim Push gesetzt.
- Bestehende TZ-Tests (`eventsToBusyIntervals`) bleiben gültig.

## Offene Grenzen v1

- Umschalten der globalen Einstellung verschiebt bestehende Einträge nicht sofort (erst beim nächsten Statuswechsel der Buchung) — bewusst, um keinen Bulk-Sync zu bauen.

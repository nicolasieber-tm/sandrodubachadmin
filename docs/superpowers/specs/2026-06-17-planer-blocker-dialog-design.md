# Planer-Blocker-Dialog (Benennen, Zeit anpassen, ganzer Tag)

**Datum:** 2026-06-17
**Status:** Design freigegeben

## Ausgangslage

Im Planer (`/admin/planer`) kann Sandro seit dem Planer-Blocker-Feature Zeiten
sperren. Aktuell läuft das in zwei Sofort-Aktionen ohne Eingabemöglichkeit:

- **Aufziehen** im Wochenraster → Auswahl-Dialog „Termin anlegen | Zeit
  blockieren". „Zeit blockieren" (`chooseBlockRange`) speichert den Blocker
  **sofort** mit `reason: null`.
- **Datum-Klick** (Tages-Kopf) → Bestätigung „Ganzen Tag blockieren?"
  (`confirmDayBlock`) speichert **sofort** ganztägig mit `reason: null`.

Die Datenbank kann bereits mehr, als das UI nutzt: Die Tabelle `time_blocks`
hat ein `reason`-Feld (nullbar, max. 200 Zeichen) und unterstützt ganztägige
Blocker über leere `start_time`/`end_time`. Die Server-Action
`createTimeBlockAction({ blockDate, startTime, endTime, reason })` validiert
schon alles Nötige (beide Zeiten gesetzt oder beide leer; `endTime` > `startTime`;
`reason` getrimmt, max. 200).

## Ziel

Ein **einheitlicher Blocker-Dialog** ersetzt die beiden Sofort-Aktionen. Sandro
kann darin den Blocker **benennen**, die **Zeit genauer eintragen** und per
**Häkchen „Ganzer Tag"** sofort den ganzen Tag sperren.

Reine **Frontend-Erweiterung** — keine Änderung an Schema, Repository,
Input-Validierung oder Server-Action.

## Verhalten

### Zwei Einstiegspunkte, ein Dialog

- **Aufziehen** → Auswahl „Termin anlegen | Zeit blockieren" bleibt unverändert.
  Klick auf **„Zeit blockieren"** öffnet den Blocker-Dialog, vorbefüllt mit der
  gezogenen Von–Bis-Zeit, Häkchen „Ganzer Tag" **aus**.
- **Datum-Klick** (Tages-Kopf) öffnet **denselben** Dialog mit Häkchen „Ganzer
  Tag" **gesetzt** (Von/Bis dann ausgegraut). Ersetzt die bisherige
  „Ganzen Tag blockieren?"-Bestätigung.

### Dialog-Layout

```
┌─────────────────────────────────────┐
│  Zeit blockieren · Mi, 17. Jun    ×  │
├─────────────────────────────────────┤
│  [✓] Ganzer Tag blockieren           │
│                                      │
│  Von [09:00]      Bis [17:00]        │   ← ausgegraut, wenn „Ganzer Tag"
│                                      │
│  Name (optional)                     │
│  [ z. B. Ferien, Arzttermin ____ ]   │
├─────────────────────────────────────┤
│            [ Abbrechen ]  [ Sperren ]│
└─────────────────────────────────────┘
```

### Feld-Regeln

- **Ganzer Tag** (Checkbox):
  - **an** → Von/Bis sind deaktiviert (ausgegraut); gespeichert wird mit
    `startTime: null, endTime: null` (ganztägig).
  - **aus** → Von/Bis sind aktiv und Pflicht; gespeichert wird mit den
    eingetragenen `HH:MM`-Werten.
- **Von / Bis** (`type="time"`): bei aktivem Zeitfenster muss `Bis` nach `Von`
  liegen. Verstoß → Fehler-Toast (kein Speichern). Die Server-Action validiert
  dasselbe ein zweites Mal; das UI fängt es nur früher mit klarer Meldung ab.
- **Name** (`type="text"`, optional): wird getrimmt; leer → `reason: null`,
  sonst der Text (Server begrenzt auf 200 Zeichen). Kein eigenes UI-Limit nötig,
  aber `maxLength={200}` am Feld als sanfte Begrenzung.

### Speichern

„Sperren" ruft die bestehende `createTimeBlockAction` mit dem zusammengebauten
Input auf:

- Ganzer Tag: `{ blockDate, startTime: null, endTime: null, reason }`
- Zeitfenster: `{ blockDate, startTime: von, endTime: bis, reason }`

Bei Erfolg: Dialog schließen, Toast („Zeit blockiert." bzw. „Ganzer Tag
blockiert."), Woche neu laden (`loadWeek(offset)`). Bei Fehler: `res.error`
als Toast, Dialog bleibt offen.

### Balken-Anzeige

Ist ein **Name** gesetzt, zeigt der graue Blocker-Balken im Raster **den Namen**
statt der generischen „Blockiert HH:MM–HH:MM"-Zeile. Die Zeitspanne wandert in
den Tooltip (`title`). Ohne Name bleibt das bisherige Label
(„Blockiert 09:00–17:00" bzw. „Ganzer Tag blockiert").

## Umsetzung (Frontend)

Alle Änderungen in `src/components/admin/planner-calendar.tsx` plus etwas CSS in
`src/app/globals.css`.

- **Neuer State** `blockEditor: { date; von; bis; name; wholeDay } | null`
  (ersetzt die Sofort-Pfade). Die bestehenden `blockChoice` (Auswahl-Dialog
  nach Aufziehen) und `pendingDayBlock` werden auf das Öffnen des neuen Editors
  umgestellt:
  - `chooseBlockRange()` setzt nicht mehr direkt ab, sondern öffnet
    `blockEditor` aus `blockChoice` (von/bis aus der Auswahl, `wholeDay: false`,
    `name: ''`) und schließt `blockChoice`.
  - Der Datum-Klick öffnet `blockEditor` mit `wholeDay: true` (statt
    `pendingDayBlock` zu setzen). `pendingDayBlock` und der zugehörige
    Bestätigungs-Dialog `confirmDayBlock` entfallen.
- **Neuer Dialog** im JSX (Markup analog zum bestehenden Finalize-Dialog:
  `.overlay` / `.scrim` / `.modal` mit `.modal-h` / `.modal-b` / `.modal-f`,
  Felder über `.field` und `.field-2`).
- **Speicher-Handler** `submitBlock()`: validiert (wenn nicht wholeDay:
  `Bis` > `Von`), baut den Input, ruft `createTimeBlockAction`, behandelt
  Erfolg/Fehler wie oben.
- **Balken-Label**: in der Blocker-Schleife `blk.reason` als sichtbares Label
  bevorzugen, wenn vorhanden; sonst das bisherige `label`. `title` zeigt die
  Zeitspanne/„Ganzer Tag".
- **CSS**: deaktivierte Von/Bis-Felder im Dialog dezent ausgrauen (bestehende
  `:disabled`-Stile prüfen; ggf. kleine Ergänzung).

## Bewusst nicht im Scope (YAGNI)

- Kein Bearbeiten bestehender Blocker (weiterhin nur anlegen via Dialog und
  entfernen via ×).
- Keine wiederkehrenden Blocker (Wochentag-Regeln laufen weiter über
  `availability`).
- Keine Server-/DB-Änderung; `reason` und ganztägig existieren bereits.

## Tests

- Bestehende Tests zu `time-blocks` (Logik, Input-Schema) bleiben gültig und
  müssen grün bleiben.
- Manuelle Beta-Verifikation: (1) Aufziehen → „Zeit blockieren" → Name + Zeit →
  Balken zeigt Name; (2) Datum-Klick → Häkchen vorgesetzt → Sperren →
  ganztägiger Balken; (3) Häkchen umschalten graut Von/Bis korrekt; (4)
  ungültige Zeit (Bis ≤ Von) → Fehler-Toast; (5) in `/book` reduziert der
  Blocker die Verfügbarkeit wie zuvor.

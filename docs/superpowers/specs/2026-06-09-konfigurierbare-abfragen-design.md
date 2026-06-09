# Konfigurierbare Abfragen pro Angebot — Design

**Datum:** 2026-06-09
**Status:** Genehmigt (Design), bereit für Implementierungsplan

## Ziel

Der Admin soll **pro Angebot** selbst festlegen können, welche zusätzlichen Felder
beim Buchen abgefragt werden — und in welcher Form (Text, Zahl, Auswahl usw.). Heute
sind die abgefragten Felder fest verdrahtet (Name, E-Mail, Telefon, Nachricht,
Rabatt-Code).

Beispiel: Beim Angebot „Hochzeit" soll zusätzlich „Anzahl Gäste" (Zahl) und „Ort der
Trauung" (Text) abgefragt werden; beim Angebot „Porträt" nichts davon.

## Entscheidungen (mit dem Nutzer abgestimmt)

- **Feldtypen:** alle gängigen — `text` (einzeilig), `textarea` (langer Text),
  `number` (mit Min/Max), `select` (Dropdown mit Optionen), `checkbox` (Ja/Nein),
  `date` (Datum).
- **Pflicht/Optional:** pro Feld einstellbar. Pflichtfelder werden beim Buchen erzwungen.
- **Sichtbarkeit der Antworten:** im Admin-Termindetail **und** in der Benachrichtigungs-E-Mail an den Admin.
- **Architektur:** Ansatz A — JSONB-Spalten, keine neuen Tabellen (passt zur App-Grösse
  und zum bestehenden Muster `subCalendars`/`busyCalendarIds`).

## Nicht im Scope (YAGNI)

- Globale, wiederverwendbare Feld-Bibliothek über mehrere Angebote hinweg.
- Bedingte Logik (Feld X nur zeigen wenn Feld Y = …).
- Datei-Uploads als Feldtyp.
- Auswertungen/Statistiken über Antworten.
- Mehrfachauswahl (multi-select). `select` ist Einfachauswahl.

## Datenmodell

Zwei neue JSONB-Spalten (Drizzle-Schema in `src/db/schema.ts`):

### `offers.custom_fields` — die Definition der Felder

```ts
custom_fields: jsonb('custom_fields')
  .$type<CustomFieldDef[]>()
  .notNull()
  .default([])
```

```ts
type CustomFieldType = 'text' | 'textarea' | 'number' | 'select' | 'checkbox' | 'date';

type CustomFieldDef = {
  key: string;        // stabil, eindeutig pro Angebot, z.B. "field_1" — verknüpft Antwort ↔ Definition
  label: string;      // Anzeige-Beschriftung, z.B. "Anzahl Gäste"
  type: CustomFieldType;
  required: boolean;
  placeholder?: string; // optional, für text/textarea/number
  helpText?: string;    // optional, kurzer Hinweis unter dem Feld
  options?: string[];   // nur type === 'select' — die Auswahlmöglichkeiten
  min?: number;         // nur type === 'number'
  max?: number;         // nur type === 'number'
};
```

### `bookings.custom_fields` — die Antworten als Snapshot

```ts
custom_fields: jsonb('custom_fields')
  .$type<CustomFieldAnswer[]>()
  .notNull()
  .default([])
```

```ts
type CustomFieldAnswer = {
  key: string;
  label: string;          // Snapshot der Beschriftung zum Buchungszeitpunkt
  type: CustomFieldType;  // Snapshot des Typs (für korrekte Darstellung)
  value: string | number | boolean; // die Antwort des Kunden
};
```

**Begründung Snapshot:** Label und Typ werden mit der Buchung gespeichert (analog zu
`offerNameSnapshot`). So bleiben historische Buchungen korrekt lesbar, auch wenn der
Admin die Felddefinition des Angebots später umbenennt, umsortiert oder löscht.

### Migration

Neue Drizzle-Migration unter `migrations/`, generiert via `npm run db:generate`.
Beide Spalten `NOT NULL DEFAULT '[]'::jsonb`, damit bestehende Zeilen problemlos
migrieren.

## Komponenten

### 1. Gemeinsames Modul `src/offers/custom-fields.ts`

Einzige Quelle der Wahrheit für Typen und Validierung. Wird von Admin (Definition),
Buchungsstrecke (Rendering) und Server-Action (autoritative Prüfung) genutzt.

- `customFieldTypes` — Liste der Typen + deutsche Labels für das Admin-Dropdown.
- `customFieldDefSchema` (Zod) — validiert **eine** Felddefinition. Regeln:
  - `label` min. 1 Zeichen.
  - `key` nicht leer, eindeutig innerhalb des Angebots (Eindeutigkeit auf Listen-Ebene geprüft).
  - `type === 'select'` ⇒ `options` mit min. 1 nicht-leerem Eintrag.
  - `type === 'number'` ⇒ `min`/`max` optional, falls beide gesetzt: `min <= max`.
- `customFieldsDefSchema` — `z.array(customFieldDefSchema)` + Prüfung auf eindeutige `key`s.
- `buildAnswerSchema(fields: CustomFieldDef[])` — erzeugt zur Laufzeit ein Zod-Objekt-Schema
  über die Antworten. Pro Feld:
  - `required` ⇒ Wert muss vorhanden/nicht leer sein; sonst optional.
  - `number` ⇒ `z.coerce.number()`, plus `min`/`max` falls gesetzt.
  - `select` ⇒ `z.enum(options)` (bzw. optional erlaubt leer wenn nicht required).
  - `checkbox` ⇒ Boolean (aus "on"/"true"/vorhanden im FormData).
  - `date` ⇒ String im Format `YYYY-MM-DD`.
  - `text`/`textarea` ⇒ String (required ⇒ min. 1 Zeichen).
- `toAnswerSnapshots(fields, validatedValues)` — baut die `CustomFieldAnswer[]` für die
  Buchung (übernimmt `label`/`type` aus der Definition).

### 2. Admin — Angebot bearbeiten (`src/components/admin/offer-form-modal.tsx`)

Neue Sektion **„Zusätzliche Abfragen"** unter den bestehenden Feldern. Editor als
kontrollierte Liste im React-State:

- Pro Feld eine Zeile mit: **Label** (Text), **Typ** (Dropdown), **Pflicht** (Schalter),
  **Platzhalter/Hilfetext** (optional).
- Typ-abhängige Zusatzeingaben:
  - `number`: Min / Max.
  - `select`: Optionsliste (Optionen hinzufügen/entfernen).
- Aktionen: **Feld hinzufügen**, **entfernen**, **hoch/runter sortieren** (Pfeile).
- `key` wird beim Hinzufügen automatisch vergeben (`field_<laufende Nummer>`), stabil und
  für den Nutzer unsichtbar.
- Beim Speichern wird die Felderliste als JSON in ein verstecktes Formularfeld serialisiert
  und mit der bestehenden `createOfferAction`/`updateOfferAction` mitgeschickt.

### 3. Angebots-Validierung (`src/offers/offer-input.ts` + `src/offers/actions.ts`)

`offerSchema` um `customFields` erweitern: JSON-String aus dem FormData parsen und gegen
`customFieldsDefSchema` validieren. Repository (`src/offers/repository.ts`) schreibt die
Definition in die neue Spalte.

### 4. Buchungsstrecke (`src/components/book/booking-flow.tsx`)

Im Kontakt-Schritt nach den Standardfeldern (Name, E-Mail, Telefon, Nachricht):

- Über `selectedOffer.customFields` iterieren und je Typ den passenden Input rendern
  (`text`/`number`/`date` → `<input>`, `textarea` → `<textarea>`, `select` → `<select>`,
  `checkbox` → Checkbox).
- Pflichtfelder als solche kennzeichnen; `helpText`/`placeholder` anzeigen.
- Eingaben unter eindeutigen Namen ins FormData (`cf_<key>`), damit die Server-Action sie
  klar zuordnen kann.
- Styling im bestehenden `.bookx-`-Designsystem.

### 5. Buchung speichern (`src/bookings/public-actions.ts`)

In `submitBookingRequest`:

1. Angebot serverseitig laden (passiert bereits — Preis/Name werden nicht dem Client vertraut).
2. `cf_*`-Werte aus FormData einsammeln.
3. Gegen `buildAnswerSchema(offer.customFields)` validieren. Bei Fehler: dieselbe
   `PublicActionResult`-Fehlerstruktur wie bisher (Feldfehler zurück an die UI).
4. `toAnswerSnapshots(...)` → `CustomFieldAnswer[]`.
5. An `createBooking(...)` durchreichen → in `bookings.custom_fields` speichern.

Dieselbe Logik analog in der manuellen Admin-Buchung (`src/bookings/booking-input.ts` +
`src/bookings/actions.ts`), damit auch manuell erfasste Buchungen Zusatzfelder tragen können.
`createBooking` im Repository (`src/bookings/repository.ts`) bekommt den neuen Parameter.

### 6. Anzeige der Antworten

- **Admin-Termindetail** (`src/components/admin/booking-detail-modal.tsx`): neuer Block
  **„Weitere Angaben"**, der `booking.customFields` als Label/Wert-Liste rendert
  (Checkbox als „Ja"/„Nein", leere/fehlende Werte als „—"). Block nur zeigen, wenn Antworten
  vorhanden sind.
- **Admin-E-Mail** (`src/notify/index.ts`, `notifyAdminNewBooking`): Antworten als
  Label-Wert-Liste an den bestehenden Mailtext anhängen.

## Datenfluss

```
Admin definiert Felder ──► offers.custom_fields (Definition)
                                   │
Kunde bucht ──► booking-flow rendert Felder dynamisch
                                   │  FormData (cf_*)
                                   ▼
            public-actions: buildAnswerSchema(offer.customFields).parse(...)
                                   │  gültige Antworten
                                   ▼
                 createBooking ──► bookings.custom_fields (Snapshot)
                                   │
                  ┌────────────────┼─────────────────┐
                  ▼                                   ▼
        Admin-Termindetail                  notifyAdminNewBooking (E-Mail)
```

## Fehlerbehandlung

- **Admin-Definition ungültig** (z.B. `select` ohne Optionen, doppelte `key`s,
  `min > max`): `customFieldsDefSchema` lehnt ab, Fehlermeldung im Angebots-Formular.
- **Kundenantwort ungültig** (Pflichtfeld leer, Zahl ausserhalb Min/Max, unbekannte
  Dropdown-Option): serverseitige Ablehnung über `buildAnswerSchema`, Feldfehler zurück
  an die Buchungs-UI (bestehende Fehlerdarstellung wiederverwenden).
- **Angebot ohne Zusatzfelder:** leere Liste, kein zusätzliches Rendering, keine Validierung
  — voll abwärtskompatibel.
- **Felddefinition nach Buchung geändert:** alte Buchungen bleiben dank Snapshot lesbar.

## Tests

- **Unit** `src/offers/custom-fields.test.ts`:
  - `customFieldsDefSchema`: lehnt `select` ohne Optionen, doppelte `key`s, `min > max` ab.
  - `buildAnswerSchema`: Pflichtfeld leer → Fehler; Zahl ausserhalb Min/Max → Fehler;
    ungültige Dropdown-Option → Fehler; gültige Eingaben → ok.
  - `toAnswerSnapshots`: übernimmt Label/Typ korrekt.
- **Integration/Action** (im Stil bestehender Tests, z.B. `src/notify/index.test.ts`):
  Server-Action lehnt Buchung mit ungültigen Zusatzfeldern ab und akzeptiert gültige.

## Betroffene Dateien (Übersicht)

| Datei | Änderung |
|---|---|
| `src/db/schema.ts` | 2 JSONB-Spalten + Typen |
| `migrations/*` | neue Migration (generiert) |
| `src/offers/custom-fields.ts` | **neu** — Typen, Zod-Schemas, `buildAnswerSchema`, Snapshots |
| `src/offers/offer-input.ts` | `customFields` ins Angebots-Schema |
| `src/offers/actions.ts` | Definition aus FormData parsen/durchreichen |
| `src/offers/repository.ts` | Definition speichern/laden |
| `src/components/admin/offer-form-modal.tsx` | Editor „Zusätzliche Abfragen" |
| `src/components/book/booking-flow.tsx` | dynamische Felder im Kontakt-Schritt |
| `src/bookings/public-actions.ts` | Antworten validieren + speichern |
| `src/bookings/booking-input.ts` + `actions.ts` | manuelle Buchung analog |
| `src/bookings/repository.ts` | `createBooking` um `customFields` erweitern |
| `src/components/admin/booking-detail-modal.tsx` | Block „Weitere Angaben" |
| `src/notify/index.ts` | Antworten in Admin-Mail |
| `src/offers/custom-fields.test.ts` | **neu** — Unit-Tests |

# Konfigurierbare Standardfelder pro Angebot — Design

**Datum:** 2026-06-11
**Status:** Entwurf, wartet auf Nutzer-Review

## Ziel

Der Admin soll **pro Angebot** die fest eingebauten Standardfelder der Buchungsstrecke
anpassen können: ihre **Beschriftung/Texte** ändern und einzelne Felder **ein- oder
ausschalten**. Heute stehen diese Felder fest verdrahtet in `booking-flow.tsx`.

Betroffene Standardfelder im Kontakt-Schritt:

| Feld | Ein/Aus | Beschriftung | Platzhalter | Pflicht beim Buchen |
|---|---|---|---|---|
| **Name** | immer an | änderbar | – | Pflicht |
| **E-Mail** | immer an | änderbar | – | Pflicht |
| **Telefon** | an/aus | änderbar | – | Pflicht (wenn an) |
| **Ortsfrage** | an/aus | änderbar | änderbar | optional |
| **Nachricht** | an/aus | änderbar | änderbar | optional |
| **Rabatt-Code** | an/aus | änderbar | – | optional |

**Name + E-Mail bleiben immer sichtbar** (nur Text änderbar) — ohne sie weiss Sandro
nicht, wer gebucht hat und wie er die Person erreicht. Alle anderen Felder sind pro
Angebot ein-/ausschaltbar (vom Nutzer bestätigt).

## Entscheidungen (mit dem Nutzer abgestimmt)

- **Umfang:** Texte ändern **und** Felder ein-/ausschalten. Keine pro-Feld-Pflicht-
  Umschaltung (Pflicht-Logik bleibt fest: Name/E-Mail/Telefon Pflicht wenn sichtbar,
  Ort/Nachricht/Code optional).
- **Ebene:** **pro Angebot**, im Angebots-Bearbeiten-Fenster — passt zum bestehenden
  „Zusätzliche Abfragen"-Editor, der ebenfalls pro Angebot lebt.
- **Speicherung (sparse Overrides):** Es werden nur die **Abweichungen** vom Standard
  gespeichert. Was der Admin nicht anfasst, fällt auf die im Code definierten Standard-
  Texte zurück. Vorteil: volle Abwärtskompatibilität (leere Spalte = heutiges Verhalten)
  und Standard-Texte bleiben später im Code verbesserbar.

## Nicht im Scope (YAGNI)

- Pro-Feld-Umschaltung von Pflicht/Optional (bewusst draussen).
- Globale Einstellung über alle Angebote hinweg.
- Umsortieren der Standardfelder (feste Reihenfolge).
- Der **Anfahrts-/Wegkosten-Hinweis** — kommt bereits aus den Wegkosten-Regeln und ist
  dort anpassbar. Er erscheint unter der Ortsfrage; ist die Ortsfrage aus, entfällt der
  Hinweis (er bezieht sich auf den Ort).
- Das **Idee-Textfeld** im Anfrage-Modus (`bookingMode === 'anfrage'`) bleibt unverändert
  und Pflicht — es ist der Kern der Anfrage. Die `message`-Konfiguration wirkt nur auf das
  optionale „Nachricht hinzufügen"-Aufklappfeld im Termin-Modus.
- Das **manuelle Admin-Buchungsformular** (`new-booking-modal.tsx`) bleibt unverändert;
  die Konfiguration betrifft nur die kundenseitige Buchungsstrecke (iframe).

## Datenmodell

Eine neue JSONB-Spalte auf `offers` (analog zur bestehenden `customFields`-Spalte):

```ts
// src/db/schema.ts → offers
standardFields: jsonb('standard_fields')
  .$type<StandardFieldsConfig>()
  .notNull()
  .default({}),
```

```ts
// src/offers/standard-fields.ts
export type StandardFieldKey =
  | 'name' | 'email' | 'phone' | 'location' | 'message' | 'discount';

// Nur die Abweichungen vom Default werden gespeichert (sparse).
export type StandardFieldOverride = {
  visible?: boolean;     // bei 'name'/'email' ignoriert (immer true)
  label?: string;        // leer/fehlend → Default-Beschriftung
  placeholder?: string;  // nur 'location' und 'message'
};

export type StandardFieldsConfig = Partial<Record<StandardFieldKey, StandardFieldOverride>>;
```

### Schema-Sync

Schema-Änderung via `npm run db:push` (Projekt-Konvention — keine generierte Migration).
Default `'{}'::jsonb` ⇒ bestehende Zeilen migrieren problemlos und verhalten sich wie heute.

## Komponenten

### 1. Gemeinsames Modul `src/offers/standard-fields.ts` (neu)

Einzige Quelle der Wahrheit — genutzt von Admin-Editor, Buchungsstrecke und Server-Action
(kein `server-only`, exakt wie `custom-fields.ts`).

- `standardFieldDefaults` — pro Feld die Code-Defaults:

  | key | defaultLabel | defaultPlaceholder | hideable | required |
  |---|---|---|---|---|
  | name | „Name" | – | nein | ja |
  | email | „E-Mail" | – | nein | ja |
  | phone | „Telefon" | – | **ja** | ja (wenn sichtbar) |
  | location | „Wo soll das Shooting stattfinden? (Ort/Region, optional)" | „z. B. Bern, Thun, bei dir zu Hause …" | **ja** | nein |
  | message | „Nachricht hinzufügen" | „Wünsche, Anlass, Personenzahl …" | **ja** | nein |
  | discount | „Rabatt-Code?" | – | **ja** | nein |

  (Default-Texte 1:1 aus dem heutigen `booking-flow.tsx`.)

- `standardFieldOrder` — feste Reihenfolge der Felder für Editor und Rendering.
- `standardFieldsConfigSchema` (Zod) — validiert das Config-Objekt: nur bekannte Keys,
  `visible` boolean, `label`/`placeholder` Strings; trimmt und verwirft leere Strings
  (→ fällt auf Default zurück). Unbekannte Keys werden gestrippt/abgelehnt.
- `resolveStandardField(key, config)` → `ResolvedStandardField`
  `{ key, visible, label, placeholder, required }` mit angewandten Defaults. Regeln:
  - `name`/`email`: `visible` immer `true` (Override ignoriert).
  - `label`: Override falls nicht leer, sonst `defaultLabel`.
  - `placeholder`: Override falls nicht leer, sonst `defaultPlaceholder`.
  - `required`: fix aus `standardFieldDefaults` (nicht konfigurierbar).
- `resolveStandardFields(config)` → `Record<StandardFieldKey, ResolvedStandardField>`
  bzw. Helper `isVisible(key, config)` / `labelOf(key, config)` für bequemes Rendering.

### 2. Admin-Editor `src/components/admin/standard-fields-editor.tsx` (neu)

Spiegelt `custom-fields-editor.tsx`. Kontrollierte Liste im React-State, beim Speichern
als JSON in ein verstecktes Feld `name="standardFields"` serialisiert.

- Rendert die 6 Felder in fester Reihenfolge (`standardFieldOrder`).
- `name`/`email`: nur ein Beschriftungs-Textfeld (kein Schalter). Das Default-Label steht
  als `placeholder`-Attribut im Input, damit der Admin den Standard sieht.
- `phone`/`location`/`message`/`discount`: Ein/Aus-Schalter (`.switch`/`.slider`, wie im
  Bestand) + Beschriftungs-Textfeld; bei `location`/`message` zusätzlich ein Platzhalter-
  Textfeld. Default-Texte als `placeholder`-Attribut sichtbar.
- Leeres Textfeld ⇒ nichts speichern (Default greift). Schalter „an" ist Default; nur
  ausgeschaltete Felder bzw. geänderte Texte landen sparse im JSON.
- Verstecktes `<input type="hidden" name="standardFields" value={JSON.stringify(config)} />`.

### 3. Einbindung im Angebots-Formular `src/components/admin/offer-form-modal.tsx`

Neue Sektion **„Standard-Abfragen"** direkt **über** `<CustomFieldsEditor>` einfügen:

```tsx
<StandardFieldsEditor initial={offer?.standardFields ?? {}} />
<CustomFieldsEditor initial={offer?.customFields ?? []} />
```

### 4. Angebots-Validierung `src/offers/actions.ts` + `repository.ts`

Analog zu `parseCustomFieldsField`:

- `parseStandardFieldsField(formData)` — liest `standardFields`, `JSON.parse`, validiert
  gegen `standardFieldsConfigSchema`; gibt `StandardFieldsConfig` oder `null` (Fehler) zurück.
- In `createOfferAction`/`updateOfferAction` einsetzen und das Ergebnis an die Offer-Daten
  anhängen (wie `customFields`). Bei `null` → bestehende Fehlerstruktur.
- `repository.ts`: `NewOfferData` um `standardFields?: StandardFieldsConfig` erweitern.
  `createOffer`/`updateOffer` spreaden `data` bereits — keine weitere Änderung nötig.
- `offer-input.ts` bleibt unverändert (Standardfelder werden — wie `customFields` — separat
  aus dem FormData geparst, nicht über `offerSchema`).

### 5. Buchungsstrecke `src/components/book/booking-flow.tsx`

Im `ContactStep` die heute hartkodierten Felder über die aufgelöste Konfiguration steuern:

- Einmalig `const sf = resolveStandardFields(offer.standardFields)`.
- **Name / E-Mail:** Label aus `sf.name.label` / `sf.email.label`. Immer gerendert.
- **Telefon:** nur rendern wenn `sf.phone.visible`; Label aus `sf.phone.label`;
  `required` aus `sf.phone.required`.
- **Ortsfrage:** nur rendern wenn `sf.location.visible`; Label + Platzhalter aus Config.
  Der `travelRuleHint` bleibt unter dem Feld (entfällt mit ausgeschalteter Ortsfrage).
- **Nachricht (Aufklappfeld, nur Termin-Modus):** nur rendern wenn `sf.message.visible`;
  Toggle-Text = `sf.message.label`, Textarea-Platzhalter = `sf.message.placeholder`.
- **Rabatt-Code:** nur rendern wenn `sf.discount.visible` **und** kein `prefill`;
  Toggle-Text = `sf.discount.label`.

### 6. Server-Validierung `src/bookings/public-input.ts` + `public-actions.ts`

Telefon ist nicht mehr statisch Pflicht (kann ausgeschaltet sein) ⇒ Prüfung wandert
in die Action (wie schon bei `requestedDate`/`message`):

- `public-input.ts`: `customerPhone` von `z.string().min(6)` auf
  `z.string().optional().default('')` ändern. Name/E-Mail bleiben Pflicht.
- `public-actions.ts` `submitBookingRequest`: nach dem Laden des Angebots
  `const sf = resolveStandardFields(offer.standardFields)`. Wenn
  `sf.phone.visible && sf.phone.required && data.customerPhone.trim().length < 6`
  → `{ error: 'Bitte gib deine Telefonnummer an.' }`.
- Ort/Nachricht/Code bleiben optional (unverändert). `createBooking` unverändert —
  leere Werte sind erlaubt (`customerPhone` ist `NOT NULL DEFAULT ''`).

> Kein „Vertrauen auf den Client": Das Ausblenden im Frontend ist nur Kosmetik; die
> Pflicht-Entscheidung trifft die Action autoritativ aus `offer.standardFields`.

### 7. Anzeige der Antworten — **keine Änderung nötig**

Name, E-Mail, Telefon, Ort und Nachricht sind echte `bookings`-Spalten und werden im
Termindetail und in den Mails bereits angezeigt. Ausgeschaltete Felder kommen schlicht
leer an. Kein neuer Anzeige-Block (anders als beim `customFields`-Feature).

## Datenfluss

```
Admin konfiguriert Felder ──► offers.standard_fields (sparse Overrides)
                                     │
Kunde bucht ──► booking-flow: resolveStandardFields(offer.standardFields)
                                     │  rendert/versteckt Felder, setzt Labels
                                     │  FormData (customerName, customerPhone, …)
                                     ▼
        public-actions: resolveStandardFields(...) → autoritative Pflichtprüfung (Telefon)
                                     │
                       createBooking ──► bookings (bestehende Spalten)
```

## Fehlerbehandlung

- **Admin-Config ungültig** (kaputtes JSON, falsche Typen): `standardFieldsConfigSchema`
  lehnt ab → Fehlermeldung im Angebots-Formular (bestehende Struktur).
- **Telefon Pflicht, aber leer** (Feld an): Action lehnt mit deutscher Meldung ab.
- **Telefon aus, leer gesendet:** akzeptiert, `customerPhone = ''`.
- **Angebot ohne Config** (`{}`): alle Defaults, alles sichtbar — voll abwärtskompatibel.
- **Name/E-Mail Override `visible:false`:** wird in `resolveStandardField` ignoriert
  (bleibt sichtbar) — Sicherheitsnetz gegen unbuchbare Angebote.

## Tests

- **Unit** `src/offers/standard-fields.test.ts` (neu):
  - `resolveStandardFields({})` → alle Defaults, name/email/phone sichtbar, Default-Labels,
    phone `required: true`.
  - `visible:false` für phone/location/message/discount → `visible: false`.
  - `visible:false` für name/email → bleibt `visible: true`.
  - Label/Placeholder-Override greift; leerer String → Default.
  - `standardFieldsConfigSchema`: akzeptiert gültige Config, weist Müll ab/strippt unbekannte Keys.
- **Action** (im Stil bestehender Tests): Buchung mit sichtbarem Pflicht-Telefon und leerer
  Nummer wird abgelehnt; bei ausgeschaltetem Telefon akzeptiert.

## Betroffene Dateien (Übersicht)

| Datei | Änderung |
|---|---|
| `src/db/schema.ts` | JSONB-Spalte `standard_fields` + Typ-Import |
| `src/offers/standard-fields.ts` | **neu** — Typen, Defaults, Zod-Schema, `resolveStandardFields` |
| `src/components/admin/standard-fields-editor.tsx` | **neu** — Editor „Standard-Abfragen" |
| `src/components/admin/offer-form-modal.tsx` | Editor einbinden |
| `src/offers/actions.ts` | `parseStandardFieldsField` + durchreichen |
| `src/offers/repository.ts` | `NewOfferData` um `standardFields` erweitern |
| `src/components/book/booking-flow.tsx` | Felder dynamisch rendern/verstecken + Labels |
| `src/bookings/public-input.ts` | `customerPhone` optional |
| `src/bookings/public-actions.ts` | autoritative Telefon-Pflichtprüfung aus Config |
| `src/offers/standard-fields.test.ts` | **neu** — Unit-Tests |
| Schema-Sync | `npm run db:push` (Default `{}`) |

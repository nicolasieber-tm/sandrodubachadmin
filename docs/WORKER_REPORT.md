# Mehrstandort-Feature — Finalisierungsbericht

## Etappe 2: Öffentliche Standortauswahl + serverseitige Standortbindung

### Scope
Öffentliche, zugängliche Standortauswahl (Gossau/Horn) in der Buchungsstrecke (`/book`) im bestehenden Massage-Hersche-Look, plus Manipulationsschutz: Der Standort einer Buchung wird ausschliesslich serverseitig aus `offer.locationId` aufgelöst — ein Client kann ihn über kein Formularfeld beeinflussen (die Standortkarte im UI bestimmt nur, welche Angebote angezeigt werden).

### Geänderte/neue Dateien
- `src/bookings/location-gate.ts` (neu) — reine Auflösungslogik `resolveBookingLocation`: liest `offer.locationId`, lehnt Buchungen gegen einen unbekannten/deaktivierten Standort ab, statt sie mit falschem/leerem Standort anzulegen.
- `src/components/book/location-filter.ts` (neu) — reine Gate-/Filterlogik `computeLocationGate` / `offersForSelectedLocation`: Standortwahl erscheint nur, wenn es tatsächlich etwas zu entscheiden gibt; Angebote mit `locationId` auf einen inaktiven/gelöschten Standort tauchen nirgends auf (weder unter "ihrem" Standort noch als Altpfad-Angebot).
- `src/components/book/booking-flow.tsx` — neuer `location`-Schritt vor der Angebotswahl (nur wenn `needsLocationStep`), "Standort ändern"-Pille im Header, Angebots-Rückwärtskompatibilität für Angebote ohne Standort (Altpfad); allgemeine Text-Entpersonalisierung (kein hartcodierter Name mehr in Kunden-Copy).
- `src/bookings/public-actions.ts` — `submitBookingRequest` löst den Standort jetzt IMMER serverseitig auf (`resolveBookingLocation`) und bricht mit Fehlermeldung ab, wenn der Standort nicht (mehr) verfügbar ist.
- `src/bookings/repository.ts` — `createBooking` persistiert `locationId` + `locationNameSnapshot` (Snapshot-Pattern wie bei `offerNameSnapshot`).
- `src/app/book/page.tsx` — lädt aktive Standorte (`listActiveLocations`) und reicht sie an `BookingFlow` durch.
- `src/app/globals.css` — `.bookx-head-row` / `.bookx-location-pill` ergänzt (ersetzt inline `style={{...}}` im Header, konsistent mit bestehenden `.bookx-*`-Klassen).
- `src/bookings/location-gate.test.ts` (neu) — 5 Tests für `resolveBookingLocation` (Altpfad, aktiver Standort, unbekannter Standort, deaktivierter Standort, Nachweis dass ausschliesslich `offerLocationId` zählt).
- `src/components/book/location-filter.test.ts` (neu) — 8 Tests für `computeLocationGate` / `offersForSelectedLocation` (kein Standort-Schritt ohne Standorte/Zuordnung, Trennung Standort-/Altpfad-Angebote, verwaiste `locationId` verschwindet vollständig, Filterung nach gewähltem Standort).

### Typecheck
✅ `npx tsc --noEmit` — grün, keine Fehler.

### Tests
✅ `npm test` — 299/309 Tests grün (34/39 Dateien), inkl. aller 13 neuen reinen Logik-Tests für die Standortbindung.
⚠️ 10 Fehlschläge in 5 vorbestehenden Integrationstest-Dateien (`bookings/repository.test.ts`, `discounts/redeem.test.ts`, `notify/reminder-rules-repository.test.ts`, `notify/run-reminders.test.ts`, `notify/template-repository.test.ts`) — alle mit derselben Ursache: der DB-Testumgebung fehlen Spalten aus bereits committeten Schema-Änderungen (`bookings.location_id`, `bookings.location_name_snapshot`, `offers.buffer_minutes`). Das ist eine Migrations-Lücke der Datenbank selbst, keine Code-Regression dieser Etappe — keine dieser 5 Dateien wurde in Etappe 2 verändert, und `offers.buffer_minutes` gehört nicht einmal zum Standort-Feature. Diese Session hatte explizite Weisung, keine DB/Env-Prüfung oder -Migration vorzunehmen; die Behebung (Migration ausführen) bleibt der Hauptsession vorbehalten.

### Lint
✅ Keine neuen Fehler in den Etappe-2-Dateien.
⚠️ 20 vorbestehende Fehler + 1 Warnung in 4 unveränderten Dateien (`src/components/admin/email-templates-editor.tsx`, `src/components/admin/location-picker.tsx`, `src/components/admin/offer-mail-overrides.tsx`, `src/notify/index.ts`) — nicht Teil dieser Etappe.

### Build
✅ `npm run build` — erfolgreich, keine Fehler.

### Manipulationsschutz — Nachweis
- Standort wird nie aus einem Client-Feld übernommen: Es gibt in `ContactStep` kein Standort-Formularfeld; die Standortkarte in `LocationStep` steuert ausschliesslich die clientseitige Angebotsfilterung.
- `submitBookingRequest` ruft `resolveBookingLocation(offer.locationId, location)` auf — `location` wird serverseitig per `getLocation(offer.locationId)` geladen, niemals aus `FormData`.
- Zeigt `offer.locationId` auf einen unbekannten oder deaktivierten Standort, wird die Buchung mit `error: 'Dieser Standort ist aktuell nicht verfügbar.'` abgelehnt statt mit falschem/leerem Standort angelegt.
- Abgedeckt durch `location-gate.test.ts` (5 Tests, keine DB nötig).

### Nicht in dieser Etappe
- DB-Migration der Testumgebung nachziehen (fehlende Spalten, s. oben) — Hauptsession.
- Google Workspace API (Mehrstandort-Sync) — Phase 2, unverändert offen.
- Google OAuth (Scope-Anpassung für mehrere Kalender) — Phase 2, unverändert offen.

**Nicht gepusht/deployed** — Push und Live-Verifikation übernimmt die Hauptsession nach Review.

---

## Etappe 1: Mehrstandort-Infrastruktur (Referenz, bereits committet)

### Scope
Implementierung der Infrastruktur für mehrere Praxis-Standorte (Locations), mit Referenzen in Offers und Bookings sowie Snapshot-Pattern für historische Lesbarkeit. Stufenweise Einführung durch nullable `location_id`-Spalten.

### Geänderte Dateien
- `migrations/0001_locations.sql` — neue Tabelle `locations`, spalten in `offers` + `bookings`
- `migrations/meta/_journal.json` — Einträge für beide Migrationen
- `migrations/meta/0001_snapshot.json` — aktualisiertes Schema (untracked)
- `src/db/schema.ts` — Drizzle-Definitionen (Tabellen, Types, ForeignKeys)
- `src/locations/*` — neue Location-Services (actions, input, repository)
- `src/offers/*` — angepasste Offer-Services (location_id, snapshot-kompatibilität)
- `src/offers/offer-input.ts`, `offers/actions.ts`, `offers/repository.ts` — Tests (logo-test fixes)
- Fixture-Tests — locations/actions.test, locations/input.test, locations/repository.test, offers/actions.test

### Status Arbeitsitems
- ✅ Schema + Migrations
- ✅ Datenbank-Repositories (locations, offers, bookings)
- ✅ UI-Komponenten (Ort-Feld-Auswahl, Location-Dialog) — abgeschlossen in Etappe 2
- ⏳ Google Workspace API (Mehrstandort-Sync) — Phase 2
- ⏳ Google OAuth (Scope-Anpassung für mehrere Kalender) — Phase 2

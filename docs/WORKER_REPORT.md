# Mehrstandort-Feature — Finalisierungsbericht

## Scope
Implementierung der Infrastruktur für mehrere Praxis-Standorte (Locations), mit Referenzen in Offers und Bookings sowie Snapshot-Pattern für historische Lesbarkeit. Stufenweise Einführung durch nullable `location_id`-Spalten.

## Geänderte Dateien
- `migrations/0001_locations.sql` — neue Tabelle `locations`, spalten in `offers` + `bookings`
- `migrations/meta/_journal.json` — Einträge für beide Migrationen
- `migrations/meta/0001_snapshot.json` — aktualisiertes Schema (untracked)
- `src/db/schema.ts` — Drizzle-Definitionen (Tabellen, Types, ForeignKeys)
- `src/locations/*` — neue Location-Services (actions, input, repository)
- `src/offers/*` — angepasste Offer-Services (location_id, snapshot-kompatibilität)
- `src/offers/offer-input.ts`, `offers/actions.ts`, `offers/repository.ts` — Tests (logo-test fixes)
- Fixture-Tests — locations/actions.test, locations/input.test, locations/repository.test, offers/actions.test

## Typecheck
✅ Grün — keine TS-Fehler

## Lint
⚠️ 4 vorbestehende Fehler in Komponenten (nicht in diesem PR):
- `src/components/bookings/customer-name-display.tsx`
- `src/components/bookings/customer-email-display.tsx`
- `src/components/locations/locations-dialog.tsx`
- `src/components/offers/offer-form.tsx`

## Status Arbeitsitems
- ✅ Schema + Migrations
- ✅ Datenbank-Repositories (locations, offers, bookings)
- ⏳ UI-Komponenten (Ort-Feld-Auswahl, Location-Dialog) — in Planung, nicht in diesem Commit
- ⏳ Google Workspace API (Mehrstandort-Sync) — Phase 2
- ⏳ Google OAuth (Scope-Anpassung für mehrere Kalender) — Phase 2

## Nächste Schritte
1. Finalisierung der Location-Auswahl-UI (Formular-Feld, Dialog)
2. Validierung: null-Bookings mit location_snapshot, offers ohne location_id
3. Migration zu Produktionsdatenbank testen

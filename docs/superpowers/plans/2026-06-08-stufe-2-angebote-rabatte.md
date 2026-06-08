# Stufe 2 — Angebote & Rabatte · Plan

> ERFORDERLICHE SUB-SKILL: superpowers:subagent-driven-development.

**Ziel:** Sandro verwaltet Angebote/Preise selbst und vergibt Rabatte — öffentliche **Rabatt-Codes** (Prozent/Fix, zeitlich/nutzungslimitiert) und **persönliche Einmal-Links** (1× gültiger Sonderpreis-Link). Einlösung greift im öffentlichen `/book`-Flow und berechnet den effektiven Preis wettlauf-sicher.

**Abgrenzung:** Kalender/Verfügbarkeit = Stufe 3. Geldbeträge in Rappen. Schweizer Rechtschreibung.

---

## Phase 2a — Angebote-CRUD

**Dateien:** `src/offers/repository.ts` (+ create/update/delete/setActive), `src/offers/offer-input.ts` (Zod), `src/offers/actions.ts` (`'use server'`), `src/app/admin/angebote/page.tsx` (RSC), `src/components/admin/offer-card.tsx`, `src/components/admin/offer-form-modal.tsx` (Client), `src/components/admin/angebote-client.tsx` (Client-Wrapper für „Neu"/Edit-Modal), `globals.css` (Klassen `.offers/.offer/.switch/.slider/.toggle-wrap` aus `04-refined.html` portieren).

- Repo: `createOffer(data)`, `updateOffer(id, data)`, `deleteOffer(id)`, `setOfferActive(id, active)`.
- Zod `offerSchema`: name min 2, priceChf ≥ 0 (→ Rappen), unit enum, durationLabel, description, calendarKey optional, active bool.
- Actions: create/update/delete/toggle + `revalidatePath('/admin/angebote')` (+ `/book`, `/admin`). Audit.
- UI: Karten-Grid aller Angebote (aktiv + inaktiv), Aktiv-Switch (sofort-Toggle via Action), „Bearbeiten" → Modal, „Löschen" (mit Bestätigungsschritt im Modal), „+ Neues Angebot".
- Verifikation: tsc/eslint/vitest/build grün; `/admin/angebote` rendert; Toggle/Anlegen wirkt sich auf `/book` aus.

---

## Phase 2b — Rabatt-Datenmodell & -Logik

**Dateien:** `src/db/schema.ts` (+ `discounts`, `discount_redemptions`, `bookings.discountId`), `src/discounts/repository.ts`, `src/discounts/logic.ts` + `logic.test.ts` (rein, TDD), `src/discounts/redeem.ts` (transaktional), `src/lib/tokens.ts` (vorhanden — `generateToken` für Link-Token nutzen).

- Schema `discounts` (kind enum code|link, code unique null, token unique null, valueType enum percent|fixed, value int, offerId FK null, maxRedemptions int null, redemptionsUsed int default 0, validFrom/validUntil timestamptz null, label text null, active bool, createdAt). `discount_redemptions` (id, discountId FK, bookingId FK, redeemedAt, amountSavedRappen). `bookings.discountId` uuid null FK → discounts (onDelete set null). `db:push`.
- `logic.ts` (rein, TDD): `computeEffectivePrice(baseRappen, {valueType,value})` → nie < 0, percent 0–100, fixed in Rappen; `validateDiscount(d, {offerId, now})` → {ok} | {reason} (active, Zeitfenster, redemptionsUsed<maxRedemptions, offer-Bindung). Grenzwerte testen.
- `redeem.ts`: `redeemDiscount({code?|token?, offerId, now})` lädt Discount, validiert; `applyRedemption(discountId, bookingId, baseRappen)` erhöht `redemptionsUsed` + schreibt `discount_redemptions` **in einer DB-Transaktion mit Zeilensperre** (`SELECT … FOR UPDATE`), damit Limits unter Last halten. Preis nie < 0.
- Verifikation: tsc/eslint/vitest (Logik-Grenzwerte + Integrationstest Einlösung inkl. Limit) grün.

---

## Phase 2c — Rabatt-Admin-UI + /book-Einlösung

**Dateien:** Admin: `src/discounts/actions.ts` (Code/Link erstellen, deaktivieren), Zod-Input, UI-Sektionen auf `/admin/angebote` (Rabatt-Codes-Liste + „Code erstellen"; Einmal-Links-Liste + „Link erstellen" mit „Link kopieren"). CSS `.sec-head/.codes/.code-row/.code-chip/.plinks/.plink/.bar` portieren. Public: `/book` — Code-Eingabefeld (validiert live/serverseitig) + `?l=<token>`-Erkennung (setzt Angebot fix + Sonderpreis vorab); `submitBookingRequest` wendet Rabatt an (effektiver Preis serverseitig, `applyRedemption`, `bookings.discountId`).
- Einmal-Link: Token via `generateToken`, URL `…/book?l=<token>`, `maxRedemptions=1`.
- Anzeige Admin: Fortschritt „x / y", Ersparnis-Badge, aktiv/abgelaufen.
- Verifikation: Code & Einmal-Link end-to-end (Anlegen → /book einlösen → Buchung mit reduziertem Preis + redemption-Eintrag, Link danach verbraucht). tsc/eslint/vitest/build grün.

---

## Selbst-Review
Angebote-CRUD ✓ (2a) · Codes + Einmal-Links ✓ (2c) · Preis-/Limit-/Wettlauf-Logik mit TDD ✓ (2b) · Einlösung im Buchungs-Flow ✓ (2c) · Preis immer ≥ 0, serverseitig autoritativ. Geld in Rappen, CH-Rechtschreibung.

# Stufe 1a — Termine im Admin echt · Implementierungsplan

> **Für agentische Worker:** ERFORDERLICHE SUB-SKILL: superpowers:subagent-driven-development zum Abarbeiten. Schritte nutzen Checkbox-Syntax (`- [ ]`).

**Ziel:** Dashboard und Termine-Seite zeigen **echte Buchungen aus Postgres**; Sandro kann Buchungen manuell anlegen, im Detail ansehen und Status setzen (bestätigen / absagen / erledigt).

**Architektur:** Drizzle-Tabellen `offers` + `bookings` (Geld in Rappen) via `db:push`. Server-seitige Repository-Funktionen (`offers/`, `bookings/`) liefern Daten an React Server Components. Mutationen über Server Actions mit `revalidatePath`. Reine Logik (Geld-Format, Status-Übergänge) ist isoliert und unit-getestet. Refined-UI-Komponenten werden wiederverwendet.

**Tech-Stack:** Next.js 16 (App Router, RSC), Drizzle ORM + Postgres (Railway), Zod (Eingaben), Vitest (Tests).

**Abgrenzung:** Öffentliche Buchungsstrecke (`/book`, `/embed.js`) und E-Mail-Versand kommen in **Stufe 1b**. Rabatte/Einmal-Links in Stufe 2 (`discount_id` daher hier noch NICHT in `bookings`). Status-Aktionen lösen hier noch keine Mails aus (nur Audit-Log + `decided_at`).

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `src/lib/money.ts` | `formatRappen` / `formatPrice` — reine Geld-Formatierung (CHF, Tausender-Schmalleerzeichen) |
| `src/lib/money.test.ts` | Unit-Tests Geld-Format |
| `src/db/schema.ts` | + Enums `offer_unit`, `booking_status`, `booking_source`; + Tabellen `offers`, `bookings`; + Typen `Offer`, `Booking` |
| `src/bookings/status.ts` | reine Status-Helfer: `STATUS_LABEL`, `statusBadgeClass`, `canTransition`, `nextActions` |
| `src/bookings/status.test.ts` | Unit-Tests Status-Logik |
| `src/offers/repository.ts` | `listActiveOffers`, `listAllOffers`, `getOffer` (server-only) |
| `src/bookings/repository.ts` | `createBooking`, `listBookings`, `getBooking`, `setBookingStatus`, `getDashboardStats` (server-only) |
| `src/bookings/schema.ts` | Zod-Schemas für manuelle Buchung |
| `src/bookings/actions.ts` | Server Actions: `confirmBooking`, `cancelBooking`, `completeBooking`, `createManualBooking` |
| `src/scripts/seed-demo.ts` | Seed: 3 Angebote + ~7 Demo-Buchungen (idempotent) |
| `src/app/admin/page.tsx` | Dashboard mit echten KPIs + „Nächste Termine" + „Neue Anfragen" |
| `src/app/admin/termine/page.tsx` | Termine-Tabelle + Status-Filter (searchParams) + Detail/Aktionen |
| `src/components/admin/booking-table.tsx` | Tabelle (klickbare Zeilen) — Client für Detail-Modal-Trigger |
| `src/components/admin/booking-detail-modal.tsx` | Detail-Modal + Aktionsbuttons (Client) |
| `src/components/admin/new-booking-modal.tsx` | „Neue Buchung"-Formular-Modal (Client) |
| `src/components/admin/status-badge.tsx` | Status-Badge auf Basis `status.ts` |

---

## Task 1: Geld-Formatierung (rein, TDD)

**Files:** Create `src/lib/money.ts`, `src/lib/money.test.ts`

- [ ] **Step 1: Failing test** — `formatRappen(25000) === '250 CHF'`, `formatRappen(315000) === "3 150 CHF"` (schmales Leerzeichen U+202F als Tausender), `formatRappen(0) === '0 CHF'`, `formatPrice(20000,'pro_stunde') === '200 CHF / Std'`, `formatPrice(25000,'pauschal') === '250 CHF'`.
- [ ] **Step 2:** `vitest run src/lib/money.test.ts` → FAIL.
- [ ] **Step 3: Implement** — Rappen → CHF (`Math.round(r/100)`), Tausendertrennung mit `' '`, Einheit-Suffix `pro_stunde → ' / Std'`.
- [ ] **Step 4:** Test → PASS. **Step 5:** Commit `feat(money): Rappen→CHF Formatierung`.

## Task 2: Schema offers + bookings + db:push

**Files:** Modify `src/db/schema.ts`

- [ ] **Step 1:** Importe ergänzen: `integer, date, pgEnum`. Enums anlegen: `offerUnit('offer_unit',['pauschal','pro_stunde'])`, `bookingStatus('booking_status',['neu','bestaetigt','abgesagt','erledigt'])`, `bookingSource('booking_source',['iframe','manuell'])`.
- [ ] **Step 2:** Tabelle `offers` (id uuid PK defaultRandom; name text notNull; price_rappen integer notNull; unit notNull default 'pauschal'; duration_label text notNull default ''; description text notNull default ''; calendar_key text null; active boolean notNull default true; sort_order integer notNull default 0; created_at/updated_at timestamptz notNull defaultNow).
- [ ] **Step 3:** Tabelle `bookings` (id uuid PK; offer_id uuid → offers.id onDelete set null, nullable; offer_name_snapshot text notNull; customer_name/email text notNull; customer_phone text notNull default ''; message text null; requested_date date notNull; requested_time text notNull default ''; location text null; price_rappen integer notNull; status notNull default 'neu'; source notNull default 'manuell'; created_at timestamptz notNull defaultNow; decided_at timestamptz null). Typen `Offer`, `Booking` exportieren.
- [ ] **Step 4:** `npm run db:push` → Tabellen in Railway-DB. Verifizieren (`db:studio` oder SQL-Count) dass `offers`/`bookings` existieren.
- [ ] **Step 5:** `npx tsc --noEmit` grün. Commit `feat(db): offers + bookings Schema`.

## Task 3: Status-Helfer (rein, TDD)

**Files:** Create `src/bookings/status.ts`, `src/bookings/status.test.ts`

- [ ] **Step 1: Failing test** — `STATUS_LABEL.neu === 'Neu'`, `…bestaetigt === 'Bestätigt'`, `…abgesagt === 'Abgesagt'`, `…erledigt === 'Erledigt'`. `statusBadgeClass('neu') === 'st-new'`, `'bestaetigt'→'st-conf'`, `'abgesagt'→'st-canc'`, `'erledigt'→'st-done'`. `nextActions('neu')` enthält `'bestaetigt'` und `'abgesagt'`; `nextActions('bestaetigt')` enthält `'erledigt'` und `'abgesagt'`; `nextActions('abgesagt') === []`. `canTransition('neu','bestaetigt') === true`, `canTransition('abgesagt','bestaetigt') === false`.
- [ ] **Step 2:** Test → FAIL. **Step 3:** Implementieren (Maps + erlaubte Übergänge). **Step 4:** PASS. **Step 5:** Commit `feat(bookings): Status-Helfer (TDD)`.

## Task 4: Offers-Repository

**Files:** Create `src/offers/repository.ts`

- [ ] **Step 1:** `import 'server-only';` oben. `listActiveOffers()` → `offers` mit `active=true`, sortiert nach `sortOrder, name`. `listAllOffers()` → alle, gleiche Sortierung. `getOffer(id)` → ein Offer | undefined.
- [ ] **Step 2:** `npx tsc --noEmit` grün. Commit `feat(offers): repository`.

## Task 5: Bookings-Repository + Dashboard-Stats (Integration-TDD)

**Files:** Create `src/bookings/repository.ts`, `src/bookings/repository.test.ts`

- [ ] **Step 1: Failing integration test** (gegen Railway-DB, räumt eigene Zeilen wieder auf): legt Offer + Booking an → `getBooking` liefert es → `listBookings({status:'neu'})` enthält es → `setBookingStatus(id,'bestaetigt')` setzt Status **und** `decided_at` → `getDashboardStats()` Felder sind Zahlen. **Aufräumen** in `afterAll` (per `inArray` der erzeugten IDs löschen).
- [ ] **Step 2:** Test → FAIL.
- [ ] **Step 3: Implement** — `createBooking(input)` (insert, returning), `listBookings(filter?: {status?})` (where + orderBy `requested_date`), `getBooking(id)`, `setBookingStatus(id,status)` (update status + `decided_at = (status==='neu'? null : now)`), `getDashboardStats()` → `{ neueAnfragen, bestaetigtDieseWoche, umsatzMonatRappen, naechsteTermine, neueListe }` (Counts/Summen via SQL; „diese Woche"/„diesen Monat" über Datumsgrenzen; `umsatzMonat` = Summe `price_rappen` bei `status='bestaetigt'` im laufenden Monat; `naechsteTermine` = kommende `bestaetigt`+`neu` nach `requested_date`, Limit 5; `neueListe` = `status='neu'`, Limit 5).
- [ ] **Step 4:** Test → PASS. **Step 5:** Commit `feat(bookings): repository + dashboard stats (TDD)`.

## Task 6: Seed Demo-Daten

**Files:** Create `src/scripts/seed-demo.ts`; add script `"seed:demo": "tsx --env-file=.env.local src/scripts/seed-demo.ts"`

- [ ] **Step 1:** Relative Importe (wie `seed-admin.ts`). Idempotent: wenn `offers` leer → 3 Angebote einfügen (Portrait Outdoor 25000/pauschal/„2 Std", Portrait Studio 40000/pauschal/„2 Std", Individuelles Shooting 20000/pro_stunde/„flexibel"), sonst überspringen. Danach wenn `bookings` leer → ~7 Buchungen mit gemischten `status` (neu/bestätigt/abgesagt/erledigt), realistischen CH-Namen, Daten teils kommende/teils vergangene, `source` gemischt, `offer_name_snapshot` gesetzt.
- [ ] **Step 2:** `npm run seed:demo` ausführen; Counts prüfen. Commit `chore(seed): Demo-Angebote + Buchungen`.

## Task 7: Dashboard echt

**Files:** Modify `src/app/admin/page.tsx`; Create `src/components/admin/status-badge.tsx`

- [ ] **Step 1:** `status-badge.tsx`: rendert `<span class="badge-status {statusBadgeClass}"><span class="pip"/>{STATUS_LABEL}</span>`.
- [ ] **Step 2:** Dashboard = async RSC: `const s = await getDashboardStats()`. KPI-Kacheln (vorhandene `kpi`-Klassen/`kpi-card`): Neue Anfragen `s.neueAnfragen`, Bestätigt diese Woche `s.bestaetigtDieseWoche`, Umsatz Monat `formatRappen(s.umsatzMonatRappen)`, (Auslastung = Platzhalter „—" bis Stufe 3). Zwei Karten: „Nächste Termine" (Liste aus `s.naechsteTermine`, Datum-Chip + Name + Angebot + Badge) und „Neue Anfragen" (`s.neueListe`). Leerzustände wenn leer. Page-Head „Hallo Sandro".
- [ ] **Step 3:** `/admin` lädt (HTTP nach Login) ohne Fehler; `tsc`/`lint` grün. Commit `feat(dashboard): echte KPIs + Listen`.

## Task 8: Termine-Tabelle + Filter

**Files:** Modify `src/app/admin/termine/page.tsx`; Create `src/components/admin/booking-table.tsx`

- [ ] **Step 1:** Termine = async RSC mit `searchParams`: `const status = parse(searchParams.status)`; `const rows = await listBookings(status ? {status} : undefined)`. Segmented Filter (Links `?status=…`, „Alle/Neu/Bestätigt/Abgesagt") mit Counts. Page-Head „Termine & Buchungen" + Button „Neue Buchung".
- [ ] **Step 2:** `booking-table.tsx` (Client): Tabelle (Datum/Zeit, Kunde mit Avatar-Initialen, Angebot, Ort, Preis `formatRappen`, Status-Badge); Zeile klickbar → öffnet Detail-Modal (Task 9). Leerzustand.
- [ ] **Step 3:** `tsc`/`lint` grün. Commit `feat(termine): Tabelle + Status-Filter`.

## Task 9: Detail-Modal + Status-Aktionen

**Files:** Create `src/components/admin/booking-detail-modal.tsx`; Create `src/bookings/actions.ts`

- [ ] **Step 1:** `actions.ts` (`'use server'`): `confirmBooking(id)`, `cancelBooking(id)`, `completeBooking(id)` — prüfen `canTransition`, `setBookingStatus`, `logAudit`, `revalidatePath('/admin')` + `revalidatePath('/admin/termine')`. (Mail-Versand TODO Stufe 1b — als Kommentar markiert.)
- [ ] **Step 2:** `booking-detail-modal.tsx` (Client): zeigt alle Felder (Angebot, Termin, Ort, Preis, Kontakt mit mailto/tel, Nachricht als Zitat). Footer-Buttons je nach `nextActions(status)`: Bestätigen (primary) / Absagen (danger) / Erledigt. Buttons rufen Server Action via `startTransition`/Form. Nutzt Refined-Modal-Markup (`overlay`/`modal`).
- [ ] **Step 3:** Manuell testen: Status wechselt, Liste revalidiert. `tsc`/`lint` grün. Commit `feat(termine): Detail-Modal + Bestätigen/Absagen/Erledigt`.

## Task 10: Buchung manuell anlegen

**Files:** Create `src/components/admin/new-booking-modal.tsx`, `src/bookings/schema.ts`; extend `src/bookings/actions.ts`

- [ ] **Step 1:** `schema.ts`: Zod `manualBookingSchema` (offerId uuid, customerName min 2, customerEmail email, customerPhone optional, requestedDate, requestedTime, location optional, message optional, priceRappen int ≥ 0).
- [ ] **Step 2:** `createManualBooking(formData)` in `actions.ts`: validieren, `offer_name_snapshot` aus gewähltem Offer, `price_rappen` default = Offer-Preis (überschreibbar), `source='manuell'`, `status='neu'` (oder direkt bestätigt — Default neu), `revalidatePath`. Bei Validierungsfehler `{error}` zurück.
- [ ] **Step 3:** `new-booking-modal.tsx` (Client): Formular (Angebot-Select aus `listActiveOffers` als Prop, Felder), bei Submit Action; Erfolg → Modal schliessen + Toast.
- [ ] **Step 4:** Manuell testen: neue Buchung erscheint in Tabelle + Dashboard. `tsc`/`lint`/`test` grün. Commit `feat(termine): Buchung manuell anlegen`.

## Task 11: Abschluss-Review & Checkpoint

- [ ] Voller `npm run test`, `npx tsc --noEmit`, `npm run build` grün.
- [ ] Smoke: Login → Dashboard zeigt Demo-Zahlen → Termine filtern → Detail → Status setzen → manuell anlegen.
- [ ] Stufe-1a-Zusammenfassung an den User; Entscheidung Stufe 1b (öffentliche Strecke + Mails).

---

## Selbst-Review (Spec-Abdeckung)
- Dashboard echte Daten ✓ (Task 5,7) · Termine-Tabelle + Filter + Detail ✓ (Task 8,9) · Bestätigen/Absagen/Erledigt ✓ (Task 9) · manuell anlegen ✓ (Task 10). Mails/öffentliche Strecke bewusst Stufe 1b. Geld in Rappen ✓. Schweizer Rechtschreibung in allen Labels.

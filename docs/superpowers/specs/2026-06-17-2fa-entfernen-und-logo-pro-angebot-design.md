# 2FA entfernen & Logo pro Angebot — Design

**Datum:** 2026-06-17
**Status:** Freigegeben (zur Implementierung)

Zwei unabhängige Änderungen am Sandro-Dubach-Admin-Tool (Next.js 16 App Router, Drizzle ORM, Postgres auf Railway):

1. **Teil A** — Die 2-Faktor-Authentifizierung (TOTP) wird vollständig entfernt; der Login wird einstufig.
2. **Teil B** — Pro Angebot kann ein eigenes Logo hinterlegt werden, statt eines global fixen Logos.

Beide Teile sind voneinander unabhängig und können getrennt implementiert/getestet werden.

---

## Teil A — 2-Faktor-Authentifizierung komplett entfernen

### Ziel
Der bisherige Login erzwingt nach Passwort-Eingabe einen TOTP-Zweitfaktor (mit QR-Setup-Flow und Recovery-Codes). Das soll ersatzlos weg: Nach korrekter E-Mail/Passwort-Eingabe wird sofort eine volle Session erstellt und nach `/admin` weitergeleitet.

### Login-Flow neu
`loginAction` (`src/auth/actions.ts`):
- Prüft E-Mail/Passwort gegen `env.ADMIN_EMAIL` / `env.ADMIN_PASSWORD` (unverändert, inkl. konstanter Vergleichszeit via `safeEqual`).
- Bei Erfolg: `getOrCreateEnvAdmin` (unverändert) → `setSessionCookie(user.id)` → `lastLoginAt` setzen → Audit `login.success` → `redirect('/admin')`.
- Entfällt: der `sd_setup_pending`-Zweig, der `sd_2fa_pending`-Zweig, der Rückgabewert `{ needsTotp: true }`.
- `verify2faAction` wird komplett entfernt.
- `MAX_2FA_TRIES` und der totp-Import (`verifyTotp`, `consumeRecoveryCode`) werden entfernt.
- Der `ENV_MANAGED_MARKER` (Platzhalter für die NOT-NULL-Spalte `passwordHash`) **bleibt**; nur sein Kommentar wird entschlackt (kein Verweis mehr auf 2FA-Secret/Recovery).

### Zu löschende Dateien (rein 2FA)
- `src/lib/totp.ts`
- `src/lib/totp.test.ts`
- `src/auth/setup-2fa.ts`
- `src/app/setup-2fa/page.tsx` (gesamtes Verzeichnis `src/app/setup-2fa/`)
- `src/components/ui/otp-input.tsx`

### Zu editierende Dateien
- **`src/app/login/page.tsx`** — gesamten `stage === 'totp'`-Block (TOTP-Eingabe + Recovery-Aufklapper + Zurück-Button) entfernen; `stage`-State entfernen; im Erfolgsfall verlässt sich der Client auf das serverseitige `redirect`; ungenutzt werdende Imports bereinigen: `verify2faAction`, `OtpInput`, sowie die Icons `ChevronIcon` und `ArrowLeftIcon` (nur im totp-Stage genutzt). `ArrowIcon` und `ShieldIcon` bleiben (Login-Stage).
- **`src/app/admin/layout.tsx`** — Zeile `if (!user.totpEnabled) redirect('/setup-2fa');` entfernen. Es bleibt: `if (!user) redirect('/login')`.
- **`src/db/schema.ts`** — aus `adminUsers` die Spalten `totpSecret`, `totpEnabled`, `recoveryCodes` entfernen.
- **`src/app/globals.css`** — die 2FA-spezifischen Blöcke entfernen: `.otp-row`/`.otp-cell` (~Z. 777–817), `.recovery*` (~Z. 818–862), `.qr-frame`/`.secret-line`/`.recovery-codes` (~Z. 894–945) inkl. zugehöriger Media-Queries und Kommentar-Header. Der Header-Kommentar Z. 422 („Auth-Screens (Login / Setup-2FA)") wird auf „Login" gekürzt.
- **`src/scripts/reset-admin.ts`** — aus dem `.set({...})` die Felder `totpEnabled`, `totpSecret`, `recoveryCodes` entfernen; Kommentar (Z. 1) auf „Setzt das Passwort eines Admins zurueck" kürzen.
- **`src/scripts/seed-admin.ts`** — Konsolen-Hinweis (Z. 18) „— bitte beim ersten Login 2FA einrichten." entfernen.
- **`package.json`** — Abhängigkeiten `otplib`, `qrcode` und Dev-Dependency `@types/qrcode` entfernen; danach `npm install` (Lockfile aktualisieren).

### Kommentar-Nebenstellen (kosmetisch, optional)
`src/components/ui/auth-icons.tsx` und `src/components/ui/auth-screen.tsx` erwähnen „Setup-2FA" in Datei-Kommentaren. Die Komponenten bleiben (vom Login genutzt); die Kommentare dürfen auf „Login" gekürzt werden.

### Datenbank
Nach Schema-Änderung: `npm run db:push` gegen die beta-DB → die 3 Spalten werden aus `admin_users` gedroppt. Verlustfrei (nur deaktivierte 2FA-Daten). Beim späteren Merge nach `main` wird `db:push` gegen die Prod-DB dieselben Spalten droppen.

### Bereinigt sich automatisch
`src/auth/current-user.ts` selektiert die ganze Zeile; nach Schema-Änderung existiert `totpEnabled` im `AdminUser`-Typ nicht mehr — die Referenz in `admin/layout.tsx` wird zeitgleich entfernt. Keine weiteren Lese-Referenzen auf die 3 Felder vorhanden (per Grep verifiziert).

### Verifikation Teil A
- `npm run lint` (keine ungenutzten Imports, keine Verweise auf gelöschte Module).
- `npm run test` (totp-Test ist entfernt; übrige Tests grün).
- `npm run build`.
- Manuell: Login mit korrekten Credentials → direkt `/admin`; falsche Credentials → Fehlermeldung; `/setup-2fa` existiert nicht mehr.

---

## Teil B — Logo pro Angebot

### Ausgangslage
Heute ist das Logo ein hartkodiertes Asset `/public/sandro-logo.jpg`, das **nur an einer Stelle** verwendet wird: in `OfferStep` der öffentlichen Buchungsstrecke (`src/components/book/booking-flow.tsx:327`) als 44×44-Badge auf jeder Angebots-Karte. Die `offers`-Tabelle hat kein Logo-Feld; es existiert keine Upload-Infrastruktur. Die App läuft als standalone-Build auf Railway — Schreiben ins Dateisystem zur Laufzeit übersteht kein Deploy.

### Speicher-Ansatz
Neue **nullable** Spalte `offers.logoDataUrl` (`text('logo_data_url')`). Das Logo wird als **Data-URL** (Base64) direkt in der DB gespeichert. Die Verkleinerung passiert **client-seitig** im Browser per Canvas, bevor abgesendet wird — keine Upload-Route, kein externer Storage, kein neues Env.

### Client-Verkleinerung
Eine kleine Client-Komponente `LogoField` (neu, z. B. `src/components/admin/logo-field.tsx`), eingebunden im Angebots-Formular:
1. Datei-Auswahl (`accept="image/png,image/jpeg,image/webp"`).
2. Bild laden, auf Canvas zeichnen, so skaliert dass die längste Kante ≤ 256 px ist (kleinere Bilder werden nicht hochskaliert).
3. Export via `canvas.toDataURL('image/webp', 0.9)` (WebP, erhält Transparenz, ~20–40 KB).
4. Ergebnis in ein Hidden-Field `name="logoDataUrl"` schreiben und als Vorschau anzeigen.
5. „Entfernen"-Button setzt Hidden-Field auf `''` und Vorschau zurück auf das Fallback-Logo.

Das Hidden-Field trägt **immer den vollständigen Soll-Zustand**:
- Beim Bearbeiten initialisiert mit `offer.logoDataUrl ?? ''` (Vorschau zeigt vorhandenes Logo).
- Neues Logo hochgeladen → Wert ersetzt.
- „Entfernen" → Wert `''`.

So sind Anlegen und Bearbeiten ohne Sonderlogik abgedeckt.

### Server-Validierung
`src/offers/offer-input.ts` (`offerSchema`): neues Feld
- `logoDataUrl: z.string().optional().default('')` mit `transform`:
  - Leer/Whitespace → `null`.
  - Sonst: muss `^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,` matchen **und** Länge ≤ 200 000 Zeichen; andernfalls schlägt die Validierung fehl (→ Action gibt „Bitte Eingaben prüfen." zurück).

`OfferInput` enthält dann `logoDataUrl: string | null`.

### Verdrahtung
- **`src/offers/actions.ts`** — `parseOfferForm` liest `formData.get('logoDataUrl') ?? undefined` (analog zu `bookingMode`/`travelRuleId`, damit Zods `.default('')` bei fehlendem Feld greift); `createOfferAction` und `updateOfferAction` übergeben `logoDataUrl: data.logoDataUrl`.
- **`src/offers/repository.ts`** — `NewOfferData` um `logoDataUrl?: string | null` erweitern (create + update nutzen es bereits via Spread).
- **`src/db/schema.ts`** — Spalte `logoDataUrl: text('logo_data_url')` in `offers`. Der `Offer`-Typ aktualisiert sich automatisch.

### Anzeige
`src/components/book/booking-flow.tsx:327`:
```tsx
<img src={offer.logoDataUrl || '/sandro-logo.jpg'} alt="" className="bookx-offer-logo" />
```
Angebote ohne eigenes Logo behalten das bestehende `/sandro-logo.jpg` als Fallback — der Look bleibt unverändert, wo nichts gesetzt ist.

### Scope-Grenzen
- Das per-Angebot-Logo erscheint dort, wo heute das fixe Logo erscheint (Angebots-Karte der Buchungsstrecke). Keine Änderung an Mails (Text-only), Admin-Übersicht oder globalem Brand-Logo.
- `revalidatePath('/book')` läuft bereits in `revalidateOfferViews()` — neue Logos werden nach dem Speichern öffentlich sichtbar.

### Datenbank
Nach Schema-Änderung: `npm run db:push` fügt die nullable Spalte hinzu (verlustfrei, bestehende Angebote bekommen `NULL` → Fallback-Logo).

### Verifikation Teil B
- `npm run lint`, `npm run build`.
- Manuell: Angebot anlegen/bearbeiten → Logo hochladen → Vorschau erscheint → speichern → in `/book` zeigt die Karte das eigene Logo; Angebot ohne Logo zeigt das Fallback; „Entfernen" → wieder Fallback.

---

## Reihenfolge der Umsetzung
Teil A und Teil B sind unabhängig. Beide enthalten je eine Schema-Änderung → ein gemeinsames `db:push` am Ende genügt. Empfehlung: erst A (mechanisch, geringes Risiko), dann B (neues Feature).

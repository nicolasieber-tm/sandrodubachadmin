# Stufe 1b — Öffentliche Buchungsstrecke & Benachrichtigungen · Plan

> ERFORDERLICHE SUB-SKILL: superpowers:subagent-driven-development.

**Ziel:** Kund:innen senden über eine eingebettete iframe-Strecke (`/book`) echte Buchungsanfragen; diese landen als `bookings` (status=neu, source=iframe) im Admin. Bei Eingang + bei Bestätigung/Absage werden Benachrichtigungen ausgelöst (Dev: Log; Prod: Resend-fertig).

**Architektur:** Öffentliche, login-freie Route `/book` mit eigenem schlankem Layout (iframe-tauglich, `postMessage` an die Host-Seite). `/embed.js` (Route Handler) liefert ein Snippet, das Button + Overlay-iframe erzeugt. Schreibender Public-Endpoint per Server Action mit Zod + Honeypot. `notify/`-Modul kapselt Versand hinter einem Transport-Interface (Log-Transport jetzt, Resend-Seam dokumentiert). CSP: `/book` nur auf erlaubten Domains einbettbar; `/admin` bleibt `frame-ancestors 'none'`.

**Abgrenzung:** Rabatte/Einmal-Links erst Stufe 2 (Public-Flow nutzt Basispreis des Angebots). Echte Slot-Verfügbarkeit erst Stufe 3 (hier freie Datum/Zeit-Eingabe). Resend-API-Key + Domain-Verifizierung = Deploy-Aufgabe.

---

## Tasks

### 1 · notify-Abstraktion
- `src/notify/types.ts` — Interface `NotificationTransport { send(msg: {to:string; subject:string; text:string}): Promise<void> }`.
- `src/notify/log-transport.ts` — schreibt strukturiert auf `console.info('[notify] …')`.
- `src/notify/index.ts` — wählt Transport (wenn `process.env.RESEND_API_KEY` → später Resend, sonst Log). Funktionen: `notifyBookingReceived(booking)` (Bestätigung an Kund:in „Anfrage erhalten"), `notifyAdminNewBooking(booking)` (an `ADMIN_NOTIFY_EMAIL`/Fallback), `notifyBookingConfirmed(booking)`, `notifyBookingCancelled(booking)`. Texte deutsch (CH).
- Unit-Test: Log-Transport wird mit erwartetem Betreff/Empfänger aufgerufen (Spy).

### 2 · Public-Submit + Schema
- `src/bookings/public-input.ts` — Zod `publicBookingSchema` (offerId uuid, customerName min 2, customerEmail `z.email()`, customerPhone min 6, requestedDate, requestedTime, message optional, `website` Honeypot = muss leer sein).
- `src/bookings/public-actions.ts` (`'use server'`) — `submitBookingRequest(prev, formData)`: Honeypot prüfen (gefüllt → still `{ok:true}` zurück, NICHTS speichern), Zod, Offer laden (`getOffer`, aktiv?), `createBooking({... offerNameSnapshot, priceRappen=offer.priceRappen, source:'iframe', status:'neu'})`, dann `notifyBookingReceived` + `notifyAdminNewBooking`. Rückgabe `{ok:true}` | `{error}`.

### 3 · /book Seite (iframe-tauglich)
- `src/app/book/layout.tsx` — minimaler Rahmen (kein Admin-Shell), transparenter/heller Hintergrund, zentriert.
- `src/app/book/page.tsx` (RSC) — lädt `listActiveOffers()`, rendert `<BookingFlow offers=… />`.
- `src/components/book/booking-flow.tsx` (`'use client'`) — Schritte: (1) Angebot wählen (Karten mit Preis), (2) Datum/Zeit + Kontakt (Name/E-Mail/Telefon/Nachricht) + verstecktes Honeypot-Feld, (3) Absenden → Erfolgs-Screen. Refined-Optik (Akzent-Orange, Fraunces-Titel). Bei Erfolg `postMessage({type:'sd-booking',event:'success'}, '*')` an `window.parent`; zusätzlich Höhe via ResizeObserver an Parent melden (`{type:'sd-booking',event:'resize',height})`).

### 4 · /embed.js Snippet
- `src/app/embed.js/route.ts` — Route Handler, `Content-Type: application/javascript`. Liefert JS, das: einen „Termin buchen"-Button (oder vorhandenes `[data-sd-book]`-Element) anbindet, bei Klick ein Overlay mit `<iframe src="<origin>/book">` öffnet, `postMessage` lauscht (resize → iframe-Höhe, success → kurz Danke + schliessen), Schliessen per Button/Backdrop/ESC. Origin aus `new URL(import.meta.url)` bzw. Script-`src` ableiten.

### 5 · CSP / Einbettung
- `next.config.ts` — Header-Block für `source: '/book'`: `Content-Security-Policy: frame-ancestors 'self' https://sandrodubach.ch https://*.sandrodubach.ch http://localhost:3000;` (ohne `X-Frame-Options: DENY` für /book). `/admin`,`/login`,`/setup-2fa` bleiben `frame-ancestors 'none'`. Erlaubte Domains aus `env` (`ALLOWED_FRAME_ANCESTORS`) mit sinnvollem Default.

### 6 · Bestätigen/Absagen lösen Mails aus
- In `src/bookings/actions.ts` die `// TODO Stufe 1b`-Stellen ersetzen: nach `setBookingStatus` `notifyBookingConfirmed`/`notifyBookingCancelled` aufrufen.

### 7 · Verifikation
- `npx tsc --noEmit`, `npx eslint`, `npx vitest run`, `npm run build` grün. `/book` rendert (HTTP 200, öffentlich), `/embed.js` liefert JS (Content-Type). Submit legt Buchung an (Dev-Log zeigt notify). Commits auf `feature/stufe-1-termine`.

---

## Selbst-Review
Public-Flow ✓ (3) · embed/overlay/postMessage ✓ (4) · Anfrage-Eingang→DB ✓ (2) · Mails Eingang+Entscheid ✓ (1,2,6) · iframe-Sicherheit ✓ (5). Honeypot-Spam-Schutz ✓. Basispreis statt Rabatt (Stufe 2). Schweizer Rechtschreibung.

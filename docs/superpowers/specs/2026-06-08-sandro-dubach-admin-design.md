# Sandro Dubach — Admin-Backend & Buchungssystem · Design-Dokument

**Datum:** 2026-06-08
**Status:** Entwurf zur Review
**Ausgangslage:** Statische HTML-Demo (`index.html`, `server.js`) → echtes, datengetriebenes System

---

## 1. Ziel & Kontext

Sandro Dubach ist Fotograf (Bern/CH). Aus der bestehenden statischen Admin-**Demo** wird ein **echtes Verwaltungs-System** mit Datenbank, sicherem Login und einer öffentlichen Buchungsstrecke. Kund:innen senden über ein **iframe-Overlay** auf der bestehenden Website Buchungs­anfragen; Sandro verwaltet diese im geschützten Adminbereich, pflegt Angebote/Preise, vergibt Rabatte und verbindet (später) seine Kalender.

### Kernentscheidungen (bestätigt)

| Thema | Entscheidung |
|---|---|
| **Buchungsquelle** | Öffentliche Buchungsstrecke als **iframe-Overlay**, eingebettet per Snippet in die bestehende Website (Button → Overlay) |
| **Buchungsmodell** | **Anfrage → Sandro bestätigt/sagt ab** → Kunde erhält E-Mail. **Keine** Online-Zahlung; bezahlt wird vor Ort/Rechnung |
| **Tech-Stack** | **Next.js (React) + Postgres**, gehostet auf **Railway** |
| **Admin-Auth** | **E-Mail + Passwort + 2FA (TOTP)**, Session per sicherem httpOnly-Cookie |
| **Rabatte** | **Rabatt-Codes** (Prozent/Fix, zeitlich/nutzungslimitiert) + **persönliche Einmal-Links** (1× gültig, individueller Preis) |
| **Kalender-Sync** | Google 2-Way-Sync **als spätere Stufe** (Stufe 4), nicht in v1 |
| **Design** | **„Refined Original"** — bestehende Demo veredelt: heller Hintergrund, Orange `#e3712a`, Top-Tabs, Fraunces-Akzent + Inter. Referenz: `design-prototypes/04-refined.html` |

---

## 2. Architektur

**Eine** Next.js-App (App Router) auf Railway, mit Postgres als Daten-Service. Drei logische Oberflächen in einer Codebasis:

```
  bestehende Website (sandrodubach.ch)
        │  Snippet: "Buchen"-Button  →  öffnet iframe-Overlay
        ▼
  ┌─────────────────────────────────────────────────────────┐
  │                 Next.js-App (Railway)                     │
  │                                                           │
  │  /book        öffentliche Buchungsstrecke (iframe)        │  kein Login
  │  /admin/*     geschütztes Backend                         │  Login + 2FA
  │  /api/*       Route Handlers (Server Actions/REST)        │
  │  /embed.js    Loader-Snippet für die Website              │
  │                                                           │
  │  Server-Logik: Auth, Buchungen, Angebote, Rabatte, Mail   │
  └─────────────────────────────┬─────────────────────────────┘
                                │
                        Postgres (Railway)
```

### Modul-Grenzen (klare Verantwortlichkeiten)

Jedes Modul ist isoliert testbar und kommuniziert über definierte Interfaces (Server Actions / Repository-Funktionen):

- **`auth/`** — Login, Passwort-Hashing, 2FA/TOTP, Session-Verwaltung, Middleware-Schutz für `/admin`.
- **`bookings/`** — Anfragen entgegennehmen, Status-Workflow (neu → bestätigt/abgesagt), Detailabruf.
- **`offers/`** — CRUD für Angebote/Pakete inkl. Aktiv-Schalter und Kalender-Zuordnung.
- **`discounts/`** — Rabatt-Codes & Einmal-Links: Erstellung, Validierung, Einlösung, Statistik.
- **`calendars/`** — Verbindungen, Angebot→Kalender-Mapping, Verfügbarkeit/Öffnungszeiten (Stufe 3); Google-Sync (Stufe 4).
- **`notify/`** — E-Mail-Versand (Bestätigung/Absage an Kunde, neue-Anfrage an Sandro).
- **`ui/`** — Design-System-Komponenten (Refined): Topbar, Tabs, Card, KPI, Tabelle, Badge, Modal, Toast, Switch, Buttons.

### Tech-Detail (Vorschlag / Defaults — beim Review bestätigen)

- **Framework:** Next.js (App Router), TypeScript, React Server Components wo sinnvoll.
- **DB-Zugriff:** **Drizzle ORM** (typsicher, schlank, gute Migrations) auf Postgres. *(Alternative: Prisma — beim Review wählbar.)*
- **Auth:** selbst gebaut auf Basis bewährter Bausteine — `@node-rs/argon2` (Passwort-Hash), `otplib` (TOTP-2FA), signierte httpOnly-Session-Cookies (Lucia-Pattern oder eigene Session-Tabelle). Kein externer Auth-Provider nötig.
- **E-Mail:** **Resend** (einfach, gutes DX) oder SMTP. *(Beim Review wählbar.)*
- **Styling:** CSS-Variablen + Tailwind **oder** CSS-Module — wir übernehmen die Tokens aus `04-refined.html`. *(Vorschlag: Tailwind mit den Refined-Tokens als Theme.)*
- **Validierung:** **Zod** für alle Eingaben (Buchungsformular, Admin-Formulare, API).
- **Tests:** Vitest (Unit/Logik) + Playwright (E2E für Login, Buchung, Rabatt-Einlösung).

---

## 3. Datenmodell (Postgres)

> Zeitstempel überall `created_at` / `updated_at`. IDs als `uuid` (Default) bzw. `bigint` für lesbare Referenzen wo sinnvoll. Geldbeträge in **Rappen (integer)** speichern (z. B. `25000` = 250.00 CHF), Anzeige formatiert.

### `admin_users`
| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| email | text unique | |
| password_hash | text | argon2 |
| totp_secret | text null | gesetzt nach 2FA-Einrichtung |
| totp_enabled | boolean | |
| recovery_codes | text[] | gehasht, einmalig nutzbar |
| created_at / last_login_at | timestamptz | |

### `sessions`
| id (uuid) | user_id (FK) | expires_at | created_at | user_agent / ip (audit) |

### `offers` (Angebote/Pakete)
| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| name | text | „Portrait Outdoor" |
| price_rappen | integer | Basispreis |
| unit | enum('pauschal','pro_stunde') | |
| duration_label | text | „2 Stunden" / „flexibel" |
| description | text | |
| calendar_key | text null | Unterkalender-Zuordnung (Stufe 3) |
| active | boolean | auf Website buchbar |
| sort_order | integer | |

### `bookings` (Anfragen & Termine)
| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| offer_id | FK → offers | (snapshot der Kerndaten, s. u.) |
| offer_name_snapshot | text | falls Angebot später geändert wird |
| customer_name / email / phone | text | |
| message | text null | Kund:innen-Nachricht |
| requested_date | date | Wunschdatum |
| requested_time | text | Wunschzeit (Stufe 1 frei; Stufe 3 echte Slots) |
| location | text null | Ort |
| price_rappen | integer | effektiver Preis (nach evtl. Rabatt) |
| discount_id | FK null → discounts | falls Rabatt angewandt |
| status | enum('neu','bestaetigt','abgesagt','erledigt') | |
| source | enum('iframe','manuell') | |
| created_at / decided_at | timestamptz | |

### `discounts` (Rabatt-Codes UND Einmal-Links — eine Tabelle, `kind` unterscheidet)
| Feld | Typ | Notiz |
|---|---|---|
| id | uuid PK | |
| kind | enum('code','link') | Code = öffentlich; Link = persönlich/einmalig |
| code | text null unique | nur bei kind='code', z. B. „SOMMER25" |
| token | text null unique | nur bei kind='link', kryptografisch zufällig (URL) |
| value_type | enum('percent','fixed') | |
| value | integer | Prozent (0–100) oder Rappen |
| offer_id | FK null → offers | optional: nur für ein Angebot gültig |
| max_redemptions | integer null | null = unbegrenzt; bei Links = 1 |
| redemptions_used | integer | Zähler |
| valid_from / valid_until | timestamptz null | Gültigkeitsfenster |
| label | text null | z. B. „Portrait Studio für Tobias Renz" |
| active | boolean | |
| created_at | timestamptz | |

### `discount_redemptions` (Audit jeder Einlösung)
| id | discount_id (FK) | booking_id (FK) | redeemed_at | amount_saved_rappen |

### `availability` (Öffnungszeiten — Stufe 3)
| id | weekday (0–6) | enabled (bool) | start_time | end_time |

### `calendar_connections` (Stufe 3/4)
| id | provider (enum google/apple/outlook) | account_label | status | tokens (verschlüsselt, Stufe 4) | sub_calendars (jsonb) |

### `audit_log`
| id | actor (user_id null = system) | action | entity / entity_id | meta (jsonb) | created_at | — protokolliert sicherheits- & geschäftsrelevante Aktionen (Login, Bestätigung, Rabatt erstellt/eingelöst).

---

## 4. Authentifizierung & Sicherheit

### Login-Flow
1. `/admin/login` → E-Mail + Passwort. Passwort-Verifikation via argon2 (timing-safe).
2. Wenn `totp_enabled`: zweiter Schritt → 6-stelliger TOTP-Code (Authenticator-App). Optional Recovery-Code.
3. Erfolg → Session-Cookie (httpOnly, Secure, SameSite=Lax, kurze Lebensdauer + Rotation).
4. **Ersteinrichtung 2FA:** beim ersten Login QR-Code zum Scannen (otplib), Secret wird erst nach erfolgreicher Code-Eingabe persistiert; Recovery-Codes werden einmalig angezeigt.

### Schutzmassnahmen
- **Middleware** schützt alle `/admin/*`-Routen; unauth → Redirect Login.
- **Rate-Limiting** auf Login (Brute-Force-Schutz) und auf das öffentliche Buchungsformular (Spam-Schutz).
- **iframe-Sicherheit:** `/book` darf via `frame-ancestors` **nur** auf erlaubten Domains (sandrodubach.ch + lokal) eingebettet werden. `/admin` setzt `frame-ancestors 'none'` (nie einbettbar). Strenge CSP.
- **CSRF-Schutz** für state-ändernde Aktionen (Server Actions / Tokens).
- **Eingabevalidierung** überall mit Zod; Ausgabe-Escaping durch React.
- **Geheimnisse** als Railway-Umgebungsvariablen (DB-URL, Session-Secret, Resend-Key, später Google-OAuth). Nichts im Repo.
- **Honeypot + optionales Captcha** am öffentlichen Formular (Captcha erst falls Spam auftritt).

---

## 5. Die vier Admin-Module (Funktionen)

### 5.1 Dashboard
- KPI-Kacheln aus **echten** Daten: Neue Anfragen (Count `status=neu`), Bestätigt diese Woche, Auslastung (Stufe 3 aus Verfügbarkeit; bis dahin Platzhalter-Berechnung), Umsatz Monat (Summe bestätigter Buchungen).
- „Nächste Termine" (kommende bestätigte/neue, sortiert) + „Neue Anfragen" mit Schnell-Aktionen (Prüfen → Detail).

### 5.2 Termine & Buchungen
- Tabelle aller Buchungen, **Status-Filter** (alle/neu/bestätigt/abgesagt), Suche.
- Zeile klick → Detail (Modal/Panel): Angebot, Termin, Ort, Preis, Kontakt, Nachricht.
- Aktionen: **Bestätigen** (→ Mail an Kunde) / **Absagen** (→ Mail) / Status auf „erledigt".
- Buchung **manuell anlegen** (Sandro trägt Telefon-Anfrage ein).

### 5.3 Angebote & Preise (inkl. Rabatt-System)
- **Angebote:** Karten-Grid, Aktiv-Schalter, Bearbeiten/Neu (Name, Preis, Einheit, Dauer, Beschreibung, Kalender-Zuordnung).
- **Rabatt-Codes:** Liste mit Code, Wert (−25 % / −CHF), Gültigkeit, Einlösungen/Limit, Status. „+ Code erstellen".
- **Persönliche Einmal-Links:** Liste mit Label, Alt-Preis → Sonderpreis, Status (offen/eingelöst), **„Link kopieren"**. „+ Link erstellen" (Angebot + Sonderpreis/Rabatt wählen → generiert einmaligen Token-Link).

### 5.4 Kalender
- **Stufe 1–2:** Verbindungs-UI (Platzhalter), Angebot→Kalender-Zuordnung (lokal), Verfügbarkeit/Öffnungszeiten editierbar & gespeichert.
- **Stufe 3:** interne Monats-/Wochenansicht der Buchungen, echte Verfügbarkeits-/Slot-Logik (freie Slots aus Öffnungszeiten minus bestehende Termine).
- **Stufe 4:** Google 2-Way-Sync (OAuth, Push/Pull, Konfliktauflösung).

---

## 6. Öffentliche Buchungsstrecke (iframe)

### Einbettung
- `/embed.js` liefert ein kleines Snippet: erzeugt Button/Overlay und lädt `/book` in ein `<iframe>`. Auf der Website nur **eine Zeile** `<script src="https://<app>/embed.js">` + Button-Markup.
- Kommunikation Overlay↔iframe via `postMessage` (Höhe, Schliessen, „Buchung erfolgreich").

### Flow (Stufe 1)
1. **Angebot wählen** (nur `active=true`).
2. **Wunschtermin:** Datum + Wunschzeit. *(Annahme Stufe 1: freie Eingabe / grobe Zeitfenster, da Live-Slot-Verfügbarkeit erst mit dem Kalender in Stufe 3 kommt.)*
3. **Kontakt:** Name, E-Mail, Telefon, optional Nachricht.
4. *(Optional)* **Rabatt:** Code-Feld; persönliche Einmal-Links setzen den Preis automatisch (Token in der URL).
5. **Absenden** → `booking` mit `status=neu`, `source=iframe`. Bestätigungs-Mail an Kunde („Anfrage erhalten") + Benachrichtigung an Sandro. Erfolgs-Screen im iframe.

---

## 7. Rabatt-Logik (Detail)

- **Code-Einlösung:** Validierung prüft `active`, Zeitfenster, `redemptions_used < max_redemptions`, optionale `offer_id`-Bindung. Bei Erfolg: effektiven Preis berechnen (percent/fixed), `discount_redemptions`-Eintrag, Zähler erhöhen. Preis nie < 0.
- **Einmal-Link:** `kind='link'`, `max_redemptions=1`, kryptografischer `token` in der URL (`/book?l=<token>`). Beim Öffnen wird der reduzierte Preis vorausgewählt und das Angebot ggf. fixiert. Nach Buchung verbraucht (Zähler → 1, Link tot).
- **Wettlauf-Sicherheit:** Einlösung in einer DB-Transaktion mit Sperre, damit Limits unter Last nicht überschritten werden.
- **Anzeige:** im Admin Fortschrittsbalken (z. B. „12 / 50"), Ersparnis-Badge, abgelaufen/aktiv-Status.

---

## 8. Design-System „Refined Original"

Referenz-Prototyp: **`design-prototypes/04-refined.html`** (verbindlich für Look & Feel). Wir übersetzen ihn in wiederverwendbare React-Komponenten.

**Tokens:**
- Akzent `#e3712a` (tief `#c75f1f`, soft `#fdf0e7`)
- Hintergrund `#f4f5f7`, Surface `#ffffff`, Linien `#e6e8ec` / `#d4d8de`
- Ink `#1a1d22` / `#5b626c` / `#8b93a0`
- Status: Grün `#1f9d57`, Amber `#bd8410`, Rot `#cf4b41`, Blau `#3066e0`
- Typo: **Fraunces** (Seitentitel/Akzent), **Inter** (UI/Body, Tabular-Nums), Radius ~10–12px, weiche getönte Schatten.

**Komponenten:** Topbar (SD-Mark + Avatar), Tab-Navigation mit animiertem Underline, Card/Card-Header/Body, KPI-Kachel mit Akzentstreifen, Datentabelle (klickbare Zeilen), Status-Badge, Modal/Slide-over, **Toast** (statt `alert()`), Switch, Button-Varianten (primary/ghost/danger), Leerzustände.

**Sprache:** Deutsch (Schweiz) — durchgängig „ss", Währung „250 CHF", Tausender „3 150 CHF".

---

## 9. Ausbaustufen (Roadmap)

| Stufe | Ergebnis | Kern-Lieferungen |
|---|---|---|
| **0 · Fundament** | App läuft auf Railway, Sandro kann sich sicher einloggen | Next.js-Gerüst, Postgres + Drizzle-Schema + Migrationen, **Auth (Passwort + 2FA)**, Design-System-Grundgerüst, Seed mit Demo-Daten, Deploy-Pipeline |
| **1 · Termine echt** | Echte Buchungen End-to-End | `/book` iframe + `/embed.js`, Anfrage-Eingang, Dashboard + Termine mit echten Daten, Bestätigen/Absagen + E-Mails |
| **2 · Angebote & Rabatte** | Selbstverwaltung von Preisen & Aktionen | Angebote-CRUD, Rabatt-Codes, persönliche Einmal-Links, Einlöse-Logik im Buchungs-Flow |
| **3 · Kalender intern** | Verfügbarkeit & Übersicht | Öffnungszeiten echt, interne Kalenderansicht, Slot-/Verfügbarkeitsberechnung, Angebot→Kalender-Mapping |
| **4 · Google 2-Way-Sync** | Externe Kalender-Synchronisation | OAuth, Push/Pull, Konfliktauflösung, Webhooks |

Jede Stufe ist eigenständig deploybar und nützlich. **Stufe 0–1 zuerst** liefern den schnellsten sichtbaren Mehrwert (echte Anfragen statt Demo).

---

## 10. Testing-Strategie

- **Unit (Vitest):** Rabatt-Berechnung (percent/fixed, Grenzwerte, Limits), Verfügbarkeits-Logik, Auth-Helfer (Hash/TOTP).
- **Integration:** Repository-Funktionen gegen Test-Postgres (Buchung anlegen → Status-Übergänge; Rabatt-Einlösung inkl. Wettlauf).
- **E2E (Playwright):** Login + 2FA, Buchung über iframe-Strecke, Bestätigung löst Mail aus (Mock), Einmal-Link nur 1× nutzbar.
- TDD pro Stufe: Tests vor Implementierung der Geschäftslogik.

---

## 11. Offene Detail-Annahmen (beim Review bestätigen/ändern)

1. **ORM:** Drizzle (vs. Prisma).
2. **E-Mail-Dienst:** Resend (vs. SMTP/Postmark).
3. **Styling-Ansatz:** Tailwind mit Refined-Tokens (vs. CSS-Module).
4. **Slot-Wahl Stufe 1:** Kunde gibt Wunschdatum/-zeit frei an; echte Slot-Verfügbarkeit erst Stufe 3. (Falls Live-Verfügbarkeit schon früher gewünscht → Kalender vorziehen.)
5. **Admin-Nutzer:** zunächst **ein** Admin (Sandro); Schema erlaubt mehrere.
6. **Domain:** Railway-Subdomain zum Start; eigene Domain/Subdomain (z. B. `admin.sandrodubach.ch`, `buchen.sandrodubach.ch`) später.
7. **Bestehende Website:** Plattform/CMS noch unbekannt — das `embed.js`-Snippet ist plattformunabhängig (reines `<script>` + Button), funktioniert daher auf den meisten Seiten.

---

## 12. Nicht im Scope (v1)

- Online-Zahlung / Stripe (bewusst ausgeklammert).
- Kund:innen-Konten/Login (nur Admin hat Login).
- Mehrsprachigkeit (nur Deutsch/CH).
- Mobile-App (Web ist responsiv).
```

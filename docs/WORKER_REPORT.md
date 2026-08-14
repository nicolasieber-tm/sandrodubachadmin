# Worker Report — Brand-/Inhaltsumstellung auf Massagepraxis Hersche

Datum: 2026-08-14

## Zusammenfassung

Sichtbare Sandro-Dubach-Fotografie-Referenzen in Admin-Login, Topbar,
Metadaten, öffentlicher Buchungsstrecke, Standard-Mailvorlagen und den
öffentlich erreichbaren Test-Seiten (`public/wix-test.html`,
`public/iframe-test.html`) wurden durch Massagepraxis-Hersche-Texte ersetzt.
Logo (freigegeben) lokal unter `public/logo-default.png` eingebunden (kein
Hotlink), Farb-Tokens in `src/app/globals.css` auf Weiss/Anthrazit +
Pink/Magenta + Violett-Akzent umgestellt (per CSS-Custom-Properties, kaskadiert
automatisch in fast alle Komponenten).

## Konkurrierende Bearbeitung während der Session

`src/app/globals.css` wurde beim ersten Lesen bereits von aussen verändert
vorgefunden: `--accent`/`--bx-accent` waren schon auf `#d6247e` (Pink) gesetzt
(git diff zeigte 2 geänderte Zeilen vor meinem ersten Edit). Ich habe diesen
Wert übernommen statt zu überschreiben und die restliche Palette
(Deep/Press/Soft/Line/Ink-Varianten, Anthrazit, Violett) darum herum
aufgebaut. Falls das eine parallele manuelle Bearbeitung war: bitte prüfen,
ob `#d6247e` die gewünschte Farbe ist.

## Geänderte Dateien (eigene, für Commit vorgesehen)

- `docs/brand-design.md` — neu geschrieben (alte Sandro-Dubach-Farbanalyse
  durch Massagepraxis-Hersche-Tokens ersetzt)
- `next.config.ts` — CSP-Kommentar-Beispieldomain aktualisiert
- `public/iframe-test.html`, `public/wix-test.html` — Titel/Texte
- `public/sandro-logo.jpg` — gelöscht (altes Kunden-Logo)
- `public/logo-default.png` — NEU: freigegebenes Logo, lokal eingebunden
- `src/app/book/layout.tsx`, `src/app/layout.tsx`, `src/app/login/page.tsx`
- `src/app/globals.css` — Farb-Tokens + alle literalen Alt-Farben
- `src/components/admin/location-picker.tsx` — Kartenfarbe + (durch
  ESLint-Hook erzwungener) Fix einer vorbestehenden `react-hooks/refs`-
  Regelverletzung (Ref-Schreiben während Render → in `useEffect` verschoben)
- `src/components/admin/logo-field.tsx`, `standard-fields-editor.tsx`
- `src/components/book/booking-flow.tsx`
- `src/components/ui/auth-screen.tsx`, `topbar.tsx`
- `src/db/schema.ts` — Kommentar (Logo-Pfad)
- `src/notify/default-templates.ts`, `index.ts`, `preview-sample.ts`,
  `resend-transport.ts`, `template.ts`
- `src/offers/standard-fields.ts` + `standard-fields.test.ts`
- `src/scripts/seed-demo.ts` — nur `accountLabel` (siehe „Bewusst nicht
  geändert" unten)

Untracked Dateien aus dem bisherigen Worktree (.tmp_hash_calc.mjs,
docs/superpowers/plans/*, scripts/clear-test-admins.mjs,
scripts/inspect-beta-db.mjs, scripts/inspect-bookings.mjs,
src/scripts/clear-test-bookings.ts) wurden **nicht** angefasst.

## Mail-Sender/-Empfänger — sicherheitsbewusste Entscheidung

- `RESEND_FROM`-Fallback (`src/notify/resend-transport.ts`): auf
  `Massagepraxis Hersche <onboarding@resend.dev>` gesetzt (Resends eigene,
  immer verifizierte Sandbox-Adresse) statt eine unbestätigte
  `@massagepraxis-fh.ch`-Adresse zu hardcoden — die würde Resend ohne
  verifizierte Domain ohnehin ablehnen. **Sobald eine echte, bei Resend
  verifizierte Absenderdomain vorliegt, `RESEND_FROM` in Railway setzen.**
- `ADMIN_NOTIFY_EMAIL`-Fallback (`src/notify/index.ts`): der alte Fallback
  zeigte auf `sandro@sandrodubach.ch` — das hätte Buchungsanfragen an eine
  fremde, dem alten Kunden gehörende Mailbox geleitet. Fallback jetzt auf
  eine nach RFC 2606 reservierte, nie zustellbare `.invalid`-Adresse gesetzt
  (fail-safe statt fail-leak). **Blockiert: `ADMIN_NOTIFY_EMAIL` muss in
  Railway auf die echte Empfangsadresse der Praxis gesetzt werden — dafür
  fehlt mir eine bestätigte Adresse.** Bestehende Railway-Variablen wurden
  nicht angefasst.

## Bewusst nicht geändert (Scope-Entscheidung, keine Annahme)

- `_legacy/`, `design-prototypes/`, `docs/superpowers/specs|plans/*`: laut
  Auftrag nur bei funktionaler Störung anfassen — sind weder gebaut noch
  ausgeliefert (eigenes `package.json`/`server.js` bzw. nicht in
  `src/app`/`public`).
- Code-Kommentare, die „Sandro"/„sandrodubach.ch" nur beschreibend nennen
  (z. B. `layout.tsx`, `globals.css`-Kommentar, `integration-guide.tsx`,
  `run-reminders.ts`, `public-actions.ts`, `offer-input.ts`) — nicht
  nutzersichtbar, nicht funktional störend.
- `src/scripts/seed-demo.ts`: Demo-Angebote/-Buchungen (Portrait-Shooting-
  Texte, Foto-spezifische Orte/Nachrichten) **nicht** inhaltlich auf Massage
  umgeschrieben — das wäre freie Erfindung plausibler Praxis-Inhalte
  (Angebotsnamen, Preise, Kundennachrichten) ohne Bestätigung durch den
  Kunden. Nur die alte Kunden-E-Mail im Kalender-Demo-Datensatz wurde durch
  eine erkennbar fiktive `.example`-Adresse ersetzt. Läuft nur manuell via
  `npm run seed:demo`, nicht Teil von Build/Tests/Produktivbetrieb.
- `package.json`-Feld `"name": "sandrodubachadmin"`: rein interne, nicht
  nutzersichtbare npm-Metadaten; Änderung hätte `package-lock.json`
  (npm install) mit angefasst — außerhalb des beauftragten Scopes belassen.
- `#sd-book`/`sd-*`-Identifier (Embed-Snippet, CSS-Klassen): funktionale
  Code-Konvention, keine sichtbare Marke; Änderung hätte `embed.js` und alle
  Kunden-Einbettungs-Snippets betroffen — nicht angefasst.

## Tests / Anpassungen an Tests

- `src/offers/standard-fields.test.ts`: eine Assertion angepasst
  (`'Wo soll das Shooting stattfinden?'` → `'Wo soll die Behandlung
  stattfinden?'`), weil sie exakt den geänderten Produktivtext prüft.
- Keine weiteren Test-Fixtures verändert (z. B. `resend-transport.test.ts`,
  `template.test.ts`, `offer-input.test.ts` nutzen „Shooting"/„Sandro" nur
  als beliebige Beispielwerte, nicht als Assertion auf Produktivtext).

## Verifikation — exakte Ergebnisse

| Befehl | Ergebnis |
|---|---|
| `npx tsc --noEmit` | ✅ Keine Ausgabe, keine Fehler |
| `npm test` (vitest) | ✅ 39 Test-Dateien, 309 Tests, alle grün |
| `npm run build` | ✅ Erfolgreich (`next build`, Turbopack), alle 13 Routen erzeugt |
| `npm run check:design` | ❌ **Blockiert: Skript existiert nicht** in `package.json` (`npm error Missing script: "check:design"`). Keine Annahme getroffen — Skript nicht erstellt/geraten. |
| `npm run lint` (zusätzlich, nicht angefordert) | 21 Probleme (20 Fehler, 1 Warnung) — **alle vorbestehend**, verifiziert per `git stash` gegen den unveränderten HEAD (gleiche Anzahl/gleiche Dateien, in `email-templates-editor.tsx` und `offer-mail-overrides.tsx`, von mir nicht berührt). Ein Fund in `location-picker.tsx` (ebenfalls vorbestehend) wurde durch einen Stop-Hook erzwungen behoben, da die Datei ohnehin für die Farbänderung angefasst wurde. |

## TASKS.md

Keine `TASKS.md` im Repo vorhanden (`Glob` bestätigt) — keine Aktualisierung
möglich/nötig.

## Commit

Nur die oben gelisteten, selbst geänderten Dateien wurden committet (siehe
`git log`), explizit per Pfad — kein `git push`, kein Railway-Deploy.

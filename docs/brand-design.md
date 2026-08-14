# Brand-Dossier: Massagepraxis Hersche

Freigegebene Marken-Referenz: https://www.massagepraxis-fh.ch/Home.htm (Logo +
Farben laut ausdrücklicher Kundenfreigabe). Farbwerte aus dem Live-Stylesheet
der Website (`design/style.php`) extrahiert; Logo lokal unter
`public/logo-default.png` eingebunden (kein Hotlink).

## Farben (aus dem Live-Stylesheet der Website)

| Rolle | Wert | Herkunft |
|---|---|---|
| **Pink/Magenta (Akzent/CTA)** | `#d6247e` | website-typische Akzentfarbe (nahe `rgb(211,73,125)` aus dem Stylesheet), im Admin als `--accent` |
| **Violett (sekundär, sparsam)** | `#502797` | `rgb(80,39,151)` aus dem Stylesheet, als `--violet` nur für dekorative Verläufe/Glows |
| **Anthrazit (Text)** | `#232323` | nahe `rgb(28,28,28)` aus dem Stylesheet, als `--ink` |
| **Weiss** | `#ffffff` | Flächenfarbe, als `--surface`/`--bg`-Basis |

Look: klares, kühles Weiss als Grundfläche (kein warmer Rosé-Stich mehr),
Pink/Magenta als Primär-CTA-Farbe, Violett nur sparsam in Ambient-Glows
(Login-Screen, Buchungskarte) — ruhiger Praxis-Look statt generischer
SaaS-Optik.

## Token-Umsetzung im Code

Alle Farben laufen über CSS-Custom-Properties in `src/app/globals.css`
(`:root` + der gescopte `.bookx`-Block für die öffentliche Buchungsstrecke).
Ein Wechsel der Marke ändert künftig nur diese Tokens, keine Komponenten.

- `--accent` / `--accent-deep` / `--accent-press` / `--accent-soft` /
  `--accent-line` / `--accent-ink` — Pink/Magenta-Skala (Primär-CTA, Fokus,
  Badges).
- `--violet` / `--violet-soft` — Website-Violett, nur für dekorative
  Verläufe (Ambient-Glow auf Login/Buchungsstrecke), bewusst nicht als
  CTA-Farbe.
- `--ink`…`--ink-4` — Anthrazit-Textabstufungen.
- `--bg`, `--surface`, `--line`… — neutrale, kühle Weiss-/Grau-Flächen.
- `--red` (Fehler/Destruktiv) bleibt bewusst ein eigenständiges Rot, damit
  „Löschen/Fehler" nicht wie das Pink-Magenta-Primär-CTA wirkt.

## Logo

`public/logo-default.png` (PNG, transparent, ca. 269×70px Wortmarke) ist das
globale Standard-Logo: Fallback für Angebote ohne eigenes Logo
(`booking-flow.tsx`, `logo-field.tsx`) sowie in Login-Screen und Topbar
(`auth-screen.tsx`, `topbar.tsx`). Badges nutzen `object-fit: contain` auf
weissem Grund statt `cover`, damit die breite Wortmarke nicht beschnitten
wird.

## Offen / nicht angenommen

- Keine echten Fotos der Praxis übernommen (Kundenwunsch: nur Logo + Farben,
  keine fremden Web-Fotos).
- `RESEND_FROM`/Admin-Notify-E-Mail: siehe `docs/WORKER_REPORT.md` — bewusst
  keine unbestätigte Kunden-Adresse hardcodiert.

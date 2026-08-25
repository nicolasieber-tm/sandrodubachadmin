# Brand-Dossier: sandrodubach.ch (Squarespace-Website)

Analysiert am 2026-06-12 von https://www.sandrodubach.ch/hhome
(site.css-Tokens + Live-Computed-Styles + Screenshots in diesem Ordner).

## Farben (exakt, aus Live-DOM)

| Rolle | Wert | Herkunft |
|---|---|---|
| **Brand-Rot (Akzent/CTA)** | `#F23636` = `rgb(242,54,54)` = `hsl(0,88%,58%)` | `--accent-hsl`, Header-Button, Logo |
| **Rosé (Seitenhintergrund)** | `#E4CFCC` = `rgb(228,207,204)` = `hsl(7.5,30.8%,84.7%)` | `--lightAccent-hsl`, Body-Hintergrund |
| **Dunkel (Text + dunkle Sektionen)** | `#303636` = `rgb(48,54,54)` = `hsl(180,5.9%,20%)` | `--black-hsl` |
| **Weiß** | `#FFFFFF` | `--white-hsl`, weiße Sektionen, Button-Text |
| **Dark-Teal (sekundär, SEHR sparsam)** | `≈#25655D` = `hsl(172.5,46.4%,27.1%)` | `--darkAccent-hsl` (auf /hhome kaum sichtbar) |

Sektions-Dramaturgie der Website: Rosé als Grundfläche, dazwischen
Schwarz-(#303636)- und Weiß-Sektionen, ein knalliges rotes Band. Keine
Verläufe, flächige Farben, keine sichtbaren Schatten, Bilder eckig (radius 0).

## Typografie

- **Eine einzige Schrift: "Public Sans"** (Google Font) — für ALLES.
  Es gibt KEINE Serifenschrift auf der Website.
- Headings: weight **700**, line-height **1.2**, letter-spacing **0**
- Body: weight **300**, line-height **1.3**, letter-spacing **−0.04em**, Basis 18px
- Meta/klein: weight 300, letter-spacing −0.04em
- Riesige Hero-Headlines (H1 4rem+), sehr viel Weißraum.

## Buttons (Referenz: „Termin Buchen" im Header)

- Form: **Pill** (`border-radius: 300px` → praktisch 999px)
- Hintergrund: `#F23636`, Text: `#FFFFFF`
- Font: Public Sans, weight **500**, letter-spacing **−0.04em**, kein Uppercase
- Großzügiges Padding (Website: `1.5em x / 2.2em y`-Verhältnis — in der App
  proportional verkleinern, Pill-Form und Gewicht sind das Wiedererkennbare)
- Kein Border (stroke 0), kein Verlauf, kein starker Schatten.

## Designsprache zusammengefasst

1. Warm-minimalistisch: Rosé-Fläche, dunkles Grau-Petrol als Ink, Rot nur als
   gezielter Akzent (CTA, Logo, aktive Zustände).
2. Flächig statt plastisch: keine Verläufe/Glows, Schatten höchstens hauchzart.
3. Pill-Buttons für Aktionen, weiß auf Rot.
4. Public Sans überall; Hierarchie über Gewicht (300 vs 500 vs 700) und Größe,
   nicht über Schriftwechsel.
5. Negative letter-spacing (−0.04em) gibt dem Fließtext den Website-Look.

## Abgrenzung Status-Farben (App-intern, nicht Website)

Brand-Rot #F23636 = Akzent/CTA. Fehler/Destruktiv muss unterscheidbar bleiben:
dunkleres Fehler-Rot (z. B. bestehendes #cf4b41) beibehalten, damit
„Löschen/Fehler" nicht wie ein Primär-CTA aussieht. Grün/Amber/Blau für Status
bleiben, ggf. minimal entsättigt ans warme Schema angepasst.

## Screenshots

- `sd_hero.jpeg` — Header: Logo rot, Nav dunkel, roter Pill-CTA, Rosé-Fläche
- `sd_fullpage.jpeg` — Sektionsfolge Rosé → Rot-Band → Rosé → Schwarz (Footer)

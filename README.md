# Sandro Dubach – Admin-Backend (Skizze)

Einfache HTML-Skizze für das Verwaltungs-Backend: Dashboard, Termine/Buchungen,
Angebote & Preise sowie Kalender-Verbindung (Angebot → Unterkalender, Verfügbarkeit).

Reine Vorschau/Referenz – keine echte Datenspeicherung, keine echte Kalender-Anbindung.
Buttons zeigen Demo-Meldungen.

## Lokal starten

```bash
npm start
# -> http://localhost:3000
```

(Node 18+ nötig, keine Abhängigkeiten zu installieren.)

## Deployment auf Railway

1. Repo auf GitHub pushen.
2. Railway: **New Project → Deploy from GitHub repo** und dieses Repo wählen.
3. Railway erkennt Node automatisch und führt `npm start` aus (Server bindet an `$PORT`).
4. **Settings → Networking → Generate Domain** für eine öffentliche URL.

## Dateien

- `index.html` – komplette Admin-Skizze (HTML/CSS/JS in einer Datei)
- `server.js` – minimaler statischer Webserver (zero-dependency)
- `package.json` – Start-Skript

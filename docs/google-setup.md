# Google-Kalender einrichten

Diese Anleitung beschreibt Schritt für Schritt, wie die Google-Kalender-Anbindung
für das Admin-Backend eingerichtet wird. Solange die Werte nicht hinterlegt sind,
funktioniert die App normal weiter – die Google-Funktionen sind dann einfach
inaktiv.

## 1. Google-Cloud-Projekt anlegen

1. Die Google Cloud Console öffnen: https://console.cloud.google.com/
2. Oben in der Projektauswahl auf **Neues Projekt** klicken.
3. Einen Namen vergeben (z. B. `sandrodubach-admin`) und auf **Erstellen** klicken.
4. Sicherstellen, dass das neue Projekt oben als aktives Projekt ausgewählt ist.

## 2. Calendar API aktivieren

1. Im Menü zu **APIs und Dienste → Bibliothek** wechseln.
2. Nach **Google Calendar API** suchen.
3. Den Eintrag öffnen und auf **Aktivieren** klicken.

## 3. OAuth-Zustimmungsbildschirm konfigurieren

1. Zu **APIs und Dienste → OAuth-Zustimmungsbildschirm** wechseln.
2. Als Nutzertyp **Extern** wählen und auf **Erstellen** klicken.
3. Die Pflichtfelder ausfüllen:
   - **App-Name** (z. B. `Sandro Dubach Admin`)
   - **Support-E-Mail**
   - **Entwickler-Kontaktdaten**
4. Den Veröffentlichungsstatus auf **Test** (Test-Modus) belassen – so wird keine
   Google-Verifizierung benötigt.
5. Unter **Test-Nutzer** die E-Mail-Adresse(n) hinzufügen, die sich später
   verbinden dürfen (z. B. die eigene Google-Adresse). Nur diese Nutzer können
   im Test-Modus den Zugriff freigeben.
6. Speichern.

## 4. OAuth-Client-ID erstellen

1. Zu **APIs und Dienste → Anmeldedaten** wechseln.
2. Auf **Anmeldedaten erstellen → OAuth-Client-ID** klicken.
3. Als Anwendungstyp **Webanwendung** wählen.
4. Einen Namen vergeben (z. B. `Admin-Backend`).
5. Unter **Autorisierte Weiterleitungs-URIs** folgende URI hinzufügen:

   ```
   http://localhost:3000/api/google/callback
   ```

6. Auf **Erstellen** klicken. Google zeigt nun **Client-ID** und
   **Client-Schlüssel** (Client Secret) an – beide Werte werden gleich benötigt.

## 5. Werte in `.env.local` eintragen

Die kopierten Werte in die Datei `.env.local` im Projektverzeichnis eintragen:

```
GOOGLE_CLIENT_ID=<deine-client-id>
GOOGLE_CLIENT_SECRET=<dein-client-secret>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/google/callback
```

Die `GOOGLE_REDIRECT_URI` ist optional – ohne Angabe wird automatisch
`http://localhost:3000/api/google/callback` verwendet.

## 6. Verschlüsselungs-Schlüssel erzeugen

Die Tokens werden verschlüsselt in der Datenbank abgelegt. Dafür wird ein
geheimer Schlüssel benötigt. Diesen mit folgendem Befehl erzeugen:

```
openssl rand -base64 32
```

Die Ausgabe in `.env.local` eintragen:

```
GOOGLE_TOKEN_ENC_KEY=<erzeugter-schlüssel>
```

## 7. Anbindung testen

1. Den Dev-Server neu starten, damit die neuen Umgebungsvariablen geladen werden.
2. Im Admin-Backend zu **Kalender** navigieren.
3. Bei **Verbundene Kalender** auf **Google-Kalender verbinden** klicken.
4. Mit einem hinterlegten Test-Nutzer anmelden und den Zugriff freigeben.
5. Nach der Rückkehr sollte die Verbindung als **Verbunden** angezeigt werden.

## Hinweis: Spätere Produktion (Railway)

Sobald die App auf Railway läuft, muss in der Google Cloud Console eine zweite
**Autorisierte Weiterleitungs-URI** mit der öffentlichen Adresse ergänzt werden,
zum Beispiel:

```
https://<deine-railway-domain>/api/google/callback
```

Zusätzlich müssen dieselben Umgebungsvariablen (`GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `GOOGLE_TOKEN_ENC_KEY`) in den
Railway-Variablen gesetzt werden – dort zeigt `GOOGLE_REDIRECT_URI` dann auf die
Railway-Domain.

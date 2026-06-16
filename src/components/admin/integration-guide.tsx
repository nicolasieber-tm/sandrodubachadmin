'use client';

import { useState } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';

// Interaktiver Integrations-Guide: erklaert in NUR ZWEI Schritten, wie der
// Buchungs-Button in eine fremde Website eingebaut wird – builder-unabhaengig.
// Wichtig: Schritt 2 ist in den meisten Baukaesten KEIN HTML, sondern nur eine
// Verlinkung (Button → Link-Feld → Adresse mit #sd-book). Die einzubettende
// Adresse kommt aus env.APP_URL (Server-Page) – Beta zeigt die Beta-URL.

interface IntegrationGuideProps {
  embedUrl: string; // z. B. https://sandro-dubach-app-...up.railway.app (ohne Slash)
  testUrl: string; // Demo-Seite (#sd-book-Button) zum Ausprobieren
}

function CodeBlock({ code, label }: { code: string; label: string }) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Fallback fuer aeltere Browser ohne Clipboard-API.
      const ta = document.createElement('textarea');
      ta.value = code;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(ta);
      }
    }
    setCopied(true);
    toast('In die Zwischenablage kopiert');
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div style={{ position: 'relative' }}>
      <pre
        aria-label={label}
        style={{
          margin: 0,
          background: 'var(--ink)',
          color: '#f4ece9',
          padding: '16px 18px',
          paddingRight: '120px',
          borderRadius: '12px',
          fontSize: '13px',
          lineHeight: 1.6,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          overflowX: 'auto',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        <code>{code}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        className="btn btn-sm"
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: copied ? '#1f9d57' : 'var(--accent)',
          color: '#fff',
          border: 'none',
          gap: '6px',
        }}
      >
        {copied ? (
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
        {copied ? 'Kopiert' : 'Kopieren'}
      </button>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '26px',
        height: '26px',
        borderRadius: '999px',
        background: 'var(--accent-soft)',
        color: 'var(--accent-ink)',
        fontWeight: 700,
        fontSize: '14px',
        flexShrink: 0,
      }}
    >
      {n}
    </span>
  );
}

function Body({ children }: { children: React.ReactNode }) {
  return (
    <CardBody>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>{children}</div>
    </CardBody>
  );
}

const pStyle: React.CSSProperties = { margin: 0, color: 'var(--ink-2)', lineHeight: 1.65 };
const noteStyle: React.CSSProperties = { margin: 0, fontSize: '13px', color: 'var(--ink-3)', lineHeight: 1.6 };

// Wo finde ich «eigenen Code» und das «Link-Feld» je Baukasten?
const BUILDERS: { name: string; code: string; button: string }[] = [
  {
    name: 'Wix',
    code: 'Einstellungen → Custom Code → Code hinzufügen → Platzierung «Body – Ende», alle Seiten (Premium-Tarif nötig).',
    button: 'Button anklicken → Link-Symbol → «Web-Adresse» → deine Seiten-Adresse + /#sd-book, «im selben Fenster».',
  },
  {
    name: 'Squarespace',
    code: 'Einstellungen → Erweitert → Code-Injektion → Feld «Footer» (Business-/Commerce-Tarif nötig).',
    button: 'Button-Block hinzufügen → Link → «Externe Adresse» → deine Seiten-Adresse + /#sd-book.',
  },
  {
    name: 'Jimdo',
    code: '«+ Inhalt hinzufügen» → «Weitere Inhalte & Add-ons» → «Widget/HTML» → Snippet einfügen.',
    button: 'Button-Element → Link → «Externer Link» → deine Seiten-Adresse + /#sd-book.',
  },
  {
    name: 'Webflow',
    code: 'Project- oder Page-Settings → Custom Code → Feld «Before </body> tag».',
    button: 'Button auswählen → Settings (Zahnrad) → Link → URL = #sd-book (oder volle Adresse + /#sd-book).',
  },
  {
    name: 'WordPress',
    code: 'Plugin «WPCode» (Code Snippets → Header & Footer → Footer) oder ein «Custom HTML»-Block.',
    button: 'Button-Block → Link-Feld → deine Seiten-Adresse + /#sd-book.',
  },
  {
    name: 'Anderer Baukasten',
    code: 'Suche nach «Custom Code», «Eigener Code», «Code einfügen» oder «HTML einbetten».',
    button: 'Beliebigen Button verlinken und im Link-/URL-Feld deine Seiten-Adresse + /#sd-book eintragen.',
  },
];

export function IntegrationGuide({ embedUrl, testUrl }: IntegrationGuideProps) {
  const snippetMain = `<script src="${embedUrl}/embed.js" data-sd-no-fab></script>`;
  const snippetAuto = `<script src="${embedUrl}/embed.js"></script>`;
  const linkTarget = `https://deine-website.ch/#sd-book`;
  const buttonExample = `<a href="#sd-book">Termin buchen</a>`;

  return (
    <>
      {/* Hinweis: nur zwei Schritte */}
      <Card>
        <Body>
          <p style={{ ...pStyle, color: 'var(--ink)' }}>
            Es sind nur <strong>zwei Schritte</strong>: <strong>1.</strong> einmal das Snippet einbauen,
            <strong> 2.</strong> einen Button damit verknüpfen. Für Schritt 2 musst du <strong>keinen Code schreiben</strong> –
            es ist nur eine Verlinkung.
          </p>
        </Body>
      </Card>

      {/* Schritt 1 */}
      <Card style={{ marginTop: 20 }}>
        <CardHeader>
          <div>
            <h3>
              <StepNumber n={1} /> Das Snippet einbauen
              <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· einmalig</span>
            </h3>
            <div className="sub">Diese eine Zeile wird einmal in die Website eingefügt – danach funktionieren alle Buttons.</div>
          </div>
        </CardHeader>
        <Body>
          <p style={pStyle}>
            Fast jeder Website-Baukasten hat einen Bereich für eigenen Code – meist <strong>«Custom Code»</strong>,
            <strong> «Eigener Code»</strong> oder <strong>«HTML einbetten»</strong>. Den Code dort einfügen, möglichst
            <strong> am Ende der Seite (Body)</strong> und <strong>auf allen Seiten</strong>, dann speichern.
            Wo genau das bei deinem Baukasten ist, steht weiter unten.
          </p>
          <CodeBlock code={snippetMain} label="Einbettungs-Snippet" />
          <p style={noteStyle}>
            <code>data-sd-no-fab</code> sorgt dafür, dass <strong>nur deine eigenen Buttons</strong> zählen (kein
            automatischer Knopf erscheint).
          </p>
        </Body>
      </Card>

      {/* Schritt 2 */}
      <Card style={{ marginTop: 20 }}>
        <CardHeader>
          <div>
            <h3>
              <StepNumber n={2} /> Einen Button verknüpfen
            </h3>
            <div className="sub">Kein HTML nötig – in den meisten Baukästen reicht eine Verlinkung.</div>
          </div>
        </CardHeader>
        <Body>
          <p style={pStyle}>
            <strong>Der einfache Weg (ohne Code):</strong> Setze einen ganz normalen Button (oder Text/Bild) und
            <strong> verlinke ihn</strong>. Trage im Link-Feld deines Baukastens als Ziel deine eigene Seiten-Adresse ein
            und hänge <code>#sd-book</code> an – und wähle <strong>«im selben Tab öffnen»</strong>:
          </p>
          <CodeBlock code={linkTarget} label="Link-Ziel für den Button" />
          <p style={noteStyle}>
            Bietet dein Baukasten ein reines Anker-/Link-Feld an, genügt auch nur <code>#sd-book</code>.
          </p>
          <p style={pStyle}>
            <strong>Nur falls du HTML einfügst</strong> (z. B. in einem Code-/HTML-Block): so sieht ein solcher Button als Code aus.
          </p>
          <CodeBlock code={buttonExample} label="Beispiel-Button (HTML)" />
          <p style={noteStyle}>Es können beliebig viele Buttons auf derselben Seite sein – alle öffnen dasselbe Fenster.</p>
        </Body>
      </Card>

      {/* Wo finde ich das? – pro Baukasten */}
      <Card style={{ marginTop: 20 }}>
        <CardHeader>
          <div>
            <h3>Wo finde ich das in meinem Baukasten?</h3>
            <div className="sub">Die zwei Schritte konkret – such dir deinen Anbieter heraus.</div>
          </div>
        </CardHeader>
        <Body>
          {BUILDERS.map((b) => (
            <div
              key={b.name}
              style={{
                border: '1px solid var(--line)',
                borderRadius: '12px',
                padding: '14px 16px',
                background: 'var(--surface-2)',
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--ink)', marginBottom: '8px' }}>{b.name}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13.5px', lineHeight: 1.55, color: 'var(--ink-2)' }}>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--accent-ink)' }}>Schritt 1 – Code:</span> {b.code}
                </div>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--accent-ink)' }}>Schritt 2 – Button:</span> {b.button}
                </div>
              </div>
            </div>
          ))}
        </Body>
      </Card>

      {/* Testen */}
      <Card style={{ marginTop: 20 }}>
        <CardHeader>
          <div>
            <h3>Testen</h3>
            <div className="sub">So sieht das Ergebnis aus.</div>
          </div>
        </CardHeader>
        <Body>
          <p style={pStyle}>Eine fertige Demo-Seite mit genau so einem Button:</p>
          <div>
            <a href={testUrl} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ textDecoration: 'none' }}>
              Demo-Seite öffnen ↗
            </a>
          </div>
        </Body>
      </Card>

      {/* Alternative */}
      <Card style={{ marginTop: 20 }}>
        <CardHeader>
          <div>
            <h3>Alternative: automatischer Button</h3>
            <div className="sub">Wenn gar kein eigener Button gebaut werden soll.</div>
          </div>
        </CardHeader>
        <Body>
          <p style={pStyle}>
            Mit diesem Snippet (ohne <code>data-sd-no-fab</code>) erscheint automatisch unten rechts ein schwebender
            Knopf «Termin buchen». Dann entfällt Schritt 2.
          </p>
          <CodeBlock code={snippetAuto} label="Snippet mit automatischem Button" />
        </Body>
      </Card>

      {/* Hinweise */}
      <Card style={{ marginTop: 20 }}>
        <CardHeader>
          <div>
            <h3>Wichtig zu wissen</h3>
          </div>
        </CardHeader>
        <Body>
          <ul style={{ margin: 0, paddingLeft: '20px', color: 'var(--ink-2)', lineHeight: 1.8 }}>
            <li>Die <strong>Vorschau im Editor</strong> des Baukastens zeigt das Fenster oft nicht – das ist normal. Erst auf der <strong>veröffentlichten Website</strong> funktioniert es zuverlässig.</li>
            <li>Manche Baukästen brauchen für eigenen Code einen <strong>Bezahl-Tarif</strong> (z. B. Wix Premium, Squarespace Business).</li>
            <li>Das Buchungsfenster erscheint nur auf <strong>freigegebenen Domains</strong>. Die eigene Website-Domain ist freigeschaltet; bei einer neuen Domain kurz Bescheid geben.</li>
            <li>Am Snippet selbst muss nichts angepasst werden – einfach so einfügen, wie es hier steht.</li>
          </ul>
        </Body>
      </Card>
    </>
  );
}

'use client';

import { useState } from 'react';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';

// Interaktiver Integrations-Guide: erklaert Schritt fuer Schritt, wie der
// Buchungs-Button in eine fremde Website (z. B. Wix) eingebaut wird, und zeigt
// die fertigen Snippets mit Kopier-Knopf. Die einzubettende Adresse kommt aus
// env.APP_URL (Server-Page) — so zeigt Beta die Beta-URL, Produktion die echte.

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

// Einheitliche Textabstaende im Card-Body: Absaetze mit etwas Luft, kein
// doppelter Rand oben/unten dank der Gap-Regelung ueber das Wrapper-div.
function Body({ children }: { children: React.ReactNode }) {
  return (
    <CardBody>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>{children}</div>
    </CardBody>
  );
}

const pStyle: React.CSSProperties = { margin: 0, color: 'var(--ink-2)', lineHeight: 1.65 };
const noteStyle: React.CSSProperties = { margin: 0, fontSize: '13px', color: 'var(--ink-3)', lineHeight: 1.6 };

export function IntegrationGuide({ embedUrl, testUrl }: IntegrationGuideProps) {
  const snippetMain = `<script src="${embedUrl}/embed.js" data-sd-no-fab></script>`;
  const snippetAuto = `<script src="${embedUrl}/embed.js"></script>`;
  const buttonExample = `<a href="#sd-book">Termin buchen</a>`;

  return (
    <>
      {/* Schritt 1 */}
      <Card>
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
            <strong> «Eigener Code»</strong> oder <strong>«HTML einbetten»</strong> (z. B. Wix, Squarespace, Jimdo,
            Webflow, WordPress). Den Code dort einfügen, möglichst <strong>am Ende der Seite (Body)</strong> und
            <strong> auf allen Seiten</strong>, dann speichern.
          </p>
          <CodeBlock code={snippetMain} label="Einbettungs-Snippet" />
          <p style={noteStyle}>
            <code>data-sd-no-fab</code> sorgt dafür, dass <strong>nur Ihre eigenen Buttons</strong> zählen (kein
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
            <div className="sub">Jeder Button, der auf #sd-book verweist, öffnet das Buchungsfenster.</div>
          </div>
        </CardHeader>
        <Body>
          <p style={pStyle}>
            Einen beliebigen Button (oder Link bzw. Bild) platzieren und ihn <strong>verlinken</strong>. Im
            Link-Feld des Baukastens – je nach Tool «Link», «Verlinken mit» oder «URL/Web-Adresse» – als Ziel
            einfach <code>#sd-book</code> eintragen. Fertig.
          </p>
          <p style={pStyle}>
            Verlangt der Baukasten eine vollständige Adresse, stattdessen die eigene Domain mit dem Zusatz angeben –
            z. B. <code>https://ihre-domain.ch/#sd-book</code> – und «im selben Tab öffnen» wählen.
          </p>
          <p style={{ ...pStyle, marginBottom: 0 }}>Als reines HTML sieht ein solcher Button so aus:</p>
          <CodeBlock code={buttonExample} label="Beispiel-Button" />
          <p style={noteStyle}>Es können beliebig viele Buttons auf derselben Seite sein – alle öffnen dasselbe Fenster.</p>
        </Body>
      </Card>

      {/* Schritt 3 */}
      <Card style={{ marginTop: 20 }}>
        <CardHeader>
          <div>
            <h3>
              <StepNumber n={3} /> Testen
            </h3>
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
            <li>Das Buchungsfenster erscheint nur auf <strong>freigegebenen Domains</strong>. Die eigene Website-Domain ist freigeschaltet; bei einer neuen Domain kurz Bescheid geben.</li>
            <li>Am Snippet selbst muss nichts angepasst werden – einfach so einfügen, wie es hier steht.</li>
          </ul>
        </Body>
      </Card>
    </>
  );
}

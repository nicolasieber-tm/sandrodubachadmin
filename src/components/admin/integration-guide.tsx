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

// Wo finde ich «eigenen Code» und das «Link-Feld» je Baukasten? Bewusst einfach
// gehalten: als Link überall nur #sd-book, keine Adressen/Domains.
const BUILDERS: { name: string; code: string; button: string }[] = [
  {
    name: 'Wix',
    code: 'Einstellungen → «Eigener Code» (Custom Code) → Code am Seitenende einfügen, für alle Seiten.',
    button: 'Knopf anklicken → Link-Symbol → als Ziel #sd-book eintragen.',
  },
  {
    name: 'Squarespace',
    code: 'Einstellungen → Erweitert → «Code einfügen» → Feld «Footer».',
    button: 'Knopf hinzufügen → Link → #sd-book.',
  },
  {
    name: 'Jimdo',
    code: '«Inhalt hinzufügen» → «Widget / HTML» → Code einfügen.',
    button: 'Knopf-Element → Link → #sd-book.',
  },
  {
    name: 'Webflow',
    code: 'Seiten-Einstellungen → «Custom Code» → unteres Code-Feld.',
    button: 'Knopf auswählen → Einstellungen → Link → #sd-book.',
  },
  {
    name: 'WordPress',
    code: 'Über das Plugin «WPCode» (Footer) oder einen «Custom HTML»-Block.',
    button: 'Knopf-Block → Link-Feld → #sd-book.',
  },
  {
    name: 'Anderer Baukasten',
    code: 'Nach «Eigener Code», «Custom Code» oder «HTML einbetten» suchen.',
    button: 'Irgendeinen Knopf mit #sd-book verlinken.',
  },
];

export function IntegrationGuide({ embedUrl, testUrl }: IntegrationGuideProps) {
  const snippetMain = `<script src="${embedUrl}/embed.js" data-sd-no-fab></script>`;
  const snippetAuto = `<script src="${embedUrl}/embed.js"></script>`;
  // Link-Ziel für Schritt 2: bewusst NUR der Anker – ohne Adresse, 1:1 einsetzbar.
  // embed.js fängt jeden Link ab, dessen Ziel auf #sd-book endet.
  const linkAnchor = `#sd-book`;

  return (
    <>
      {/* Hinweis: nur zwei Schritte */}
      <Card>
        <Body>
          <p style={{ ...pStyle, color: 'var(--ink)' }}>
            So kommt der <strong>«Termin buchen»-Knopf</strong> auf deine Website – in nur
            <strong> 2 einfachen Schritten</strong>. Du brauchst dafür <strong>keine Programmier-Kenntnisse</strong>:
            Code einfügen, einen Knopf damit verbinden, fertig.
          </p>
        </Body>
      </Card>

      {/* Schritt 1 */}
      <Card style={{ marginTop: 20 }}>
        <CardHeader>
          <div>
            <h3>
              <StepNumber n={1} /> Den Code einfügen
              <span style={{ color: 'var(--ink-3)', fontWeight: 400 }}>· nur einmal</span>
            </h3>
            <div className="sub">Einmal machen – danach klappt es auf der ganzen Website.</div>
          </div>
        </CardHeader>
        <Body>
          <p style={pStyle}>
            Fast jede Website hat einen Platz für <strong>«eigenen Code»</strong> (oft auch
            <strong> «Custom Code»</strong> oder <strong>«HTML einbetten»</strong> genannt). Füge diesen Code dort ein
            und speichere. Wo das bei deinem Anbieter ist, steht gleich unten.
          </p>
          <CodeBlock code={snippetMain} label="Code zum Einfügen" />
          <p style={noteStyle}>
            👉 Einfach <strong>so kopieren und einfügen</strong> – du musst <strong>nichts daran ändern</strong>.
          </p>
        </Body>
      </Card>

      {/* Schritt 2 */}
      <Card style={{ marginTop: 20 }}>
        <CardHeader>
          <div>
            <h3>
              <StepNumber n={2} /> Den Knopf verbinden
            </h3>
            <div className="sub">Damit beim Klick das Buchungsfenster aufgeht.</div>
          </div>
        </CardHeader>
        <Body>
          <p style={pStyle}>
            Mach auf deiner Website einen Knopf an die gewünschte Stelle – oder nimm einen, den du schon hast.
            Trag bei diesem Knopf als <strong>Verlinkung</strong> genau das hier ein:
          </p>
          <CodeBlock code={linkAnchor} label="Das hier beim Knopf als Link eintragen" />
          <p style={noteStyle}>
            Speichern – <strong>fertig!</strong> Beim Klick auf den Knopf öffnet sich das Buchungsfenster.
            Wähle beim Verlinken am besten <strong>«im selben Fenster öffnen»</strong>.
          </p>
          <p style={noteStyle}>Du kannst beliebig viele solche Knöpfe machen – alle öffnen dasselbe Fenster.</p>
        </Body>
      </Card>

      {/* Wo finde ich das? – pro Baukasten */}
      <Card style={{ marginTop: 20 }}>
        <CardHeader>
          <div>
            <h3>Wo finde ich das bei meinem Anbieter?</h3>
            <div className="sub">Such dir deinen Anbieter heraus – hier steht, wo der Code hinkommt und wie du den Knopf verbindest.</div>
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
                  <span style={{ fontWeight: 600, color: 'var(--accent-ink)' }}>1. Code einfügen:</span> {b.code}
                </div>
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--accent-ink)' }}>2. Knopf verbinden:</span> {b.button}
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
            <h3>Ausprobieren</h3>
            <div className="sub">So sieht es am Ende aus.</div>
          </div>
        </CardHeader>
        <Body>
          <p style={pStyle}>Hier kannst du es selbst anschauen – eine fertige Beispiel-Seite mit genau so einem Knopf:</p>
          <div>
            <a href={testUrl} target="_blank" rel="noreferrer" className="btn btn-primary" style={{ textDecoration: 'none' }}>
              Beispiel-Seite öffnen ↗
            </a>
          </div>
        </Body>
      </Card>

      {/* Alternative */}
      <Card style={{ marginTop: 20 }}>
        <CardHeader>
          <div>
            <h3>Noch einfacher: Knopf erscheint automatisch</h3>
            <div className="sub">Wenn du gar keinen eigenen Knopf machen willst.</div>
          </div>
        </CardHeader>
        <Body>
          <p style={pStyle}>
            Möchtest du keinen eigenen Knopf bauen? Dann füge in Schritt 1 <strong>diesen Code statt dem oberen</strong> ein –
            dann erscheint der Knopf «Termin buchen» automatisch unten rechts auf jeder Seite. <strong>Schritt 2 fällt dann weg.</strong>
          </p>
          <CodeBlock code={snippetAuto} label="Code für den automatischen Knopf" />
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
            <li>Es funktioniert auf <strong>jeder Website</strong> – es muss vorher <strong>nichts freigeschaltet</strong> werden.</li>
            <li>Manche Anbieter zeigen den Knopf erst auf der <strong>fertig veröffentlichten Seite</strong>, noch nicht in der Vorschau beim Bearbeiten. Das ist normal.</li>
            <li>Bei manchen Anbietern ist der Bereich für «eigenen Code» nur in einem <strong>kostenpflichtigen Tarif</strong> dabei (z. B. Wix, Squarespace).</li>
            <li>Falls dein Anbieter beim Verlinken eine <strong>ganze Adresse</strong> verlangt: schreib einfach deine Website-Adresse davor und <code>#sd-book</code> ans Ende.</li>
          </ul>
        </Body>
      </Card>
    </>
  );
}

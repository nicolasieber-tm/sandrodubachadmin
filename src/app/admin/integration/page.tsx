import { env } from '@/env';
import { IntegrationGuide } from '@/components/admin/integration-guide';

// Admin-Seite «Integration»: Schritt-fuer-Schritt-Anleitung samt fertigem
// Copy-Paste-Snippet, um den Buchungs-Button in eine Website (z. B. Wix)
// einzubauen. Die einzubettende Adresse stammt aus env.APP_URL — dadurch zeigt
// die Beta-Umgebung automatisch die Beta-URL und die Produktion die echte URL.

export default function IntegrationPage() {
  const embedUrl = env.APP_URL.replace(/\/$/, '');
  const testUrl = `${embedUrl}/wix-test.html`;

  return (
    <section>
      <div className="page-head">
        <div>
          <div className="eyebrow">Website-Einbindung</div>
          <h1>Integration</h1>
          <p className="lead">
            So bauen Sie den Buchungs-Button in Ihre Website ein – in nur zwei Schritten, zum Kopieren.
          </p>
        </div>
      </div>

      <IntegrationGuide embedUrl={embedUrl} testUrl={testUrl} />
    </section>
  );
}

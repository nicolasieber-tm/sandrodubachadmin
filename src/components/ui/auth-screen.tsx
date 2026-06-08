import type { ReactNode } from 'react';

/**
 * Gemeinsame Hülle für Login und Setup-2FA: ambient Tiefe-Layer (fixed,
 * pointer-events:none), die „Double-Bezel"-Karte und die Markenzeile.
 * Der eigentliche Inhalt (Eyebrow, Titel, Formular) kommt als children.
 */
export function AuthScreen({
  children,
  label = 'Anmeldung',
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <main className="auth-screen">
      <div className="ambient" aria-hidden="true" />
      <div className="grid-lines" aria-hidden="true" />
      <div className="blob" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      <section className="card-shell reveal" aria-label={label}>
        <div className="card-core">
          <div className="brand-row reveal" style={{ animationDelay: '.10s' }}>
            <div className="monogram" aria-hidden="true">
              SD
            </div>
            <div className="brand-meta">
              <span className="brand-name">Sandro Dubach</span>
              <span className="brand-sub">Fotografie · Verwaltung</span>
            </div>
          </div>
          {children}
        </div>
      </section>

      <p className="page-foot reveal">© 2026 Sandro Dubach · Adminbereich</p>
    </main>
  );
}

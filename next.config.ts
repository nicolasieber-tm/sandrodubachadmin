import type { NextConfig } from 'next';

// Framing-Policy für die öffentliche Buchungsstrecke (/book):
//
// /book ist als einbettbares Widget gedacht und darf STANDARDMÄSSIG von JEDER
// Website per <iframe> eingebettet werden – so funktioniert das Einbettungs-
// Snippet sofort überall (Wix-Editor/Preview, lokale Test-Datei via file://,
// jede Kunden-Domain), ohne dass zuerst eine Domain freigeschaltet werden muss.
//
// Wer das Einbetten doch auf bestimmte Domains beschränken will, setzt die Env-Var
// ALLOWED_FRAME_ANCESTORS (space-separated Origins, z. B.
// "'self' https://massagepraxis-fh.ch https://*.massagepraxis-fh.ch"). Dann – und NUR
// dann – wird für /book eine CSP `frame-ancestors <wert>` gesetzt. Ohne die Env-Var
// bekommt /book bewusst keinen frame-ancestors-/X-Frame-Options-Header.
//
// Admin- und Auth-Pfade bleiben davon unberührt IMMER framing-gesperrt.

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    const headers = [
      // Admin/Auth: keinerlei Framing (Clickjacking-Schutz). Eigene Pfade, daher
      // kein Pfad-Overlap mit dem optionalen /book-Eintrag.
      { source: '/admin/:path*', headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] },
      { source: '/login', headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] },
    ];

    // Optionale Einschränkung: nur wenn eine Allowlist gesetzt ist, /book darauf
    // begrenzen. Sonst bleibt /book ohne Framing-Header → von überall einbettbar.
    const allowed = process.env.ALLOWED_FRAME_ANCESTORS?.trim();
    if (allowed) {
      headers.push({
        source: '/book',
        headers: [{ key: 'Content-Security-Policy', value: `frame-ancestors ${allowed};` }],
      });
    }

    return headers;
  },
};

export default nextConfig;

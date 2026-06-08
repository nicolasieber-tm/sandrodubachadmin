import type { NextConfig } from 'next';

// Erlaubte iframe-Einbetter für die öffentliche Buchungsstrecke (/book).
// Aus ALLOWED_FRAME_ANCESTORS (space-separated) ableitbar; sonst sinnvoller
// Default für die Hauptwebsite + lokale Entwicklung.
const DEFAULT_FRAME_ANCESTORS =
  "'self' https://sandrodubach.ch https://*.sandrodubach.ch http://localhost:3000";

const frameAncestors = (
  process.env.ALLOWED_FRAME_ANCESTORS ?? DEFAULT_FRAME_ANCESTORS
).trim();

const bookCsp = `frame-ancestors ${frameAncestors};`;

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      // Admin/Auth bleiben strikt: keinerlei Framing. Eigene Pfade, daher
      // überschreibt der /book-Eintrag diese Regeln nicht (kein Pfad-Overlap).
      { source: '/admin/:path*', headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] },
      { source: '/login', headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] },
      { source: '/setup-2fa', headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] },
      // Öffentliche Buchungsstrecke: Framing durch erlaubte Ancestors möglich.
      // Bewusst KEIN X-Frame-Options: DENY, das würde jegliches Framing sperren.
      { source: '/book', headers: [{ key: 'Content-Security-Policy', value: bookCsp }] },
    ];
  },
};

export default nextConfig;

import { describe, it, expect, afterEach } from 'vitest';
import nextConfig from './next.config';

// Regressionstest für die iframe-Framing-Policy der öffentlichen Buchungsstrecke.
// Hintergrund: /book wird als <iframe> auf fremden Websites eingebettet. Eine
// CSP `frame-ancestors`-Allowlist hatte das Overlay auf jeder nicht freigegebenen
// Domain LEER gelassen (Browser blockt das iframe). Standard ist daher: /book ist
// von überall einbettbar; nur mit gesetzter ALLOWED_FRAME_ANCESTORS-Env wird es
// wieder eingeschränkt. Admin/Auth bleiben immer gesperrt.

const ENV_KEY = 'ALLOWED_FRAME_ANCESTORS';

async function findCsp(source: string): Promise<string | undefined> {
  const headers = (await nextConfig.headers?.()) ?? [];
  const entry = headers.find((h) => h.source === source);
  return entry?.headers.find((h) => h.key === 'Content-Security-Policy')?.value;
}

describe('next.config: frame-ancestors-Policy für /book', () => {
  afterEach(() => {
    delete process.env[ENV_KEY];
  });

  it('lässt /book ohne ALLOWED_FRAME_ANCESTORS von überall einbetten (kein CSP-Header)', async () => {
    delete process.env[ENV_KEY];
    expect(await findCsp('/book')).toBeUndefined();
  });

  it('beschränkt /book auf die Allowlist, wenn ALLOWED_FRAME_ANCESTORS gesetzt ist', async () => {
    process.env[ENV_KEY] = "'self' https://sandrodubach.ch";
    expect(await findCsp('/book')).toBe("frame-ancestors 'self' https://sandrodubach.ch;");
  });

  it('sperrt Admin-Pfade unabhängig von der Env-Var komplett gegen Framing', async () => {
    process.env[ENV_KEY] = "'self'";
    expect(await findCsp('/admin/:path*')).toBe("frame-ancestors 'none'");
  });
});

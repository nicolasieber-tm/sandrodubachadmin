import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import path from 'node:path';

config({ path: '.env.local' });

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Server-only-Repos importieren das `server-only`-Marker-Paket. Dessen
      // Standard-Entry wirft beim Import. In Tests (kein React-Server-Bundler)
      // mappen wir es auf die leere Variante des Pakets – analog zur
      // `react-server`-Bedingung, die Next.js zur Laufzeit verwendet.
      'server-only': path.resolve(__dirname, './node_modules/server-only/empty.js'),
    },
  },
  test: { environment: 'node', globals: true },
});

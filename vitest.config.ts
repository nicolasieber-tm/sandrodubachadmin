import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';
import path from 'node:path';

config({ path: '.env.local' });

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'otplib': path.resolve(__dirname, './src/lib/otplib-shim.ts'),
    },
  },
  test: { environment: 'node', globals: true },
});

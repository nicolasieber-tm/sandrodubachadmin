/**
 * Compatibility shim: exposes an `authenticator` object that mirrors the
 * old otplib v11/v12 API using the actual v13 functional API underneath.
 *
 * This file is registered as the `otplib` alias in vitest.config.ts so that
 * test files (and totp.ts in test mode) can `import { authenticator } from 'otplib'`.
 * The shim imports the real v13 module via the bare specifier which will NOT
 * be aliased again because vitest resolves aliases only once per specifier.
 */

// Use a dynamic require to avoid the alias being applied recursively.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const otplib = require('otplib') as {
  generateSecret: () => string;
  generateSync: (opts: { secret: string }) => string;
  generateURI: (opts: { issuer: string; label: string; secret: string }) => string;
  verifySync: (opts: { secret: string; token: string }) => { valid: boolean };
};

export const authenticator = {
  generateSecret(): string {
    return otplib.generateSecret();
  },

  generate(secret: string): string {
    return otplib.generateSync({ secret });
  },

  keyuri(account: string, issuer: string, secret: string): string {
    return otplib.generateURI({ issuer, label: account, secret });
  },

  verify({ token, secret }: { token: string; secret: string }): boolean {
    try {
      const result = otplib.verifySync({ secret, token });
      return result.valid;
    } catch {
      return false;
    }
  },
};

import { describe, it, expect } from 'vitest';
import { generateSync } from 'otplib';
import {
  createTotpSecret, buildOtpAuthUri, verifyTotp,
  generateRecoveryCodes, hashRecoveryCodes, consumeRecoveryCode,
} from './totp';

describe('totp', () => {
  it('verifies a freshly generated token', () => {
    const secret = createTotpSecret();
    const token = generateSync({ secret });
    expect(verifyTotp(secret, token)).toBe(true);
  });

  it('rejects a wrong token', () => {
    const secret = createTotpSecret();
    expect(verifyTotp(secret, '000000')).toBe(false);
  });

  it('builds an otpauth uri containing issuer and account', () => {
    const uri = buildOtpAuthUri('sandro@x.ch', 'SECRET123');
    expect(uri.startsWith('otpauth://totp/')).toBe(true);
    expect(uri).toContain('Sandro%20Dubach');
  });

  it('generates N recovery codes and consumes one exactly once', async () => {
    const codes = generateRecoveryCodes(8);
    expect(codes).toHaveLength(8);
    const hashes = await hashRecoveryCodes(codes);
    const r1 = await consumeRecoveryCode(hashes, codes[0]);
    expect(r1.ok).toBe(true);
    expect(r1.remaining).toHaveLength(7);
    const r2 = await consumeRecoveryCode(r1.remaining, codes[0]);
    expect(r2.ok).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password', () => {
  it('verifies a correct password against its hash', async () => {
    const hash = await hashPassword('s3cret-pw!');
    expect(await verifyPassword(hash, 's3cret-pw!')).toBe(true);
  });
  it('rejects a wrong password', async () => {
    const hash = await hashPassword('s3cret-pw!');
    expect(await verifyPassword(hash, 'wrong')).toBe(false);
  });
  it('produces different hashes for the same password (random salt)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
  });
});

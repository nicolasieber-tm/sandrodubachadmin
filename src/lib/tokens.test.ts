import { describe, it, expect } from 'vitest';
import { generateToken, sha256Hex } from './tokens';

describe('tokens', () => {
  it('generates unique high-entropy tokens', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(24);
  });
  it('hashes deterministically', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).not.toBe(sha256Hex('abd'));
    expect(sha256Hex('abc')).toMatch(/^[a-f0-9]{64}$/);
  });
});

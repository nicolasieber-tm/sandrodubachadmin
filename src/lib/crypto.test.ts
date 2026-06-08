import { describe, it, expect, beforeAll } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptSecret, decryptSecret } from './crypto';

describe('crypto (AES-256-GCM)', () => {
  beforeAll(() => {
    // Gueltiger 32-Byte-Testschluessel als base64.
    process.env.GOOGLE_TOKEN_ENC_KEY = randomBytes(32).toString('base64');
  });

  it('verschluesselt so, dass das Ergebnis vom Klartext abweicht', () => {
    const plain = 'mein-geheimes-refresh-token';
    const enc = encryptSecret(plain);
    expect(enc).not.toBe(plain);
    expect(enc).not.toContain(plain);
  });

  it('round-trip: decrypt(encrypt(x)) === x', () => {
    const plain = 'ya29.A0AeXRPp-Beispiel-Token_äöü-ss';
    expect(decryptSecret(encryptSecret(plain))).toBe(plain);
  });

  it('erzeugt durch zufaelliges IV unterschiedliche Ciphertexte fuer gleichen Klartext', () => {
    const plain = 'gleicher-input';
    expect(encryptSecret(plain)).not.toBe(encryptSecret(plain));
  });

  it('wirft bei manipuliertem Ciphertext', () => {
    const enc = encryptSecret('unversehrt');
    const data = Buffer.from(enc, 'base64');
    // Letztes Byte (Teil des Ciphertexts) kippen.
    data[data.length - 1] ^= 0xff;
    const tampered = data.toString('base64');
    expect(() => decryptSecret(tampered)).toThrow();
  });
});

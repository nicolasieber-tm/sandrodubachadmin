import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM. Format der base64-kodierten Nutzlast:
//   iv(12B) + authTag(16B) + ciphertext
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

/**
 * Liest den Verschluesselungsschluessel aus der Umgebung.
 * Wirft ERST beim Aufruf (nicht beim Import), damit App und /admin/kalender
 * ohne gesetzte Google-Env-Variablen normal laufen.
 */
function getKey(): Buffer {
  const raw = process.env.GOOGLE_TOKEN_ENC_KEY;
  if (!raw) {
    throw new Error(
      'GOOGLE_TOKEN_ENC_KEY ist nicht gesetzt. Erzeuge einen Schluessel via "openssl rand -base64 32".',
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new Error('GOOGLE_TOKEN_ENC_KEY ist kein gueltiges base64.');
  }
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `GOOGLE_TOKEN_ENC_KEY muss 32 Byte gross sein (base64), erhalten: ${key.length} Byte.`,
    );
  }
  return key;
}

/** Verschluesselt Klartext und liefert iv+authTag+ciphertext als base64-String. */
export function encryptSecret(plain: string): string {
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/** Entschluesselt einen mit encryptSecret erzeugten base64-String. */
export function decryptSecret(enc: string): string {
  const key = getKey();
  const data = Buffer.from(enc, 'base64');
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Ungueltiges Ciphertext-Format (zu kurz).');
  }
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  // Wirft bei manipuliertem Ciphertext/AuthTag ("Unsupported state or unable
  // to authenticate data").
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

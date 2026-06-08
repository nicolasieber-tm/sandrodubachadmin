import { randomBytes, createHash } from 'node:crypto';

export function generateToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

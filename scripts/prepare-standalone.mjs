// Next.js 'output: standalone' kopiert .next/static und public NICHT automatisch
// neben den Server. Ohne diese Dateien fehlen auf dem Host CSS/JS/Assets.
// Dieses Skript stellt sie idempotent bereit (vor dem Start, z. B. auf Railway).
import { cpSync, existsSync } from 'node:fs';

if (existsSync('.next/static')) {
  cpSync('.next/static', '.next/standalone/.next/static', { recursive: true });
}
if (existsSync('public')) {
  cpSync('public', '.next/standalone/public', { recursive: true });
}

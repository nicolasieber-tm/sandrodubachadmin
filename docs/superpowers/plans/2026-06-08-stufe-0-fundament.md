# Stufe 0 — Fundament & sicherer Admin-Login · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine auf Railway deploybare Next.js-App, in der sich Sandro mit E-Mail + Passwort + TOTP-2FA sicher einloggt, mit dem geschützten Admin-Grundgerüst (Topbar + 4 Tabs als Platzhalter) im „Refined"-Design.

**Architecture:** Eine Next.js-16-App (App Router, `src/`) mit Postgres via Drizzle ORM. Selbst gebaute Session-Auth (Argon2id-Passwörter, DB-Sessions mit gehashtem Cookie-Token, TOTP-2FA). Routenschutz über `proxy.ts` (optimistisch) + autoritativen DB-Session-Check in Server Components/Layouts. Design-System aus dem verbindlichen Prototyp `design-prototypes/04-refined.html` als Tailwind-Theme.

**Tech Stack:** Next.js 16.2, TypeScript 5, Tailwind CSS, Drizzle ORM 0.45 + drizzle-kit, `pg` (node-postgres), `@node-rs/argon2`, `otplib`, `qrcode`, `zod`. Tests: Vitest. Host: Railway (App + Postgres).

**Referenzen:**
- Spec: `docs/superpowers/specs/2026-06-08-sandro-dubach-admin-design.md`
- Design-Referenz (verbindlich für Look & Feel, Tokens, Komponenten): `design-prototypes/04-refined.html`

---

## File Structure (Stufe 0)

```
/ (Repo-Root = Next.js-App)
├── _legacy/                         # alte Demo (index.html, server.js) — Referenz, nicht deployt
├── design-prototypes/              # bleibt: Design-Referenz
├── docs/superpowers/{specs,plans}/ # bleibt
├── drizzle.config.ts               # Drizzle-Konfiguration
├── migrations/                     # generierte SQL-Migrationen
├── next.config.ts                  # output: 'standalone' + CSP-Header
├── proxy.ts                        # optimistischer Routenschutz (/admin)
├── vitest.config.ts
├── package.json
├── .env.local                      # lokale Secrets (gitignored)
├── .env.example                    # Vorlage
└── src/
    ├── env.ts                      # Zod-validierte Umgebungsvariablen
    ├── db/
    │   ├── index.ts                # Drizzle-Client (pg Pool)
    │   └── schema.ts               # admin_users, sessions, audit_log
    ├── lib/
    │   ├── password.ts             # Argon2id hash/verify
    │   ├── password.test.ts
    │   ├── tokens.ts               # sichere Zufallstoken + sha256
    │   ├── tokens.test.ts
    │   ├── session.ts              # createSession/validateSession/invalidateSession
    │   ├── session.test.ts
    │   ├── totp.ts                 # Secret/keyuri/verify + Recovery-Codes
    │   ├── totp.test.ts
    │   └── audit.ts                # audit_log Schreiber
    ├── auth/
    │   ├── actions.ts              # Server Actions: login, verify2fa, logout, setup2fa
    │   └── current-user.ts         # getCurrentUser() für Server Components
    ├── components/ui/              # Button, Card, KpiCard, Badge, Tabs, Topbar, Toast
    ├── app/
    │   ├── layout.tsx              # Root-Layout (Fonts: Inter + Fraunces)
    │   ├── globals.css             # Tailwind + Refined-Tokens (CSS-Variablen)
    │   ├── page.tsx                # Redirect → /admin
    │   ├── login/page.tsx          # Login (Passwort) + 2FA-Schritt
    │   ├── setup-2fa/page.tsx      # Ersteinrichtung TOTP (QR)
    │   └── admin/
    │       ├── layout.tsx          # geschützt: Topbar + Tabs (autoritativer Check)
    │       ├── page.tsx            # Dashboard (Platzhalter)
    │       ├── termine/page.tsx    # Platzhalter
    │       ├── angebote/page.tsx   # Platzhalter
    │       └── kalender/page.tsx   # Platzhalter
    └── scripts/
        └── seed-admin.ts           # ersten Admin aus ENV anlegen
```

---

## Task 1: Branch, Aufräumen & Next.js-Init

**Files:**
- Move: `index.html`, `server.js`, `package.json` → `_legacy/`
- Create: gesamtes Next.js-Gerüst im Root

- [ ] **Step 1: Feature-Branch anlegen**

```bash
git checkout -b feature/stufe-0-fundament
```

- [ ] **Step 2: Alte Demo wegräumen (als Referenz behalten)**

```bash
mkdir -p _legacy
git mv index.html _legacy/index.html
git mv server.js _legacy/server.js
git mv package.json _legacy/package.json
git mv README.md _legacy/README.md
git commit -m "chore: move static demo into _legacy/ before Next.js scaffold"
```

- [ ] **Step 3: Next.js 16 in temporären Ordner scaffolden, dann ins Root mergen**

`create-next-app` verweigert nicht-leere Verzeichnisse, daher Umweg über temp:

```bash
npx create-next-app@latest .nextscaffold \
  --typescript --tailwind --app --src-dir --eslint --import-alias "@/*" --use-npm --yes
# Inhalt (inkl. dotfiles) ins Root verschieben, ohne bestehende Ordner zu überschreiben
rsync -a --exclude='.git' .nextscaffold/ ./
rm -rf .nextscaffold
```

- [ ] **Step 4: `next.config.ts` für Railway + CSP setzen**

Ersetze `next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  async headers() {
    return [
      // Admin darf NIE in einem iframe eingebettet werden
      {
        source: '/admin/:path*',
        headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }],
      },
      { source: '/login', headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] },
      { source: '/setup-2fa', headers: [{ key: 'Content-Security-Policy', value: "frame-ancestors 'none'" }] },
    ];
  },
};

export default nextConfig;
```

- [ ] **Step 5: `package.json` scripts + engines ergänzen**

In `package.json` den `scripts`-Block ergänzen und `engines` setzen:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "node .next/standalone/server.js",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio",
    "seed:admin": "tsx src/scripts/seed-admin.ts"
  },
  "engines": { "node": "22.x" }
}
```

- [ ] **Step 6: Dependencies installieren**

```bash
npm i drizzle-orm pg @node-rs/argon2 otplib qrcode zod
npm i -D drizzle-kit @types/pg @types/qrcode tsx vitest dotenv
```

- [ ] **Step 7: Dev-Server starten und Default-Seite verifizieren**

Run: `npm run dev` → öffne `http://localhost:3000`
Expected: Next.js-Startseite lädt ohne Fehler. Danach Strg-C.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js 16 app (Railway-ready, CSP headers, scripts)"
```

---

## Task 2: Umgebungsvariablen (Zod-validiert)

**Files:**
- Create: `src/env.ts`, `.env.example`, `.env.local`

- [ ] **Step 1: `.env.example` anlegen**

```bash
# .env.example
DATABASE_URL=postgresql://user:pass@localhost:5432/sandro
SESSION_COOKIE_NAME=sd_session
# Seed des ersten Admins:
ADMIN_EMAIL=sandro@example.ch
ADMIN_INITIAL_PASSWORD=change-me-now
APP_URL=http://localhost:3000
```

- [ ] **Step 2: `.env.local` lokal befüllen (gitignored)**

Kopiere `.env.example` → `.env.local` und trage echte lokale Werte ein (lokale Postgres-URL). `.env.local` ist durch das Next.js-`.gitignore` bereits ausgeschlossen — verifizieren.

- [ ] **Step 3: `src/env.ts` mit Zod-Validierung**

```ts
import { z } from 'zod';

const schema = z.object({
  DATABASE_URL: z.string().url(),
  SESSION_COOKIE_NAME: z.string().min(1).default('sd_session'),
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_INITIAL_PASSWORD: z.string().min(8).optional(),
  APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export const env = schema.parse(process.env);
```

- [ ] **Step 4: Commit**

```bash
git add src/env.ts .env.example
git commit -m "feat: zod-validated environment config"
```

---

## Task 3: Datenbank-Schema & Drizzle-Setup

**Files:**
- Create: `drizzle.config.ts`, `src/db/index.ts`, `src/db/schema.ts`

- [ ] **Step 1: `drizzle.config.ts`**

```ts
import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './migrations',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 2: `src/db/index.ts` (pg Pool + SSL für Railway)**

```ts
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });
```

- [ ] **Step 3: `src/db/schema.ts` (Auth-Tabellen)**

```ts
import { pgTable, uuid, text, timestamp, boolean, jsonb, inet } from 'drizzle-orm/pg-core';

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  totpSecret: text('totp_secret'),            // null bis 2FA eingerichtet
  totpEnabled: boolean('totp_enabled').notNull().default(false),
  recoveryCodes: text('recovery_codes').array().notNull().default([]), // argon2-Hashes, single-use
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});

export const sessions = pgTable('sessions', {
  // id = sha256(token); der rohe Token steht nur im Cookie
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => adminUsers.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  userAgent: text('user_agent'),
  ip: inet('ip'),
});

export const auditLog = pgTable('audit_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  actor: uuid('actor'),                        // null = System
  action: text('action').notNull(),
  entity: text('entity'),
  entityId: text('entity_id'),
  meta: jsonb('meta'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AdminUser = typeof adminUsers.$inferSelect;
export type Session = typeof sessions.$inferSelect;
```

- [ ] **Step 4: Migration generieren**

Run: `npm run db:generate`
Expected: Neue SQL-Datei unter `migrations/` mit `CREATE TABLE admin_users / sessions / audit_log`.

- [ ] **Step 5: Lokale Postgres-DB migrieren**

Run: `npm run db:migrate`
Expected: Tabellen werden in der lokalen DB angelegt (keine Fehler). *(Voraussetzung: lokale Postgres läuft und `DATABASE_URL` in `.env.local` zeigt darauf. Falls keine lokale Postgres vorhanden: `docker run --name sd-pg -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=sandro -p 5432:5432 -d postgres:16`.)*

- [ ] **Step 6: Commit**

```bash
git add drizzle.config.ts src/db/ migrations/
git commit -m "feat: drizzle setup + auth schema (admin_users, sessions, audit_log)"
```

---

## Task 4: Passwort-Hashing (TDD)

**Files:**
- Create: `src/lib/password.ts`, `src/lib/password.test.ts`, `vitest.config.ts`

- [ ] **Step 1: `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', globals: true },
});
```

- [ ] **Step 2: Failing test schreiben** (`src/lib/password.test.ts`)

```ts
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
```

- [ ] **Step 3: Test ausführen → fehlschlägt**

Run: `npm test -- password`
Expected: FAIL ("hashPassword is not a function" / Modul fehlt).

- [ ] **Step 4: Implementierung** (`src/lib/password.ts`) — OWASP-2026-Parameter

```ts
import { hash, verify } from '@node-rs/argon2';

// OWASP 2026: Argon2id, m=64 MiB, t=3, p=1
const OPTS = { memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

export async function hashPassword(password: string): Promise<string> {
  return hash(password, OPTS);
}

export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
```

- [ ] **Step 5: Test ausführen → grün**

Run: `npm test -- password`
Expected: PASS (3 Tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/password.ts src/lib/password.test.ts vitest.config.ts
git commit -m "feat: argon2id password hashing (TDD)"
```

---

## Task 5: Sichere Tokens & Hashing (TDD)

**Files:**
- Create: `src/lib/tokens.ts`, `src/lib/tokens.test.ts`

- [ ] **Step 1: Failing test** (`src/lib/tokens.test.ts`)

```ts
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
```

- [ ] **Step 2: Test → fehlschlägt**

Run: `npm test -- tokens`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung** (`src/lib/tokens.ts`)

```ts
import { randomBytes, createHash } from 'node:crypto';

// URL-sicherer Base32-ähnlicher Token (ohne Padding/Sonderzeichen)
export function generateToken(bytes = 24): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}
```

- [ ] **Step 4: Test → grün**

Run: `npm test -- tokens`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tokens.ts src/lib/tokens.test.ts
git commit -m "feat: secure token generation + sha256 helper (TDD)"
```

---

## Task 6: Session-Modul (TDD)

**Files:**
- Create: `src/lib/session.ts`, `src/lib/session.test.ts`

Sessions: Der rohe Token geht ins Cookie; in der DB liegt nur `sha256(token)` als `id`. So ist ein DB-Leak allein wertlos.

- [ ] **Step 1: Failing test** (`src/lib/session.test.ts`)

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@/db';
import { adminUsers, sessions } from '@/db/schema';
import { hashPassword } from './password';
import { createSession, validateSessionToken, invalidateSession } from './session';

async function makeUser() {
  const [u] = await db.insert(adminUsers)
    .values({ email: `t${Date.now()}@x.ch`, passwordHash: await hashPassword('pw12345') })
    .returning();
  return u;
}

describe('session', () => {
  beforeEach(async () => { await db.delete(sessions); });

  it('creates a session and validates its token', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    const result = await validateSessionToken(token);
    expect(result?.user.id).toBe(u.id);
  });

  it('returns null for an invalid token', async () => {
    expect(await validateSessionToken('nope')).toBeNull();
  });

  it('invalidates a session', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    await invalidateSession(token);
    expect(await validateSessionToken(token)).toBeNull();
  });

  it('rejects an expired session', async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id, -1000); // bereits abgelaufen
    expect(await validateSessionToken(token)).toBeNull();
  });
});
```

- [ ] **Step 2: Test → fehlschlägt**

Run: `npm test -- session`
Expected: FAIL (Modul fehlt). *(Test nutzt die lokale DB aus Task 3.)*

- [ ] **Step 3: Implementierung** (`src/lib/session.ts`)

```ts
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { sessions, adminUsers, type AdminUser, type Session } from '@/db/schema';
import { generateToken, sha256Hex } from './tokens';

const DEFAULT_TTL_MS = 1000 * 60 * 60 * 24; // 24h

export async function createSession(userId: string, ttlMs = DEFAULT_TTL_MS) {
  const token = generateToken();
  const id = sha256Hex(token);
  const expiresAt = new Date(Date.now() + ttlMs);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { token, expiresAt };
}

export async function validateSessionToken(
  token: string,
): Promise<{ session: Session; user: AdminUser } | null> {
  const id = sha256Hex(token);
  const row = await db
    .select({ session: sessions, user: adminUsers })
    .from(sessions)
    .innerJoin(adminUsers, eq(sessions.userId, adminUsers.id))
    .where(eq(sessions.id, id))
    .limit(1);
  const found = row[0];
  if (!found) return null;
  if (found.session.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  return found;
}

export async function invalidateSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, sha256Hex(token)));
}

export async function invalidateAllForUser(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}
```

- [ ] **Step 4: Test → grün**

Run: `npm test -- session`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/session.ts src/lib/session.test.ts
git commit -m "feat: DB-backed sessions with hashed cookie token (TDD)"
```

---

## Task 7: TOTP-2FA & Recovery-Codes (TDD)

**Files:**
- Create: `src/lib/totp.ts`, `src/lib/totp.test.ts`

Korrekte `otplib`-API: `authenticator.generateSecret()`, `authenticator.keyuri()`, `authenticator.verify()`, `authenticator.generate()` (für Tests).

- [ ] **Step 1: Failing test** (`src/lib/totp.test.ts`)

```ts
import { describe, it, expect } from 'vitest';
import { authenticator } from 'otplib';
import {
  createTotpSecret, buildOtpAuthUri, verifyTotp,
  generateRecoveryCodes, hashRecoveryCodes, consumeRecoveryCode,
} from './totp';

describe('totp', () => {
  it('verifies a freshly generated token', () => {
    const secret = createTotpSecret();
    const token = authenticator.generate(secret);
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
    expect(r2.ok).toBe(false); // schon verbraucht
  });
});
```

- [ ] **Step 2: Test → fehlschlägt**

Run: `npm test -- totp`
Expected: FAIL (Modul fehlt).

- [ ] **Step 3: Implementierung** (`src/lib/totp.ts`)

```ts
import { authenticator } from 'otplib';
import { hash, verify } from '@node-rs/argon2';
import { randomBytes } from 'node:crypto';

const ISSUER = 'Sandro Dubach Admin';

export function createTotpSecret(): string {
  return authenticator.generateSecret(); // Base32
}

export function buildOtpAuthUri(account: string, secret: string): string {
  return authenticator.keyuri(account, ISSUER, secret);
}

export function verifyTotp(secret: string, token: string): boolean {
  try {
    return authenticator.verify({ token: token.trim(), secret });
  } catch {
    return false;
  }
}

export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => {
    const hex = randomBytes(5).toString('hex').toUpperCase(); // 10 Zeichen
    return `${hex.slice(0, 5)}-${hex.slice(5)}`;
  });
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => hash(c)));
}

// Prüft den Code gegen alle Hashes; bei Treffer wird dieser Hash entfernt (single-use)
export async function consumeRecoveryCode(
  hashes: string[],
  code: string,
): Promise<{ ok: boolean; remaining: string[] }> {
  for (let i = 0; i < hashes.length; i++) {
    if (await verify(hashes[i], code.trim().toUpperCase())) {
      return { ok: true, remaining: [...hashes.slice(0, i), ...hashes.slice(i + 1)] };
    }
  }
  return { ok: false, remaining: hashes };
}
```

- [ ] **Step 4: Test → grün**

Run: `npm test -- totp`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/totp.ts src/lib/totp.test.ts
git commit -m "feat: TOTP 2FA + single-use recovery codes (TDD)"
```

---

## Task 8: Audit-Log-Helfer

**Files:**
- Create: `src/lib/audit.ts`

- [ ] **Step 1: Implementierung** (`src/lib/audit.ts`)

```ts
import { db } from '@/db';
import { auditLog } from '@/db/schema';

export async function logAudit(params: {
  actor?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}) {
  await db.insert(auditLog).values({
    actor: params.actor ?? null,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    meta: params.meta ?? null,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/audit.ts
git commit -m "feat: audit log writer"
```

---

## Task 9: Auth Server Actions + Session-Cookie

**Files:**
- Create: `src/auth/actions.ts`, `src/auth/current-user.ts`

Cookie-Strategie: httpOnly, Secure (prod), SameSite=Lax (Admin ist nie im iframe). Login-Flow: Passwort prüfen → wenn `totpEnabled` Zwischenschritt 2FA, sonst weiter zu `/setup-2fa`.

- [ ] **Step 1: `src/auth/current-user.ts` (autoritativer Check)**

```ts
import { cookies } from 'next/headers';
import { env } from '@/env';
import { validateSessionToken } from '@/lib/session';

export async function getCurrentUser() {
  const store = await cookies();
  const token = store.get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  const res = await validateSessionToken(token);
  return res?.user ?? null;
}
```

- [ ] **Step 2: `src/auth/actions.ts`**

```ts
'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminUsers } from '@/db/schema';
import { env } from '@/env';
import { verifyPassword } from '@/lib/password';
import { verifyTotp, consumeRecoveryCode } from '@/lib/totp';
import {
  createSession, invalidateSession, invalidateAllForUser, validateSessionToken,
} from '@/lib/session';
import { logAudit } from '@/lib/audit';

const COOKIE = env.SESSION_COOKIE_NAME;
const secure = process.env.NODE_ENV === 'production';

async function setSessionCookie(userId: string) {
  // alte Session rotieren
  const store = await cookies();
  const old = store.get(COOKIE)?.value;
  if (old) await invalidateSession(old);
  const { token, expiresAt } = await createSession(userId);
  store.set(COOKIE, token, {
    httpOnly: true, secure, sameSite: 'lax', path: '/', expires: expiresAt,
  });
}

// Schritt 1: Passwort. Gibt Status zurück, ob 2FA nötig / Setup nötig ist.
export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  const user = (await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1))[0];
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    await logAudit({ action: 'login.fail', meta: { email } });
    return { error: 'E-Mail oder Passwort ist falsch.' };
  }

  if (!user.totpEnabled) {
    // 2FA noch nicht eingerichtet → kurzlebige Session, dann Setup erzwingen
    await setSessionCookie(user.id);
    redirect('/setup-2fa');
  }

  // 2FA nötig → pending-Cookie (nur userId, 5 min)
  const store = await cookies();
  store.set('sd_2fa_pending', user.id, {
    httpOnly: true, secure, sameSite: 'lax', path: '/', maxAge: 300,
  });
  return { needsTotp: true as const };
}

// Schritt 2: TOTP oder Recovery-Code
export async function verify2faAction(_prev: unknown, formData: FormData) {
  const store = await cookies();
  const userId = store.get('sd_2fa_pending')?.value;
  if (!userId) return { error: 'Sitzung abgelaufen, bitte erneut anmelden.' };

  const user = (await db.select().from(adminUsers).where(eq(adminUsers.id, userId)).limit(1))[0];
  if (!user || !user.totpSecret) return { error: 'Konto nicht gefunden.' };

  const token = String(formData.get('token') ?? '');
  const recovery = String(formData.get('recovery') ?? '');

  let ok = false;
  if (token) ok = verifyTotp(user.totpSecret, token);
  if (!ok && recovery) {
    const res = await consumeRecoveryCode(user.recoveryCodes, recovery);
    if (res.ok) {
      ok = true;
      await db.update(adminUsers).set({ recoveryCodes: res.remaining }).where(eq(adminUsers.id, user.id));
    }
  }
  if (!ok) {
    await logAudit({ actor: user.id, action: '2fa.fail' });
    return { error: 'Code ungültig.' };
  }

  store.delete('sd_2fa_pending');
  await db.update(adminUsers).set({ lastLoginAt: new Date() }).where(eq(adminUsers.id, user.id));
  await setSessionCookie(user.id);
  await logAudit({ actor: user.id, action: 'login.success' });
  redirect('/admin');
}

export async function logoutAction() {
  const store = await cookies();
  const token = store.get(COOKIE)?.value;
  if (token) {
    const res = await validateSessionToken(token);
    await invalidateSession(token);
    if (res) await logAudit({ actor: res.user.id, action: 'logout' });
  }
  store.delete(COOKIE);
  redirect('/login');
}
```

- [ ] **Step 3: Build-Check (Typen)**

Run: `npx tsc --noEmit`
Expected: keine Typfehler in `src/auth/`.

- [ ] **Step 4: Commit**

```bash
git add src/auth/
git commit -m "feat: auth server actions (login, 2fa verify, logout) + current-user"
```

---

## Task 10: 2FA-Einrichtung (Server Action + Seite)

**Files:**
- Create: `src/auth/setup-2fa.ts`, `src/app/setup-2fa/page.tsx`

- [ ] **Step 1: `src/auth/setup-2fa.ts`**

```ts
'use server';

import QRCode from 'qrcode';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminUsers } from '@/db/schema';
import { getCurrentUser } from './current-user';
import {
  createTotpSecret, buildOtpAuthUri, verifyTotp,
  generateRecoveryCodes, hashRecoveryCodes,
} from '@/lib/totp';
import { invalidateAllForUser, createSession } from '@/lib/session';
import { logAudit } from '@/lib/audit';

// Erzeugt ein Secret + QR-Code (noch nicht persistiert aktiviert)
export async function startTotpSetup(): Promise<{ secret: string; qr: string } | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const secret = createTotpSecret();
  // Secret vorläufig speichern (enabled bleibt false bis Bestätigung)
  await db.update(adminUsers).set({ totpSecret: secret }).where(eq(adminUsers.id, user.id));
  const uri = buildOtpAuthUri(user.email, secret);
  const qr = await QRCode.toDataURL(uri);
  return { secret, qr };
}

// Bestätigt den ersten Code → aktiviert 2FA, gibt Recovery-Codes EINMALIG zurück
export async function confirmTotpSetup(_prev: unknown, formData: FormData) {
  const user = await getCurrentUser();
  if (!user || !user.totpSecret) return { error: 'Keine Einrichtung aktiv.' };
  const token = String(formData.get('token') ?? '');
  if (!verifyTotp(user.totpSecret, token)) return { error: 'Code stimmt nicht.' };

  const codes = generateRecoveryCodes(8);
  const hashes = await hashRecoveryCodes(codes);
  await db.update(adminUsers)
    .set({ totpEnabled: true, recoveryCodes: hashes })
    .where(eq(adminUsers.id, user.id));
  await logAudit({ actor: user.id, action: '2fa.enabled' });
  return { success: true as const, recoveryCodes: codes };
}
```

- [ ] **Step 2: `src/app/setup-2fa/page.tsx`** (Client-Komponente, QR + Bestätigung)

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startTotpSetup, confirmTotpSetup } from '@/auth/setup-2fa';

export default function Setup2faPage() {
  const router = useRouter();
  const [qr, setQr] = useState<string>();
  const [secret, setSecret] = useState<string>();
  const [codes, setCodes] = useState<string[]>();
  const [error, setError] = useState<string>();

  useEffect(() => { startTotpSetup().then((r) => { if (r) { setQr(r.qr); setSecret(r.secret); } }); }, []);

  if (codes) {
    return (
      <main className="auth-card">
        <h1 className="font-display">2FA aktiviert</h1>
        <p className="mut">Bewahre diese Wiederherstellungs-Codes sicher auf — jeder ist einmal nutzbar.</p>
        <ul className="recovery">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
        <button className="btn btn-primary" onClick={() => router.push('/admin')}>Weiter zum Adminbereich</button>
      </main>
    );
  }

  return (
    <main className="auth-card">
      <h1 className="font-display">Zwei-Faktor einrichten</h1>
      <p className="mut">Scanne den QR-Code mit einer Authenticator-App (z. B. Google Authenticator) und gib den 6-stelligen Code ein.</p>
      {qr ? <img src={qr} alt="QR-Code" width={180} height={180} /> : <p>lädt…</p>}
      {secret && <p className="mut">Manuell: <code>{secret}</code></p>}
      <form action={async (fd) => { const r = await confirmTotpSetup(null, fd); if ('error' in r) setError(r.error); else setCodes(r.recoveryCodes); }}>
        <input name="token" inputMode="numeric" placeholder="123456" autoFocus />
        {error && <p className="err">{error}</p>}
        <button className="btn btn-primary" type="submit">Bestätigen</button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Build-Check**

Run: `npx tsc --noEmit`
Expected: keine Typfehler.

- [ ] **Step 4: Commit**

```bash
git add src/auth/setup-2fa.ts src/app/setup-2fa/
git commit -m "feat: TOTP setup flow (QR + confirm + recovery codes)"
```

---

## Task 11: Routenschutz (proxy.ts) + autoritativer Layout-Check

**Files:**
- Create: `proxy.ts`, `src/app/admin/layout.tsx`, `src/app/page.tsx`

- [ ] **Step 1: `proxy.ts`** (optimistisch — nur Cookie-Präsenz)

```ts
import { NextRequest, NextResponse } from 'next/server';

const COOKIE = process.env.SESSION_COOKIE_NAME ?? 'sd_session';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/admin')) {
    const hasCookie = request.cookies.get(COOKIE)?.value;
    if (!hasCookie) return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*'] };
```

> Hinweis: Next.js 16 nennt diese Datei `proxy.ts` (vormals `middleware.ts`). Falls die installierte Version noch `middleware.ts` erwartet, Datei entsprechend benennen und Export `middleware` statt `proxy` verwenden — Verhalten identisch. Beim Implementieren die Konvention der tatsächlich installierten Next-Version prüfen.

- [ ] **Step 2: `src/app/admin/layout.tsx`** (autoritativer DB-Check + Shell)

```tsx
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/auth/current-user';
import { AdminShell } from '@/components/ui/admin-shell';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!user.totpEnabled) redirect('/setup-2fa');
  return <AdminShell email={user.email}>{children}</AdminShell>;
}
```

- [ ] **Step 3: `src/app/page.tsx`** (Root → Admin)

```tsx
import { redirect } from 'next/navigation';
export default function Home() { redirect('/admin'); }
```

- [ ] **Step 4: Commit**

```bash
git add proxy.ts src/app/admin/layout.tsx src/app/page.tsx
git commit -m "feat: route protection (proxy optimistic + authoritative layout check)"
```

---

## Task 12: Design-System „Refined" (Tokens + Basis-Komponenten)

**Files:**
- Modify: `src/app/globals.css`, `src/app/layout.tsx`
- Create: `src/components/ui/{button,card,kpi-card,badge,tabs,topbar,admin-shell,toast}.tsx`

> **Quelle der Wahrheit für Styles/Tokens:** `design-prototypes/04-refined.html`. Farben, Schatten, Abstände, Komponenten-Optik exakt von dort übernehmen. Unten nur die Tokens + Komponenten-Signaturen; die genauen Tailwind-/CSS-Werte aus dem Prototyp ziehen.

- [ ] **Step 1: Tokens in `globals.css`** (aus Prototyp übernommen)

```css
@import "tailwindcss";

:root{
  --bg:#f4f5f7; --surface:#ffffff; --surface-2:#fafbfc;
  --line:#e6e8ec; --line-strong:#d4d8de;
  --ink:#1a1d22; --ink-2:#5b626c; --ink-3:#8b93a0;
  --accent:#e3712a; --accent-deep:#c75f1f; --accent-soft:#fdf0e7;
  --green:#1f9d57; --amber:#bd8410; --red:#cf4b41; --blue:#3066e0;
  --radius:11px;
  --shadow:0 1px 2px rgba(20,25,35,.05), 0 8px 24px -12px rgba(20,25,35,.14);
}
body{ background:var(--bg); color:var(--ink); font-family:var(--font-inter), system-ui, sans-serif; }
.font-display{ font-family:var(--font-fraunces), Georgia, serif; letter-spacing:-.01em; }
/* weitere Utility-Klassen (.btn, .card, .mut, .err, .auth-card, .recovery) gem. Prototyp 04-refined.html */
```

- [ ] **Step 2: Fonts in `src/app/layout.tsx`** (Inter + Fraunces via `next/font`)

```tsx
import type { Metadata } from 'next';
import { Inter, Fraunces } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const fraunces = Fraunces({ subsets: ['latin'], variable: '--font-fraunces' });

export const metadata: Metadata = { title: 'Sandro Dubach · Adminbereich' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${inter.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Basis-Komponenten anlegen**

Erstelle als typisierte React-Komponenten, Optik exakt nach `04-refined.html`:
- `button.tsx` — Varianten `primary | ghost | danger | sm` (Props: `variant`, `size`).
- `card.tsx` — `Card`, `CardHeader`, `CardBody`.
- `kpi-card.tsx` — Props `{ label, value, sub, accent }`, linker Akzentstreifen.
- `badge.tsx` — Status `neu | bestaetigt | abgesagt | erledigt` (Farben aus Tokens).
- `tabs.tsx` — Client-Komponente, Tabs `Dashboard | Termine | Angebote & Preise | Kalender` mit animiertem Underline, `next/navigation` für aktiven Pfad.
- `topbar.tsx` — SD-Mark, Titel, Avatar, Logout-Button (ruft `logoutAction`).
- `admin-shell.tsx` — `Topbar` + `Tabs` + `<main className="container">{children}</main>`.
- `toast.tsx` — minimaler Toast-Context (`useToast()`), ersetzt `alert()`.

Jede Komponente bekommt einen Smoke-Test (rendert ohne Fehler), z. B. `button.test.tsx`:

```tsx
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { Button } from './button';
describe('Button', () => {
  it('renders its label', () => {
    const { getByText } = render(<Button>Speichern</Button>);
    expect(getByText('Speichern')).toBeTruthy();
  });
});
```

*(Falls `@testing-library/react` + `jsdom` gewünscht: `npm i -D @testing-library/react jsdom` und `vitest.config.ts` um `environment: 'jsdom'` für `*.tsx`-Tests erweitern. Andernfalls Smoke-Tests weglassen und Komponenten visuell in Task 14 prüfen.)*

- [ ] **Step 4: Build-Check**

Run: `npx tsc --noEmit`
Expected: keine Typfehler.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/components/ui/
git commit -m "feat: Refined design system (tokens, fonts, base components)"
```

---

## Task 13: Login-Seite + Admin-Platzhalterseiten

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/admin/page.tsx`, `src/app/admin/termine/page.tsx`, `src/app/admin/angebote/page.tsx`, `src/app/admin/kalender/page.tsx`

- [ ] **Step 1: `src/app/login/page.tsx`** (zweistufig: Passwort → 2FA)

```tsx
'use client';
import { useState } from 'react';
import { loginAction, verify2faAction } from '@/auth/actions';

export default function LoginPage() {
  const [stage, setStage] = useState<'pw' | 'totp'>('pw');
  const [error, setError] = useState<string>();

  return (
    <main className="auth-card">
      <h1 className="font-display">Adminbereich</h1>
      {stage === 'pw' ? (
        <form action={async (fd) => {
          const r = await loginAction(null, fd);
          if (r?.error) setError(r.error);
          if (r && 'needsTotp' in r) { setError(undefined); setStage('totp'); }
        }}>
          <label>E-Mail<input name="email" type="email" autoFocus required /></label>
          <label>Passwort<input name="password" type="password" required /></label>
          {error && <p className="err">{error}</p>}
          <button className="btn btn-primary" type="submit">Anmelden</button>
        </form>
      ) : (
        <form action={async (fd) => { const r = await verify2faAction(null, fd); if (r?.error) setError(r.error); }}>
          <p className="mut">Gib den 6-stelligen Code aus deiner Authenticator-App ein.</p>
          <label>Code<input name="token" inputMode="numeric" autoFocus /></label>
          <details><summary className="mut">Code verloren? Recovery-Code nutzen</summary>
            <input name="recovery" placeholder="XXXXX-XXXXX" /></details>
          {error && <p className="err">{error}</p>}
          <button className="btn btn-primary" type="submit">Bestätigen</button>
        </form>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Vier Admin-Platzhalterseiten**

Je eine simple Server-Komponente mit Seitentitel (Fraunces) + Hinweis „kommt in Stufe N". Beispiel `src/app/admin/page.tsx`:

```tsx
export default function DashboardPage() {
  return (
    <section>
      <h1 className="font-display" style={{ fontSize: 22 }}>Hallo Sandro</h1>
      <p className="mut">Echte Kennzahlen folgen in Stufe 1.</p>
    </section>
  );
}
```

Analog: `termine/page.tsx` („Termine & Buchungen — Stufe 1"), `angebote/page.tsx` („Angebote & Preise — Stufe 2"), `kalender/page.tsx` („Kalender — Stufe 3").

- [ ] **Step 3: Lokaler End-to-End-Durchlauf (manuell)**

Voraussetzung: Seed-Admin existiert (Task 14). Hier nur Build prüfen:
Run: `npm run dev` → `/login` lädt im Refined-Look, `/admin` ohne Cookie leitet auf `/login` um.

- [ ] **Step 4: Commit**

```bash
git add src/app/login/ src/app/admin/
git commit -m "feat: login page (password + 2FA) and admin placeholder tabs"
```

---

## Task 14: Seed-Script (erster Admin)

**Files:**
- Create: `src/scripts/seed-admin.ts`

- [ ] **Step 1: Implementierung**

```ts
import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminUsers } from '@/db/schema';
import { hashPassword } from '@/lib/password';
import { env } from '@/env';

async function main() {
  if (!env.ADMIN_EMAIL || !env.ADMIN_INITIAL_PASSWORD) {
    throw new Error('ADMIN_EMAIL und ADMIN_INITIAL_PASSWORD müssen gesetzt sein.');
  }
  const email = env.ADMIN_EMAIL.toLowerCase();
  const existing = (await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1))[0];
  if (existing) { console.log('Admin existiert bereits:', email); return; }
  await db.insert(adminUsers).values({ email, passwordHash: await hashPassword(env.ADMIN_INITIAL_PASSWORD) });
  console.log('Admin angelegt:', email, '— bitte beim ersten Login 2FA einrichten.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

> Hinweis für `tsx` + Alias `@/*`: ggf. `tsconfig-paths` nötig (`npm i -D tsconfig-paths`) und Script via `tsx --tsconfig tsconfig.json` aufrufen, oder im Script relative Imports verwenden. Beim Implementieren verifizieren, dass `npm run seed:admin` die Aliase auflöst.

- [ ] **Step 2: Seed lokal ausführen & Login testen**

Run: `npm run seed:admin`
Expected: „Admin angelegt: …". Dann `npm run dev`, einloggen → `/setup-2fa` erscheint → QR scannen → Code bestätigen → Recovery-Codes → `/admin` lädt mit Topbar + Tabs.

- [ ] **Step 3: Commit**

```bash
git add src/scripts/seed-admin.ts
git commit -m "feat: seed-admin script (first admin from env)"
```

---

## Task 15: Railway-Deployment

**Files:** keine Code-Änderung; Infrastruktur. (Nutzt die Railway-Skills/CLI.)

- [ ] **Step 1: Railway-Projekt + Postgres anlegen**

Im Railway-Dashboard (oder via CLI `railway init`): neues Projekt, **Postgres-Service** hinzufügen.

- [ ] **Step 2: App-Service aus GitHub-Repo**

Repo auf GitHub pushen (Branch mergen, s. u.), in Railway „Deploy from GitHub repo" → dieses Repo. Railpack erkennt Next.js automatisch.

- [ ] **Step 3: Umgebungsvariablen setzen (App-Service)**

```
DATABASE_URL = ${{ Postgres.DATABASE_URL }}
SESSION_COOKIE_NAME = sd_session
APP_URL = https://<app>.up.railway.app
ADMIN_EMAIL = <sandros-email>
ADMIN_INITIAL_PASSWORD = <starkes-initialpasswort>
NODE_ENV = production
```

- [ ] **Step 4: Migrationen beim Deploy ausführen**

Service → Settings → Deploy → **Pre-deploy command**: `npm run db:migrate`

- [ ] **Step 5: Domain generieren**

Settings → Networking → **Generate Domain**.

- [ ] **Step 6: Ersten Admin in Produktion seeden**

Einmalig via Railway-Shell/`railway run npm run seed:admin` ausführen (oder lokal mit prod-`DATABASE_URL`). Danach `ADMIN_INITIAL_PASSWORD` aus den Variablen entfernen.

- [ ] **Step 7: Smoke-Test in Produktion**

Öffne die Domain → `/login` → einloggen → 2FA einrichten → `/admin` lädt. Verifiziere in den Response-Headern: `Content-Security-Policy: frame-ancestors 'none'` auf `/admin`.

- [ ] **Step 8: Branch mergen**

Nach erfolgreichem Test: PR/Merge nach `main` (siehe Handoff).

---

## Self-Review (gegen die Spec, Stufe 0)

**Spec-Abdeckung Stufe 0:** Railway-App ✓ (Task 15), Postgres+Drizzle+Schema+Migration ✓ (Task 3), Auth Passwort ✓ (Task 4/9), 2FA ✓ (Task 7/10), Session/Cookie+Schutz ✓ (Task 6/9/11), iframe-Sicherheit Admin (`frame-ancestors 'none'`) ✓ (Task 1), Design-System-Grundgerüst „Refined" ✓ (Task 12), Admin-Shell + 4 Tabs ✓ (Task 13), Seed ✓ (Task 14), Deploy-Pipeline ✓ (Task 15). Audit-Log ✓ (Task 8). *Bewusst NICHT in Stufe 0:* echte Demo-Daten/Module, `/book`-iframe + `embed.js` (Stufe 1), Rabatte (Stufe 2), Kalender (Stufe 3).

**Platzhalter-Scan:** Keine „TBD/TODO". Zwei explizit markierte Implementierungs-Verifikationen (proxy.ts-vs-middleware.ts-Namenskonvention der installierten Next-Version; `tsx`+Alias-Auflösung) — bewusst als „beim Implementieren prüfen" gekennzeichnet, kein Code-Loch.

**Typ-Konsistenz:** `hashPassword/verifyPassword`, `generateToken/sha256Hex`, `createSession/validateSessionToken/invalidateSession/invalidateAllForUser`, `createTotpSecret/buildOtpAuthUri/verifyTotp/generateRecoveryCodes/hashRecoveryCodes/consumeRecoveryCode`, `getCurrentUser` — Namen über alle Tasks hinweg konsistent verwendet. Schema-Felder (`totpEnabled`, `totpSecret`, `recoveryCodes`, `passwordHash`) konsistent referenziert.

---

## Execution Handoff

Wird nach Freigabe gewählt (Subagent-Driven empfohlen).

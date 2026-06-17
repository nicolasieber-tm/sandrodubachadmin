# 2FA entfernen & Logo pro Angebot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die 2-Faktor-Authentifizierung komplett aus dem Login entfernen und pro Angebot ein eigenes Logo ermöglichen.

**Architecture:** Teil A macht den Login einstufig (E-Mail/Passwort → Session) und löscht alle TOTP-/Recovery-Bausteine inkl. dreier DB-Spalten und der Pakete `otplib`/`qrcode`. Teil B fügt der `offers`-Tabelle eine nullable Spalte `logoDataUrl` hinzu; das Logo wird client-seitig auf 256 px verkleinert und als WebP-Data-URL gespeichert, mit Fallback auf das bisherige globale Logo.

**Tech Stack:** Next.js 16 (App Router, Server Actions), React 19, Drizzle ORM + Postgres (Railway), Zod v4, Vitest, Tailwind v4 / globales CSS.

**Spec:** `docs/superpowers/specs/2026-06-17-2fa-entfernen-und-logo-pro-angebot-design.md`

---

## Dateiübersicht

**Teil A — 2FA entfernen**
- Löschen: `src/lib/totp.ts`, `src/lib/totp.test.ts`, `src/auth/setup-2fa.ts`, `src/app/setup-2fa/page.tsx`, `src/components/ui/otp-input.tsx`
- Editieren: `src/auth/actions.ts`, `src/app/login/page.tsx`, `src/app/admin/layout.tsx`, `src/db/schema.ts`, `src/app/globals.css`, `src/scripts/reset-admin.ts`, `src/scripts/seed-admin.ts`, `package.json`

**Teil B — Logo pro Angebot**
- Erstellen: `src/components/admin/logo-field.tsx`, `src/offers/offer-input.test.ts`
- Editieren: `src/db/schema.ts`, `src/offers/offer-input.ts`, `src/offers/repository.ts`, `src/offers/actions.ts`, `src/components/admin/offer-form-modal.tsx`, `src/components/book/booking-flow.tsx`

**Abschluss**
- `npm run db:push` (beide Schema-Änderungen) + volle Verifikation

---

# Teil A — 2-Faktor-Authentifizierung entfernen

### Task A1: Login-Action vereinfachen, verify2faAction entfernen

**Files:**
- Modify: `src/auth/actions.ts`

- [ ] **Step 1: Datei komplett durch folgende Fassung ersetzen**

```ts
'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/db';
import { adminUsers } from '@/db/schema';
import { env } from '@/env';
import { safeEqual } from '@/lib/password';
import { validateSessionToken } from '@/lib/session';
import { setSessionCookie, clearSessionCookie } from './session-cookie';
import { logAudit } from '@/lib/audit';

const COOKIE = env.SESSION_COOKIE_NAME;

// Platzhalter fuer das NOT-NULL-Feld passwordHash. Der Login laeuft ueber die
// Umgebungsvariablen (ADMIN_EMAIL/ADMIN_PASSWORD); der DB-Datensatz traegt kein
// echtes Passwort und dient nur als Anker fuer Session-Bindung und Audit.
// Dieser Wert ist KEIN gueltiger Argon2-Hash und kann nie verifiziert werden.
const ENV_MANAGED_MARKER = '__env_managed__';

/**
 * Liefert den DB-Datensatz fuer den per ENV konfigurierten Admin und legt ihn
 * beim ersten Login automatisch an. So bleibt der Session-/Audit-Apparat
 * unveraendert, obwohl das Passwort aus der Umgebung kommt.
 */
async function getOrCreateEnvAdmin(email: string) {
  const existing = (await db.select().from(adminUsers).where(eq(adminUsers.email, email)).limit(1))[0];
  if (existing) return existing;
  const [created] = await db
    .insert(adminUsers)
    .values({ email, passwordHash: ENV_MANAGED_MARKER })
    .returning();
  return created;
}

export async function loginAction(_prev: unknown, formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const password = String(formData.get('password') ?? '');

  const adminEmail = env.ADMIN_EMAIL?.trim().toLowerCase();
  const adminPassword = env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    // Login serverseitig nicht konfiguriert — kein Zugang moeglich.
    await logAudit({ action: 'login.fail', meta: { reason: 'env_missing' } });
    return { error: 'Login ist nicht konfiguriert. Bitte ADMIN_EMAIL und ADMIN_PASSWORD setzen.' };
  }

  // Beide Faktoren immer vergleichen (kein Short-Circuit), damit die Dauer nicht
  // verraet, ob die E-Mail oder das Passwort falsch war.
  const emailOk = safeEqual(email, adminEmail);
  const passOk = safeEqual(password, adminPassword);
  if (!emailOk || !passOk) {
    await logAudit({ action: 'login.fail' });
    return { error: 'E-Mail oder Passwort ist falsch.' };
  }

  const user = await getOrCreateEnvAdmin(adminEmail);
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
    if (res) await logAudit({ actor: res.user.id, action: 'logout' });
  }
  await clearSessionCookie();
  redirect('/login');
}
```

- [ ] **Step 2: Commit**

```bash
git add src/auth/actions.ts
git commit -m "feat(auth): Login einstufig — 2FA-Verify entfernt"
```

---

### Task A2: Login-Page — TOTP-Stage entfernen

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Datei komplett durch folgende Fassung ersetzen**

```tsx
'use client';

import { useState } from 'react';
import { loginAction } from '@/auth/actions';
import { AuthScreen } from '@/components/ui/auth-screen';
import { ArrowIcon, ShieldIcon } from '@/components/ui/auth-icons';

export default function LoginPage() {
  const [error, setError] = useState<string>();
  const [showPw, setShowPw] = useState(false);

  return (
    <AuthScreen label="Anmeldung">
      <span className="eyebrow reveal" style={{ animationDelay: '.16s' }}>
        <span className="dot" />
        Adminbereich
      </span>
      <h1 className="title reveal" style={{ animationDelay: '.20s' }}>
        Willkommen zurück
      </h1>
      <p className="subtitle reveal" style={{ animationDelay: '.24s' }}>
        Melde dich an, um Buchungen, Angebote und Anfragen zu verwalten.
      </p>

      <form
        className="auth-form"
        action={async (fd) => {
          setError(undefined);
          const r = await loginAction(null, fd);
          if (r?.error) setError(r.error);
        }}
      >
        <div className="stack">
          <div className="field reveal" style={{ animationDelay: '.28s' }}>
            <div className="field-top">
              <label className="lbl" htmlFor="email">
                E-Mail
              </label>
            </div>
            <div className="input-wrap">
              <input
                className="input"
                id="email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="username"
                placeholder="sandro@sandrodubach.ch"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="field reveal" style={{ animationDelay: '.32s' }}>
            <div className="field-top">
              <label className="lbl" htmlFor="password">
                Passwort
              </label>
            </div>
            <div className="input-wrap">
              <input
                className="input has-trail"
                id="password"
                name="password"
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="Dein Passwort"
                required
              />
              <button
                type="button"
                className="trail-btn"
                aria-pressed={showPw}
                aria-label={showPw ? 'Passwort verbergen' : 'Passwort anzeigen'}
                onClick={() => setShowPw((s) => !s)}
              >
                {showPw ? 'Verbergen' : 'Anzeigen'}
              </button>
            </div>
          </div>
        </div>

        {error && <p className="err auth-err">{error}</p>}

        <button type="submit" className="auth-submit reveal" style={{ animationDelay: '.36s' }}>
          Anmelden
          <ArrowIcon />
        </button>

        <div className="form-foot reveal" style={{ animationDelay: '.40s' }}>
          <ShieldIcon />
          Verschlüsselte Verbindung · Nur für autorisierte Mitarbeitende.
        </div>
      </form>
    </AuthScreen>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(auth): Login-Seite ohne 2FA-Eingabe"
```

---

### Task A3: Admin-Layout — 2FA-Gate entfernen

**Files:**
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: Die Zeile mit dem 2FA-Redirect entfernen**

Entferne genau diese Zeile (Zeile 9):

```tsx
  if (!user.totpEnabled) redirect('/setup-2fa');
```

Danach lautet der Anfang der Funktion:

```tsx
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return (
    <ToastProvider>
      <AdminShell email={user.email}>{children}</AdminShell>
    </ToastProvider>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/admin/layout.tsx
git commit -m "feat(auth): Admin-Gate ohne 2FA-Pflicht"
```

---

### Task A4: 2FA-Dateien löschen

**Files:**
- Delete: `src/lib/totp.ts`, `src/lib/totp.test.ts`, `src/auth/setup-2fa.ts`, `src/app/setup-2fa/page.tsx`, `src/components/ui/otp-input.tsx`

- [ ] **Step 1: Dateien und das leere Setup-Verzeichnis entfernen**

```bash
git rm src/lib/totp.ts src/lib/totp.test.ts src/auth/setup-2fa.ts src/app/setup-2fa/page.tsx src/components/ui/otp-input.tsx
rmdir src/app/setup-2fa 2>/dev/null || true
```

- [ ] **Step 2: Prüfen, dass keine Importe übrig sind**

Run:
```bash
grep -rnE "lib/totp|auth/setup-2fa|ui/otp-input|OtpInput|verifyTotp|consumeRecoveryCode|startTotpSetup|confirmTotpSetup" src
```
Expected: keine Treffer (leere Ausgabe).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(auth): 2FA-Module entfernt (totp, setup, otp-input)"
```

---

### Task A5: DB-Schema — totp-Spalten aus adminUsers entfernen

**Files:**
- Modify: `src/db/schema.ts:6-15`

- [ ] **Step 1: Die drei totp-Spalten aus `adminUsers` entfernen**

Ersetze den `adminUsers`-Block durch:

```ts
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
});
```

- [ ] **Step 2: Prüfen, dass `boolean` noch benötigt wird (Import-Bereinigung)**

Run:
```bash
grep -nE "boolean\(" src/db/schema.ts | head
```
Expected: weitere Treffer vorhanden (z. B. `active`, `enabled`) → der `boolean`-Import in Zeile 1 bleibt. Falls KEINE Treffer mehr: `boolean` aus dem Import in Zeile 1 entfernen.

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(db): totp-Spalten aus admin_users entfernt"
```

---

### Task A6: Seed-/Reset-Skripte bereinigen

**Files:**
- Modify: `src/scripts/reset-admin.ts:1-2,24`
- Modify: `src/scripts/seed-admin.ts:18`

- [ ] **Step 1: `reset-admin.ts` — Kommentar und `.set(...)` anpassen**

Ersetze Zeile 1–2 (Kommentarkopf):

```ts
// Setzt das Passwort eines Admins zurueck. Erstellt den Admin, falls er noch
// nicht existiert.
```

Ersetze die `.set(...)`-Zeile (Zeile 24):

```ts
    .set({ passwordHash })
```

- [ ] **Step 2: `seed-admin.ts` — 2FA-Hinweis aus der Konsolenausgabe entfernen**

Ersetze Zeile 18:

```ts
  console.log('Admin angelegt:', email);
```

- [ ] **Step 3: Commit**

```bash
git add src/scripts/reset-admin.ts src/scripts/seed-admin.ts
git commit -m "chore(scripts): 2FA-Reste aus admin-skripten entfernt"
```

---

### Task A7: globals.css — 2FA-/OTP-Styles entfernen

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Den zusammenhängenden 2FA-Block entfernen**

Entferne den kompletten Bereich vom Kommentar `/* ----- OTP / 2FA ----- */` (Zeile 777) bis einschliesslich der Regel `.auth-screen .recovery-codes li { ... }` (endet Zeile 945). Das ist ein zusammenhängender Block mit: `.otp-row`, `.otp-cell` (+ `:hover`/`:focus`/`.filled`), `details.recovery` (+ summary/marker/chev), `.recovery-body`, `.recovery-hint`, `.back-row`, `.back-link`, `.qr-frame`, `.secret-line`, `.recovery-codes`. Der nächste Kommentar `/* ----- Fussnote ----- */` (`.page-foot`) bleibt erhalten.

- [ ] **Step 2: OTP-Reste aus den Media-Queries entfernen**

Im `@media (max-width: 768px)`-Block die beiden OTP-Regeln entfernen:

```css
  .auth-screen .otp-row {
    gap: 7px;
  }
  .auth-screen .otp-cell {
    height: 50px;
    font-size: 19px;
  }
```

Den gesamten folgenden `@media (max-width: 360px)`-Block entfernen (er enthält nur `.otp-cell`):

```css
@media (max-width: 360px) {
  .auth-screen .otp-cell {
    height: 46px;
    font-size: 17px;
  }
}
```

- [ ] **Step 3: Kommentar-Kopf bei den Auth-Screens kürzen (Zeile ~422)**

Ersetze im Kommentar `Auth-Screens (Login / Setup-2FA) — „Warm Minimal" (Variante B)` den Teil `(Login / Setup-2FA)` durch `(Login)`.

- [ ] **Step 4: Prüfen, dass keine 2FA-Klassen mehr referenziert werden**

Run:
```bash
grep -nE "otp-cell|otp-row|recovery|qr-frame|secret-line|back-link|back-row" src/app/globals.css src/app/login/page.tsx
```
Expected: keine Treffer.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "style(auth): OTP-/2FA-CSS entfernt"
```

---

### Task A8: Pakete otplib/qrcode entfernen

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Abhängigkeiten entfernen und Lockfile aktualisieren**

Run:
```bash
npm remove otplib qrcode @types/qrcode
```
Expected: `otplib`, `qrcode` verschwinden aus `dependencies`, `@types/qrcode` aus `devDependencies`; `package-lock.json` aktualisiert.

- [ ] **Step 2: Prüfen, dass nichts mehr otplib/qrcode importiert**

Run:
```bash
grep -rnE "from 'otplib'|from \"otplib\"|from 'qrcode'|from \"qrcode\"" src
```
Expected: keine Treffer.

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): otplib/qrcode entfernt"
```

---

# Teil B — Logo pro Angebot

### Task B1: DB-Schema — Spalte logoDataUrl an offers

**Files:**
- Modify: `src/db/schema.ts` (offers-Tabelle)

- [ ] **Step 1: Spalte `logoDataUrl` ergänzen**

Füge in der `offers`-Tabelle direkt nach der `description`-Zeile diese Zeile ein:

```ts
  // Optionales, angebotsspezifisches Logo als Data-URL (Base64, client-seitig
  // auf 256px verkleinert). null = globales Standard-Logo (/sandro-logo.jpg).
  logoDataUrl: text('logo_data_url'),
```

- [ ] **Step 2: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(db): offers.logoDataUrl ergänzt"
```

---

### Task B2: Validierung in offerSchema (TDD)

**Files:**
- Test: `src/offers/offer-input.test.ts` (Create)
- Modify: `src/offers/offer-input.ts`

- [ ] **Step 1: Failing Test schreiben**

Erstelle `src/offers/offer-input.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { offerSchema } from './offer-input';

const base = {
  name: 'Shooting',
  priceChf: 100,
  unit: 'pauschal' as const,
  durationMinutes: 60,
};

describe('offerSchema.logoDataUrl', () => {
  it('akzeptiert eine gültige Bild-Data-URL', () => {
    const r = offerSchema.safeParse({ ...base, logoDataUrl: 'data:image/webp;base64,AAAA' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.logoDataUrl).toBe('data:image/webp;base64,AAAA');
  });

  it('macht aus einem leeren String null', () => {
    const r = offerSchema.safeParse({ ...base, logoDataUrl: '' });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.logoDataUrl).toBeNull();
  });

  it('macht aus einem fehlenden Feld null', () => {
    const r = offerSchema.safeParse({ ...base });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.logoDataUrl).toBeNull();
  });

  it('lehnt eine Nicht-Data-URL ab', () => {
    const r = offerSchema.safeParse({ ...base, logoDataUrl: 'https://example.com/logo.png' });
    expect(r.success).toBe(false);
  });

  it('lehnt eine zu grosse Data-URL ab', () => {
    const big = 'data:image/webp;base64,' + 'A'.repeat(200_001);
    const r = offerSchema.safeParse({ ...base, logoDataUrl: big });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Test ausführen, Fehlschlag bestätigen**

Run:
```bash
npm run test -- src/offers/offer-input.test.ts
```
Expected: FAIL — `logoDataUrl` ist `undefined` (Feld existiert noch nicht), die Asserts auf `null`/`success:false` schlagen fehl.

- [ ] **Step 3: Schema erweitern**

Ergänze in `src/offers/offer-input.ts` im `offerSchema`-Objekt (z. B. direkt vor `active:`) dieses Feld:

```ts
  // Optionales angebotsspezifisches Logo als Data-URL. Leer -> null.
  // Sonst Pflicht: data:image/...;base64,... und max. 200'000 Zeichen
  // (das deckt ein 256px-WebP locker ab und begrenzt die DB-Zeile).
  logoDataUrl: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim())
    .refine(
      (v) =>
        v === '' ||
        (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/.test(v) && v.length <= 200_000),
      { message: 'Logo ist ungültig.' },
    )
    .transform((v) => (v === '' ? null : v)),
```

- [ ] **Step 4: Test ausführen, Erfolg bestätigen**

Run:
```bash
npm run test -- src/offers/offer-input.test.ts
```
Expected: PASS (5 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/offers/offer-input.ts src/offers/offer-input.test.ts
git commit -m "feat(offers): logoDataUrl-Validierung im offerSchema"
```

---

### Task B3: Repository — NewOfferData um logoDataUrl erweitern

**Files:**
- Modify: `src/offers/repository.ts:26-39`

- [ ] **Step 1: Feld im Typ ergänzen**

Füge in den Typ `NewOfferData` (vor `sortOrder?`) ein:

```ts
  logoDataUrl?: string | null;
```

`createOffer` (`db.insert(offers).values(data)`) und `updateOffer` (`set({ ...data, ... })`) übernehmen das Feld automatisch — keine weitere Änderung nötig.

- [ ] **Step 2: Commit**

```bash
git add src/offers/repository.ts
git commit -m "feat(offers): logoDataUrl in NewOfferData"
```

---

### Task B4: Server-Action — logoDataUrl aus FormData lesen und speichern

**Files:**
- Modify: `src/offers/actions.ts:28-39,92-103,136-147`

- [ ] **Step 1: `parseOfferForm` um das Feld erweitern**

Ergänze im Objekt in `parseOfferForm` (nach `active:`) die Zeile:

```ts
    logoDataUrl: formData.get('logoDataUrl') ?? undefined,
```

- [ ] **Step 2: In `createOfferAction` an `createOffer` übergeben**

Ergänze im `createOffer({...})`-Aufruf (nach `active: data.active,`):

```ts
    logoDataUrl: data.logoDataUrl,
```

- [ ] **Step 3: In `updateOfferAction` an `updateOffer` übergeben**

Ergänze im `updateOffer(id, {...})`-Aufruf (nach `active: data.active,`):

```ts
    logoDataUrl: data.logoDataUrl,
```

- [ ] **Step 4: Commit**

```bash
git add src/offers/actions.ts
git commit -m "feat(offers): logoDataUrl in create/update-Action"
```

---

### Task B5: LogoField-Komponente (Upload + Client-Verkleinerung)

**Files:**
- Create: `src/components/admin/logo-field.tsx`

- [ ] **Step 1: Komponente erstellen**

```tsx
'use client';

import { useRef, useState } from 'react';

const MAX_EDGE = 256;
const MAX_LEN = 200_000;
const FALLBACK = '/sandro-logo.jpg';

// Verkleinert das gewählte Bild client-seitig auf max. 256px (längste Kante)
// und liefert eine WebP-Data-URL. Bei Fehlern: null.
async function fileToDataUrl(file: File): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('load failed'));
      el.src = objectUrl;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/webp', 0.9);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function LogoField({ initial }: { initial?: string | null }) {
  const [value, setValue] = useState<string>(initial ?? '');
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(undefined);
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    if (!dataUrl) {
      setError('Bild konnte nicht verarbeitet werden.');
      return;
    }
    if (dataUrl.length > MAX_LEN) {
      setError('Bild ist zu gross. Bitte ein kleineres Logo wählen.');
      return;
    }
    setValue(dataUrl);
  }

  function clear() {
    setValue('');
    setError(undefined);
    if (inputRef.current) inputRef.current.value = '';
  }

  const preview = value || FALLBACK;

  return (
    <div className="field">
      <label htmlFor="logo">Logo</label>
      <input type="hidden" name="logoDataUrl" value={value} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            overflow: 'hidden',
            display: 'grid',
            placeItems: 'center',
            flex: 'none',
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          />
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={inputRef}
            id="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFile}
          />
          {value ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>
              Entfernen
            </button>
          ) : null}
        </div>
      </div>
      <small className="mut">
        Optional. Eigenes Logo für dieses Angebot (wird auf 256&nbsp;px verkleinert).
        Ohne eigenes Logo wird das Standard-Logo angezeigt.
      </small>
      {error ? (
        <p className="mut" role="alert" style={{ color: 'var(--red, #c0392b)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/admin/logo-field.tsx
git commit -m "feat(admin): LogoField mit Client-Verkleinerung"
```

---

### Task B6: LogoField ins Angebots-Formular einbinden

**Files:**
- Modify: `src/components/admin/offer-form-modal.tsx:11-12,184-192`

- [ ] **Step 1: Import ergänzen**

Füge nach den bestehenden Editor-Importen (nach `import { StandardFieldsEditor } from './standard-fields-editor';`) hinzu:

```tsx
import { LogoField } from './logo-field';
```

- [ ] **Step 2: Feld im Formular platzieren**

Füge direkt NACH dem schliessenden `</div>` des Beschreibungs-Feldes (das `<textarea name="description" ...>` enthält) und VOR dem Wegkosten-Feld (`<label htmlFor="travelRuleId">`) ein:

```tsx
            <LogoField initial={offer?.logoDataUrl ?? null} />
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/offer-form-modal.tsx
git commit -m "feat(admin): Logo-Upload im Angebots-Formular"
```

---

### Task B7: Booking-Flow — per-Angebot-Logo rendern

**Files:**
- Modify: `src/components/book/booking-flow.tsx:325-328`

- [ ] **Step 1: Hartkodiertes Logo durch per-Angebot-Logo mit Fallback ersetzen**

Ersetze in `OfferStep` den Badge-Block:

```tsx
          <span className="bookx-offer-badge" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/sandro-logo.jpg" alt="" className="bookx-offer-logo" />
          </span>
```

durch:

```tsx
          <span className="bookx-offer-badge" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={offer.logoDataUrl || '/sandro-logo.jpg'} alt="" className="bookx-offer-logo" />
          </span>
```

- [ ] **Step 2: Commit**

```bash
git add src/components/book/booking-flow.tsx
git commit -m "feat(book): per-Angebot-Logo mit Fallback"
```

---

# Abschluss

### Task C1: Schema pushen & Gesamt-Verifikation

**Files:** keine

- [ ] **Step 1: Schema auf die beta-DB pushen**

Run (im Terminal; drizzle-kit kann interaktiv nach dem Droppen der totp-Spalten fragen — bestätigen):
```bash
npm run db:push
```
Expected: `admin_users` verliert `totp_secret`, `totp_enabled`, `recovery_codes`; `offers` bekommt `logo_data_url` (nullable). „No changes" wäre ein Fehler.

- [ ] **Step 2: Lint**

Run:
```bash
npm run lint
```
Expected: keine Fehler (insbesondere keine ungenutzten Importe, keine Verweise auf gelöschte Module).

- [ ] **Step 3: Tests**

Run:
```bash
npm run test
```
Expected: alle grün (inkl. der neuen `offer-input.test.ts`; die gelöschte `totp.test.ts` taucht nicht mehr auf).

- [ ] **Step 4: Build**

Run:
```bash
npm run build
```
Expected: erfolgreicher Build, keine Type-Fehler.

- [ ] **Step 5: Manuelle Verifikation (dev-Server)**

Run:
```bash
npm run dev
```
Prüfen:
- `/login` → korrekte Credentials → direkt `/admin` (kein 2FA-Schritt). Falsche Credentials → Fehlermeldung.
- `/setup-2fa` → existiert nicht mehr (404).
- `/admin/angebote` → Angebot bearbeiten → Logo hochladen → Vorschau erscheint → speichern.
- `/book` → die Karte des Angebots zeigt das eigene Logo; ein Angebot ohne Logo zeigt das Standard-Logo (`/sandro-logo.jpg`).
- Im Angebot „Entfernen" klicken → speichern → `/book` zeigt wieder das Standard-Logo.

---

## Hinweise zur Ausführung
- Teil A und Teil B sind unabhängig; bei Bedarf kann Teil A allein gemerged werden (dann `db:push` direkt nach Task A5).
- Wir arbeiten auf dem `beta`-Branch; `db:push` betrifft die beta-DB. Beim späteren Merge nach `main` wird `db:push` gegen die Prod-DB dieselben Änderungen anwenden (totp-Spalten droppen, `logo_data_url` ergänzen).

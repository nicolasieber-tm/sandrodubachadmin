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

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
  const [noPending, setNoPending] = useState(false);

  useEffect(() => {
    startTotpSetup().then((r) => {
      if (r) { setQr(r.qr); setSecret(r.secret); } else { setNoPending(true); }
    });
  }, []);

  if (noPending && !codes) {
    return (
      <main className="auth-card">
        <h1 className="font-display">Einrichtung nicht möglich</h1>
        <p className="mut">Es liegt keine aktive Einrichtung vor. Bitte melde dich erneut an.</p>
        <button className="btn btn-primary" onClick={() => router.push('/login')}>Zur Anmeldung</button>
      </main>
    );
  }

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

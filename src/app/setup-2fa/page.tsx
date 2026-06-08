'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { startTotpSetup, confirmTotpSetup } from '@/auth/setup-2fa';
import { AuthScreen } from '@/components/ui/auth-screen';
import { OtpInput } from '@/components/ui/otp-input';
import { ArrowIcon } from '@/components/ui/auth-icons';

export default function Setup2faPage() {
  const router = useRouter();
  const [qr, setQr] = useState<string>();
  const [secret, setSecret] = useState<string>();
  const [codes, setCodes] = useState<string[]>();
  const [error, setError] = useState<string>();
  const [noPending, setNoPending] = useState(false);

  useEffect(() => {
    startTotpSetup().then((r) => {
      if (r) {
        setQr(r.qr);
        setSecret(r.secret);
      } else {
        setNoPending(true);
      }
    });
  }, []);

  if (noPending && !codes) {
    return (
      <AuthScreen label="Einrichtung">
        <span className="eyebrow">
          <span className="dot" />
          Zwei-Faktor
        </span>
        <h1 className="title">Einrichtung nicht möglich</h1>
        <p className="subtitle">
          Es liegt keine aktive Einrichtung vor. Bitte melde dich erneut an.
        </p>
        <button
          type="button"
          className="auth-submit"
          style={{ marginTop: 26 }}
          onClick={() => router.push('/login')}
        >
          Zur Anmeldung
          <ArrowIcon />
        </button>
      </AuthScreen>
    );
  }

  if (codes) {
    return (
      <AuthScreen label="Wiederherstellungs-Codes">
        <span className="eyebrow">
          <span className="dot" />
          Geschützt
        </span>
        <h1 className="title">2FA aktiviert</h1>
        <p className="subtitle">
          Bewahre diese Wiederherstellungs-Codes sicher auf — jeder ist genau einmal nutzbar.
        </p>
        <ul className="recovery-codes">
          {codes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <button
          type="button"
          className="auth-submit"
          style={{ marginTop: 22 }}
          onClick={() => router.push('/admin')}
        >
          Weiter zum Adminbereich
          <ArrowIcon />
        </button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen label="Zwei-Faktor einrichten">
      <span className="eyebrow">
        <span className="dot" />
        Zwei-Faktor
      </span>
      <h1 className="title">Zwei-Faktor einrichten</h1>
      <p className="subtitle">
        Scanne den QR-Code mit einer Authenticator-App (z.B. Google Authenticator) und gib
        anschliessend den 6-stelligen Code ein.
      </p>

      {qr ? (
        <div className="qr-frame reveal">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qr} alt="QR-Code zur Einrichtung der Zwei-Faktor-Authentifizierung" width={176} height={176} />
        </div>
      ) : (
        <p className="subtitle" style={{ marginTop: 18 }}>
          lädt…
        </p>
      )}

      {secret && (
        <p className="secret-line">
          Manuell eingeben: <code>{secret}</code>
        </p>
      )}

      <form
        className="auth-form"
        action={async (fd) => {
          setError(undefined);
          const r = await confirmTotpSetup(null, fd);
          if ('error' in r) setError(r.error);
          else setCodes(r.recoveryCodes);
        }}
      >
        <div className="field">
          <label className="lbl" htmlFor="otp-0">
            Code aus der App
          </label>
          <OtpInput name="token" autoFocus />
        </div>

        {error && <p className="err auth-err">{error}</p>}

        <button type="submit" className="auth-submit">
          Bestätigen
          <ArrowIcon />
        </button>
      </form>
    </AuthScreen>
  );
}

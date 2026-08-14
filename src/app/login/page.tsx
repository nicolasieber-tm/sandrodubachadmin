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
                placeholder="info@massagepraxis-fh.ch"
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

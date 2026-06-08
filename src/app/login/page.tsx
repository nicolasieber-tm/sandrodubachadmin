'use client';

import { useState } from 'react';
import { loginAction, verify2faAction } from '@/auth/actions';
import { AuthScreen } from '@/components/ui/auth-screen';
import { OtpInput } from '@/components/ui/otp-input';
import { ArrowIcon, ArrowLeftIcon, ChevronIcon, ShieldIcon } from '@/components/ui/auth-icons';

export default function LoginPage() {
  const [stage, setStage] = useState<'pw' | 'totp'>('pw');
  const [error, setError] = useState<string>();
  const [showPw, setShowPw] = useState(false);

  if (stage === 'totp') {
    return (
      <AuthScreen label="Bestätigung">
        <span className="eyebrow">
          <span className="dot" />
          Zwei-Faktor
        </span>
        <h1 className="title">Bestätigung</h1>
        <p className="subtitle">
          Gib den 6-stelligen Code aus deiner Authenticator-App ein, um fortzufahren.
        </p>

        <form
          className="auth-form"
          action={async (fd) => {
            setError(undefined);
            const r = await verify2faAction(null, fd);
            if (r?.error) setError(r.error);
          }}
        >
          <div className="field">
            <label className="lbl" htmlFor="otp-0">
              Bestätigungscode
            </label>
            <OtpInput name="token" autoFocus />
          </div>

          {error && <p className="err auth-err">{error}</p>}

          <button type="submit" className="auth-submit">
            Bestätigen
            <ArrowIcon />
          </button>

          <details className="recovery">
            <summary>
              <ChevronIcon />
              Code verloren? Recovery-Code nutzen
            </summary>
            <div className="recovery-body">
              <p className="recovery-hint">
                Gib einen deiner einmaligen Wiederherstellungs-Codes ein, die du bei der
                Einrichtung gespeichert hast.
              </p>
              <label className="sr-only" htmlFor="recovery">
                Recovery-Code
              </label>
              <input
                className="input"
                id="recovery"
                name="recovery"
                type="text"
                autoComplete="off"
                placeholder="z.B. 4f9k-22hd-pl0x"
                spellCheck={false}
              />
            </div>
          </details>

          <div className="back-row">
            <button
              type="button"
              className="back-link"
              onClick={() => {
                setError(undefined);
                setStage('pw');
              }}
            >
              <ArrowLeftIcon />
              Zurück zur Anmeldung
            </button>
          </div>
        </form>
      </AuthScreen>
    );
  }

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
          else if (r && 'needsTotp' in r) setStage('totp');
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

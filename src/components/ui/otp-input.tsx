'use client';

import { useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react';

/**
 * Sechsstelliges Code-Feld mit Auto-Advance, Backspace-Rücksprung,
 * Pfeiltasten-Navigation und Paste-Verteilung. Die Einzelziffern werden in
 * einem versteckten Feld (`name`) zusammengeführt, das das Formular abschickt.
 */
export function OtpInput({
  name = 'token',
  length = 6,
  autoFocus = false,
}: {
  name?: string;
  length?: number;
  autoFocus?: boolean;
}) {
  const [digits, setDigits] = useState<string[]>(() => Array(length).fill(''));
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  function focusCell(i: number) {
    refs.current[i]?.focus();
  }

  function setAt(i: number, value: string) {
    setDigits((prev) => {
      const next = [...prev];
      next[i] = value;
      return next;
    });
  }

  function handleChange(i: number, raw: string) {
    const value = raw.replace(/\D/g, '').slice(0, 1);
    setAt(i, value);
    if (value && i + 1 < length) focusCell(i + 1);
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      setAt(i - 1, '');
      focusCell(i - 1);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      focusCell(i - 1);
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && i + 1 < length) {
      focusCell(i + 1);
      e.preventDefault();
    }
  }

  function handlePaste(i: number, e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const incoming = e.clipboardData
      .getData('text')
      .replace(/\D/g, '')
      .slice(0, length - i)
      .split('');
    if (incoming.length === 0) return;
    setDigits((prev) => {
      const next = [...prev];
      incoming.forEach((d, k) => {
        if (i + k < length) next[i + k] = d;
      });
      return next;
    });
    focusCell(Math.min(i + incoming.length, length - 1));
  }

  return (
    <div className="otp-row" role="group" aria-label="Bestätigungscode">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={i === 0 ? 'otp-0' : undefined}
          className={`otp-cell${d ? ' filled' : ''}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          aria-label={`Ziffer ${i + 1}`}
          value={d}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={(e) => handlePaste(i, e)}
        />
      ))}
      <input type="hidden" name={name} value={digits.join('')} />
    </div>
  );
}

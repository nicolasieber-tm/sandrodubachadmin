import { describe, it, expect } from 'vitest';
import type { OutboundMessage } from './types';
import { buildResendPayload } from './resend-transport';

describe('buildResendPayload', () => {
  const msg: OutboundMessage = {
    to: 'lena@example.ch',
    subject: 'Termin bestätigt',
    text: 'Hallo Lena',
  };

  it('übernimmt to, subject und text aus der Nachricht', () => {
    const payload = buildResendPayload(msg, 'Sandro <buchung@sandrodubach.ch>');

    expect(payload.to).toBe(msg.to);
    expect(payload.subject).toBe(msg.subject);
    expect(payload.text).toBe(msg.text);
  });

  it('setzt den übergebenen Absender als from', () => {
    const from = 'Sandro Dubach Fotografie <buchung@sandrodubach.ch>';
    const payload = buildResendPayload(msg, from);

    expect(payload.from).toBe(from);
  });
});

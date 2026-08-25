import type { NotificationTransport, OutboundMessage } from './types';

// Standard-Absender, falls RESEND_FROM nicht gesetzt ist.
const DEFAULT_FROM = 'Sandro Dubach Fotografie <buchung@sandrodubach.ch>';

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

// Form des JSON-Bodys, den die Resend-API erwartet.
export interface ResendPayload {
  from: string;
  to: string;
  subject: string;
  text: string;
}

/**
 * Baut den Resend-Payload aus einer ausgehenden Nachricht.
 * Reine Hilfsfunktion (ohne Netz) – so bleibt die Payload-Bildung testbar.
 */
export function buildResendPayload(msg: OutboundMessage, from: string): ResendPayload {
  return {
    from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
  };
}

/**
 * Versendet Nachrichten über die Resend REST-API (POST /emails).
 * Nutzt nur fetch(), keine zusätzliche Abhängigkeit.
 *
 * Robustheit: send() wirft NIEMALS. Fehlt der Key, antwortet Resend mit non-2xx
 * oder schlägt das Netz fehl, loggen wir den Fehler via console.error und kehren
 * still zurück – genau wie der logTransport. So scheitern Buchungen nicht, nur
 * weil eine Mail nicht rausgeht.
 */
export const resendTransport: NotificationTransport = {
  async send(msg) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error('[notify] RESEND_API_KEY fehlt – Mail nicht versendet:', msg.subject);
      return;
    }

    const from = process.env.RESEND_FROM || DEFAULT_FROM;

    try {
      const res = await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildResendPayload(msg, from)),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('[notify] Resend-Fehler', res.status, body);
      }
    } catch (err) {
      console.error('[notify] Resend-Versand fehlgeschlagen:', err);
    }
  },
};

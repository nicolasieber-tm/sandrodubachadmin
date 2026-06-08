import type { NotificationTransport } from './types';

/**
 * Schreibt Nachrichten in die Server-Logs statt sie zu versenden.
 * Vorläufiger Standard-Transport, bis der echte Resend-Versand verdrahtet ist.
 */
export const logTransport: NotificationTransport = {
  async send(msg) {
    console.info('[notify]', JSON.stringify(msg));
  },
};

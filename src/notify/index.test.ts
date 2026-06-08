import { describe, it, expect, vi } from 'vitest';
import type { Booking } from '@/db/schema';
import type { NotificationTransport, OutboundMessage } from './types';
import {
  notifyBookingReceived,
  notifyAdminNewBooking,
  notifyBookingConfirmed,
  notifyBookingCancelled,
} from './index';

// Minimal-Booking als Testdouble. Felder, die die Texte nicht lesen, sind
// bewusst plausibel, aber unkritisch belegt.
function makeBooking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    offerId: null,
    offerNameSnapshot: 'Portrait-Shooting',
    customerName: 'Lena Muster',
    customerEmail: 'lena@example.ch',
    customerPhone: '+41 79 000 00 00',
    message: 'Freue mich!',
    requestedDate: '2026-07-01',
    requestedTime: '14:00',
    location: 'Bern',
    priceRappen: 25000,
    status: 'neu',
    source: 'iframe',
    discountId: null,
    googleEventId: null,
    createdAt: new Date('2026-06-08T10:00:00Z'),
    decidedAt: null,
    ...overrides,
  };
}

// Sammelnder Transport zum Injizieren.
function captureTransport(): { transport: NotificationTransport; sent: OutboundMessage[] } {
  const sent: OutboundMessage[] = [];
  return {
    sent,
    transport: {
      async send(msg) {
        sent.push(msg);
      },
    },
  };
}

describe('notifyBookingReceived', () => {
  it('sendet an die Kunden-E-Mail mit nichtleerem Betreff', async () => {
    const { transport, sent } = captureTransport();
    const b = makeBooking();

    await notifyBookingReceived(b, transport);

    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe(b.customerEmail);
    expect(sent[0].subject.length).toBeGreaterThan(0);
    expect(sent[0].text).toContain(b.offerNameSnapshot);
  });

  it('nutzt den Standard-Transport (console.info) ohne injizierten Transport', async () => {
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {});
    try {
      await notifyBookingReceived(makeBooking());
      expect(spy).toHaveBeenCalledWith('[notify]', expect.any(String));
    } finally {
      spy.mockRestore();
    }
  });
});

describe('notifyAdminNewBooking', () => {
  it('sendet an die Admin-Adresse mit Angebotsname im Betreff', async () => {
    const { transport, sent } = captureTransport();
    const b = makeBooking();

    await notifyAdminNewBooking(b, transport);

    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain(b.offerNameSnapshot);
    expect(sent[0].to).not.toBe('');
    expect(sent[0].text).toContain(b.customerEmail);
  });
});

describe('notifyBookingConfirmed / notifyBookingCancelled', () => {
  it('Bestätigung geht an die Kundin mit Betreff "Termin bestätigt"', async () => {
    const { transport, sent } = captureTransport();
    const b = makeBooking({ status: 'bestaetigt' });

    await notifyBookingConfirmed(b, transport);

    expect(sent[0].to).toBe(b.customerEmail);
    expect(sent[0].subject).toBe('Termin bestätigt');
  });

  it('Absage geht an die Kundin mit Betreff "Termin abgesagt"', async () => {
    const { transport, sent } = captureTransport();
    const b = makeBooking({ status: 'abgesagt' });

    await notifyBookingCancelled(b, transport);

    expect(sent[0].to).toBe(b.customerEmail);
    expect(sent[0].subject).toBe('Termin abgesagt');
  });
});

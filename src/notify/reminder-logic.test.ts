import { describe, it, expect } from 'vitest';
import { isReminderDue, zurichWallTimeToInstant } from './reminder-logic';
import type { Booking } from '@/db/schema';

// Tests fuer die REINE Reminder-Logik (kein DB/Netz noetig).

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b-1',
    offerId: 'o-1',
    offerNameSnapshot: 'Fotoshooting',
    customerName: 'Lena Muster',
    customerEmail: 'lena@example.ch',
    customerPhone: '079 123 45 67',
    message: null,
    requestedDate: '2026-06-12',
    requestedTime: '10:00',
    location: null,
    priceRappen: 25000,
    status: 'bestaetigt',
    source: 'iframe',
    discountId: null,
    customFields: [],
    googleEventId: null,
    googleCalendarId: null,
    reminderSentAt: null,
    travelCostRappen: 0,
    extraMinutes: 0,
    createdAt: new Date('2026-06-01T08:00:00Z'),
    decidedAt: new Date('2026-06-02T08:00:00Z'),
    ...overrides,
  };
}

describe('zurichWallTimeToInstant', () => {
  it('rechnet Sommerzeit (UTC+2) korrekt: 10:00 Zuerich = 08:00 UTC', () => {
    const inst = zurichWallTimeToInstant('2026-06-12', '10:00');
    expect(inst?.toISOString()).toBe('2026-06-12T08:00:00.000Z');
  });

  it('rechnet Winterzeit (UTC+1) korrekt: 10:00 Zuerich = 09:00 UTC', () => {
    const inst = zurichWallTimeToInstant('2026-01-15', '10:00');
    expect(inst?.toISOString()).toBe('2026-01-15T09:00:00.000Z');
  });

  it('liefert null bei fehlender/ungueltiger Zeit', () => {
    expect(zurichWallTimeToInstant('2026-06-12', '')).toBeNull();
    expect(zurichWallTimeToInstant('2026-06-12', '99:99')).toBeNull();
    expect(zurichWallTimeToInstant('kaputt', '10:00')).toBeNull();
  });
});

describe('isReminderDue', () => {
  // Bezug: Termin am 2026-06-12 10:00 Zuerich (= 08:00 UTC, Sommerzeit).
  const APPOINTMENT_UTC = '2026-06-12T08:00:00Z';

  it('faellig: Termin in 47h (innerhalb 48h-Fenster, noch nicht vorbei)', () => {
    const now = new Date('2026-06-10T09:00:00Z'); // 47h vorher
    expect(isReminderDue(booking(), now)).toBe(true);
  });

  it('nicht faellig: Termin in 49h (ausserhalb 48h-Fenster)', () => {
    const now = new Date('2026-06-10T07:00:00Z'); // 49h vorher
    expect(isReminderDue(booking(), now)).toBe(false);
  });

  it('faellig: exakt an der 48h-Grenze (<= 48h zaehlt)', () => {
    const now = new Date('2026-06-10T08:00:00Z'); // exakt 48h vorher
    expect(isReminderDue(booking(), now)).toBe(true);
  });

  it('nicht faellig: Termin liegt in der Vergangenheit', () => {
    const now = new Date('2026-06-12T09:00:00Z'); // 1h nach Termin
    expect(isReminderDue(booking(), now)).toBe(false);
  });

  it('nicht faellig: Termin liegt exakt jetzt (diff == 0, nicht mehr in Zukunft)', () => {
    const now = new Date(APPOINTMENT_UTC);
    expect(isReminderDue(booking(), now)).toBe(false);
  });

  it('nicht faellig: Buchung ohne Uhrzeit (Ganztags)', () => {
    const now = new Date('2026-06-10T09:00:00Z');
    expect(isReminderDue(booking({ requestedTime: '' }), now)).toBe(false);
  });

  it('nicht faellig: Status ist nicht bestaetigt', () => {
    const now = new Date('2026-06-10T09:00:00Z');
    expect(isReminderDue(booking({ status: 'neu' }), now)).toBe(false);
    expect(isReminderDue(booking({ status: 'abgesagt' }), now)).toBe(false);
    expect(isReminderDue(booking({ status: 'erledigt' }), now)).toBe(false);
  });

  it('nicht faellig: Reminder wurde bereits versendet', () => {
    const now = new Date('2026-06-10T09:00:00Z');
    expect(
      isReminderDue(booking({ reminderSentAt: new Date('2026-06-10T08:30:00Z') }), now),
    ).toBe(false);
  });
});

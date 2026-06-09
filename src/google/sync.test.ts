import { describe, it, expect } from 'vitest';
import { buildEventPayload, eventsToBusyIntervals } from './sync';
import type { Booking } from '@/db/schema';
import type { GoogleEvent } from './client';

// Tests fuer die REINEN Funktionen aus sync.ts (kein DB/Netz noetig).

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: 'b-1',
    offerId: 'o-1',
    offerNameSnapshot: 'Fotoshooting',
    customerName: 'Lena Muster',
    customerEmail: 'lena@example.ch',
    customerPhone: '079 123 45 67',
    message: null,
    requestedDate: '2026-06-10',
    requestedTime: '10:00',
    location: null,
    priceRappen: 25000,
    status: 'bestaetigt',
    source: 'iframe',
    discountId: null,
    googleEventId: null,
    googleCalendarId: null,
    createdAt: new Date('2026-06-01T08:00:00Z'),
    decidedAt: new Date('2026-06-02T08:00:00Z'),
    ...overrides,
  };
}

describe('buildEventPayload', () => {
  it('baut ein getaktetes Event mit start/end (dateTime + Zone) bei requestedTime', () => {
    const payload = buildEventPayload(booking(), 90);

    expect(payload.summary).toBe('Lena Muster — Fotoshooting');
    expect(payload.start).toEqual({ dateTime: '2026-06-10T10:00:00', timeZone: 'Europe/Zurich' });
    expect(payload.end).toEqual({ dateTime: '2026-06-10T11:30:00', timeZone: 'Europe/Zurich' });
    // Kontaktangaben in der Beschreibung.
    expect(payload.description).toContain('E-Mail: lena@example.ch');
    expect(payload.description).toContain('Telefon: 079 123 45 67');
  });

  it('nutzt die Default-Dauer von 60 Minuten', () => {
    const payload = buildEventPayload(booking({ requestedTime: '14:15' }));
    expect(payload.start).toEqual({ dateTime: '2026-06-10T14:15:00', timeZone: 'Europe/Zurich' });
    expect(payload.end).toEqual({ dateTime: '2026-06-10T15:15:00', timeZone: 'Europe/Zurich' });
  });

  it('nimmt die Nachricht in die Beschreibung auf, wenn vorhanden', () => {
    const payload = buildEventPayload(booking({ message: 'Bitte draussen fotografieren.' }));
    expect(payload.description).toContain('Bitte draussen fotografieren.');
  });

  it('laesst Telefon weg, wenn keine Nummer vorhanden ist', () => {
    const payload = buildEventPayload(booking({ customerPhone: '' }));
    expect(payload.description).toContain('E-Mail: lena@example.ch');
    expect(payload.description).not.toContain('Telefon:');
  });

  it('erzeugt ein Ganztags-Event (date) ohne requestedTime', () => {
    const payload = buildEventPayload(booking({ requestedTime: '' }));
    expect(payload.start).toEqual({ date: '2026-06-10' });
    expect(payload.end).toEqual({ date: '2026-06-10' });
    expect(payload.summary).toBe('Lena Muster — Fotoshooting');
  });

  it('behandelt einen Tagesueberlauf am Ende korrekt', () => {
    const payload = buildEventPayload(booking({ requestedTime: '23:30' }), 60);
    expect(payload.start).toEqual({ dateTime: '2026-06-10T23:30:00', timeZone: 'Europe/Zurich' });
    expect(payload.end).toEqual({ dateTime: '2026-06-11T00:30:00', timeZone: 'Europe/Zurich' });
  });
});

describe('eventsToBusyIntervals', () => {
  // Hinweis: Google liefert dateTimes IMMER mit Zonen-Offset. Die Wandzeit wird
  // explizit gegen Europe/Zurich abgeleitet – mit '+02:00' (Sommerzeit) sind die
  // Fixtures damit unabhaengig von der Zeitzone der Testmaschine deterministisch.
  it('wandelt dateTime-Events des Tages in Busy-Intervalle', () => {
    const events: GoogleEvent[] = [
      {
        id: 'e1',
        start: { dateTime: '2026-06-10T10:00:00+02:00' },
        end: { dateTime: '2026-06-10T11:00:00+02:00' },
      },
      {
        id: 'e2',
        start: { dateTime: '2026-06-10T14:30:00+02:00' },
        end: { dateTime: '2026-06-10T15:15:00+02:00' },
      },
    ];
    const busy = eventsToBusyIntervals(events, '2026-06-10');
    expect(busy).toEqual([
      { start: '10:00', durationMinutes: 60 },
      { start: '14:30', durationMinutes: 45 },
    ]);
  });

  it('ueberspringt Ganztags-/date-Events', () => {
    const events: GoogleEvent[] = [
      { id: 'allday', start: { date: '2026-06-10' }, end: { date: '2026-06-11' } },
      {
        id: 'timed',
        start: { dateTime: '2026-06-10T09:00:00+02:00' },
        end: { dateTime: '2026-06-10T09:30:00+02:00' },
      },
    ];
    const busy = eventsToBusyIntervals(events, '2026-06-10');
    expect(busy).toEqual([{ start: '09:00', durationMinutes: 30 }]);
  });

  it('ignoriert Events, die nicht am gesuchten Tag beginnen', () => {
    const events: GoogleEvent[] = [
      {
        id: 'other',
        start: { dateTime: '2026-06-09T10:00:00+02:00' },
        end: { dateTime: '2026-06-09T11:00:00+02:00' },
      },
    ];
    expect(eventsToBusyIntervals(events, '2026-06-10')).toEqual([]);
  });

  it('begrenzt die Dauer auf den Tagesschluss, wenn das Event ueber Mitternacht laeuft', () => {
    const events: GoogleEvent[] = [
      {
        id: 'spanning',
        start: { dateTime: '2026-06-10T23:00:00+02:00' },
        end: { dateTime: '2026-06-11T01:00:00+02:00' },
      },
    ];
    const busy = eventsToBusyIntervals(events, '2026-06-10');
    // Von 23:00 bis Tagesende 24:00 = 60 Minuten.
    expect(busy).toEqual([{ start: '23:00', durationMinutes: 60 }]);
  });

  it('liefert [] fuer eine leere Eventliste', () => {
    expect(eventsToBusyIntervals([], '2026-06-10')).toEqual([]);
  });

  it('rechnet TZ-fest gegen Europe/Zurich (Offset-behaftete dateTimes)', () => {
    // Wandzeit 08:00–10:00 Zuercher Zeit, explizit als +02:00 angegeben.
    // Die Ableitung muss in JEDER Server-TZ '08:00' / 120 Minuten ergeben,
    // weil die Wandzeit ueber Intl gegen Europe/Zurich bestimmt wird.
    const events: GoogleEvent[] = [
      {
        id: 'tz',
        start: { dateTime: '2026-06-08T08:00:00+02:00' },
        end: { dateTime: '2026-06-08T10:00:00+02:00' },
      },
    ];
    expect(eventsToBusyIntervals(events, '2026-06-08')).toEqual([
      { start: '08:00', durationMinutes: 120 },
    ]);
  });
});

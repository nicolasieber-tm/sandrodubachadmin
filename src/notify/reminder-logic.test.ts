import { describe, it, expect } from 'vitest';
import {
  isReminderDueForRule,
  zurichWallTimeToInstant,
  type ReminderRuleLite,
} from './reminder-logic';
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

describe('isReminderDueForRule', () => {
  // Bezug: Termin am 2026-06-12 10:00 Zuerich (= 08:00 UTC, Sommerzeit).
  const APPOINTMENT_UTC = '2026-06-12T08:00:00Z';

  // Zwei aktive Regeln (1 Woche + 1 Tag), wie geseedet.
  const rule168: ReminderRuleLite = { id: 'r168', offsetHours: 168, enabled: true };
  const rule24: ReminderRuleLite = { id: 'r24', offsetHours: 24, enabled: true };
  const allOffsets = [168, 24];
  const NONE = new Set<string>();

  it('48h-Fenster: 47h vorher loest NUR die 168h-Regel aus (nicht 24h)', () => {
    const now = new Date('2026-06-10T09:00:00Z'); // 47h vorher
    expect(isReminderDueForRule(booking(), rule168, NONE, allOffsets, now)).toBe(true);
    expect(isReminderDueForRule(booking(), rule24, NONE, allOffsets, now)).toBe(false);
  });

  it('168h-Regel: an der oberen Grenze (exakt 168h) faellig, knapp darueber nicht', () => {
    const exakt168 = new Date('2026-06-05T08:00:00Z'); // 168h vorher
    const knappDrueber = new Date('2026-06-05T07:00:00Z'); // 169h vorher
    expect(isReminderDueForRule(booking(), rule168, NONE, allOffsets, exakt168)).toBe(true);
    expect(isReminderDueForRule(booking(), rule168, NONE, allOffsets, knappDrueber)).toBe(false);
  });

  it('168h-Regel: untere Grenze ist die naechstkleinere aktive Regel (24h, exklusiv)', () => {
    // diff = 24h -> gehoert NICHT mehr zur 168h-Regel (Grenze exklusiv),
    //               sondern zur 24h-Regel (obere Grenze inklusiv).
    const now24 = new Date('2026-06-11T08:00:00Z'); // exakt 24h vorher
    expect(isReminderDueForRule(booking(), rule168, NONE, allOffsets, now24)).toBe(false);
    expect(isReminderDueForRule(booking(), rule24, NONE, allOffsets, now24)).toBe(true);
  });

  it('24h-Regel: 12h vorher faellig (im (0,24]-Fenster)', () => {
    const now = new Date('2026-06-11T20:00:00Z'); // 12h vorher
    expect(isReminderDueForRule(booking(), rule24, NONE, allOffsets, now)).toBe(true);
    expect(isReminderDueForRule(booking(), rule168, NONE, allOffsets, now)).toBe(false);
  });

  it('kurzfristige Buchung: in 12h gebucht loest NUR den naechstgelegenen (24h) aus', () => {
    // Selbst wenn die 168h-Regel theoretisch "in der Zukunft" waere, faellt
    // diese Buchung nur in das engste passende Fenster.
    const now = new Date('2026-06-11T20:00:00Z'); // 12h vorher
    const due = allOffsets
      .map((h) => ({ h, due: isReminderDueForRule(booking(), { id: `r${h}`, offsetHours: h, enabled: true }, NONE, allOffsets, now) }))
      .filter((x) => x.due);
    expect(due).toEqual([{ h: 24, due: true }]);
  });

  it('nicht faellig: Termin in der Vergangenheit', () => {
    const now = new Date('2026-06-12T09:00:00Z'); // 1h nach Termin
    expect(isReminderDueForRule(booking(), rule24, NONE, allOffsets, now)).toBe(false);
    expect(isReminderDueForRule(booking(), rule168, NONE, allOffsets, now)).toBe(false);
  });

  it('nicht faellig: Termin exakt jetzt (diff == 0, untere Grenze ist exklusiv)', () => {
    const now = new Date(APPOINTMENT_UTC);
    expect(isReminderDueForRule(booking(), rule24, NONE, allOffsets, now)).toBe(false);
  });

  it('nicht faellig: bereits fuer diese Regel gesendet', () => {
    const now = new Date('2026-06-11T20:00:00Z'); // 12h vorher
    const sent = new Set(['r24']);
    expect(isReminderDueForRule(booking(), rule24, sent, allOffsets, now)).toBe(false);
  });

  it('nicht faellig: Regel deaktiviert', () => {
    const now = new Date('2026-06-11T20:00:00Z');
    const aus: ReminderRuleLite = { ...rule24, enabled: false };
    expect(isReminderDueForRule(booking(), aus, NONE, allOffsets, now)).toBe(false);
  });

  it('nicht faellig: Buchung ohne Uhrzeit (Ganztags)', () => {
    const now = new Date('2026-06-11T20:00:00Z');
    expect(isReminderDueForRule(booking({ requestedTime: '' }), rule24, NONE, allOffsets, now)).toBe(false);
  });

  it('nicht faellig: Anfrage ohne Datum (requestedDate null)', () => {
    const now = new Date('2026-06-11T20:00:00Z');
    expect(isReminderDueForRule(booking({ requestedDate: null }), rule24, NONE, allOffsets, now)).toBe(false);
  });

  it('nicht faellig: Status ist nicht bestaetigt', () => {
    const now = new Date('2026-06-11T20:00:00Z');
    expect(isReminderDueForRule(booking({ status: 'neu' }), rule24, NONE, allOffsets, now)).toBe(false);
    expect(isReminderDueForRule(booking({ status: 'abgesagt' }), rule24, NONE, allOffsets, now)).toBe(false);
    expect(isReminderDueForRule(booking({ status: 'erledigt' }), rule24, NONE, allOffsets, now)).toBe(false);
  });

  it('einzelne Regel ohne weitere Offsets: untere Grenze faellt auf 0', () => {
    // Nur eine 24h-Regel aktiv: Fenster (0, 24h].
    const now = new Date('2026-06-11T20:00:00Z'); // 12h vorher
    expect(isReminderDueForRule(booking(), rule24, NONE, [24], now)).toBe(true);
  });
});

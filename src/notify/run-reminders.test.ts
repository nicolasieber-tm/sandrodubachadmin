import { describe, it, expect } from 'vitest';
import { runDueReminders, zurichToday } from './run-reminders';

// zurichToday ist reine Logik (kein DB/Netz). runDueReminders ist die
// testbare Verarbeitungseinheit; wir pruefen sie hier OHNE Live-Mutationen:
//
// Mit einem 'now' weit in der Zukunft (Jahr 2099) ist der Stichtag so spaet,
// dass keine bestaetigte Buchung requestedDate >= Stichtag erfuellt (Filter in
// listBookingsForReminderCheck). Damit gibt es 0 Kandidaten → 0 faellige
// Kombinationen → kein Versand, kein Marker, kein Audit. Garantiert
// mutationsfrei und unabhaengig von den aktuell aktiven Reminder-Regeln.

describe('zurichToday', () => {
  it('formatiert TZ-fest als YYYY-MM-DD in Europe/Zurich (Sommerzeit)', () => {
    // 2026-06-12 00:30 UTC ist in Zuerich (UTC+2) bereits der 12.06., 02:30.
    expect(zurichToday(new Date('2026-06-12T00:30:00Z'))).toBe('2026-06-12');
  });

  it('beruecksichtigt den Zonen-Offset ueber die Tagesgrenze (Winterzeit)', () => {
    // 2026-01-15 23:30 UTC ist in Zuerich (UTC+1) schon der 16.01., 00:30.
    expect(zurichToday(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16');
  });
});

describe('runDueReminders (Integration, mutationsfrei)', () => {
  it('liefert gesendet:0, wenn keine kuenftigen Kandidaten existieren', async () => {
    // Stichtag im Jahr 2099 → keine Buchung erfuellt requestedDate >= Stichtag.
    const res = await runDueReminders(new Date('2099-01-01T00:00:00Z'));
    expect(res.gesendet).toBe(0);
    expect(res.geprueft).toBe(0);
  });
});

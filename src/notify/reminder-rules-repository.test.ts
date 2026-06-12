import { describe, it, expect, afterAll } from 'vitest';
import { inArray } from 'drizzle-orm';
import { db } from '@/db';
import { reminderRules, bookings, bookingRemindersSent } from '@/db/schema';
import {
  listReminderRules,
  listEnabledReminderRules,
  createReminderRule,
  updateReminderRule,
  deleteReminderRule,
} from './reminder-rules-repository';
import {
  createBooking,
  listSentReminderRuleIds,
  markReminderRuleSent,
  clearRemindersSent,
} from '@/bookings/repository';

// INTEGRATION (Live-DB-Konvention): nur selbst angelegte Datensaetze, gezielter
// Cleanup in afterAll. KEIN Wipe ganzer Tabellen.
//
// ACHTUNG: setzt die Tabellen reminder_rules + booking_reminders_sent voraus.
// Vor dem Setup-Skript schlagen die Tests mit «relation does not exist» fehl –
// erwartet und dokumentiert.

const createdRuleIds: string[] = [];
const createdBookingIds: string[] = [];

afterAll(async () => {
  // sent-Eintraege fallen via Cascade weg, wir loeschen aber defensiv zuerst.
  if (createdBookingIds.length > 0) {
    await db.delete(bookingRemindersSent).where(
      inArray(bookingRemindersSent.bookingId, createdBookingIds),
    );
    await db.delete(bookings).where(inArray(bookings.id, createdBookingIds));
  }
  if (createdRuleIds.length > 0) {
    await db.delete(reminderRules).where(inArray(reminderRules.id, createdRuleIds));
  }
});

describe('reminder-rules-repository (Integration)', () => {
  it('legt eine Regel an, listet, aktualisiert und loescht sie', async () => {
    const rule = await createReminderRule({ offsetHours: 72, enabled: true });
    createdRuleIds.push(rule.id);
    expect(rule.offsetHours).toBe(72);
    expect(rule.enabled).toBe(true);
    expect(rule.subject).toBeNull();

    const alle = await listReminderRules();
    expect(alle.some((r) => r.id === rule.id)).toBe(true);

    const updated = await updateReminderRule(rule.id, {
      enabled: false,
      subject: 'Eigener Betreff',
      body: 'Eigener Text',
    });
    expect(updated?.enabled).toBe(false);
    expect(updated?.subject).toBe('Eigener Betreff');

    // deaktivierte Regel taucht in listEnabledReminderRules NICHT auf.
    const aktive = await listEnabledReminderRules();
    expect(aktive.some((r) => r.id === rule.id)).toBe(false);

    await deleteReminderRule(rule.id);
    const nachher = await listReminderRules();
    expect(nachher.some((r) => r.id === rule.id)).toBe(false);
    // schon geloescht – aus dem Cleanup-Array nehmen.
    createdRuleIds.splice(createdRuleIds.indexOf(rule.id), 1);
  });
});

describe('booking-reminders-sent (Integration)', () => {
  it('markiert (Buchung, Regel) idempotent und liest die Regel-IDs zurueck', async () => {
    const rule = await createReminderRule({ offsetHours: 36, enabled: true });
    createdRuleIds.push(rule.id);

    const booking = await createBooking({
      offerNameSnapshot: 'Reminder-Test',
      customerName: 'Test',
      customerEmail: 'reminder@example.ch',
      requestedDate: '2026-08-01',
      requestedTime: '10:00',
      priceRappen: 25000,
      status: 'bestaetigt',
    });
    createdBookingIds.push(booking.id);

    expect(await listSentReminderRuleIds(booking.id)).toEqual([]);

    await markReminderRuleSent(booking.id, rule.id);
    // Zweiter Aufruf darf NICHT werfen (onConflictDoNothing).
    await markReminderRuleSent(booking.id, rule.id);

    const ids = await listSentReminderRuleIds(booking.id);
    expect(ids).toEqual([rule.id]);

    // clearRemindersSent entfernt die Marker (Reminder laufen neu an).
    await clearRemindersSent(booking.id);
    expect(await listSentReminderRuleIds(booking.id)).toEqual([]);
  });
});

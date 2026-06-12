import 'server-only';
import {
  listBookingsForReminderCheck,
  listSentReminderRuleIds,
  markReminderRuleSent,
} from '@/bookings/repository';
import { notifyBookingReminder } from '@/notify';
import { isReminderDueForRule } from '@/notify/reminder-logic';
import { listEnabledReminderRules } from '@/notify/reminder-rules-repository';
import { getTemplate } from '@/notify/template-repository';
import { logAudit } from '@/lib/audit';

// Verarbeitungskern fuer die konfigurierbaren Reminder vor dem Shooting.
//
// Reine, wiederverwendbare Funktion ohne HTTP-Bezug: wird sowohl vom internen
// Scheduler (src/instrumentation.ts) als auch von der manuellen Backup-Route
// (src/app/api/cron/reminders/route.ts) aufgerufen. Sie laedt die aktiven
// Reminder-Regeln, grobe Buchungs-Kandidaten und die bereits versendeten Marker
// und verschickt fuer jede faellige (Buchung, Regel)-Kombination genau einen
// Reminder.
//
// Robustheit: ein fehlgeschlagener Versand bricht die uebrigen NICHT ab.

const ZONE = 'Europe/Zurich';

/** Heutiges Datum 'YYYY-MM-DD' in der Zone ZONE (TZ-fest via Intl). */
export function zurichToday(now: Date): string {
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const p = Object.fromEntries(dtf.formatToParts(now).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Versendet alle zum Zeitpunkt `now` faelligen Reminder.
 *
 * Idempotenz: pro (Buchung, Regel) wird hoechstens einmal versendet
 * (booking_reminders_sent, PK booking_id+rule_id, onConflictDoNothing) –
 * verstaerkt durch das `alreadySent`-Set innerhalb eines Laufs.
 *
 * @returns Anzahl gepruefter Buchungs-Kandidaten und versendeter Reminder.
 */
export async function runDueReminders(
  now: Date,
): Promise<{ geprueft: number; gesendet: number }> {
  const todayStr = zurichToday(now);

  // Aktive Regeln + grobe Buchungs-Kandidaten laden.
  const regeln = await listEnabledReminderRules();
  const kandidaten = await listBookingsForReminderCheck(todayStr);

  // Ohne aktive Regeln gibt es nichts zu tun.
  if (regeln.length === 0) {
    return { geprueft: kandidaten.length, gesendet: 0 };
  }

  const enabledOffsets = regeln.map((r) => r.offsetHours);

  let gesendet = 0;
  for (const b of kandidaten) {
    // Bereits versendete Regel-Marker dieser Buchung (fuer die Faelligkeit).
    const alreadySent = new Set(await listSentReminderRuleIds(b.id));

    for (const rule of regeln) {
      if (!isReminderDueForRule(b, rule, alreadySent, enabledOffsets, now)) continue;

      try {
        // Vorlage: eigener Regel-Text (subject+body gesetzt) sonst globale
        // 'reminder'-Vorlage mit Offer-Override-Aufloesung.
        let override: { subject: string; body: string } | undefined;
        if (rule.subject != null && rule.body != null) {
          override = { subject: rule.subject, body: rule.body };
        }
        const fallback = override
          ? undefined
          : await getTemplate('reminder', b.offerId);

        // notifyBookingReminder wirft nie (Transport schluckt Fehler), aber wir
        // kapseln dennoch defensiv pro Kombination, damit Marker/Audit einen
        // einzelnen Ausreisser nicht den ganzen Lauf abbrechen lassen.
        await notifyBookingReminder(
          b,
          undefined,
          undefined,
          override ?? (fallback ? { subject: fallback.subject, body: fallback.body } : undefined),
        );
        await markReminderRuleSent(b.id, rule.id, now);
        // Marker direkt nachziehen, damit keine zweite Regel im selben Lauf
        // faelschlich als "noch nicht gesendet" gilt.
        alreadySent.add(rule.id);
        await logAudit({
          action: 'booking.reminder.gesendet',
          entity: 'booking',
          entityId: b.id,
          meta: {
            ruleId: rule.id,
            offsetHours: rule.offsetHours,
            requestedDate: b.requestedDate,
            requestedTime: b.requestedTime,
          },
        });
        gesendet += 1;
      } catch (err) {
        console.error(
          '[reminder] Versand fehlgeschlagen fuer Buchung',
          b.id,
          'Regel',
          rule.id,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  return { geprueft: kandidaten.length, gesendet };
}

// Next.js Instrumentation: register() wird einmal pro Server-Instanz beim Boot
// aufgerufen (Node- UND Edge-Runtime). Wir starten hier einen INTERNEN Scheduler,
// der die faelligen Reminder getaktet im laufenden Server-Prozess versendet –
// ohne externen Cron-Dienst.
//
// Voraussetzung fuer funktionierende Reminder ist damit nur noch, dass ein
// echter Mail-Transport konfiguriert ist (RESEND_API_KEY + RESEND_FROM). Ohne
// RESEND_API_KEY laeuft der Scheduler weiter, schreibt aber nur ins Log
// (Log-Transport) – kein CRON_SECRET, kein cron-job.org noetig.

const ZONE_LOG = '[reminder-scheduler]';

// Default-Takt: stuendlich. Ueber REMINDER_POLL_MINUTES anpassbar; sinnvolle
// Untergrenze 5 Minuten (haeufigeres Pollen braechte nichts, die Faelligkeit
// haengt am 48h/24h-Offset-Fenster, nicht an der Poll-Frequenz).
const DEFAULT_POLL_MINUTES = 60;
const MIN_POLL_MINUTES = 5;
// Kurzer Delay nach dem Boot, damit DB/Server bereit sind, bevor der erste Lauf
// startet (sonst koennte ein Deploy-Reminder bis zur vollen Stunde warten).
const INITIAL_DELAY_MS = 60_000;

// Singleton-Guard ueber globalThis: schuetzt vor Doppel-Init durch HMR im Dev
// und etwaiger Mehrfach-Registrierung. Pro Prozess laeuft hoechstens ein Timer.
const GUARD_KEY = '__sd_reminderSchedulerStarted__';

function pollIntervalMs(): number {
  const raw = Number(process.env.REMINDER_POLL_MINUTES);
  const minutes =
    Number.isFinite(raw) && raw > 0 ? Math.max(raw, MIN_POLL_MINUTES) : DEFAULT_POLL_MINUTES;
  return minutes * 60_000;
}

// Ein einzelner Scheduler-Lauf. Wirft NIE nach aussen: ein Fehler im
// Reminder-Versand darf den Server nicht beeintraechtigen.
async function tick(): Promise<void> {
  try {
    // Lazy import INNERHALB der Laufzeit: run-reminders zieht server-only/DB-
    // Module. So bleiben Edge-/Build-Pfade frei von diesen Abhaengigkeiten.
    const { runDueReminders } = await import('@/notify/run-reminders');
    const { geprueft, gesendet } = await runDueReminders(new Date());
    console.log(`${ZONE_LOG} Lauf abgeschlossen: ${geprueft} geprueft, ${gesendet} gesendet.`);
  } catch (err) {
    console.error(
      `${ZONE_LOG} Lauf fehlgeschlagen:`,
      err instanceof Error ? err.message : String(err),
    );
  }
}

export async function register(): Promise<void> {
  // NUR in der Node-Runtime starten (nicht Edge). Und nicht waehrend des Builds:
  // 'phase-production-build' ruft register() ebenfalls auf, dort gibt es weder
  // einen laufenden Server noch eine sinnvolle Timer-Semantik.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  // Opt-out: Wer doch extern taktet (oder den Scheduler temporaer abstellen
  // will), setzt DISABLE_INTERNAL_REMINDER_SCHEDULER (truthy). Die Backup-Route
  // /api/cron/reminders bleibt davon unberuehrt.
  if (process.env.DISABLE_INTERNAL_REMINDER_SCHEDULER) {
    console.log(`${ZONE_LOG} per DISABLE_INTERNAL_REMINDER_SCHEDULER deaktiviert.`);
    return;
  }

  // Singleton: nur einmal pro Prozess.
  const g = globalThis as typeof globalThis & { [GUARD_KEY]?: boolean };
  if (g[GUARD_KEY]) return;
  g[GUARD_KEY] = true;

  const intervalMs = pollIntervalMs();
  console.log(
    `${ZONE_LOG} gestartet (Takt: ${Math.round(intervalMs / 60_000)} min, erster Lauf in ~${Math.round(INITIAL_DELAY_MS / 1000)} s).`,
  );

  // Initialer Lauf kurz nach dem Boot (DB/Server bereit), danach periodisch.
  const initial = setTimeout(() => {
    void tick();
  }, INITIAL_DELAY_MS);

  const interval = setInterval(() => {
    void tick();
  }, intervalMs);

  // unref(): Die Timer halten den Prozess NICHT am Leben (das macht der
  // HTTP-Server) und blockieren ein sauberes Shutdown nicht.
  initial.unref?.();
  interval.unref?.();
}

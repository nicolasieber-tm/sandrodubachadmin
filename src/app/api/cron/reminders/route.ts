import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { runDueReminders } from '@/notify/run-reminders';

// Manueller/Backup-Trigger fuer den Reminder-Versand.
//
// Der regulaere Versand laeuft seit der internen Scheduler-Loesung getaktet im
// Server-Prozess (src/instrumentation.ts); diese Route bleibt als manueller
// Anstoss bzw. Fallback fuer externe Cron-Dienste erhalten. Schutz via
// Bearer-Token (CRON_SECRET) – ohne Secret ist der Endpoint deaktiviert.
//
// Die eigentliche Verarbeitung steckt in runDueReminders (src/notify/
// run-reminders.ts); hier bleibt nur die Auth-Schicht.

export const dynamic = 'force-dynamic';

/**
 * Konstant-zeitiger Vergleich zweier Tokens. Bei Laengenungleichheit sofort
 * Mismatch (timingSafeEqual wuerde sonst werfen).
 */
function tokenMatches(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET;
  // Ohne konfiguriertes Secret bleibt der Endpoint NICHT offen.
  if (!secret) {
    return NextResponse.json(
      { fehler: 'CRON_SECRET ist nicht gesetzt – Endpoint deaktiviert.' },
      { status: 503 },
    );
  }

  const auth = request.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (!tokenMatches(auth, expected)) {
    return NextResponse.json({ fehler: 'Nicht autorisiert.' }, { status: 401 });
  }

  const { geprueft, gesendet } = await runDueReminders(new Date());
  return NextResponse.json({ geprueft, gesendet });
}

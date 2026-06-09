import 'server-only';
import { and, eq } from 'drizzle-orm';
import { db } from '@/db';
import { calendarConnections, type CalendarConnection } from '@/db/schema';
import { encryptSecret, decryptSecret } from '@/lib/crypto';

// Persistenz der Google-Kalender-Verbindung. Es existiert konventionell genau
// EINE Zeile mit provider='google'. Tokens werden verschluesselt abgelegt.

export interface SaveGoogleConnectionInput {
  accountLabel: string;
  googleCalendarId: string;
  accessToken: string;
  refreshToken: string;
  /** Ablaufzeitpunkt des Access-Tokens. */
  expiry: Date;
  /** Optionale Liste der Unter-Kalender. Default: leer. */
  subCalendars?: string[];
  /** Kalender, die fuer Belegung zaehlen. Default beim Erstanlegen: [googleCalendarId]. */
  busyCalendarIds?: string[];
}

export interface GoogleConnection {
  row: CalendarConnection;
  accessToken: string;
  refreshToken: string;
}

/**
 * Legt die Google-Verbindung an oder aktualisiert sie (UPSERT auf die EINE
 * provider='google'-Zeile). Tokens werden via encryptSecret verschluesselt.
 * status wird auf 'verbunden' gesetzt.
 */
export async function saveGoogleConnection(
  input: SaveGoogleConnectionInput,
): Promise<CalendarConnection> {
  const accessTokenEnc = encryptSecret(input.accessToken);
  const refreshTokenEnc = encryptSecret(input.refreshToken);

  const existing = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.provider, 'google'))
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(calendarConnections)
      .set({
        accountLabel: input.accountLabel,
        googleCalendarId: input.googleCalendarId,
        accessTokenEnc,
        refreshTokenEnc,
        tokenExpiry: input.expiry,
        subCalendars: input.subCalendars ?? existing[0].subCalendars,
        status: 'verbunden',
      })
      .where(eq(calendarConnections.id, existing[0].id))
      .returning();
    return row;
  }

  const [row] = await db
    .insert(calendarConnections)
    .values({
      provider: 'google',
      accountLabel: input.accountLabel,
      googleCalendarId: input.googleCalendarId,
      accessTokenEnc,
      refreshTokenEnc,
      tokenExpiry: input.expiry,
      subCalendars: input.subCalendars ?? [],
      busyCalendarIds: input.busyCalendarIds ?? [input.googleCalendarId],
      status: 'verbunden',
    })
    .returning();
  return row;
}

/**
 * Liefert die Google-Verbindung mit entschluesselten Tokens, oder null wenn
 * keine Zeile existiert. Kein Crash, wenn keine Verbindung vorhanden ist.
 */
export async function getGoogleConnection(): Promise<GoogleConnection | null> {
  const rows = await db
    .select()
    .from(calendarConnections)
    .where(eq(calendarConnections.provider, 'google'))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const accessToken = row.accessTokenEnc ? decryptSecret(row.accessTokenEnc) : '';
  const refreshToken = row.refreshTokenEnc ? decryptSecret(row.refreshTokenEnc) : '';
  return { row, accessToken, refreshToken };
}

/** Entfernt die Google-Verbindung. Kein Crash, wenn keine Zeile existiert. */
export async function deleteGoogleConnection(): Promise<void> {
  await db
    .delete(calendarConnections)
    .where(and(eq(calendarConnections.provider, 'google')));
}

/** Setzt die fuer Belegung beruecksichtigten Kalender (provider='google'). */
export async function setBusyCalendarIds(ids: string[]): Promise<void> {
  await db
    .update(calendarConnections)
    .set({ busyCalendarIds: ids })
    .where(eq(calendarConnections.provider, 'google'));
}

/** Setzt den Schreib-Modus (provider='google'). */
export async function setWriteMode(mode: 'main' | 'per_offer'): Promise<void> {
  await db
    .update(calendarConnections)
    .set({ writeMode: mode })
    .where(eq(calendarConnections.provider, 'google'));
}

import 'server-only';
import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { calendarConnections, type CalendarConnection } from '@/db/schema';

export async function listConnections(): Promise<CalendarConnection[]> {
  return db
    .select()
    .from(calendarConnections)
    .orderBy(asc(calendarConnections.createdAt));
}

/**
 * Alle Unter-Kalender aller Verbindungen, flach und dedupliziert.
 * Dient als Optionen-Liste für die Angebot→Kalender-Zuordnung.
 */
export async function availableCalendarKeys(): Promise<string[]> {
  const connections = await listConnections();
  const keys = connections.flatMap((connection) => connection.subCalendars);
  return Array.from(new Set(keys));
}

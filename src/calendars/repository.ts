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


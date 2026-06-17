import 'server-only';
import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/db';
import { timeBlocks, type TimeBlock } from '@/db/schema';

// Alle Blocks im (inklusiven) Datumsbereich, sortiert nach Datum/Startzeit.
export async function listBlocksInRange(
  fromIso: string,
  toIso: string,
): Promise<TimeBlock[]> {
  return db
    .select()
    .from(timeBlocks)
    .where(and(gte(timeBlocks.blockDate, fromIso), lte(timeBlocks.blockDate, toIso)))
    .orderBy(asc(timeBlocks.blockDate), asc(timeBlocks.startTime));
}

// Alle Blocks eines einzelnen Tages.
export async function getBlocksOnDate(dateIso: string): Promise<TimeBlock[]> {
  return db.select().from(timeBlocks).where(eq(timeBlocks.blockDate, dateIso));
}

export async function createTimeBlock(input: {
  blockDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}): Promise<void> {
  await db.insert(timeBlocks).values({
    blockDate: input.blockDate,
    startTime: input.startTime,
    endTime: input.endTime,
    reason: input.reason,
  });
}

export async function deleteTimeBlock(id: string): Promise<void> {
  await db.delete(timeBlocks).where(eq(timeBlocks.id, id));
}

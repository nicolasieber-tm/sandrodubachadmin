import 'server-only';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db';
import { reminderRules, type ReminderRule } from '@/db/schema';

// CRUD fuer die konfigurierbaren Reminder-Regeln. offsetHours = Vorlauf vor dem
// Termin (168 = 1 Woche, 24 = 1 Tag). subject/body null = globale 'reminder'-
// Vorlage; gesetzt = eigener Text fuer genau diese Regel.

/** Alle Regeln, sortiert nach Vorlauf absteigend (frueheste Erinnerung zuerst). */
export async function listReminderRules(): Promise<ReminderRule[]> {
  return db.select().from(reminderRules).orderBy(asc(reminderRules.offsetHours));
}

/** Nur aktive Regeln (fuer den Cron-Lauf), nach Vorlauf sortiert. */
export async function listEnabledReminderRules(): Promise<ReminderRule[]> {
  return db
    .select()
    .from(reminderRules)
    .where(eq(reminderRules.enabled, true))
    .orderBy(asc(reminderRules.offsetHours));
}

export type ReminderRuleInput = {
  offsetHours: number;
  enabled?: boolean;
  subject?: string | null;
  body?: string | null;
};

export async function createReminderRule(input: ReminderRuleInput): Promise<ReminderRule> {
  const [row] = await db
    .insert(reminderRules)
    .values({
      offsetHours: input.offsetHours,
      enabled: input.enabled ?? true,
      subject: input.subject ?? null,
      body: input.body ?? null,
    })
    .returning();
  return row;
}

export async function updateReminderRule(
  id: string,
  input: Partial<ReminderRuleInput>,
): Promise<ReminderRule | undefined> {
  const patch: Partial<typeof reminderRules.$inferInsert> = {};
  if (input.offsetHours !== undefined) patch.offsetHours = input.offsetHours;
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  if (input.subject !== undefined) patch.subject = input.subject;
  if (input.body !== undefined) patch.body = input.body;

  if (Object.keys(patch).length === 0) {
    const rows = await db.select().from(reminderRules).where(eq(reminderRules.id, id)).limit(1);
    return rows[0];
  }

  const [row] = await db
    .update(reminderRules)
    .set(patch)
    .where(eq(reminderRules.id, id))
    .returning();
  return row;
}

export async function deleteReminderRule(id: string): Promise<void> {
  await db.delete(reminderRules).where(eq(reminderRules.id, id));
}

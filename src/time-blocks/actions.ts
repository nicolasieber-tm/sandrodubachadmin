'use server';

import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { createTimeBlock, deleteTimeBlock } from './repository';
import { timeBlockSchema } from './input';

export type ActionResult = { ok: true } | { error: string };

// Plain-arg (kein FormData): der Planer ruft diese Actions imperativ auf —
// wie movePlannerBooking/finalizePlannedBooking in planner-actions.ts.
export async function createTimeBlockAction(input: {
  blockDate: string;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
}): Promise<ActionResult> {
  const parsed = timeBlockSchema.safeParse(input);
  if (!parsed.success) {
    return { error: 'Ungültiger Blocker.' };
  }
  await createTimeBlock(parsed.data);
  await logAudit({ action: 'time_block.created' });
  revalidatePath('/admin/planer');
  revalidatePath('/book');
  return { ok: true };
}

export async function deleteTimeBlockAction(id: string): Promise<ActionResult> {
  if (typeof id !== 'string' || id.trim() === '') {
    return { error: 'Ungültige ID.' };
  }
  await deleteTimeBlock(id);
  await logAudit({ action: 'time_block.deleted' });
  revalidatePath('/admin/planer');
  revalidatePath('/book');
  return { ok: true };
}

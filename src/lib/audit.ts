import { db } from '@/db';
import { auditLog } from '@/db/schema';

export async function logAudit(params: {
  actor?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}) {
  await db.insert(auditLog).values({
    actor: params.actor ?? null,
    action: params.action,
    entity: params.entity,
    entityId: params.entityId,
    meta: params.meta ?? null,
  });
}

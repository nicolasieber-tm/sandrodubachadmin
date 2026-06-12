import 'server-only';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { discounts, type Discount } from '@/db/schema';
import { generateToken } from '@/lib/tokens';

export type CreateDiscountInput = {
  kind: 'code' | 'link';
  code?: string | null;
  valueType: 'percent' | 'fixed';
  value: number;
  offerId?: string | null;
  maxRedemptions?: number | null;
  validFrom?: Date | null;
  validUntil?: Date | null;
  label?: string | null;
  active?: boolean;
};

/**
 * Legt einen Rabatt an.
 * - kind='code': `code` wird gesetzt, `token`=null.
 * - kind='link': `token` wird generiert, `code`=null, `maxRedemptions`=1
 *   (ein Link ist genau einmal einlösbar).
 */
export async function createDiscount(data: CreateDiscountInput): Promise<Discount> {
  const isLink = data.kind === 'link';
  const [row] = await db
    .insert(discounts)
    .values({
      kind: data.kind,
      code: isLink ? null : (data.code ?? null),
      token: isLink ? generateToken() : null,
      valueType: data.valueType,
      value: data.value,
      offerId: data.offerId ?? null,
      maxRedemptions: isLink ? 1 : (data.maxRedemptions ?? null),
      validFrom: data.validFrom ?? null,
      validUntil: data.validUntil ?? null,
      label: data.label ?? null,
      active: data.active ?? true,
    })
    .returning();
  return row;
}

/** Listet Rabatte, optional nach Art gefiltert, neueste zuerst. */
export async function listDiscounts(kind?: 'code' | 'link'): Promise<Discount[]> {
  if (kind) {
    return db
      .select()
      .from(discounts)
      .where(eq(discounts.kind, kind))
      .orderBy(desc(discounts.createdAt));
  }
  return db.select().from(discounts).orderBy(desc(discounts.createdAt));
}

export async function getDiscountById(id: string): Promise<Discount | undefined> {
  const rows = await db.select().from(discounts).where(eq(discounts.id, id)).limit(1);
  return rows[0];
}

/**
 * Lädt einen aktiven Code-Rabatt case-insensitiv.
 * Vergleich über lower(code) = lower(:code) und active = true.
 */
export async function getActiveDiscountByCode(code: string): Promise<Discount | undefined> {
  const rows = await db
    .select()
    .from(discounts)
    .where(
      and(sql`lower(${discounts.code}) = lower(${code})`, eq(discounts.active, true)),
    )
    .limit(1);
  return rows[0];
}

export async function getDiscountByToken(token: string): Promise<Discount | undefined> {
  const rows = await db
    .select()
    .from(discounts)
    .where(eq(discounts.token, token))
    .limit(1);
  return rows[0];
}

export async function setDiscountActive(
  id: string,
  active: boolean,
): Promise<Discount | undefined> {
  const [row] = await db
    .update(discounts)
    .set({ active })
    .where(eq(discounts.id, id))
    .returning();
  return row;
}

/**
 * Loescht einen Rabatt endgueltig. Die Einloesungen (discount_redemptions)
 * werden per ON DELETE CASCADE mitgeloescht; betroffene Buchungen behalten ihren
 * gespeicherten Preis, verlieren aber den Rabattbezug (discount_id -> NULL).
 * Liefert true, wenn ein Datensatz entfernt wurde.
 */
export async function deleteDiscount(id: string): Promise<boolean> {
  const rows = await db
    .delete(discounts)
    .where(eq(discounts.id, id))
    .returning({ id: discounts.id });
  return rows.length > 0;
}

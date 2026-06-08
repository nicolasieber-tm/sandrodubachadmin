import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/db';
import { discounts, discountRedemptions, offers, type Discount } from '@/db/schema';
import { computeEffectivePrice, computeSaving, validateDiscount } from './logic';

// Mapping der internen Prüf-Gründe auf Meldungen (Deutsch, Schweiz).
const REASON_MESSAGE: Record<string, string> = {
  inaktiv: 'Dieser Rabatt ist nicht aktiv.',
  noch_nicht_gueltig: 'Dieser Rabatt ist noch nicht gültig.',
  abgelaufen: 'Dieser Rabatt ist abgelaufen.',
  aufgebraucht: 'Dieser Rabatt wurde bereits aufgebraucht.',
  falsches_angebot: 'Dieser Rabatt gilt nicht für dieses Angebot.',
  nicht_gefunden: 'Rabatt nicht gefunden.',
  angebot_nicht_gefunden: 'Angebot nicht gefunden.',
};

function messageForReason(reason: string): string {
  return REASON_MESSAGE[reason] ?? 'Rabatt kann nicht eingelöst werden.';
}

export type FindRedeemableArgs = {
  code?: string;
  token?: string;
  offerId: string;
  now?: Date;
};

export type RedeemablePreview = {
  discount: Discount;
  effectiveRappen: number;
  savedRappen: number;
};

/**
 * Read-only-Vorschau: Lädt den Rabatt per Code (case-insensitiv) oder Token,
 * validiert ihn und berechnet den effektiven Preis aus dem serverseitig
 * geladenen Basispreis des Angebots (NICHT vom Client). Bei Fehlern wird eine
 * deutsche Meldung zurückgegeben.
 */
export async function findRedeemable(
  args: FindRedeemableArgs,
): Promise<RedeemablePreview | { error: string }> {
  const now = args.now ?? new Date();

  // Angebot serverseitig laden -> verlässlicher Basispreis.
  const offerRows = await db
    .select()
    .from(offers)
    .where(eq(offers.id, args.offerId))
    .limit(1);
  const offer = offerRows[0];
  if (!offer) {
    return { error: messageForReason('angebot_nicht_gefunden') };
  }

  // Rabatt per Token (bevorzugt, falls gesetzt) oder Code laden.
  let discount: Discount | undefined;
  if (args.token) {
    const rows = await db
      .select()
      .from(discounts)
      .where(eq(discounts.token, args.token))
      .limit(1);
    discount = rows[0];
  } else if (args.code) {
    const rows = await db
      .select()
      .from(discounts)
      .where(sql`lower(${discounts.code}) = lower(${args.code})`)
      .limit(1);
    discount = rows[0];
  }

  if (!discount) {
    return { error: messageForReason('nicht_gefunden') };
  }

  const check = validateDiscount(discount, { offerId: args.offerId, now });
  if (!check.ok) {
    return { error: messageForReason(check.reason) };
  }

  const d = { valueType: discount.valueType, value: discount.value };
  const effectiveRappen = computeEffectivePrice(offer.priceRappen, d);
  const savedRappen = computeSaving(offer.priceRappen, d);
  return { discount, effectiveRappen, savedRappen };
}

export type ApplyRedemptionArgs = {
  discountId: string;
  bookingId: string;
  offerId: string;
  baseRappen: number;
  now?: Date;
};

export type ApplyRedemptionResult = { effectiveRappen: number; savedRappen: number };

/**
 * Löst einen Rabatt transaktional und atomar ein.
 *
 * Sperr-/Transaktionsstrategie:
 * - In `db.transaction` wird die Rabatt-Zeile via `SELECT … FOR UPDATE`
 *   (`.for('update')`) gesperrt. Damit serialisieren konkurrierende
 *   Einlösungen desselben Rabatts: Eine zweite Transaktion blockiert, bis die
 *   erste committet/rollt, und sieht danach den aktualisierten
 *   `redemptionsUsed`-Zähler.
 * - Erst gegen die GESPERRTE Zeile wird erneut `validateDiscount` geprüft
 *   (aktiv/Zeitfenster/Limit). So kann das Einlöselimit nicht überschritten
 *   werden (kein Race zwischen Prüfung und Schreiben).
 * - Bei Validierungsfehler wird die Einlösung NICHT geschrieben; durch den
 *   `return` aus dem Transaktions-Callback ohne Schreibzugriff bleibt alles
 *   unverändert (nichts zu rollen).
 * - Sonst: Einlösung in `discount_redemptions` einfügen und
 *   `redemptions_used = redemptions_used + 1` setzen — beides in derselben
 *   Transaktion.
 */
export async function applyRedemption(
  args: ApplyRedemptionArgs,
): Promise<ApplyRedemptionResult | { error: string }> {
  const now = args.now ?? new Date();

  return db.transaction(async (tx) => {
    // Rabatt-Zeile sperren (FOR UPDATE).
    const lockedRows = await tx
      .select()
      .from(discounts)
      .where(eq(discounts.id, args.discountId))
      .for('update')
      .limit(1);
    const discount = lockedRows[0];
    if (!discount) {
      return { error: messageForReason('nicht_gefunden') };
    }

    // Erneute Prüfung gegen die gesperrte Zeile.
    const check = validateDiscount(discount, { offerId: args.offerId, now });
    if (!check.ok) {
      return { error: messageForReason(check.reason) };
    }

    const d = { valueType: discount.valueType, value: discount.value };
    const effectiveRappen = computeEffectivePrice(args.baseRappen, d);
    const savedRappen = computeSaving(args.baseRappen, d);

    await tx.insert(discountRedemptions).values({
      discountId: discount.id,
      bookingId: args.bookingId,
      amountSavedRappen: savedRappen,
    });

    await tx
      .update(discounts)
      .set({ redemptionsUsed: sql`${discounts.redemptionsUsed} + 1` })
      .where(eq(discounts.id, discount.id));

    return { effectiveRappen, savedRappen };
  });
}

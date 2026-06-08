// Reine, DB-freie Rabatt-Logik. Geld immer in Rappen (integer).
// Diese Datei ist absichtlich frei von Server-/DB-Imports, damit sie
// überall (auch im Client) genutzt und einfach getestet werden kann.

export type DiscountValue = { valueType: 'percent' | 'fixed'; value: number };

/**
 * Berechnet den effektiven Preis nach Anwendung des Rabatts.
 * - percent: baseRappen - round(baseRappen * value / 100)
 * - fixed:   baseRappen - value (Rappen)
 * Das Ergebnis ist ganzzahlig (Rappen) und niemals kleiner als 0.
 */
export function computeEffectivePrice(baseRappen: number, d: DiscountValue): number {
  const abzug =
    d.valueType === 'percent' ? Math.round((baseRappen * d.value) / 100) : d.value;
  return Math.max(0, baseRappen - abzug);
}

/**
 * Berechnet die Ersparnis in Rappen (Basispreis minus effektiver Preis).
 * Durch das Clampen in computeEffectivePrice ist die Ersparnis höchstens
 * der Basispreis und niemals negativ.
 */
export function computeSaving(baseRappen: number, d: DiscountValue): number {
  return baseRappen - computeEffectivePrice(baseRappen, d);
}

type ValidatableDiscount = {
  active: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  maxRedemptions: number | null;
  redemptionsUsed: number;
  offerId: string | null;
};

export type ValidateContext = { offerId?: string; now: Date };

export type ValidateResult = { ok: true } | { ok: false; reason: string };

/**
 * Prüft die Einlösbarkeit eines Rabatts in fester Reihenfolge:
 * 1. active            -> 'inaktiv'
 * 2. validFrom/now     -> 'noch_nicht_gueltig'
 * 3. validUntil/now    -> 'abgelaufen'
 * 4. maxRedemptions    -> 'aufgebraucht'
 * 5. offerId-Bindung   -> 'falsches_angebot'
 * Sonst { ok: true }.
 */
export function validateDiscount(
  d: ValidatableDiscount,
  ctx: ValidateContext,
): ValidateResult {
  if (!d.active) {
    return { ok: false, reason: 'inaktiv' };
  }
  if (d.validFrom != null && ctx.now < d.validFrom) {
    return { ok: false, reason: 'noch_nicht_gueltig' };
  }
  if (d.validUntil != null && ctx.now > d.validUntil) {
    return { ok: false, reason: 'abgelaufen' };
  }
  if (d.maxRedemptions != null && d.redemptionsUsed >= d.maxRedemptions) {
    return { ok: false, reason: 'aufgebraucht' };
  }
  if (d.offerId != null && ctx.offerId !== d.offerId) {
    return { ok: false, reason: 'falsches_angebot' };
  }
  return { ok: true };
}

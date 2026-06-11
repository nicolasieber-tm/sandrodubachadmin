// Geldbeträge werden im System IMMER in Rappen (integer) gehalten.
// Anzeige in CHF, ganzzahlig gerundet, Tausender mit schmalem Leerzeichen U+202F.

const NARROW_NO_BREAK_SPACE = ' ';

/**
 * Formatiert Rappen als ganzzahligen CHF-Betrag.
 * Beispiele: formatRappen(25000) === '250 CHF', formatRappen(315000) === '3 150 CHF'.
 */
export function formatRappen(rappen: number): string {
  const franken = Math.round(rappen / 100);
  const negative = franken < 0;
  const digits = Math.abs(franken).toString();

  // Tausender von rechts gruppieren und mit U+202F trennen.
  let grouped = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && i % 3 === 0) {
      grouped = NARROW_NO_BREAK_SPACE + grouped;
    }
    grouped = digits[digits.length - 1 - i] + grouped;
  }

  return `${negative ? '-' : ''}${grouped} CHF`;
}

/**
 * Formatiert einen Preis inkl. Einheit. Bei 'pro_stunde' wird ' / Std' angehängt.
 * Beispiele: formatPrice(20000, 'pro_stunde') === '200 CHF / Std'.
 */
export function formatPrice(rappen: number, unit: 'pauschal' | 'pro_stunde'): string {
  const base = formatRappen(rappen);
  return unit === 'pro_stunde' ? `${base} / Std` : base;
}

/**
 * Gesamtbetrag einer Buchung in Rappen: Angebotspreis (ggf. rabattiert) plus
 * Wegkosten. Reine Berechnung – Anzeige via formatRappen(gesamtpreisRappen(...)).
 * travelCostRappen ist optional (Buchungen aus der Zeit vor Step 5 haben es
 * evtl. nicht gesetzt) und wird dann als 0 behandelt.
 */
export function gesamtpreisRappen(priceRappen: number, travelCostRappen = 0): number {
  return priceRappen + travelCostRappen;
}

/**
 * Formatiert Rappen rappengenau (zwei Nachkommastellen, sofern kein ganzer
 * Frankenbetrag). Für Kleinbeträge wie den km-Ansatz einer Wegkosten-Regel,
 * bei denen formatRappen (ganzzahlig gerundet) verfälschen würde.
 * Beispiele: formatRappenExakt(90) === '0.90 CHF', formatRappenExakt(200) === '2 CHF'.
 */
export function formatRappenExakt(rappen: number): string {
  if (rappen % 100 === 0) return formatRappen(rappen);
  return `${(rappen / 100).toFixed(2)} CHF`;
}

// Menschenlesbarer Hinweis-Text einer Wegkosten-Regel. KEIN server-only:
// wird in der Buchungsstrecke (Client) und im Admin-Termindetail verwendet.
import { formatRappenExakt } from '@/lib/money';
import type { TravelRule } from '@/db/schema';

/**
 * Hinweis für die Buchungsstrecke: was kostenlos ist und was darüber hinaus
 * pro Kilometer verrechnet wird. Bei Freiradius 0 entfällt der erste Teil.
 */
export function travelRuleHint(rule: TravelRule): string {
  const ansatz = `${formatRappenExakt(rule.ratePerKmRappen)} pro km`;
  if (rule.freeRadiusKm > 0) {
    return `Anfahrt: Im Umkreis von ${rule.freeRadiusKm} km um ${rule.baseLocation} fallen keine Wegkosten an, darüber hinaus ${ansatz} (ab ${rule.baseLocation}).`;
  }
  return `Anfahrt: Wegkosten von ${ansatz} ab ${rule.baseLocation}.`;
}

/**
 * Kurzform für das Admin-Termindetail neben dem Wegkosten-Feld,
 * z. B. "Region Bern: 30 km um Bern Bahnhof frei, danach 0.90 CHF/km".
 */
export function travelRuleKurz(rule: TravelRule): string {
  const ansatz = `${formatRappenExakt(rule.ratePerKmRappen)}/km`;
  if (rule.freeRadiusKm > 0) {
    return `${rule.name}: ${rule.freeRadiusKm} km um ${rule.baseLocation} frei, danach ${ansatz}`;
  }
  return `${rule.name}: ${ansatz} ab ${rule.baseLocation}`;
}

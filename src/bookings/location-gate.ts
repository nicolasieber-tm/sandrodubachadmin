// Reine Validierungslogik für den Standort einer Buchung — getrennt von
// public-actions.ts, damit sie ohne DB-Mocking testbar ist. Der DB-Zugriff
// (getLocation) bleibt beim Aufrufer; diese Funktion bekommt das Ergebnis nur
// übergeben.
import type { Location } from '@/db/schema';

export type BookingLocationResolution =
  | { ok: true; locationId: string | null; locationNameSnapshot: string }
  | { ok: false; error: string };

// Praxis-Standort der Buchung: IMMER serverseitig aus offer.locationId
// auflösen (nie aus einem Client-Feld). Angebot ohne locationId = Altpfad
// (kein Standort). Zeigt offer.locationId auf einen unbekannten oder
// deaktivierten Standort, wird die Buchung abgelehnt, statt sie mit einem
// falschen/leeren Standort anzulegen.
export function resolveBookingLocation(
  offerLocationId: string | null,
  location: Location | null | undefined,
): BookingLocationResolution {
  if (!offerLocationId) {
    return { ok: true, locationId: null, locationNameSnapshot: '' };
  }
  if (!location || !location.active) {
    return { ok: false, error: 'Dieser Standort ist aktuell nicht verfügbar.' };
  }
  return { ok: true, locationId: location.id, locationNameSnapshot: location.name };
}

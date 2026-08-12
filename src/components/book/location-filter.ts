// Reine Gate-/Filterlogik für die Standortwahl der Buchungsstrecke — bewusst
// ohne React, damit sie ohne DOM/Testing-Library direkt getestet werden kann.
import type { Offer, Location } from '@/db/schema';

export interface LocationGate {
  // Standortwahl nur zeigen, wenn sie tatsächlich etwas zu entscheiden gibt
  // (mindestens ein aktiver Standort mit mindestens einem zugeordneten Angebot).
  needsLocationStep: boolean;
  // Aktive Standorte, die auch tatsächlich ein Angebot haben — nur diese
  // erscheinen als Karten in der Standortwahl.
  selectableLocations: Location[];
  // Angebote mit einem gültigen, aktiven Standort.
  locationOffers: Offer[];
  // Angebote ohne Standort-Zuordnung (Altpfad).
  legacyOffers: Offer[];
}

// Ein Angebot mit locationId auf einen inaktiven/gelöschten Standort taucht
// NIRGENDS auf (weder unter "seinem" Standort noch als Altpfad-Angebot).
export function computeLocationGate(offers: Offer[], locations: Location[]): LocationGate {
  const activeLocationIds = new Set(locations.map((l) => l.id));
  const locationOffers = offers.filter(
    (o) => o.locationId !== null && activeLocationIds.has(o.locationId),
  );
  const legacyOffers = offers.filter((o) => o.locationId === null);
  const usedLocationIds = new Set(locationOffers.map((o) => o.locationId as string));
  const selectableLocations = locations.filter((l) => usedLocationIds.has(l.id));
  return {
    needsLocationStep: selectableLocations.length > 0,
    selectableLocations,
    locationOffers,
    legacyOffers,
  };
}

// Angebote für den Angebots-Schritt: bei aktivem Mehrstandort-Gate ausschliesslich
// die Angebote des gewählten Standorts (nie Altpfad-Angebote gemischt darunter —
// die wären sonst am aktuellen Standort irreführend). Ohne Gate unverändert alle
// Angebote (bisheriges Verhalten).
export function offersForSelectedLocation(
  gate: LocationGate,
  allOffers: Offer[],
  selectedLocationId: string | null,
): Offer[] {
  if (!gate.needsLocationStep) return allOffers;
  if (!selectedLocationId) return [];
  return gate.locationOffers.filter((o) => o.locationId === selectedLocationId);
}

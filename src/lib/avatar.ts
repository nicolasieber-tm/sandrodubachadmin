// Hilfsfunktionen für Kunden-Avatare (Initialen + deterministische Farbe).

/**
 * Bildet aus einem Namen bis zu zwei Initialen (Grossbuchstaben).
 * Beispiel: 'Anna Meier' → 'AM', 'sandro' → 'S', '' → '?'.
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

// Dezente, zur Marke passende Farbverläufe für Avatare.
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #e3712a, #c75f1f)',
  'linear-gradient(135deg, #3066e0, #2451b8)',
  'linear-gradient(135deg, #1f9d57, #157a42)',
  'linear-gradient(135deg, #bd8410, #9a6b0d)',
  'linear-gradient(135deg, #7b5cd6, #5f43b0)',
  'linear-gradient(135deg, #d6457b, #b22f60)',
] as const;

/**
 * Liefert einen stabilen Farbverlauf für einen Namen (gleicher Name → gleiche Farbe).
 */
export function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

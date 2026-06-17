// Validierungsschema für die Angebots-Erfassung (Anlegen und Bearbeiten).
// KEIN server-only: Das Schema darf auch clientseitig genutzt werden.
// Zod v4. Preis-Eingabe erfolgt im UI in CHF; die Umrechnung in Rappen
// (Math.round(chf * 100)) passiert in der Server-Action.
import { z } from 'zod';

export const offerSchema = z.object({
  name: z.string().min(2),
  priceChf: z.coerce.number().min(0),
  unit: z.enum(['pauschal', 'pro_stunde']),
  // Dauer in Minuten – Basis für die Slot-Berechnung (mind. 15 Minuten).
  // Die Anzeige wird daraus formatiert (src/lib/duration.ts).
  durationMinutes: z.coerce.number().int().min(15),
  description: z.string().optional().default(''),
  // 'termin' = Buchung mit Kalender/Slots; 'anfrage' = individuelles Shooting
  // ohne Kalender (Idee-Textfeld + Direktkontakt).
  bookingMode: z.enum(['termin', 'anfrage']).optional().default('termin'),
  // Zugeordnete Wegkosten-Regel; leerer String ('— keine —') wird zu null.
  travelRuleId: z
    .string()
    .optional()
    .default('')
    .transform((v) => (v.trim() === '' ? null : v.trim())),
  // Optionales angebotsspezifisches Logo als Data-URL. Leer -> null.
  // Sonst Pflicht: data:image/...;base64,... und max. 200'000 Zeichen
  // (das deckt ein 256px-WebP locker ab und begrenzt die DB-Zeile).
  logoDataUrl: z
    .string()
    .optional()
    .default('')
    .transform((v) => v.trim())
    .refine(
      (v) =>
        v === '' ||
        (/^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/.test(v) && v.length <= 200_000),
      { message: 'Logo ist ungültig.' },
    )
    .transform((v) => (v === '' ? null : v)),
  active: z.coerce.boolean().optional().default(true),
});

export type OfferInput = z.infer<typeof offerSchema>;

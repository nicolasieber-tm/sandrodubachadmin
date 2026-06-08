// Validierungsschema für die Angebots-Erfassung (Anlegen und Bearbeiten).
// KEIN server-only: Das Schema darf auch clientseitig genutzt werden.
// Zod v4. Preis-Eingabe erfolgt im UI in CHF; die Umrechnung in Rappen
// (Math.round(chf * 100)) passiert in der Server-Action.
import { z } from 'zod';

export const offerSchema = z.object({
  name: z.string().min(2),
  priceChf: z.coerce.number().min(0),
  unit: z.enum(['pauschal', 'pro_stunde']),
  durationLabel: z.string().min(1),
  description: z.string().optional().default(''),
  calendarKey: z.string().optional().default(''),
  active: z.coerce.boolean().optional().default(true),
});

export type OfferInput = z.infer<typeof offerSchema>;

// Validierungsschema für die manuelle Buchungserfassung.
// KEIN server-only: Das Schema darf auch clientseitig genutzt werden.
// Zod v4: `z.email()` statt `z.string().email()`.
import { z } from 'zod';

export const manualBookingSchema = z.object({
  offerId: z.string().uuid(),
  customerName: z.string().min(2),
  customerEmail: z.email(),
  customerPhone: z.string().optional().default(''),
  requestedDate: z.string().min(1),
  requestedTime: z.string().optional().default(''),
  location: z.string().optional().default(''),
  message: z.string().optional().default(''),
  // Preis-Eingabe erfolgt im UI in CHF; die Umrechnung in Rappen passiert
  // in der Server-Action (Math.round(chf * 100)).
  priceChf: z.coerce.number().min(0),
});

export type ManualBookingInput = z.infer<typeof manualBookingSchema>;

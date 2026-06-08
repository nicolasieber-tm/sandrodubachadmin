// Validierungsschema für die öffentliche Buchungsstrecke (iframe).
// KEIN server-only: Das Schema darf auch clientseitig genutzt werden.
// Zod v4: `z.email()` statt `z.string().email()`.
import { z } from 'zod';

export const publicBookingSchema = z.object({
  offerId: z.string().uuid(),
  customerName: z.string().min(2),
  customerEmail: z.email(),
  customerPhone: z.string().min(6),
  requestedDate: z.string().min(1),
  requestedTime: z.string().optional().default(''),
  message: z.string().optional().default(''),
  // Optionaler Rabatt-Code (vom Kunden eingegeben).
  code: z.string().optional().default(''),
  // Optionales Einmal-Link-Token (aus ?l= in der URL).
  token: z.string().optional().default(''),
  // Honeypot: Bots füllen dieses für Menschen unsichtbare Feld aus.
  website: z.string().optional().default(''),
});

export type PublicBookingInput = z.infer<typeof publicBookingSchema>;

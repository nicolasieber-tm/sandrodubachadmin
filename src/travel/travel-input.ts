// Validierungsschema für Wegkosten-Regeln (Anlegen und Bearbeiten).
// KEIN server-only: Das Schema darf auch clientseitig genutzt werden.
// Der km-Ansatz wird im UI in CHF eingegeben (z. B. 0.90); die Umrechnung in
// Rappen (Math.round(chf * 100)) passiert in der Server-Action.
import { z } from 'zod';

export const travelRuleSchema = z.object({
  name: z.string().trim().min(2),
  baseLocation: z.string().trim().min(2),
  freeRadiusKm: z.coerce.number().int().min(0),
  ratePerKmChf: z.coerce.number().min(0),
});

export type TravelRuleInput = z.infer<typeof travelRuleSchema>;

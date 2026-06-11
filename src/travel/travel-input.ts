// Validierungsschema für Wegkosten-Regeln (Anlegen und Bearbeiten).
// KEIN server-only: Das Schema darf auch clientseitig genutzt werden.
// Der km-Ansatz wird im UI in CHF eingegeben (z. B. 0.90); die Umrechnung in
// Rappen (Math.round(chf * 100)) passiert in der Server-Action.
import { z } from 'zod';

// Koordinate aus dem Karten-Picker (Hidden-Input): leerer String = kein Pin.
// z.coerce.number() taugt hier nicht, weil '' zu 0 gezwungen wuerde.
function koordinate(min: number, max: number) {
  return z
    .string()
    .optional()
    .default('')
    .transform((v, ctx) => {
      const t = v.trim();
      if (t === '') return null;
      const n = Number(t);
      if (!Number.isFinite(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: 'Ungültige Koordinate' });
        return z.NEVER;
      }
      return n;
    });
}

export const travelRuleSchema = z.object({
  name: z.string().trim().min(2),
  baseLocation: z.string().trim().min(2),
  baseLat: koordinate(-90, 90),
  baseLng: koordinate(-180, 180),
  freeRadiusKm: z.coerce.number().int().min(0),
  ratePerKmChf: z.coerce.number().min(0),
});

export type TravelRuleInput = z.infer<typeof travelRuleSchema>;

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

// Schema fuer das nachtraegliche Bearbeiten einer bestehenden Buchung
// (Termin verschieben). Step 3: Datum/Zeit/Ort + notifyCustomer-Checkbox.
// Bewusst als z.object angelegt, damit Step 4 (Preis) und Step 5 (Wegkosten,
// Zusatzminuten) per `.extend(...)` weitere Felder ergaenzen koennen.
//
// Checkbox-Konvention (HTML): ein gesetztes Haekchen sendet den Wert 'on';
// fehlt das Feld, kommt null an. Beides wird auf bool normalisiert.
export const updateBookingSchema = z.object({
  requestedDate: z.string().min(1),
  requestedTime: z.string().optional().default(''),
  location: z.string().optional().default(''),
  // Preis-Eingabe erfolgt im UI in CHF; die Umrechnung in Rappen passiert in der
  // Server-Action (Math.round(chf * 100)). Step 4: manuelle Preisanpassung
  // (Entgegenkommen/Rabatt) – eine Preisaenderung loest KEINE Kundenmail aus.
  priceChf: z.coerce.number().min(0),
  // Step 5: Wegkosten (CHF-Eingabe -> Rappen in der Action) und Zusatzminuten
  // (Termin-Verlaengerung ueber die Angebotsdauer hinaus). Beide optional mit
  // Default 0, damit bestehende Formulare ohne diese Felder weiter validieren.
  travelCostChf: z.coerce.number().min(0).optional().default(0),
  extraMinutes: z.coerce.number().int().min(0).optional().default(0),
  notifyCustomer: z
    .union([z.literal('on'), z.literal('true'), z.null()])
    .optional()
    .transform((v) => v === 'on' || v === 'true'),
});

export type UpdateBookingInput = z.infer<typeof updateBookingSchema>;

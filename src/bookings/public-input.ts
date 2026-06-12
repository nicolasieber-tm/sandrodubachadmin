// Validierungsschema für die öffentliche Buchungsstrecke (iframe).
// KEIN server-only: Das Schema darf auch clientseitig genutzt werden.
// Zod v4: `z.email()` statt `z.string().email()`.
import { z } from 'zod';

// formData.get(name) liefert null, wenn das Feld nicht im DOM war (zugeklappte
// Nachricht-/Rabatt-Folds, kein Einmal-Link-Token, per standardFields
// ausgeblendetes Telefon/Ort-Feld). Zods .optional() akzeptiert nur undefined —
// null muss daher explizit auf '' normalisiert werden, sonst scheitert jede
// Buchung ohne diese Felder.
const optionalText = z
  .string()
  .nullish()
  .transform((v) => v ?? '');

export const publicBookingSchema = z.object({
  offerId: z.string().uuid(),
  customerName: z.string().min(2),
  customerEmail: z.email(),
  // Telefon kann pro Angebot ausgeschaltet sein; ob es Pflicht ist, entscheidet
  // die Server-Action autoritativ aus offer.standardFields (resolveStandardFields).
  customerPhone: optionalText,
  // Leer erlaubt: Angebote im Anfrage-Modus ('anfrage') kommen ohne
  // Wunschtermin; ob ein Datum Pflicht ist, entscheidet die Server-Action
  // anhand von offer.bookingMode.
  requestedDate: optionalText,
  requestedTime: optionalText,
  // Optionaler Wunsch-Ort/-Region des Kunden. Dient Sandro spaeter als
  // Vorschlag in der Bearbeitung (ueberschreibbar). Leer = kein Vorschlag.
  location: optionalText,
  message: optionalText,
  // Optionaler Rabatt-Code (vom Kunden eingegeben).
  code: optionalText,
  // Optionales Einmal-Link-Token (aus ?l= in der URL).
  token: optionalText,
  // Honeypot: Bots füllen dieses für Menschen unsichtbare Feld aus.
  website: optionalText,
});

export type PublicBookingInput = z.infer<typeof publicBookingSchema>;

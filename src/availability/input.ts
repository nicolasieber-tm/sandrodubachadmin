// Validierungsschema für die Verfügbarkeit / Öffnungszeiten.
// KEIN server-only: Das Schema darf auch clientseitig genutzt werden.
// Wochentag-Konvention: 0=Montag … 6=Sonntag. Es müssen immer genau
// sieben Zeilen vorliegen.
import { z } from 'zod';

const timeRegex = /^\d{2}:\d{2}$/;

export const availabilitySchema = z.object({
  rows: z
    .array(
      z.object({
        weekday: z.number().int().min(0).max(6),
        enabled: z.boolean(),
        startTime: z.string().regex(timeRegex),
        endTime: z.string().regex(timeRegex),
      }),
    )
    .length(7),
});

export type AvailabilityInput = z.infer<typeof availabilitySchema>;

// Validierungsschemata für die Rabatt-Erfassung (Codes und Einmal-Links).
// KEIN server-only: Die Schemata dürfen auch clientseitig genutzt werden.
// Zod v4. Geld IMMER in Rappen: Bei valueType='fixed' wird die CHF-Eingabe
// in den Server-Actions in Rappen umgerechnet; bei 'percent' bleibt der Wert
// der Prozentsatz (1–100).
import { z } from 'zod';

// Gemeinsame Wert-Felder: valueType + roher numerischer Wert.
// Die Umrechnung CHF→Rappen für 'fixed' passiert bewusst in der Server-Action,
// damit das Schema rein und clientseitig nutzbar bleibt.
const valueType = z.enum(['percent', 'fixed']);

// Roher Wert als Zahl (CHF bei fixed, Prozent bei percent). Verfeinerung
// (Prozent 1–100, fixed > 0) erfolgt nach Kenntnis des valueType per superRefine.
const rawValue = z.coerce.number();

export const codeSchema = z
  .object({
    code: z
      .string()
      .min(3)
      .transform((s) => s.trim().toUpperCase()),
    valueType,
    value: rawValue,
    // Leeres Select = „Alle Angebote“ → null.
    offerId: z
      .string()
      .optional()
      .default('')
      .transform((s) => (s === '' ? null : s)),
    // Datums-String aus <input type="date"> → Date (Ende des Tages) oder null.
    validUntil: z
      .string()
      .optional()
      .default('')
      .transform((s) => (s.trim() === '' ? null : new Date(`${s}T23:59:59`)))
      .refine((d) => d === null || !Number.isNaN(d.getTime()), {
        message: 'Ungültiges Datum.',
      }),
    maxRedemptions: z.coerce.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.valueType === 'percent') {
      if (data.value < 1 || data.value > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'Prozentwert muss zwischen 1 und 100 liegen.',
        });
      }
    } else if (data.value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Betrag muss grösser als 0 sein.',
      });
    }
  });

export const linkSchema = z
  .object({
    label: z.string().min(2),
    offerId: z.string().uuid(),
    valueType,
    value: rawValue,
  })
  .superRefine((data, ctx) => {
    if (data.valueType === 'percent') {
      if (data.value < 1 || data.value > 100) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['value'],
          message: 'Prozentwert muss zwischen 1 und 100 liegen.',
        });
      }
    } else if (data.value <= 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['value'],
        message: 'Betrag muss grösser als 0 sein.',
      });
    }
  });

export type CodeInput = z.infer<typeof codeSchema>;
export type LinkInput = z.infer<typeof linkSchema>;

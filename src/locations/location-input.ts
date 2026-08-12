// Validierungsschema für Standorte (Anlegen und Bearbeiten).
// KEIN server-only: Das Schema darf auch clientseitig genutzt werden.
import { z } from 'zod';

export const locationSchema = z.object({
  name: z.string().trim().min(2),
  addressLine1: z.string().trim().optional().default(''),
  postalCode: z.string().trim().optional().default(''),
  city: z.string().trim().optional().default(''),
  // Leer = es gilt die globale ADMIN_NOTIFY_EMAIL fürs Buchungs-Postfach.
  notifyEmail: z
    .string()
    .trim()
    .optional()
    .default('')
    .transform((v) => (v === '' ? null : v))
    .refine((v) => v === null || z.email().safeParse(v).success, {
      message: 'Ungültige E-Mail-Adresse.',
    }),
  active: z.coerce.boolean().optional().default(true),
});

export type LocationInput = z.infer<typeof locationSchema>;

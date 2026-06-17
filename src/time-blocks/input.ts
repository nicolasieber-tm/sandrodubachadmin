// Validierung eines Blockers. KEIN server-only (Schema darf clientseitig genutzt
// werden). Entweder beide Zeiten leer (ganztägig) oder beide gesetzt mit Ende
// nach Start. 'HH:MM' ist nullbeschreibbar.
import { z } from 'zod';

const hhmm = /^\d{2}:\d{2}$/;

export const timeBlockSchema = z
  .object({
    blockDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(hhmm).nullable(),
    endTime: z.string().regex(hhmm).nullable(),
    reason: z.string().trim().max(200).nullable(),
  })
  .refine(
    (v) =>
      (v.startTime === null && v.endTime === null) ||
      (v.startTime !== null && v.endTime !== null),
    { message: 'Start und Ende müssen beide gesetzt oder beide leer sein.' },
  )
  .refine((v) => v.startTime === null || v.endTime === null || v.endTime > v.startTime, {
    message: 'Ende muss nach dem Start liegen.',
  });

export type TimeBlockInput = z.infer<typeof timeBlockSchema>;

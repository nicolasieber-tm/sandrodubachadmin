// Einzige Quelle der Wahrheit für konfigurierbare Zusatzfelder pro Angebot.
// KEIN server-only: wird im Admin-Editor, in der Buchungsstrecke (Client) und
// in den Server-Actions (autoritative Prüfung) verwendet.
import { z } from 'zod';

export type CustomFieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'select'
  | 'checkbox'
  | 'date';

// Definition eines Feldes (gespeichert in offers.custom_fields).
export type CustomFieldDef = {
  key: string; // stabil & eindeutig pro Angebot, z. B. "field_1"
  label: string;
  type: CustomFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[]; // nur type === 'select'
  min?: number; // nur type === 'number'
  max?: number; // nur type === 'number'
};

export type AnswerValue = string | number | boolean;

// Antwort als Snapshot (gespeichert in bookings.custom_fields).
export type CustomFieldAnswer = {
  key: string;
  label: string;
  type: CustomFieldType;
  value: AnswerValue;
};

// Auswahl der Typen für das Admin-Dropdown (Reihenfolge = Anzeige).
export const customFieldTypes = [
  { value: 'text', label: 'Text (einzeilig)' },
  { value: 'textarea', label: 'Langer Text' },
  { value: 'number', label: 'Zahl' },
  { value: 'select', label: 'Auswahl' },
  { value: 'checkbox', label: 'Ja/Nein' },
  { value: 'date', label: 'Datum' },
] as const;

// --- Validierung der Definition (Admin) ---

export const customFieldDefSchema = z
  .object({
    key: z.string().min(1),
    label: z.string().trim().min(1, 'Beschriftung fehlt.'),
    type: z.enum(['text', 'textarea', 'number', 'select', 'checkbox', 'date']),
    required: z.boolean().default(false),
    placeholder: z.string().optional(),
    options: z.array(z.string().trim().min(1)).optional(),
    min: z.number().optional(),
    max: z.number().optional(),
  })
  .refine((f) => f.type !== 'select' || (f.options?.length ?? 0) >= 1, {
    message: 'Auswahl-Felder brauchen mindestens eine Option.',
    path: ['options'],
  })
  .refine(
    (f) =>
      f.type !== 'number' ||
      f.min === undefined ||
      f.max === undefined ||
      f.min <= f.max,
    { message: 'Min darf nicht grösser als Max sein.', path: ['min'] },
  );

export const customFieldsDefSchema = z
  .array(customFieldDefSchema)
  .superRefine((fields, ctx) => {
    const seen = new Set<string>();
    fields.forEach((f, i) => {
      if (seen.has(f.key)) {
        ctx.addIssue({
          code: 'custom',
          message: 'Doppelter Feld-Schlüssel.',
          path: [i, 'key'],
        });
      }
      seen.add(f.key);
    });
  });

// --- Laufzeit-Validierung der Antworten (Server) ---

function fieldValueSchema(f: CustomFieldDef): z.ZodTypeAny {
  switch (f.type) {
    case 'number': {
      let s = z.coerce.number();
      if (typeof f.min === 'number') s = s.min(f.min);
      if (typeof f.max === 'number') s = s.max(f.max);
      return s;
    }
    case 'select':
      return f.options && f.options.length > 0
        ? z.enum(f.options as [string, ...string[]])
        : z.never();
    case 'checkbox':
      return z.boolean();
    case 'date':
      return z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
    case 'textarea':
    case 'text':
    default:
      return z.string().min(1);
  }
}

// Baut ein Zod-Objektschema über die Antworten. Pflichtfelder müssen vorhanden
// sein; optionale Felder dürfen fehlen; Checkboxen sind immer boolean.
export function buildAnswerSchema(fields: CustomFieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of fields) {
    let v = fieldValueSchema(f);
    if (f.type === 'checkbox') {
      // Pflicht-Checkbox (z. B. Einwilligung) muss aktiv angehakt sein.
      v = f.required ? z.literal(true) : v.default(false);
    } else if (!f.required) {
      v = v.optional();
    }
    shape[f.key] = v;
  }
  return z.object(shape);
}

// Baut die Snapshots aus validierten Werten. Checkboxen immer (Ja/Nein),
// andere Felder nur, wenn ein Wert vorhanden ist.
export function toAnswerSnapshots(
  fields: CustomFieldDef[],
  values: Record<string, AnswerValue | undefined>,
): CustomFieldAnswer[] {
  const out: CustomFieldAnswer[] = [];
  for (const f of fields) {
    const value = values[f.key];
    if (f.type === 'checkbox') {
      out.push({ key: f.key, label: f.label, type: f.type, value: Boolean(value) });
    } else if (value !== undefined && value !== '') {
      out.push({ key: f.key, label: f.label, type: f.type, value });
    }
  }
  return out;
}

// Liest die cf_*-Werte aus FormData, validiert sie und liefert Snapshots.
export function parseAnswers(
  fields: CustomFieldDef[],
  formData: FormData,
): { ok: true; answers: CustomFieldAnswer[] } | { ok: false; error: string } {
  const raw: Record<string, unknown> = {};
  for (const f of fields) {
    const v = formData.get(`cf_${f.key}`);
    if (f.type === 'checkbox') {
      raw[f.key] = v === 'on' || v === 'true';
    } else if (typeof v === 'string' && v.trim() !== '') {
      raw[f.key] = v.trim();
    }
    // sonst: weglassen (optional/leer)
  }
  const parsed = buildAnswerSchema(fields).safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: 'Bitte die Zusatzfelder prüfen.' };
  }
  return {
    ok: true,
    answers: toAnswerSnapshots(fields, parsed.data as Record<string, AnswerValue>),
  };
}

// Menschenlesbare Darstellung eines Antwortwerts (Termindetail + Mail).
export function formatAnswerValue(a: CustomFieldAnswer): string {
  if (a.type === 'checkbox') return a.value ? 'Ja' : 'Nein';
  return String(a.value);
}

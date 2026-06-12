// Einzige Quelle der Wahrheit für die konfigurierbaren Standardfelder der
// Buchungsstrecke. KEIN server-only: Admin-Editor, Buchungsstrecke (Client) und
// Server-Action nutzen dasselbe Modul (Muster wie custom-fields.ts).
import { z } from 'zod';

export type StandardFieldKey =
  | 'name'
  | 'email'
  | 'phone'
  | 'location'
  | 'message'
  | 'discount';

// Nur Abweichungen vom Default werden gespeichert (sparse). Bei 'name'/'email'
// wird `visible` ignoriert (immer sichtbar). `placeholder` nur location/message.
// `mode`/`options` gelten nur für 'location': 'select' rendert ein Dropdown mit
// festen Orten (Angabe dann Pflicht), Default 'text' = Freitext.
export type StandardFieldOverride = {
  visible?: boolean;
  label?: string;
  placeholder?: string;
  mode?: 'text' | 'select';
  options?: string[];
};

export type StandardFieldsConfig = Partial<
  Record<StandardFieldKey, StandardFieldOverride>
>;

// Vollständig aufgelöstes Feld für Rendering + Validierung.
export type ResolvedStandardField = {
  key: StandardFieldKey;
  visible: boolean;
  label: string;
  placeholder: string;
  required: boolean;
  hideable: boolean;
  hasPlaceholder: boolean;
  // Nur für 'location' relevant: 'select' = Dropdown mit festen Orten
  // (options nie leer), sonst 'text' mit options = [].
  mode: 'text' | 'select';
  options: string[];
};

type StandardFieldDefault = {
  label: string;
  placeholder: string;
  hideable: boolean; // false = immer sichtbar (name/email)
  required: boolean; // feste Pflicht-Logik (nicht konfigurierbar)
  hasPlaceholder: boolean;
};

// Default-Texte 1:1 aus dem heutigen booking-flow.tsx.
export const standardFieldDefaults: Record<StandardFieldKey, StandardFieldDefault> = {
  name: { label: 'Name', placeholder: '', hideable: false, required: true, hasPlaceholder: false },
  email: { label: 'E-Mail', placeholder: '', hideable: false, required: true, hasPlaceholder: false },
  phone: { label: 'Telefon', placeholder: '', hideable: true, required: true, hasPlaceholder: false },
  location: {
    label: 'Wo soll das Shooting stattfinden? (Ort/Region, optional)',
    placeholder: 'z. B. Bern, Thun, bei dir zu Hause …',
    hideable: true,
    required: false,
    hasPlaceholder: true,
  },
  message: {
    label: 'Nachricht hinzufügen',
    placeholder: 'Wünsche, Anlass, Personenzahl …',
    hideable: true,
    required: false,
    hasPlaceholder: true,
  },
  discount: { label: 'Rabatt-Code?', placeholder: '', hideable: true, required: false, hasPlaceholder: false },
};

// Feste Reihenfolge für Editor + Rendering.
export const standardFieldOrder: StandardFieldKey[] = [
  'name',
  'email',
  'phone',
  'location',
  'message',
  'discount',
];

// Validierung der gespeicherten Config (Admin-Action, autoritativ). Unbekannte
// Keys werden von z.object standardmässig verworfen (strip).
const overrideSchema = z.object({
  visible: z.boolean().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  // Leere Strings in options sind erlaubt (Editor-Zwischenstände); die
  // Auflösung trimmt und filtert sie heraus.
  mode: z.enum(['text', 'select']).optional(),
  options: z.array(z.string()).optional(),
});

export const standardFieldsConfigSchema = z.object({
  name: overrideSchema.optional(),
  email: overrideSchema.optional(),
  phone: overrideSchema.optional(),
  location: overrideSchema.optional(),
  message: overrideSchema.optional(),
  discount: overrideSchema.optional(),
});

function resolveOne(
  key: StandardFieldKey,
  config: StandardFieldsConfig,
): ResolvedStandardField {
  const def = standardFieldDefaults[key];
  const ov = config[key] ?? {};

  // Auswahl-Modus nur für 'location'; ohne brauchbare Optionen → Freitext.
  const options =
    key === 'location' && ov.mode === 'select'
      ? (ov.options ?? []).map((o) => o.trim()).filter((o) => o !== '')
      : [];
  const mode: 'text' | 'select' = options.length > 0 ? 'select' : 'text';

  const fallbackLabel =
    key === 'location' && mode === 'select'
      ? 'Wo soll das Shooting stattfinden?'
      : def.label;
  const label = ov.label && ov.label.trim() !== '' ? ov.label.trim() : fallbackLabel;
  const placeholder =
    def.hasPlaceholder && ov.placeholder && ov.placeholder.trim() !== ''
      ? ov.placeholder.trim()
      : def.placeholder;
  // name/email immer sichtbar; sonst Override oder Default (true).
  const visible = def.hideable ? ov.visible !== false : true;
  return {
    key,
    visible,
    label,
    placeholder,
    required: def.required,
    hideable: def.hideable,
    hasPlaceholder: def.hasPlaceholder,
    mode,
    options,
  };
}

export function resolveStandardFields(
  config: StandardFieldsConfig | null | undefined,
): Record<StandardFieldKey, ResolvedStandardField> {
  const cfg = config ?? {};
  return {
    name: resolveOne('name', cfg),
    email: resolveOne('email', cfg),
    phone: resolveOne('phone', cfg),
    location: resolveOne('location', cfg),
    message: resolveOne('message', cfg),
    discount: resolveOne('discount', cfg),
  };
}

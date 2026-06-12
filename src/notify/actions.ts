'use server';

// Server-Actions fuer die E-Mail-Verwaltung (Tab «E-Mails») und die
// angebotsspezifischen Mail-Overrides im Angebots-Modal.
//
// Auth-/Audit-Muster wie in src/offers/actions.ts und src/bookings/actions.ts:
// Der Zugriffsschutz liegt auf der Middleware (matcher '/admin/:path*'); die
// Actions protokollieren Aenderungen ueber logAudit. KEIN separates
// requireAdmin in diesem Projekt (gleiches Muster wie alle Admin-Actions).
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit';
import { z } from 'zod';
import type { EmailTemplateKeyValue } from '@/db/schema';
import {
  upsertTemplate,
  deleteTemplate,
  getTemplate,
  listOfferTemplateKeys,
} from './template-repository';
import {
  createReminderRule,
  updateReminderRule,
  deleteReminderRule,
} from './reminder-rules-repository';
import { isOfferTemplateKey } from './default-templates';

type ActionResult = { ok: true } | { error: string };

const TEMPLATE_KEYS: EmailTemplateKeyValue[] = [
  'received',
  'admin_new',
  'confirmed',
  'reminder',
  'rescheduled',
  'cancelled',
];

function revalidateEmailViews(): void {
  revalidatePath('/admin/emails');
  revalidatePath('/admin/angebote');
}

function isTemplateKey(v: unknown): v is EmailTemplateKeyValue {
  return typeof v === 'string' && (TEMPLATE_KEYS as string[]).includes(v);
}

// --- E-Mail-Vorlagen (global) ---

const templateSchema = z.object({
  templateKey: z.string(),
  subject: z.string().trim().min(1, 'Betreff fehlt.'),
  body: z.string().trim().min(1, 'Text fehlt.'),
});

/**
 * Speichert eine globale Vorlage (Betreff + Text) eines Mail-Typs.
 */
export async function saveTemplateAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = templateSchema.safeParse({
    templateKey: formData.get('templateKey'),
    subject: formData.get('subject'),
    body: formData.get('body'),
  });
  if (!parsed.success) {
    return { error: 'Bitte Betreff und Text ausfüllen.' };
  }
  if (!isTemplateKey(parsed.data.templateKey)) {
    return { error: 'Unbekannter Mail-Typ.' };
  }

  await upsertTemplate(parsed.data.templateKey, null, parsed.data.subject, parsed.data.body);
  await logAudit({
    action: 'email.template.gespeichert',
    entity: 'email_template',
    meta: { templateKey: parsed.data.templateKey, offerId: null },
  });
  revalidateEmailViews();
  return { ok: true };
}

/**
 * Setzt eine globale Vorlage auf den Standard zurueck (loescht die DB-Zeile).
 */
export async function resetTemplateAction(
  templateKey: string,
): Promise<ActionResult> {
  if (!isTemplateKey(templateKey)) {
    return { error: 'Unbekannter Mail-Typ.' };
  }
  await deleteTemplate(templateKey, null);
  await logAudit({
    action: 'email.template.zurueckgesetzt',
    entity: 'email_template',
    meta: { templateKey, offerId: null },
  });
  revalidateEmailViews();
  return { ok: true };
}

// --- Angebotsspezifische Mail-Overrides ---
//
// Pro Angebot duerfen nur die KUNDENSEITIGEN Mail-Typen ueberschrieben werden
// (Allowlist OFFER_TEMPLATE_KEYS in default-templates.ts). 'admin_new' ist
// ausgeschlossen – ein angebotsspezifischer Admin-Text ergibt keinen Sinn.

/** Aufgeloeste Vorlage fuers Modal – oder Fehler (z. B. unerlaubter Key). */
type OfferTemplateResult =
  | { ok: true; hasOverride: boolean; subject: string; body: string }
  | { error: string };

/**
 * Liefert fuer das Angebots-Modal die aktive Vorlage eines Mail-Typs:
 *  - hasOverride: gibt es eine angebotsspezifische Zeile?
 *  - subject/body: der Override falls vorhanden, sonst die globale/Standard-
 *    Vorlage als sinnvolle Vorbefuellung beim Anpassen.
 */
export async function getOfferTemplateAction(
  offerId: string,
  templateKey: string,
): Promise<OfferTemplateResult> {
  if (!isOfferTemplateKey(templateKey)) {
    return { error: 'Dieser Mail-Typ kann nicht pro Angebot angepasst werden.' };
  }
  const resolved = await getTemplate(templateKey, offerId);
  return {
    ok: true,
    hasOverride: resolved.source === 'offer',
    subject: resolved.subject,
    body: resolved.body,
  };
}

/**
 * Mail-Typen, fuer die dieses Angebot bereits einen Override hat – Basis fuer
 * die «Standard/Angepasst»-Badges im Modal (Inhalte laedt das UI lazy).
 */
export async function listOfferTemplateOverridesAction(
  offerId: string,
): Promise<EmailTemplateKeyValue[]> {
  if (typeof offerId !== 'string' || offerId === '') {
    return [];
  }
  return listOfferTemplateKeys(offerId);
}

const offerTemplateSchema = z.object({
  offerId: z.string().uuid('Angebot fehlt.'),
  subject: z.string().trim().min(1, 'Betreff fehlt.'),
  body: z.string().trim().min(1, 'Text fehlt.'),
});

/**
 * Speichert den angebotsspezifischen Override eines Mail-Typs.
 */
export async function saveOfferTemplateAction(
  offerId: string,
  templateKey: string,
  subject: string,
  body: string,
): Promise<ActionResult> {
  if (!isOfferTemplateKey(templateKey)) {
    return { error: 'Dieser Mail-Typ kann nicht pro Angebot angepasst werden.' };
  }
  const parsed = offerTemplateSchema.safeParse({ offerId, subject, body });
  if (!parsed.success) {
    return { error: 'Bitte Betreff und Text ausfüllen.' };
  }
  await upsertTemplate(templateKey, parsed.data.offerId, parsed.data.subject, parsed.data.body);
  await logAudit({
    action: 'email.template.gespeichert',
    entity: 'email_template',
    entityId: parsed.data.offerId,
    meta: { templateKey, offerId: parsed.data.offerId },
  });
  revalidateEmailViews();
  return { ok: true };
}

/**
 * Entfernt den angebotsspezifischen Override eines Mail-Typs (zurueck auf die
 * globale bzw. Standard-Vorlage).
 */
export async function deleteOfferTemplateAction(
  offerId: string,
  templateKey: string,
): Promise<ActionResult> {
  if (!isOfferTemplateKey(templateKey)) {
    return { error: 'Dieser Mail-Typ kann nicht pro Angebot angepasst werden.' };
  }
  if (typeof offerId !== 'string' || offerId === '') {
    return { error: 'Angebot nicht gefunden.' };
  }
  await deleteTemplate(templateKey, offerId);
  await logAudit({
    action: 'email.template.zurueckgesetzt',
    entity: 'email_template',
    entityId: offerId,
    meta: { templateKey, offerId },
  });
  revalidateEmailViews();
  return { ok: true };
}

// --- Reminder-Regeln ---

// Eigener Text ist optional; leere Strings werden zu null (= globale Vorlage).
const reminderRuleSchema = z.object({
  offsetHours: z.coerce.number().int().min(1, 'Vorlauf muss mindestens 1 Stunde sein.'),
  enabled: z.boolean().default(true),
  subject: z
    .string()
    .optional()
    .default('')
    .transform((v) => (v.trim() === '' ? null : v.trim())),
  body: z
    .string()
    .optional()
    .default('')
    .transform((v) => (v.trim() === '' ? null : v.trim())),
});

function bool(v: FormDataEntryValue | null): boolean {
  return v === 'on' || v === 'true';
}

/**
 * Legt eine neue Reminder-Regel an.
 */
export async function createReminderRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = reminderRuleSchema.safeParse({
    offsetHours: formData.get('offsetHours'),
    enabled: bool(formData.get('enabled')),
    subject: formData.get('subject') ?? '',
    body: formData.get('body') ?? '',
  });
  if (!parsed.success) {
    return { error: 'Bitte den Vorlauf prüfen.' };
  }
  // Eigener Text nur sinnvoll, wenn BEIDE Felder gesetzt sind: sonst beide null.
  const { offsetHours, enabled } = parsed.data;
  const subject = parsed.data.subject && parsed.data.body ? parsed.data.subject : null;
  const body = parsed.data.subject && parsed.data.body ? parsed.data.body : null;

  const rule = await createReminderRule({ offsetHours, enabled, subject, body });
  await logAudit({
    action: 'email.reminder_rule.angelegt',
    entity: 'reminder_rule',
    entityId: rule.id,
    meta: { offsetHours, enabled },
  });
  revalidateEmailViews();
  return { ok: true };
}

/**
 * Aktualisiert eine bestehende Reminder-Regel.
 */
export async function updateReminderRuleAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const id = formData.get('id');
  if (typeof id !== 'string' || id === '') {
    return { error: 'Regel nicht gefunden.' };
  }
  const parsed = reminderRuleSchema.safeParse({
    offsetHours: formData.get('offsetHours'),
    enabled: bool(formData.get('enabled')),
    subject: formData.get('subject') ?? '',
    body: formData.get('body') ?? '',
  });
  if (!parsed.success) {
    return { error: 'Bitte den Vorlauf prüfen.' };
  }
  const { offsetHours, enabled } = parsed.data;
  const subject = parsed.data.subject && parsed.data.body ? parsed.data.subject : null;
  const body = parsed.data.subject && parsed.data.body ? parsed.data.body : null;

  const updated = await updateReminderRule(id, { offsetHours, enabled, subject, body });
  if (!updated) {
    return { error: 'Regel nicht gefunden.' };
  }
  await logAudit({
    action: 'email.reminder_rule.aktualisiert',
    entity: 'reminder_rule',
    entityId: id,
    meta: { offsetHours, enabled },
  });
  revalidateEmailViews();
  return { ok: true };
}

/**
 * Loescht eine Reminder-Regel (inkl. ihrer Versand-Marker via ON DELETE CASCADE).
 */
export async function deleteReminderRuleAction(id: string): Promise<ActionResult> {
  if (typeof id !== 'string' || id === '') {
    return { error: 'Regel nicht gefunden.' };
  }
  await deleteReminderRule(id);
  await logAudit({
    action: 'email.reminder_rule.geloescht',
    entity: 'reminder_rule',
    entityId: id,
  });
  revalidateEmailViews();
  return { ok: true };
}

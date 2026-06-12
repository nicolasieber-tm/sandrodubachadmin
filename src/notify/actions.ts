'use server';

// Server-Actions fuer die E-Mail-Verwaltung (Tab «E-Mails») und den
// angebotsspezifischen Bestaetigungs-Override im Angebots-Modal.
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
} from './template-repository';
import {
  createReminderRule,
  updateReminderRule,
  deleteReminderRule,
} from './reminder-rules-repository';

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

// --- Angebotsspezifische Bestaetigungs-Mail ('confirmed'-Override) ---

/**
 * Liefert fuer das Angebots-Modal die aktive Bestaetigungs-Vorlage:
 *  - hasOverride: gibt es eine angebotsspezifische Zeile?
 *  - subject/body: der Override falls vorhanden, sonst die globale Vorlage als
 *    sinnvolle Vorbefuellung beim Aktivieren des eigenen Texts.
 */
export async function getOfferConfirmedTemplateAction(
  offerId: string,
): Promise<{ hasOverride: boolean; subject: string; body: string }> {
  const resolved = await getTemplate('confirmed', offerId);
  return {
    hasOverride: resolved.source === 'offer',
    subject: resolved.subject,
    body: resolved.body,
  };
}

const offerConfirmedSchema = z.object({
  offerId: z.string().uuid('Angebot fehlt.'),
  subject: z.string().trim().min(1, 'Betreff fehlt.'),
  body: z.string().trim().min(1, 'Text fehlt.'),
});

/**
 * Speichert die angebotsspezifische Bestaetigungs-Mail (confirmed-Override).
 */
export async function saveOfferConfirmedTemplateAction(
  offerId: string,
  subject: string,
  body: string,
): Promise<ActionResult> {
  const parsed = offerConfirmedSchema.safeParse({ offerId, subject, body });
  if (!parsed.success) {
    return { error: 'Bitte Betreff und Text der Bestätigungs-Mail ausfüllen.' };
  }
  await upsertTemplate('confirmed', parsed.data.offerId, parsed.data.subject, parsed.data.body);
  await logAudit({
    action: 'email.template.gespeichert',
    entity: 'email_template',
    entityId: parsed.data.offerId,
    meta: { templateKey: 'confirmed', offerId: parsed.data.offerId },
  });
  revalidateEmailViews();
  return { ok: true };
}

/**
 * Entfernt den angebotsspezifischen confirmed-Override (zurueck auf die globale
 * Bestaetigungs-Vorlage).
 */
export async function deleteOfferConfirmedTemplateAction(
  offerId: string,
): Promise<ActionResult> {
  if (typeof offerId !== 'string' || offerId === '') {
    return { error: 'Angebot nicht gefunden.' };
  }
  await deleteTemplate('confirmed', offerId);
  await logAudit({
    action: 'email.template.zurueckgesetzt',
    entity: 'email_template',
    entityId: offerId,
    meta: { templateKey: 'confirmed', offerId },
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

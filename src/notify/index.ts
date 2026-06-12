import { formatRappen } from '@/lib/money';
import type { Booking, EmailTemplateKeyValue } from '@/db/schema';
import { formatAnswerValue } from '@/offers/custom-fields';
import { logTransport } from './log-transport';
import { resendTransport } from './resend-transport';
import { renderTemplate, type TemplateBooking } from './template';
import { DEFAULT_TEMPLATES, type TemplateContent } from './default-templates';
import type { NotificationTransport } from './types';

// Transportwahl: Ist ein Resend-API-Key gesetzt, gehen Mails echt via Resend
// raus. Ohne Key schreiben wir bewusst nur ins Log (lokale Entwicklung).
const transport: NotificationTransport = process.env.RESEND_API_KEY
  ? resendTransport
  : logTransport;

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? 'sandro@sandrodubach.ch';

// Lader fuer die aktive Vorlage eines Mail-Typs (angebotsspezifisch → global →
// Standard). Injizierbar gehalten: Im Echtbetrieb liest loadTemplateFromDb aus
// der DB, in Tests wird der Default-Lader (ohne Netz/DB) verwendet.
export type TemplateLoader = (
  key: EmailTemplateKeyValue,
  offerId: string | null,
) => Promise<TemplateContent>;

// Default-Lader OHNE DB/Netz: liefert immer die eingebaute Standard-Vorlage.
// Damit funktioniert der Default-Pfad (und die Unit-Tests) ohne DB. Exportiert,
// damit Tests ihn als Lader injizieren koennen.
export const defaultTemplateLoader: TemplateLoader = async (key) => DEFAULT_TEMPLATES[key];

// DB-Lader: lazy import, damit der reine Default-Pfad keine server-only-Module
// (DB) zieht. Wird vom Echtbetrieb als Standard-Lader gesetzt.
//
// Wirft NIE: Das Vorlagen-Laden darf den Versand (und damit z. B. die
// Buchungsanlage, die notifyBookingReceived awaitet) nicht zum Scheitern
// bringen. Bei DB-Problemen (Tabelle fehlt noch, Verbindungsfehler) faellt
// der Versand auf die eingebaute Standard-Vorlage zurueck.
const dbTemplateLoader: TemplateLoader = async (key, offerId) => {
  try {
    const { getTemplate } = await import('./template-repository');
    const resolved = await getTemplate(key, offerId);
    return { subject: resolved.subject, body: resolved.body };
  } catch (err) {
    console.error('[notify] Vorlagen-Laden fehlgeschlagen, nutze Standard-Vorlage:', err);
    return DEFAULT_TEMPLATES[key];
  }
};

// Wandelt eine Booking-Row in die Minimalform fuer die Platzhalter-Engine.
function toTemplateBooking(b: Booking): TemplateBooking {
  return {
    customerName: b.customerName,
    offerNameSnapshot: b.offerNameSnapshot,
    requestedDate: b.requestedDate,
    requestedTime: b.requestedTime,
    location: b.location,
    priceRappen: b.priceRappen,
    message: b.message,
  };
}

// Rendert eine Vorlage (subject + body) gegen eine Buchung.
function render(content: TemplateContent, b: Booking): { subject: string; text: string } {
  const tb = toTemplateBooking(b);
  return {
    subject: renderTemplate(content.subject, tb),
    text: renderTemplate(content.body, tb),
  };
}

/**
 * Bestätigt der Kundin/dem Kunden den Eingang der Anfrage.
 */
export async function notifyBookingReceived(
  b: Booking,
  t: NotificationTransport = transport,
  loadTemplate: TemplateLoader = dbTemplateLoader,
): Promise<void> {
  const content = await loadTemplate('received', b.offerId);
  const { subject, text } = render(content, b);
  await t.send({ to: b.customerEmail, subject, text });
}

/**
 * Informiert den Admin über eine neue eingegangene Buchungsanfrage.
 *
 * Die Antworten der Zusatzfelder (custom fields) werden NICHT in die Vorlage
 * gequetscht, sondern hier als fester Block unter den gerenderten Body
 * angehaengt. Ebenso die Kontaktzeilen (E-Mail/Telefon), die nicht als
 * Platzhalter existieren, fuer den Admin aber wichtig sind.
 */
export async function notifyAdminNewBooking(
  b: Booking,
  t: NotificationTransport = transport,
  loadTemplate: TemplateLoader = dbTemplateLoader,
): Promise<void> {
  const content = await loadTemplate('admin_new', b.offerId);
  const { subject, text } = render(content, b);

  // Fester Anhang: Kontaktdaten + Custom-Field-Antworten unter dem Body.
  const anhang = [
    `E-Mail: ${b.customerEmail}`,
    `Telefon: ${b.customerPhone || '–'}`,
    ...b.customFields.map((a) => `${a.label}: ${formatAnswerValue(a)}`),
  ].join('\n');

  await t.send({ to: ADMIN_EMAIL, subject, text: `${text}\n\n${anhang}` });
}

/**
 * Bestätigt der Kundin/dem Kunden den fixierten Termin.
 */
export async function notifyBookingConfirmed(
  b: Booking,
  t: NotificationTransport = transport,
  loadTemplate: TemplateLoader = dbTemplateLoader,
): Promise<void> {
  const content = await loadTemplate('confirmed', b.offerId);
  const { subject, text } = render(content, b);
  await t.send({ to: b.customerEmail, subject, text });
}

/**
 * Erinnert die Kundin/den Kunden freundlich an den nahenden Termin.
 *
 * Optional kann eine bereits aufgeloeste Vorlage uebergeben werden (z. B. der
 * eigene Text einer Reminder-Regel). Ist `override` gesetzt, wird der Lader
 * uebersprungen.
 */
export async function notifyBookingReminder(
  b: Booking,
  t: NotificationTransport = transport,
  loadTemplate: TemplateLoader = dbTemplateLoader,
  override?: TemplateContent,
): Promise<void> {
  const content = override ?? (await loadTemplate('reminder', b.offerId));
  const { subject, text } = render(content, b);
  await t.send({ to: b.customerEmail, subject, text });
}

/**
 * Informiert die Kundin/den Kunden über den verschobenen Termin (neues Datum/
 * neue Zeit). Wird vom Admin beim Bearbeiten ausgelöst, wenn die Option
 * "Kundin/Kunde informieren" gewählt ist.
 */
export async function notifyBookingRescheduled(
  b: Booking,
  t: NotificationTransport = transport,
  loadTemplate: TemplateLoader = dbTemplateLoader,
): Promise<void> {
  const content = await loadTemplate('rescheduled', b.offerId);
  const { subject, text } = render(content, b);
  await t.send({ to: b.customerEmail, subject, text });
}

/**
 * Informiert die Kundin/den Kunden freundlich über die Absage.
 */
export async function notifyBookingCancelled(
  b: Booking,
  t: NotificationTransport = transport,
  loadTemplate: TemplateLoader = dbTemplateLoader,
): Promise<void> {
  const content = await loadTemplate('cancelled', b.offerId);
  const { subject, text } = render(content, b);
  await t.send({ to: b.customerEmail, subject, text });
}

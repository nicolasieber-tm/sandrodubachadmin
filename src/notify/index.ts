import { formatRappen } from '@/lib/money';
import type { Booking } from '@/db/schema';
import { formatAnswerValue } from '@/offers/custom-fields';
import { logTransport } from './log-transport';
import { resendTransport } from './resend-transport';
import type { NotificationTransport } from './types';

// Transportwahl: Ist ein Resend-API-Key gesetzt, gehen Mails echt via Resend
// raus. Ohne Key schreiben wir bewusst nur ins Log (lokale Entwicklung).
const transport: NotificationTransport = process.env.RESEND_API_KEY
  ? resendTransport
  : logTransport;

const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL ?? 'sandro@sandrodubach.ch';

// Datum/Zeit für die Anzeige im Text – Zeit nur, wenn vorhanden.
function whenLine(b: Booking): string {
  return b.requestedTime ? `${b.requestedDate} um ${b.requestedTime} Uhr` : b.requestedDate;
}

/**
 * Bestätigt der Kundin/dem Kunden den Eingang der Anfrage.
 */
export async function notifyBookingReceived(
  b: Booking,
  t: NotificationTransport = transport,
): Promise<void> {
  const text = [
    `Hallo ${b.customerName}`,
    '',
    'Vielen Dank für deine Anfrage – wir haben sie erhalten.',
    '',
    `Angebot: ${b.offerNameSnapshot}`,
    `Wunschtermin: ${whenLine(b)}`,
    '',
    'Sandro meldet sich in Kürze persönlich bei dir, um die Details zu besprechen.',
    '',
    'Herzliche Grüsse',
    'Sandro Dubach Fotografie',
  ].join('\n');

  await t.send({
    to: b.customerEmail,
    subject: 'Anfrage erhalten – Sandro Dubach Fotografie',
    text,
  });
}

/**
 * Informiert den Admin über eine neue eingegangene Buchungsanfrage.
 */
export async function notifyAdminNewBooking(
  b: Booking,
  t: NotificationTransport = transport,
): Promise<void> {
  const text = [
    'Eine neue Buchungsanfrage ist eingegangen.',
    '',
    `Angebot: ${b.offerNameSnapshot}`,
    `Kunde: ${b.customerName}`,
    `E-Mail: ${b.customerEmail}`,
    `Telefon: ${b.customerPhone || '–'}`,
    `Wunschtermin: ${whenLine(b)}`,
    b.location ? `Wunsch-Ort: ${b.location}` : '',
    `Preis: ${formatRappen(b.priceRappen)}`,
    b.message ? `Nachricht: ${b.message}` : '',
    ...b.customFields.map((a) => `${a.label}: ${formatAnswerValue(a)}`),
  ]
    .filter(Boolean)
    .join('\n');

  await t.send({
    to: ADMIN_EMAIL,
    subject: `Neue Buchungsanfrage: ${b.offerNameSnapshot}`,
    text,
  });
}

/**
 * Bestätigt der Kundin/dem Kunden den fixierten Termin.
 */
export async function notifyBookingConfirmed(
  b: Booking,
  t: NotificationTransport = transport,
): Promise<void> {
  const text = [
    `Hallo ${b.customerName}`,
    '',
    'Dein Termin ist bestätigt – wir freuen uns auf dich.',
    '',
    `Angebot: ${b.offerNameSnapshot}`,
    `Termin: ${whenLine(b)}`,
    `Ort: ${b.location || 'wird noch bekannt gegeben'}`,
    '',
    'Bei Fragen melde dich jederzeit.',
    '',
    'Herzliche Grüsse',
    'Sandro Dubach Fotografie',
  ].join('\n');

  await t.send({
    to: b.customerEmail,
    subject: 'Termin bestätigt',
    text,
  });
}

/**
 * Erinnert die Kundin/den Kunden freundlich an den nahenden Termin (48h vorher).
 */
export async function notifyBookingReminder(
  b: Booking,
  t: NotificationTransport = transport,
): Promise<void> {
  const text = [
    `Hallo ${b.customerName}`,
    '',
    'Dein Termin rückt näher – wir freuen uns schon sehr auf dich.',
    '',
    `Angebot: ${b.offerNameSnapshot}`,
    `Termin: ${whenLine(b)}`,
    `Ort: ${b.location || 'wird noch bekannt gegeben'}`,
    '',
    'Falls sich etwas ändert oder du noch Fragen hast, melde dich einfach.',
    '',
    'Bis bald und herzliche Grüsse',
    'Sandro Dubach Fotografie',
  ].join('\n');

  await t.send({
    to: b.customerEmail,
    subject: 'Erinnerung: Dein Termin rückt näher',
    text,
  });
}

/**
 * Informiert die Kundin/den Kunden über den verschobenen Termin (neues Datum/
 * neue Zeit). Wird vom Admin beim Bearbeiten ausgelöst, wenn die Option
 * "Kundin/Kunde informieren" gewählt ist.
 */
export async function notifyBookingRescheduled(
  b: Booking,
  t: NotificationTransport = transport,
): Promise<void> {
  const text = [
    `Hallo ${b.customerName}`,
    '',
    'Dein Termin wurde auf einen neuen Zeitpunkt verschoben.',
    '',
    `Angebot: ${b.offerNameSnapshot}`,
    `Neuer Termin: ${whenLine(b)}`,
    `Ort: ${b.location || 'wird noch bekannt gegeben'}`,
    '',
    'Falls dir der neue Zeitpunkt nicht passt, melde dich einfach bei uns.',
    '',
    'Herzliche Grüsse',
    'Sandro Dubach Fotografie',
  ].join('\n');

  await t.send({
    to: b.customerEmail,
    subject: 'Termin verschoben',
    text,
  });
}

/**
 * Informiert die Kundin/den Kunden freundlich über die Absage.
 */
export async function notifyBookingCancelled(
  b: Booking,
  t: NotificationTransport = transport,
): Promise<void> {
  const text = [
    `Hallo ${b.customerName}`,
    '',
    `Leider müssen wir den Termin für "${b.offerNameSnapshot}" am ${whenLine(b)} absagen.`,
    '',
    'Das tut uns aufrichtig leid. Melde dich gerne, damit wir gemeinsam einen neuen Termin finden.',
    '',
    'Herzliche Grüsse',
    'Sandro Dubach Fotografie',
  ].join('\n');

  await t.send({
    to: b.customerEmail,
    subject: 'Termin abgesagt',
    text,
  });
}

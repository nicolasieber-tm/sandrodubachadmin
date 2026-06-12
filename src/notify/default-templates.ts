// Standard-Vorlagen fuer die sechs Mail-Typen. Bilden die frueher hartkodierten
// Texte aus src/notify/index.ts 1:1 als Vorlagen mit Platzhaltern ab. Sie sind
// der Fallback, wenn in der DB (emailTemplates) keine Zeile existiert.
//
// Hinweis zu {{termin}}: kombiniert Datum + Uhrzeit und bildet damit die
// frühere whenLine-Semantik ab (kein Datum → «nach Absprache»; Datum ohne Zeit
// → nur Datum; Datum + Zeit → «… um HH:MM Uhr»).
//
// Hinweis zur admin_new-Vorlage: Die Antworten der konfigurierbaren Zusatzfelder
// (custom fields) werden NICHT in die Vorlage gequetscht, sondern beim Versand
// als fester Block unter den gerenderten Body angehaengt (siehe index.ts).
import type { EmailTemplateKeyValue } from '@/db/schema';

export interface TemplateContent {
  subject: string;
  body: string;
}

export const DEFAULT_TEMPLATES: Record<EmailTemplateKeyValue, TemplateContent> = {
  // notifyBookingReceived – Eingangsbestaetigung an die Kundin/den Kunden.
  received: {
    subject: 'Anfrage erhalten – Sandro Dubach Fotografie',
    body: [
      'Hallo {{name}}',
      '',
      'Vielen Dank für deine Anfrage – wir haben sie erhalten.',
      '',
      'Angebot: {{angebot}}',
      'Wunschtermin: {{termin}}',
      '',
      'Sandro meldet sich in Kürze persönlich bei dir, um die Details zu besprechen.',
      '',
      'Herzliche Grüsse',
      'Sandro Dubach Fotografie',
    ].join('\n'),
  },

  // notifyAdminNewBooking – Info an den Admin. Die Custom-Field-Zeilen haengt
  // der Versand separat unter diesem Body an.
  admin_new: {
    subject: 'Neue Buchungsanfrage: {{angebot}}',
    body: [
      'Eine neue Buchungsanfrage ist eingegangen.',
      '',
      'Angebot: {{angebot}}',
      'Kunde: {{name}}',
      'Wunschtermin: {{termin}}',
      'Ort: {{ort}}',
      'Preis: {{preis}}',
      'Nachricht: {{nachricht}}',
    ].join('\n'),
  },

  // notifyBookingConfirmed – Terminbestaetigung an die Kundin/den Kunden.
  confirmed: {
    subject: 'Termin bestätigt',
    body: [
      'Hallo {{name}}',
      '',
      'Dein Termin ist bestätigt – wir freuen uns auf dich.',
      '',
      'Angebot: {{angebot}}',
      'Termin: {{termin}}',
      'Ort: {{ort}}',
      '',
      'Bei Fragen melde dich jederzeit.',
      '',
      'Herzliche Grüsse',
      'Sandro Dubach Fotografie',
    ].join('\n'),
  },

  // notifyBookingReminder – Erinnerung an den nahenden Termin.
  reminder: {
    subject: 'Erinnerung: Dein Termin rückt näher',
    body: [
      'Hallo {{name}}',
      '',
      'Dein Termin rückt näher – wir freuen uns schon sehr auf dich.',
      '',
      'Angebot: {{angebot}}',
      'Termin: {{termin}}',
      'Ort: {{ort}}',
      '',
      'Falls sich etwas ändert oder du noch Fragen hast, melde dich einfach.',
      '',
      'Bis bald und herzliche Grüsse',
      'Sandro Dubach Fotografie',
    ].join('\n'),
  },

  // notifyBookingRescheduled – Terminverschiebung an die Kundin/den Kunden.
  rescheduled: {
    subject: 'Termin verschoben',
    body: [
      'Hallo {{name}}',
      '',
      'Dein Termin wurde auf einen neuen Zeitpunkt verschoben.',
      '',
      'Angebot: {{angebot}}',
      'Neuer Termin: {{termin}}',
      'Ort: {{ort}}',
      '',
      'Falls dir der neue Zeitpunkt nicht passt, melde dich einfach bei uns.',
      '',
      'Herzliche Grüsse',
      'Sandro Dubach Fotografie',
    ].join('\n'),
  },

  // notifyBookingCancelled – Absage an die Kundin/den Kunden.
  cancelled: {
    subject: 'Termin abgesagt',
    body: [
      'Hallo {{name}}',
      '',
      'Leider müssen wir den Termin für "{{angebot}}" absagen.',
      '',
      'Das tut uns aufrichtig leid. Melde dich gerne, damit wir gemeinsam einen neuen Termin finden.',
      '',
      'Herzliche Grüsse',
      'Sandro Dubach Fotografie',
    ].join('\n'),
  },
};

// Menschenlesbare Labels fuer das Admin-UI (Reihenfolge = Anzeige).
export const TEMPLATE_LABELS: Record<EmailTemplateKeyValue, string> = {
  received: 'Eingangsbestätigung an Kunde',
  admin_new: 'Info an dich bei neuer Buchung',
  confirmed: 'Terminbestätigung',
  reminder: 'Erinnerung',
  rescheduled: 'Terminverschiebung',
  cancelled: 'Absage',
};

// Anzeige-Reihenfolge der Mail-Typen im Admin-UI.
export const TEMPLATE_KEYS_ORDERED: EmailTemplateKeyValue[] = [
  'received',
  'admin_new',
  'confirmed',
  'reminder',
  'rescheduled',
  'cancelled',
];

// Mail-Typen, die pro Angebot ueberschrieben werden koennen: nur die
// kundenseitigen Mails. 'admin_new' (Info an den Admin) ist bewusst
// ausgeschlossen – ein angebotsspezifischer Admin-Text ergibt keinen Sinn.
// Diese Allowlist ist die einzige Quelle der Wahrheit: die Server-Actions
// validieren dagegen (isOfferTemplateKey), das Angebots-Modal rendert genau
// diese Typen.
export const OFFER_TEMPLATE_KEYS: EmailTemplateKeyValue[] = [
  'received',
  'confirmed',
  'reminder',
  'rescheduled',
  'cancelled',
];

// Type-Guard fuer die Allowlist. Liegt hier (statt in actions.ts), weil
// 'use server'-Module nur async-Funktionen exportieren duerfen und der Guard
// auch clientseitig nutzbar sein soll.
export function isOfferTemplateKey(v: unknown): v is EmailTemplateKeyValue {
  return typeof v === 'string' && (OFFER_TEMPLATE_KEYS as string[]).includes(v);
}

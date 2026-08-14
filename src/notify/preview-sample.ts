// Beispieldaten fuer die Live-Vorschau der E-Mail-Vorlagen im Admin-UI. Bewusst
// client-tauglich (keine DB/Netz, keine server-only-Markierung): dieselbe Form
// wie TemplateBooking, damit renderTemplate sie direkt verarbeiten kann.
import type { TemplateBooking } from './template';

export const PREVIEW_SAMPLE: TemplateBooking = {
  customerName: 'Lena Muster',
  offerNameSnapshot: 'Klassische Massage 60 Min',
  requestedDate: '2026-06-15', // Montag
  requestedTime: '14:00',
  location: 'Gossau',
  priceRappen: 9500,
  message: 'Ich freue mich sehr auf den Termin!',
};

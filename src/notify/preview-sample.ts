// Beispieldaten fuer die Live-Vorschau der E-Mail-Vorlagen im Admin-UI. Bewusst
// client-tauglich (keine DB/Netz, keine server-only-Markierung): dieselbe Form
// wie TemplateBooking, damit renderTemplate sie direkt verarbeiten kann.
import type { TemplateBooking } from './template';

export const PREVIEW_SAMPLE: TemplateBooking = {
  customerName: 'Lena Muster',
  offerNameSnapshot: 'Portrait-Shooting',
  requestedDate: '2026-06-15', // Montag
  requestedTime: '14:00',
  location: 'Bern',
  priceRappen: 25000,
  message: 'Ich freue mich sehr auf das Shooting!',
};

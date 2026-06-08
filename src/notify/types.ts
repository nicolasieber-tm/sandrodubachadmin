// Schnittstellen für ausgehende Benachrichtigungen.
// Bewusst transportneutral gehalten, damit der Log-Transport jetzt und ein
// echter Resend-Transport später dieselbe Signatur erfüllen.

export interface OutboundMessage {
  to: string;
  subject: string;
  text: string;
}

export interface NotificationTransport {
  send(msg: OutboundMessage): Promise<void>;
}

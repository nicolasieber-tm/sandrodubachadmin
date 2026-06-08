export type BookingStatusValue = 'neu' | 'bestaetigt' | 'abgesagt' | 'erledigt';

export const STATUS_LABEL: Record<BookingStatusValue, string> = {
  neu: 'Neu',
  bestaetigt: 'Bestätigt',
  abgesagt: 'Abgesagt',
  erledigt: 'Erledigt',
};

export function statusBadgeClass(s: BookingStatusValue): string {
  switch (s) {
    case 'neu':
      return 'st-new';
    case 'bestaetigt':
      return 'st-conf';
    case 'abgesagt':
      return 'st-canc';
    case 'erledigt':
      return 'st-done';
  }
}

export const ALLOWED_TRANSITIONS: Record<BookingStatusValue, BookingStatusValue[]> = {
  neu: ['bestaetigt', 'abgesagt'],
  bestaetigt: ['erledigt', 'abgesagt'],
  abgesagt: [],
  erledigt: [],
};

export function canTransition(from: BookingStatusValue, to: BookingStatusValue): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function nextActions(s: BookingStatusValue): BookingStatusValue[] {
  return ALLOWED_TRANSITIONS[s];
}

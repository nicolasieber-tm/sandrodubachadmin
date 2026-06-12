import { describe, it, expect } from 'vitest';
import { renderTemplate, type TemplateBooking } from './template';

// Tests fuer die REINE Platzhalter-Engine (kein DB/Netz noetig).

function booking(overrides: Partial<TemplateBooking> = {}): TemplateBooking {
  return {
    customerName: 'Lena Muster',
    offerNameSnapshot: 'Portrait-Shooting',
    requestedDate: '2026-06-15', // Montag
    requestedTime: '14:00',
    location: 'Bern',
    priceRappen: 25000,
    message: 'Freue mich!',
    ...overrides,
  };
}

describe('renderTemplate – Standard-Platzhalter', () => {
  it('ersetzt name, angebot, ort, preis und nachricht', () => {
    const out = renderTemplate(
      '{{name}} / {{angebot}} / {{ort}} / {{preis}} / {{nachricht}}',
      booking(),
    );
    expect(out).toBe('Lena Muster / Portrait-Shooting / Bern / 250 CHF / Freue mich!');
  });

  it('formatiert {{datum}} als «Montag, 15. Juni 2026» (de-CH, TZ-sicher)', () => {
    expect(renderTemplate('{{datum}}', booking())).toBe('Montag, 15. Juni 2026');
  });

  it('liefert den korrekten {{wochentag}}', () => {
    expect(renderTemplate('{{wochentag}}', booking())).toBe('Montag');
  });

  it('haengt «Uhr» an {{uhrzeit}} an', () => {
    expect(renderTemplate('{{uhrzeit}}', booking())).toBe('14:00 Uhr');
  });

  it('kombiniert Datum + Zeit in {{termin}}', () => {
    expect(renderTemplate('{{termin}}', booking())).toBe(
      'Montag, 15. Juni 2026 um 14:00 Uhr',
    );
  });
});

describe('renderTemplate – Whitespace & Unbekanntes', () => {
  it('ist whitespace-tolerant ({{ name }})', () => {
    expect(renderTemplate('Hallo {{ name }}', booking())).toBe('Hallo Lena Muster');
  });

  it('laesst unbekannte Platzhalter unangetastet', () => {
    expect(renderTemplate('{{name}} {{unbekannt}}', booking())).toBe(
      'Lena Muster {{unbekannt}}',
    );
  });
});

describe('renderTemplate – Leer-/Fehlerfaelle', () => {
  it('Anfrage ohne Datum: {{datum}}, {{wochentag}}, {{termin}} = «nach Absprache»', () => {
    const b = booking({ requestedDate: null, requestedTime: '' });
    expect(renderTemplate('{{datum}}', b)).toBe('nach Absprache');
    expect(renderTemplate('{{wochentag}}', b)).toBe('nach Absprache');
    expect(renderTemplate('{{termin}}', b)).toBe('nach Absprache');
  });

  it('leere Uhrzeit: {{uhrzeit}} = «nach Absprache»', () => {
    expect(renderTemplate('{{uhrzeit}}', booking({ requestedTime: '' }))).toBe(
      'nach Absprache',
    );
  });

  it('Datum ohne Zeit: {{termin}} ist nur das Datum', () => {
    const b = booking({ requestedTime: '' });
    expect(renderTemplate('{{termin}}', b)).toBe('Montag, 15. Juni 2026');
  });

  it('leerer Ort: {{ort}} = «wird noch bekannt gegeben»', () => {
    expect(renderTemplate('{{ort}}', booking({ location: null }))).toBe(
      'wird noch bekannt gegeben',
    );
    expect(renderTemplate('{{ort}}', booking({ location: '' }))).toBe(
      'wird noch bekannt gegeben',
    );
  });

  it('leere Nachricht: {{nachricht}} = leerer String', () => {
    expect(renderTemplate('[{{nachricht}}]', booking({ message: null }))).toBe('[]');
  });

  it('formatiert {{datum}} auch im Winter korrekt (TZ-fest)', () => {
    // 2026-01-15 ist ein Donnerstag.
    const b = booking({ requestedDate: '2026-01-15' });
    expect(renderTemplate('{{datum}}', b)).toBe('Donnerstag, 15. Januar 2026');
  });
});

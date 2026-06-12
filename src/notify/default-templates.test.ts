import { describe, it, expect } from 'vitest';
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_LABELS,
  TEMPLATE_KEYS_ORDERED,
  OFFER_TEMPLATE_KEYS,
  isOfferTemplateKey,
} from './default-templates';

// REINE Logik-Tests (kein DB/Netz): Die Allowlist der pro Angebot
// ueberschreibbaren Mail-Typen ist sicherheitsrelevant fuer die Server-Actions
// (saveOfferTemplateAction & Co. validieren via isOfferTemplateKey).

describe('OFFER_TEMPLATE_KEYS (Allowlist fuer Angebots-Overrides)', () => {
  it('schliesst admin_new aus (Admin-Mail ist nicht pro Angebot anpassbar)', () => {
    expect(OFFER_TEMPLATE_KEYS).not.toContain('admin_new');
  });

  it('enthaelt genau die fuenf kundenseitigen Mail-Typen', () => {
    expect([...OFFER_TEMPLATE_KEYS].sort()).toEqual([
      'cancelled',
      'confirmed',
      'received',
      'reminder',
      'rescheduled',
    ]);
  });

  it('jeder erlaubte Key hat Standard-Vorlage und Label', () => {
    for (const key of OFFER_TEMPLATE_KEYS) {
      expect(DEFAULT_TEMPLATES[key].subject.length).toBeGreaterThan(0);
      expect(DEFAULT_TEMPLATES[key].body.length).toBeGreaterThan(0);
      expect(TEMPLATE_LABELS[key].length).toBeGreaterThan(0);
    }
  });

  it('ist eine Teilmenge aller Mail-Typen', () => {
    for (const key of OFFER_TEMPLATE_KEYS) {
      expect(TEMPLATE_KEYS_ORDERED).toContain(key);
    }
  });
});

describe('isOfferTemplateKey', () => {
  it('akzeptiert alle erlaubten Keys', () => {
    for (const key of OFFER_TEMPLATE_KEYS) {
      expect(isOfferTemplateKey(key)).toBe(true);
    }
  });

  it('lehnt admin_new ab', () => {
    expect(isOfferTemplateKey('admin_new')).toBe(false);
  });

  it('lehnt unbekannte und nicht-string Werte ab', () => {
    expect(isOfferTemplateKey('kaputt')).toBe(false);
    expect(isOfferTemplateKey('')).toBe(false);
    expect(isOfferTemplateKey(null)).toBe(false);
    expect(isOfferTemplateKey(undefined)).toBe(false);
    expect(isOfferTemplateKey(42)).toBe(false);
  });
});

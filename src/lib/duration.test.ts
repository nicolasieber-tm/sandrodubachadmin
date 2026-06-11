import { describe, it, expect } from 'vitest';
import { formatDauer } from './duration';

describe('formatDauer', () => {
  it('formatiert unter einer Stunde in Minuten', () => {
    expect(formatDauer(45)).toBe('45 Min.');
    expect(formatDauer(15)).toBe('15 Min.');
  });

  it('formatiert volle Stunden ohne Minutenrest', () => {
    expect(formatDauer(60)).toBe('1 Std.');
    expect(formatDauer(120)).toBe('2 Std.');
  });

  it('formatiert gemischte Dauern mit Stunden und Minuten', () => {
    expect(formatDauer(90)).toBe('1 Std. 30 Min.');
    expect(formatDauer(195)).toBe('3 Std. 15 Min.');
  });

  it('liefert einen leeren String für 0 und ungültige Werte', () => {
    expect(formatDauer(0)).toBe('');
    expect(formatDauer(-30)).toBe('');
    expect(formatDauer(Number.NaN)).toBe('');
  });
});

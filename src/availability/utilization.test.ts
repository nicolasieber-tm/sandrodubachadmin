import { describe, it, expect } from 'vitest';
import {
  computeUtilizationPercent,
  sumAvailableMinutes,
  sumBookedMinutes,
  type UtilizationDay,
  type UtilizationBooking,
} from './utilization';

describe('computeUtilizationPercent', () => {
  it('liefert null, wenn keine Minuten verfuegbar sind (keine Oeffnungszeiten)', () => {
    expect(computeUtilizationPercent(0, 0)).toBeNull();
    expect(computeUtilizationPercent(0, 120)).toBeNull();
  });

  it('liefert 0 %, wenn nichts gebucht ist', () => {
    expect(computeUtilizationPercent(600, 0)).toBe(0);
  });

  it('liefert 100 % bei voller Auslastung', () => {
    expect(computeUtilizationPercent(600, 600)).toBe(100);
  });

  it('liefert 50 % bei halber Auslastung', () => {
    expect(computeUtilizationPercent(600, 300)).toBe(50);
  });

  it('rundet auf ganze Prozent', () => {
    // 175 / 600 = 29.166… → 29
    expect(computeUtilizationPercent(600, 175)).toBe(29);
    // 170 / 600 = 28.33… → 28
    expect(computeUtilizationPercent(600, 170)).toBe(28);
    // 177 / 600 = 29.5 → 30 (rundet auf)
    expect(computeUtilizationPercent(600, 177)).toBe(30);
  });

  it('deckelt Ueberbuchung auf 100 %', () => {
    expect(computeUtilizationPercent(600, 900)).toBe(100);
  });

  it('behandelt negative belegte Minuten als 0 (Schutz)', () => {
    expect(computeUtilizationPercent(600, -50)).toBe(0);
  });
});

describe('sumAvailableMinutes', () => {
  it('summiert nur aktive Tage', () => {
    const days: UtilizationDay[] = [
      { enabled: true, startTime: '09:00', endTime: '12:00' }, // 180
      { enabled: false, startTime: '09:00', endTime: '18:00' }, // 0
      { enabled: true, startTime: '13:00', endTime: '14:30' }, // 90
    ];
    expect(sumAvailableMinutes(days)).toBe(270);
  });

  it('liefert 0 bei ausschliesslich deaktivierten Tagen', () => {
    const days: UtilizationDay[] = [
      { enabled: false, startTime: '09:00', endTime: '18:00' },
      { enabled: false, startTime: '09:00', endTime: '18:00' },
    ];
    expect(sumAvailableMinutes(days)).toBe(0);
  });

  it('liefert 0 bei leerer Wochenliste', () => {
    expect(sumAvailableMinutes([])).toBe(0);
  });

  it('ignoriert ungueltige Fenster (Ende <= Start)', () => {
    const days: UtilizationDay[] = [
      { enabled: true, startTime: '18:00', endTime: '09:00' }, // negativ → 0
      { enabled: true, startTime: '10:00', endTime: '10:00' }, // 0
    ];
    expect(sumAvailableMinutes(days)).toBe(0);
  });
});

describe('sumBookedMinutes', () => {
  const durations = new Map<string, number>([
    ['offer-60', 60],
    ['offer-90', 90],
  ]);

  it('summiert Angebotsdauer plus extraMinutes', () => {
    const bookings: UtilizationBooking[] = [
      { offerId: 'offer-60', requestedTime: '09:00', extraMinutes: 0 }, // 60
      { offerId: 'offer-90', requestedTime: '11:00', extraMinutes: 15 }, // 105
    ];
    expect(sumBookedMinutes(bookings, durations)).toBe(165);
  });

  it('ignoriert Buchungen ohne Uhrzeit', () => {
    const bookings: UtilizationBooking[] = [
      { offerId: 'offer-60', requestedTime: '', extraMinutes: 0 }, // ignoriert
      { offerId: 'offer-60', requestedTime: '09:00', extraMinutes: 0 }, // 60
    ];
    expect(sumBookedMinutes(bookings, durations)).toBe(60);
  });

  it('beruecksichtigt extraMinutes auch bei fehlendem Angebot (Fallback 60)', () => {
    const bookings: UtilizationBooking[] = [
      { offerId: 'geloescht', requestedTime: '09:00', extraMinutes: 30 }, // 60 + 30
    ];
    expect(sumBookedMinutes(bookings, durations)).toBe(90);
  });

  it('nutzt Fallback 60 Minuten bei geloeschtem/fehlendem Angebot', () => {
    const bookings: UtilizationBooking[] = [
      { offerId: 'geloescht', requestedTime: '09:00', extraMinutes: 0 }, // 60
      { offerId: null, requestedTime: '10:00', extraMinutes: 0 }, // 60
    ];
    expect(sumBookedMinutes(bookings, durations)).toBe(120);
  });

  it('liefert 0 bei leerer Buchungsliste', () => {
    expect(sumBookedMinutes([], durations)).toBe(0);
  });
});

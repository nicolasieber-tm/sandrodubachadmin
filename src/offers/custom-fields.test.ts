import { describe, it, expect } from 'vitest';
import {
  customFieldsDefSchema,
  buildAnswerSchema,
  toAnswerSnapshots,
  parseAnswers,
  formatAnswerValue,
  type CustomFieldDef,
} from './custom-fields';

describe('customFieldsDefSchema', () => {
  it('lehnt ein Auswahlfeld ohne Optionen ab', () => {
    const r = customFieldsDefSchema.safeParse([
      { key: 'field_1', label: 'Stil', type: 'select', required: true },
    ]);
    expect(r.success).toBe(false);
  });

  it('lehnt doppelte Schlüssel ab', () => {
    const r = customFieldsDefSchema.safeParse([
      { key: 'field_1', label: 'A', type: 'text', required: false },
      { key: 'field_1', label: 'B', type: 'text', required: false },
    ]);
    expect(r.success).toBe(false);
  });

  it('lehnt min > max bei Zahl ab', () => {
    const r = customFieldsDefSchema.safeParse([
      { key: 'field_1', label: 'Gäste', type: 'number', required: false, min: 10, max: 2 },
    ]);
    expect(r.success).toBe(false);
  });

  it('akzeptiert ein gültiges Auswahlfeld', () => {
    const r = customFieldsDefSchema.safeParse([
      { key: 'field_1', label: 'Stil', type: 'select', required: true, options: ['Indoor', 'Outdoor'] },
    ]);
    expect(r.success).toBe(true);
  });
});

const NUM_FIELD: CustomFieldDef = {
  key: 'g',
  label: 'Gäste',
  type: 'number',
  required: true,
  min: 1,
  max: 5,
};

describe('buildAnswerSchema', () => {
  it('erzwingt Pflichtfelder', () => {
    const schema = buildAnswerSchema([
      { key: 't', label: 'Ort', type: 'text', required: true },
    ]);
    expect(schema.safeParse({}).success).toBe(false);
    expect(schema.safeParse({ t: 'Bern' }).success).toBe(true);
  });

  it('prüft Min/Max bei Zahlen', () => {
    const schema = buildAnswerSchema([NUM_FIELD]);
    expect(schema.safeParse({ g: 0 }).success).toBe(false);
    expect(schema.safeParse({ g: 6 }).success).toBe(false);
    expect(schema.safeParse({ g: 3 }).success).toBe(true);
  });

  it('lässt ungültige Auswahloptionen nicht zu', () => {
    const schema = buildAnswerSchema([
      { key: 's', label: 'Stil', type: 'select', required: true, options: ['Indoor', 'Outdoor'] },
    ]);
    expect(schema.safeParse({ s: 'Mond' }).success).toBe(false);
    expect(schema.safeParse({ s: 'Indoor' }).success).toBe(true);
  });

  it('lässt optionale Felder weg', () => {
    const schema = buildAnswerSchema([
      { key: 'o', label: 'Wunsch', type: 'text', required: false },
    ]);
    expect(schema.safeParse({}).success).toBe(true);
  });
});

describe('toAnswerSnapshots', () => {
  it('übernimmt Label/Typ und überspringt leere Nicht-Checkboxen', () => {
    const fields: CustomFieldDef[] = [
      { key: 'a', label: 'Ort', type: 'text', required: false },
      { key: 'b', label: 'Anfahrt', type: 'checkbox', required: false },
    ];
    const snaps = toAnswerSnapshots(fields, { b: true });
    expect(snaps).toEqual([
      { key: 'b', label: 'Anfahrt', type: 'checkbox', value: true },
    ]);
  });
});

describe('parseAnswers', () => {
  it('liest Checkbox und Text aus FormData', () => {
    const fields: CustomFieldDef[] = [
      { key: 'ort', label: 'Ort', type: 'text', required: true },
      { key: 'anfahrt', label: 'Anfahrt', type: 'checkbox', required: false },
    ];
    const fd = new FormData();
    fd.set('cf_ort', 'Bern');
    fd.set('cf_anfahrt', 'on');
    const r = parseAnswers(fields, fd);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.answers).toContainEqual({ key: 'ort', label: 'Ort', type: 'text', value: 'Bern' });
      expect(r.answers).toContainEqual({ key: 'anfahrt', label: 'Anfahrt', type: 'checkbox', value: true });
    }
  });

  it('meldet Fehler bei fehlendem Pflichtfeld', () => {
    const fields: CustomFieldDef[] = [
      { key: 'ort', label: 'Ort', type: 'text', required: true },
    ];
    const r = parseAnswers(fields, new FormData());
    expect(r.ok).toBe(false);
  });
});

describe('formatAnswerValue', () => {
  it('zeigt Checkbox als Ja/Nein', () => {
    expect(formatAnswerValue({ key: 'a', label: 'X', type: 'checkbox', value: true })).toBe('Ja');
    expect(formatAnswerValue({ key: 'a', label: 'X', type: 'checkbox', value: false })).toBe('Nein');
  });
});

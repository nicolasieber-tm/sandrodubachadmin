import { describe, it, expect } from 'vitest';
import {
  resolveStandardFields,
  standardFieldsConfigSchema,
  standardFieldDefaults,
} from './standard-fields';

describe('resolveStandardFields', () => {
  it('liefert für leere Config alle Defaults', () => {
    const r = resolveStandardFields({});
    expect(r.name.visible).toBe(true);
    expect(r.email.visible).toBe(true);
    expect(r.phone.visible).toBe(true);
    expect(r.phone.required).toBe(true);
    expect(r.name.label).toBe('Name');
    expect(r.location.placeholder).toBe(standardFieldDefaults.location.placeholder);
  });

  it('akzeptiert null/undefined wie eine leere Config', () => {
    expect(resolveStandardFields(null).phone.visible).toBe(true);
    expect(resolveStandardFields(undefined).discount.visible).toBe(true);
  });

  it('schaltet schaltbare Felder per visible:false aus', () => {
    const r = resolveStandardFields({
      phone: { visible: false },
      location: { visible: false },
      message: { visible: false },
      discount: { visible: false },
    });
    expect(r.phone.visible).toBe(false);
    expect(r.location.visible).toBe(false);
    expect(r.message.visible).toBe(false);
    expect(r.discount.visible).toBe(false);
  });

  it('hält name und email immer sichtbar, auch bei visible:false', () => {
    const r = resolveStandardFields({
      name: { visible: false },
      email: { visible: false },
    });
    expect(r.name.visible).toBe(true);
    expect(r.email.visible).toBe(true);
  });

  it('übernimmt Label-Override, fällt bei leerem String auf Default zurück', () => {
    const r = resolveStandardFields({
      phone: { label: 'Handynummer' },
      name: { label: '   ' },
    });
    expect(r.phone.label).toBe('Handynummer');
    expect(r.name.label).toBe('Name');
  });

  it('übernimmt Placeholder-Override nur für Felder mit Platzhalter', () => {
    const r = resolveStandardFields({
      location: { placeholder: 'z. B. dein Atelier' },
      phone: { placeholder: 'ignoriert' },
    });
    expect(r.location.placeholder).toBe('z. B. dein Atelier');
    expect(r.phone.placeholder).toBe('');
  });
});

describe('standardFieldsConfigSchema', () => {
  it('akzeptiert eine gültige Config', () => {
    const r = standardFieldsConfigSchema.safeParse({
      phone: { visible: false, label: 'Handy' },
      location: { placeholder: 'Ort' },
    });
    expect(r.success).toBe(true);
  });

  it('verwirft unbekannte Keys (strip), bleibt aber gültig', () => {
    const r = standardFieldsConfigSchema.safeParse({ foo: { visible: false } });
    expect(r.success).toBe(true);
    if (r.success) expect('foo' in r.data).toBe(false);
  });

  it('lehnt falsche Typen ab', () => {
    const r = standardFieldsConfigSchema.safeParse({ phone: { visible: 'yes' } });
    expect(r.success).toBe(false);
  });
});

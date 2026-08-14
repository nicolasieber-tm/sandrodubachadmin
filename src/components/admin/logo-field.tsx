'use client';

import { useRef, useState } from 'react';

const MAX_EDGE = 256;
const MAX_LEN = 200_000;
const FALLBACK = '/logo-default.png';

// Verkleinert das gewählte Bild client-seitig auf max. 256px (längste Kante)
// und liefert eine WebP-Data-URL. Bei Fehlern: null.
async function fileToDataUrl(file: File): Promise<string | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('load failed'));
      el.src = objectUrl;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL('image/webp', 0.9);
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function LogoField({ initial }: { initial?: string | null }) {
  const [value, setValue] = useState<string>(initial ?? '');
  const [error, setError] = useState<string>();
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(undefined);
    const file = e.target.files?.[0];
    if (!file) return;
    const dataUrl = await fileToDataUrl(file);
    if (!dataUrl) {
      setError('Bild konnte nicht verarbeitet werden.');
      return;
    }
    if (dataUrl.length > MAX_LEN) {
      setError('Bild ist zu gross. Bitte ein kleineres Logo wählen.');
      return;
    }
    setValue(dataUrl);
  }

  function clear() {
    setValue('');
    setError(undefined);
    if (inputRef.current) inputRef.current.value = '';
  }

  const preview = value || FALLBACK;

  return (
    <div className="field">
      <label htmlFor="logo">Logo</label>
      <input type="hidden" name="logoDataUrl" value={value} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span
          aria-hidden="true"
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            overflow: 'hidden',
            display: 'grid',
            placeItems: 'center',
            flex: 'none',
            background: 'var(--surface-2)',
            border: '1px solid var(--line)',
            padding: 5,
            boxSizing: 'border-box',
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt=""
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            ref={inputRef}
            id="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFile}
          />
          {value ? (
            <button type="button" className="btn btn-ghost btn-sm" onClick={clear}>
              Entfernen
            </button>
          ) : null}
        </div>
      </div>
      <small className="mut">
        Optional. Eigenes Logo für dieses Angebot (wird auf 256&nbsp;px verkleinert).
        Ohne eigenes Logo wird das Standard-Logo angezeigt.
      </small>
      {error ? (
        <p className="mut" role="alert" style={{ color: 'var(--red, #c0392b)' }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

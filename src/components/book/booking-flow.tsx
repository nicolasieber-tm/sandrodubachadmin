'use client';

import {
  useActionState,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  submitBookingRequest,
  previewDiscount,
  type PublicActionResult,
} from '@/bookings/public-actions';
import { formatPrice, formatRappen } from '@/lib/money';
import type { Offer } from '@/db/schema';

type Step = 'offer' | 'details' | 'success';

// Vorbelegung über einen persönlichen Einmal-Link (?l=token).
export interface BookingPrefill {
  token: string;
  offerId: string;
  baseRappen: number;
  effectiveRappen: number;
  label: string;
}

interface BookingFlowProps {
  offers: Offer[];
  prefill?: BookingPrefill;
}

// postMessage-Protokoll an die einbettende Seite. Immer { type:'sd-booking', ... }.
function postToParent(payload: { event: 'resize'; height: number } | { event: 'success' }) {
  if (typeof window === 'undefined') return;
  if (window.parent === window) return;
  window.parent.postMessage({ type: 'sd-booking', ...payload }, '*');
}

export function BookingFlow({ offers, prefill }: BookingFlowProps) {
  const prefillOffer = prefill
    ? offers.find((o) => o.id === prefill.offerId) ?? null
    : null;
  const hasValidPrefill = Boolean(prefill && prefillOffer);

  // Bei gültigem Einmal-Link das Angebot vorwählen und direkt zum Detail-Schritt.
  const [step, setStep] = useState<Step>(hasValidPrefill ? 'details' : 'offer');
  const [selectedOfferId, setSelectedOfferId] = useState<string>(
    hasValidPrefill ? prefill!.offerId : '',
  );
  const rootRef = useRef<HTMLDivElement>(null);

  const [state, formAction, pending] = useActionState<PublicActionResult | null, FormData>(
    submitBookingRequest,
    null,
  );

  const selectedOffer = offers.find((o) => o.id === selectedOfferId) ?? null;

  // Erfolg: in den Danke-Schritt wechseln und die Eltern-Seite informieren.
  const successHandledRef = useRef(false);
  useEffect(() => {
    if (state && 'ok' in state && state.ok && !successHandledRef.current) {
      successHandledRef.current = true;
      setStep('success');
      postToParent({ event: 'success' });
    }
  }, [state]);

  // Höhe an das einbettende iframe melden (Auto-Resize).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const report = () => postToParent({ event: 'resize', height: el.offsetHeight });
    report();
    const ro = new ResizeObserver(() => report());
    ro.observe(el);
    return () => ro.disconnect();
  }, [step]);

  function chooseOffer(id: string) {
    setSelectedOfferId(id);
    setStep('details');
  }

  const errorMsg = state && 'error' in state ? state.error : null;

  return (
    <div ref={rootRef} style={{ width: '100%', maxWidth: 520 }}>
      <div className="card">
        <div className="card-h" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 4 }}>
          <div
            className="eyebrow"
            style={{
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
            }}
          >
            Termin buchen
          </div>
          <h2 className="font-display" style={{ fontSize: 22, lineHeight: 1.1 }}>
            {step === 'offer' && 'Angebot wählen'}
            {step === 'details' && (selectedOffer?.name ?? 'Deine Angaben')}
            {step === 'success' && 'Anfrage erhalten'}
          </h2>
        </div>

        <div className="card-b">
          {step === 'offer' && (
            <OfferStep offers={offers} onChoose={chooseOffer} />
          )}

          {step === 'details' && selectedOffer && (
            <DetailsStep
              offer={selectedOffer}
              formAction={formAction}
              pending={pending}
              errorMsg={errorMsg}
              onBack={hasValidPrefill ? null : () => setStep('offer')}
              prefill={hasValidPrefill ? prefill! : null}
            />
          )}

          {step === 'success' && <SuccessStep />}
        </div>
      </div>
    </div>
  );
}

function OfferStep({
  offers,
  onChoose,
}: {
  offers: Offer[];
  onChoose: (id: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <p className="mut" style={{ fontSize: 13 }}>
        Wähle das Angebot, das am besten zu deinem Anlass passt.
      </p>
      {offers.map((offer) => (
        <button
          key={offer.id}
          type="button"
          onClick={() => onChoose(offer.id)}
          style={{
            textAlign: 'left',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--r)',
            background: 'var(--surface)',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            transition: 'border-color 0.16s var(--ease), box-shadow 0.16s var(--ease)',
            width: '100%',
          }}
          className="offer-card"
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 12,
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 15 }}>{offer.name}</span>
            <span
              className="num"
              style={{ fontWeight: 600, color: 'var(--accent-ink)', whiteSpace: 'nowrap' }}
            >
              {formatPrice(offer.priceRappen, offer.unit)}
            </span>
          </div>
          {offer.durationLabel ? (
            <span className="mut" style={{ fontSize: 12.5 }}>
              {offer.durationLabel}
            </span>
          ) : null}
          {offer.description ? (
            <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              {offer.description}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function DetailsStep({
  offer,
  formAction,
  pending,
  errorMsg,
  onBack,
  prefill,
}: {
  offer: Offer;
  formAction: (formData: FormData) => void;
  pending: boolean;
  errorMsg: string | null;
  onBack: (() => void) | null;
  prefill: BookingPrefill | null;
}) {
  return (
    <form action={formAction}>
      <input type="hidden" name="offerId" value={offer.id} />
      {prefill ? <input type="hidden" name="token" value={prefill.token} /> : null}

      {prefill ? (
        <PrefillPriceBox offer={offer} prefill={prefill} />
      ) : (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
            padding: '10px 14px',
            background: 'var(--accent-soft)',
            border: '1px solid var(--accent-line)',
            borderRadius: 'var(--r)',
            marginBottom: 18,
          }}
        >
          <span style={{ fontWeight: 600, color: 'var(--accent-ink)' }}>{offer.name}</span>
          <span className="num" style={{ fontWeight: 600, color: 'var(--accent-ink)' }}>
            {formatPrice(offer.priceRappen, offer.unit)}
          </span>
        </div>
      )}

      <div className="field-2">
        <div className="field">
          <label htmlFor="requestedDate">Wunschdatum</label>
          <input id="requestedDate" name="requestedDate" type="date" required />
        </div>
        <div className="field">
          <label htmlFor="requestedTime">Uhrzeit (optional)</label>
          <input id="requestedTime" name="requestedTime" type="time" />
        </div>
      </div>

      <div className="field">
        <label htmlFor="customerName">Name</label>
        <input id="customerName" name="customerName" type="text" required minLength={2} autoComplete="name" />
      </div>

      <div className="field">
        <label htmlFor="customerEmail">E-Mail</label>
        <input id="customerEmail" name="customerEmail" type="email" required autoComplete="email" />
      </div>

      <div className="field">
        <label htmlFor="customerPhone">Telefon</label>
        <input id="customerPhone" name="customerPhone" type="tel" required minLength={6} autoComplete="tel" />
      </div>

      <div className="field">
        <label htmlFor="message">Nachricht (optional)</label>
        <textarea id="message" name="message" rows={3} />
      </div>

      {/* Rabatt-Code nur ohne Einmal-Link anbieten (der hat schon einen Preis). */}
      {prefill ? null : <DiscountCodeField offer={offer} />}

      {/* Honeypot: für Menschen unsichtbar, für Bots verlockend. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 'auto' }}>
        <label htmlFor="website">Website (bitte freilassen)</label>
        <input
          id="website"
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
        />
      </div>

      {errorMsg ? (
        <p className="err" role="alert" style={{ marginTop: 4, marginBottom: 12 }}>
          {errorMsg}
        </p>
      ) : null}

      <div
        style={{
          display: 'flex',
          justifyContent: onBack ? 'space-between' : 'flex-end',
          gap: 11,
          marginTop: 8,
        }}
      >
        {onBack ? (
          <button type="button" className="btn btn-ghost" onClick={onBack} disabled={pending}>
            Zurück
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? 'Wird gesendet …' : 'Anfrage senden'}
        </button>
      </div>
    </form>
  );
}

function PrefillPriceBox({
  offer,
  prefill,
}: {
  offer: Offer;
  prefill: BookingPrefill;
}) {
  const saved = prefill.baseRappen - prefill.effectiveRappen;
  return (
    <div
      style={{
        padding: '12px 14px',
        background: 'var(--accent-soft)',
        border: '1px solid var(--accent-line)',
        borderRadius: 'var(--r)',
        marginBottom: 18,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontWeight: 600, color: 'var(--accent-ink)' }}>{offer.name}</span>
        {prefill.label ? (
          <span className="mut" style={{ fontSize: 12 }}>
            Persönlicher Preis für {prefill.label}
          </span>
        ) : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
        <span
          className="num"
          style={{ textDecoration: 'line-through', color: 'var(--ink-3)', fontSize: 14 }}
        >
          {formatRappen(prefill.baseRappen)}
        </span>
        <span aria-hidden="true" style={{ color: 'var(--ink-4)' }}>→</span>
        <span className="num" style={{ fontWeight: 700, fontSize: 20, color: 'var(--accent-ink)' }}>
          {formatRappen(prefill.effectiveRappen)}
        </span>
        {saved > 0 ? (
          <span
            className="num"
            style={{
              marginLeft: 'auto',
              fontSize: 11.5,
              fontWeight: 600,
              color: 'var(--green)',
              background: 'var(--green-soft)',
              border: '1px solid var(--green-line)',
              padding: '2px 8px',
              borderRadius: 999,
            }}
          >
            −{formatRappen(saved)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DiscountCodeField({ offer }: { offer: Offer }) {
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; effectiveRappen: number; savedRappen: number }
    | { ok: false; error: string }
    | null
  >(null);

  async function apply() {
    if (code.trim() === '') return;
    setPending(true);
    const res = await previewDiscount(code, offer.id);
    setPending(false);
    if ('error' in res) {
      setResult({ ok: false, error: res.error });
    } else {
      setResult({ ok: true, effectiveRappen: res.effectiveRappen, savedRappen: res.savedRappen });
    }
  }

  return (
    <div className="field">
      <label htmlFor="code">Rabatt-Code (optional)</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          id="code"
          name="code"
          type="text"
          autoComplete="off"
          placeholder="z. B. SOMMER25"
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            setResult(null);
          }}
          style={{ textTransform: 'uppercase', flex: 1 }}
        />
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={apply}
          disabled={pending || code.trim() === ''}
        >
          {pending ? 'Prüfe …' : 'Anwenden'}
        </button>
      </div>
      {result && result.ok ? (
        <small style={{ color: 'var(--green)', marginTop: 6, display: 'block' }}>
          Rabatt angewendet: {formatRappen(result.effectiveRappen)} statt{' '}
          {formatRappen(offer.priceRappen)} — du sparst {formatRappen(result.savedRappen)}.
        </small>
      ) : null}
      {result && !result.ok ? (
        <small style={{ color: 'var(--red, #c0392b)', marginTop: 6, display: 'block' }}>
          {result.error}
        </small>
      ) : null}
    </div>
  );
}

function SuccessStep() {
  return (
    <div style={{ textAlign: 'center', padding: '20px 8px' }}>
      <div
        aria-hidden="true"
        style={{
          width: 54,
          height: 54,
          borderRadius: 16,
          margin: '0 auto 16px',
          background: 'var(--green-soft)',
          border: '1px solid var(--green-line)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--green)',
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <h3 className="font-display" style={{ fontSize: 20, marginBottom: 8 }}>
        Anfrage erhalten
      </h3>
      <p style={{ fontSize: 14, color: 'var(--ink-2)', maxWidth: '36ch', margin: '0 auto', lineHeight: 1.6 }}>
        Vielen Dank! Sandro meldet sich in Kürze persönlich bei dir, um die
        Details zu besprechen.
      </p>
    </div>
  );
}

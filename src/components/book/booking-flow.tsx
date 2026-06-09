'use client';

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from 'react';
import {
  submitBookingRequest,
  previewDiscount,
  type PublicActionResult,
} from '@/bookings/public-actions';
import { getFreeSlots } from '@/availability/slots-actions';
import { formatPrice, formatRappen } from '@/lib/money';
import type { Offer } from '@/db/schema';

type Step = 'offer' | 'date' | 'time' | 'contact' | 'success';

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

// ----- Datums-Helfer (lokale Zeitzone, KEIN toISOString → kein UTC-Versatz) -----
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const WD_MO = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTHS_FULL = [
  'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember',
];

function ymd(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function dateLabel(ds: string): string {
  if (!ds) return '';
  const d = new Date(`${ds}T00:00:00`);
  return `${WD[d.getDay()]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
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

  // Bei gültigem Einmal-Link das Angebot vorwählen und direkt zur Datumswahl.
  const [step, setStep] = useState<Step>(hasValidPrefill ? 'date' : 'offer');
  const [selectedOfferId, setSelectedOfferId] = useState<string>(
    hasValidPrefill ? prefill!.offerId : '',
  );
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
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

  // Höhe an das einbettende iframe melden (Auto-Resize pro Schritt).
  // Volle Dokumenthöhe (inkl. Layout-Polsterung), damit das iframe exakt passt
  // und KEIN Scrollbalken entsteht. ResizeObserver auf <body> fängt auch
  // Slot-Laden und Aufklappen (Nachricht/Code) ab.
  useEffect(() => {
    const report = () =>
      postToParent({ event: 'resize', height: document.documentElement.scrollHeight });
    report();
    const ro = new ResizeObserver(report);
    if (document.body) ro.observe(document.body);
    window.addEventListener('resize', report);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', report);
    };
  }, [step]);

  function chooseOffer(id: string) {
    setSelectedOfferId(id);
    setDate('');
    setTime('');
    setStep('date');
  }

  function pickDate(ds: string) {
    setDate(ds);
    setTime('');
    setStep('time');
  }

  const errorMsg = state && 'error' in state ? state.error : null;

  return (
    <div ref={rootRef} className="bookx">
      <div className="bookx-card">
        <Header step={step} hasPrefill={hasValidPrefill} />

        <div className="bookx-body">
          {step === 'offer' && <OfferStep offers={offers} onChoose={chooseOffer} />}

          {step === 'date' && (
            <DateStep
              value={date}
              onPick={pickDate}
              onBack={hasValidPrefill ? null : () => setStep('offer')}
            />
          )}

          {step === 'time' && selectedOffer && (
            <TimeStep
              offer={selectedOffer}
              prefill={hasValidPrefill ? prefill! : null}
              date={date}
              time={time}
              onTime={setTime}
              onNext={() => setStep('contact')}
              onBack={() => setStep('date')}
            />
          )}

          {step === 'contact' && selectedOffer && (
            <ContactStep
              offer={selectedOffer}
              prefill={hasValidPrefill ? prefill! : null}
              date={date}
              time={time}
              formAction={formAction}
              pending={pending}
              errorMsg={errorMsg}
              onBack={() => setStep('time')}
            />
          )}

          {step === 'success' && <SuccessStep />}
        </div>
      </div>
    </div>
  );
}

function Header({ step, hasPrefill }: { step: Step; hasPrefill: boolean }) {
  const eyebrow =
    step === 'success'
      ? 'Geschafft'
      : step === 'offer'
        ? 'Termin buchen'
        : step === 'date'
          ? 'Datum'
          : step === 'time'
            ? 'Uhrzeit'
            : 'Deine Angaben';

  const title =
    step === 'success'
      ? 'Vielen Dank!'
      : step === 'offer'
        ? 'Wähle dein Shooting.'
        : step === 'date'
          ? 'Wähle einen Tag'
          : step === 'time'
            ? 'Wähle eine Zeit'
            : 'Fast geschafft';

  const seq: Step[] = hasPrefill
    ? ['date', 'time', 'contact']
    : ['offer', 'date', 'time', 'contact'];
  const activeIdx = seq.indexOf(step);

  return (
    <div className="bookx-head">
      <span className="bookx-eyebrow">
        <span className="dot" aria-hidden="true" />
        {eyebrow}
      </span>
      <h2 className="bookx-title">{title}</h2>
      {step === 'offer' && (
        <p className="bookx-sub">Such dir das Angebot aus, das zu deinem Anlass passt.</p>
      )}

      {step !== 'success' && (
        <div className="bookx-steps" aria-hidden="true">
          {seq.map((s, i) => (
            <span key={s} className={`bar${i <= activeIdx ? ' on' : ''}`} />
          ))}
        </div>
      )}
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
    <div className="bookx-offers">
      {offers.map((offer, i) => (
        <button
          key={offer.id}
          type="button"
          onClick={() => onChoose(offer.id)}
          className="bookx-offer bookx-reveal"
          style={{ animationDelay: `${0.05 + i * 0.06}s` }}
        >
          <span className="bookx-offer-badge" aria-hidden="true">
            {offer.name.trim().charAt(0).toUpperCase()}
          </span>
          <span className="bookx-offer-main">
            <span className="bookx-offer-name">{offer.name}</span>
            {offer.durationLabel ? (
              <span className="bookx-offer-meta">{offer.durationLabel}</span>
            ) : null}
          </span>
          <span className="bookx-offer-price">{formatPrice(offer.priceRappen, offer.unit)}</span>
          <Chevron className="bookx-offer-chev" />
        </button>
      ))}
    </div>
  );
}

function DateStep({
  value,
  onPick,
  onBack,
}: {
  value: string;
  onPick: (d: string) => void;
  onBack: (() => void) | null;
}) {
  return (
    <div>
      <Calendar value={value} onSelect={onPick} />
      {onBack ? (
        <div className="bookx-actions">
          <button type="button" className="bookx-btn bookx-btn-ghost" onClick={onBack}>
            Zurück
          </button>
        </div>
      ) : null}
    </div>
  );
}

// Monatskalender. Erst nach dem Mount gerendert, damit die lokalen Datumswerte
// (Browser-Zeitzone) keinen Hydration-Mismatch mit der Serverzeit auslösen.
function Calendar({ value, onSelect }: { value: string; onSelect: (d: string) => void }) {
  const [today, setToday] = useState<Date | null>(null);
  const [view, setView] = useState<{ y: number; m: number } | null>(null);

  useEffect(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    setToday(t);
    if (value) {
      const d = new Date(`${value}T00:00:00`);
      setView({ y: d.getFullYear(), m: d.getMonth() });
    } else {
      setView({ y: t.getFullYear(), m: t.getMonth() });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!today || !view) {
    return <div className="bookx-cal-skel" aria-hidden="true" />;
  }

  const first = new Date(view.y, view.m, 1);
  const lead = (first.getDay() + 6) % 7; // 0 = Montag
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));

  const atCurrentMonth = view.y === today.getFullYear() && view.m === today.getMonth();
  const todayStr = ymd(today);

  function shift(delta: number) {
    setView((v) => {
      if (!v) return v;
      const d = new Date(v.y, v.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  return (
    <div className="bookx-cal">
      <div className="bookx-cal-nav">
        <button
          type="button"
          className="bookx-cal-navbtn"
          aria-label="Vorheriger Monat"
          onClick={() => shift(-1)}
          disabled={atCurrentMonth}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="bookx-cal-title">
          {MONTHS_FULL[view.m]} {view.y}
        </span>
        <button
          type="button"
          className="bookx-cal-navbtn"
          aria-label="Nächster Monat"
          onClick={() => shift(1)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="bookx-cal-grid">
        {WD_MO.map((w) => (
          <div key={w} className="bookx-cal-wd">
            {w}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="bookx-cal-empty" />;
          const ds = ymd(d);
          const past = d < today;
          const active = ds === value;
          const isToday = ds === todayStr;
          return (
            <button
              key={ds}
              type="button"
              className={`bookx-cal-day${active ? ' is-active' : ''}${isToday && !active ? ' is-today' : ''}`}
              disabled={past}
              aria-pressed={active}
              aria-label={`${d.getDate()}. ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`}
              onClick={() => onSelect(ds)}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function TimeStep({
  offer,
  prefill,
  date,
  time,
  onTime,
  onNext,
  onBack,
}: {
  offer: Offer;
  prefill: BookingPrefill | null;
  date: string;
  time: string;
  onTime: (t: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const [slots, setSlots] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [slotError, setSlotError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setStatus('loading');
    setSlots([]);
    setSlotError(null);
    startTransition(async () => {
      const result = await getFreeSlots(offer.id, date);
      if ('error' in result) {
        setSlotError(result.error);
        setStatus('error');
      } else {
        setSlots(result.slots);
        setStatus('ready');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <Summary offer={offer} prefill={prefill} when={dateLabel(date)} />

      {status === 'loading' ? (
        <p className="bookx-hint">Freie Zeiten werden geladen …</p>
      ) : status === 'error' ? (
        <p className="bookx-hint err" role="alert">
          {slotError}
        </p>
      ) : slots.length === 0 ? (
        <p className="bookx-hint">Keine freien Zeiten an diesem Tag — bitte einen anderen Tag wählen.</p>
      ) : (
        <div className="bookx-times">
          {slots.map((slot) => {
            const active = slot === time;
            return (
              <button
                key={slot}
                type="button"
                className={`bookx-time${active ? ' is-active' : ''}`}
                aria-pressed={active}
                onClick={() => onTime(slot)}
              >
                {slot}
              </button>
            );
          })}
        </div>
      )}

      <div className="bookx-actions">
        <button type="button" className="bookx-btn bookx-btn-ghost" onClick={onBack}>
          Zurück
        </button>
        <button
          type="button"
          className="bookx-btn bookx-btn-primary"
          onClick={onNext}
          disabled={time === ''}
        >
          Weiter
          <Arrow />
        </button>
      </div>
    </div>
  );
}

function ContactStep({
  offer,
  prefill,
  date,
  time,
  formAction,
  pending,
  errorMsg,
  onBack,
}: {
  offer: Offer;
  prefill: BookingPrefill | null;
  date: string;
  time: string;
  formAction: (formData: FormData) => void;
  pending: boolean;
  errorMsg: string | null;
  onBack: () => void;
}) {
  const [showMsg, setShowMsg] = useState(false);

  return (
    <form action={formAction}>
      <input type="hidden" name="offerId" value={offer.id} />
      {prefill ? <input type="hidden" name="token" value={prefill.token} /> : null}
      <input type="hidden" name="requestedDate" value={date} />
      <input type="hidden" name="requestedTime" value={time} />

      <Summary offer={offer} prefill={prefill} when={`${dateLabel(date)} · ${time}`} />

      <div className="bookx-fields">
        <div className="bookx-field">
          <label htmlFor="customerName">Name</label>
          <input id="customerName" name="customerName" type="text" required minLength={2} autoComplete="name" />
        </div>
        <div className="bookx-field">
          <label htmlFor="customerEmail">E-Mail</label>
          <input id="customerEmail" name="customerEmail" type="email" required autoComplete="email" />
        </div>
        <div className="bookx-field">
          <label htmlFor="customerPhone">Telefon</label>
          <input id="customerPhone" name="customerPhone" type="tel" required minLength={6} autoComplete="tel" />
        </div>
      </div>

      <div className="bookx-folds">
        <div>
          <button
            type="button"
            className="bookx-fold-toggle"
            aria-expanded={showMsg}
            onClick={() => setShowMsg((v) => !v)}
          >
            <Chevron className="chev" />
            Nachricht hinzufügen
          </button>
          {showMsg ? (
            <div className="bookx-fold-body">
              <textarea name="message" rows={2} placeholder="Wünsche, Anlass, Personenzahl …" />
            </div>
          ) : null}
        </div>

        {/* Rabatt-Code nur ohne Einmal-Link anbieten (der hat schon einen Preis). */}
        {prefill ? null : <DiscountCodeField offer={offer} />}
      </div>

      {/* Honeypot: für Menschen unsichtbar, für Bots verlockend. */}
      <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', top: 'auto' }}>
        <label htmlFor="website">Website (bitte freilassen)</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {errorMsg ? (
        <p className="bookx-err" role="alert">
          {errorMsg}
        </p>
      ) : null}

      <div className="bookx-actions">
        <button type="button" className="bookx-btn bookx-btn-ghost" onClick={onBack} disabled={pending}>
          Zurück
        </button>
        <button type="submit" className="bookx-btn bookx-btn-primary" disabled={pending}>
          {pending ? 'Wird gesendet …' : 'Anfrage senden'}
          {!pending && <Arrow />}
        </button>
      </div>
    </form>
  );
}

// Zusammenfassung des gewählten Angebots (+ optional Termin / Sonderpreis).
function Summary({
  offer,
  prefill,
  when,
}: {
  offer: Offer;
  prefill: BookingPrefill | null;
  when?: string;
}) {
  const saved = prefill ? prefill.baseRappen - prefill.effectiveRappen : 0;
  return (
    <div className="bookx-summary">
      <div className="srow">
        <span className="nm">{offer.name}</span>
        {prefill ? (
          <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            {saved > 0 ? <span className="old">{formatRappen(prefill.baseRappen)}</span> : null}
            <span className="pr">{formatRappen(prefill.effectiveRappen)}</span>
          </span>
        ) : (
          <span className="pr">{formatPrice(offer.priceRappen, offer.unit)}</span>
        )}
      </div>
      {when ? <span className="when">{when}</span> : null}
      {prefill && prefill.label ? (
        <span className="when">Persönlicher Preis für {prefill.label}</span>
      ) : null}
    </div>
  );
}

function DiscountCodeField({ offer }: { offer: Offer }) {
  const [open, setOpen] = useState(false);
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
    <div>
      <button
        type="button"
        className="bookx-fold-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Chevron className="chev" />
        Rabatt-Code?
      </button>

      {open ? (
        <div className="bookx-fold-body">
          <div className="bookx-fold-row">
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
            />
            <button
              type="button"
              className="bookx-btn bookx-btn-ghost"
              style={{ height: 'auto', padding: '0 16px', fontSize: 13.5 }}
              onClick={apply}
              disabled={pending || code.trim() === ''}
            >
              {pending ? 'Prüfe …' : 'Anwenden'}
            </button>
          </div>
          {result && result.ok ? (
            <small className="bookx-note ok">
              Rabatt angewendet: {formatRappen(result.effectiveRappen)} statt{' '}
              {formatRappen(offer.priceRappen)} — du sparst {formatRappen(result.savedRappen)}.
            </small>
          ) : null}
          {result && !result.ok ? <small className="bookx-note bad">{result.error}</small> : null}
        </div>
      ) : null}
    </div>
  );
}

function SuccessStep() {
  return (
    <div className="bookx-success">
      <div className="bookx-success-mark" aria-hidden="true">
        <svg
          width="30"
          height="30"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </div>
      <h3 className="bookx-success-title">Vielen Dank!</h3>
      <p className="bookx-success-text">
        Deine Anfrage ist angekommen. Sandro meldet sich in Kürze persönlich bei dir, um die
        Details zu besprechen.
      </p>
    </div>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg
      className="arrow"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

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
import { getFreeSlots, getMonthSlotAvailability } from '@/availability/slots-actions';
import { formatPrice, formatRappen } from '@/lib/money';
import { formatDauer } from '@/lib/duration';
import { travelRuleHint } from '@/travel/format';
import type { Offer, TravelRule } from '@/db/schema';
import { CustomFieldInputs } from '@/components/custom-field-inputs';
import { resolveStandardFields } from '@/offers/standard-fields';

type Step = 'offer' | 'date' | 'time' | 'contact' | 'success';

// WhatsApp-Chat-Link: wa.me erwartet die Nummer ohne '+' und Sonderzeichen.
function waLink(phone: string, offerName: string): string {
  const digits = phone.replace(/\D/g, '');
  const text = encodeURIComponent(`Hallo Sandro, ich interessiere mich für: ${offerName}`);
  return `https://wa.me/${digits}?text=${text}`;
}

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
  // Wegkosten-Regeln (für den Anfahrts-Hinweis bei zugeordneten Angeboten).
  travelRules?: TravelRule[];
  // Sandros Nummer (international, z. B. +41791234567) für WhatsApp/Anruf.
  // null/undefined = Buttons ausblenden.
  contactPhone?: string | null;
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
// Nur noch die Erfolgs-Meldung: das iframe hat eine feste, bildschirmabhaengige
// Hoehe (siehe embed.js) und braucht keine Inhaltshoehe mehr gemeldet zu bekommen.
function postToParent(payload: { event: 'success' }) {
  if (typeof window === 'undefined') return;
  if (window.parent === window) return;
  window.parent.postMessage({ type: 'sd-booking', ...payload }, '*');
}

export function BookingFlow({ offers, prefill, travelRules, contactPhone }: BookingFlowProps) {
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
  const istAnfrage = selectedOffer?.bookingMode === 'anfrage';

  // Erfolg: in den Danke-Schritt wechseln und die Eltern-Seite informieren.
  const successHandledRef = useRef(false);
  useEffect(() => {
    if (state && 'ok' in state && state.ok && !successHandledRef.current) {
      successHandledRef.current = true;
      setStep('success');
      postToParent({ event: 'success' });
    }
  }, [state]);

  function chooseOffer(id: string) {
    setSelectedOfferId(id);
    setDate('');
    setTime('');
    // Termin-Modus: Tag → Uhrzeit (freie Slots). Anfrage-Modus: nur Wunschtag,
    // danach direkt die Angaben (siehe pickDate) – die Uhrzeit wird ohnehin
    // persönlich abgesprochen.
    setStep('date');
  }

  function pickDate(ds: string) {
    setDate(ds);
    setTime('');
    // Anfrage ohne Kalender: keine Uhrzeit-/Slot-Wahl – direkt zu den Angaben.
    setStep(istAnfrage ? 'contact' : 'time');
  }

  const errorMsg = state && 'error' in state ? state.error : null;
  const travelRule =
    selectedOffer?.travelRuleId && travelRules
      ? travelRules.find((r) => r.id === selectedOffer.travelRuleId) ?? null
      : null;

  return (
    <div ref={rootRef} className="bookx">
      <div className="bookx-card">
        <Header step={step} hasPrefill={hasValidPrefill} anfrage={istAnfrage} />

        <div className="bookx-body">
          {step === 'offer' && (
            <OfferStep
              offers={offers}
              onChoose={chooseOffer}
              contactPhone={contactPhone ?? null}
            />
          )}

          {step === 'date' && (
            <DateStep
              value={date}
              onPick={pickDate}
              onBack={hasValidPrefill ? null : () => setStep('offer')}
              // Anfrage-Modus: Wunschtag frei wählbar → keine Ausgebucht-Markierung.
              offerId={istAnfrage ? null : selectedOfferId || null}
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
              anfrage={istAnfrage}
              travelRule={travelRule}
              contactPhone={contactPhone ?? null}
              date={date}
              time={time}
              formAction={formAction}
              pending={pending}
              errorMsg={errorMsg}
              onBack={() => setStep(istAnfrage ? 'date' : 'time')}
            />
          )}

          {step === 'success' && (
            <SuccessStep
              anfrage={istAnfrage}
              offerName={selectedOffer?.name ?? null}
              contactPhone={contactPhone ?? null}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Header({
  step,
  hasPrefill,
  anfrage,
}: {
  step: Step;
  hasPrefill: boolean;
  anfrage: boolean;
}) {
  const eyebrow =
    step === 'success'
      ? 'Geschafft'
      : step === 'offer'
        ? 'Termin buchen'
        : step === 'date'
          ? anfrage
            ? 'Wunschtermin'
            : 'Datum'
          : step === 'time'
            ? anfrage
              ? 'Wunschtermin'
              : 'Uhrzeit'
            : anfrage
              ? 'Deine Anfrage'
              : 'Deine Angaben';

  const title =
    step === 'success'
      ? 'Vielen Dank!'
      : step === 'offer'
        ? 'Wähle dein Shooting.'
        : step === 'date'
          ? anfrage
            ? 'Wähle deinen Wunschtag'
            : 'Wähle einen Tag'
          : step === 'time'
            ? anfrage
              ? 'Wähle deine Wunschzeit'
              : 'Wähle eine Zeit'
            : anfrage
              ? 'Erzähl uns von deiner Idee'
              : 'Fast geschafft';

  // Anfrage-Modus überspringt die Uhrzeit-Wahl: nur Wunschtag, dann die Angaben.
  // Termin-Modus: Angebot → Datum → Zeit → Angaben.
  const seq: Step[] = anfrage
    ? hasPrefill
      ? ['date', 'contact']
      : ['offer', 'date', 'contact']
    : hasPrefill
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
  contactPhone,
}: {
  offers: Offer[];
  onChoose: (id: string) => void;
  contactPhone: string | null;
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
            <span className="bookx-offer-meta">
              {offer.bookingMode === 'anfrage'
                ? 'Termin & Dauer nach Absprache'
                : formatDauer(offer.durationMinutes)}
            </span>
          </span>
          <span className="bookx-offer-price">{formatPrice(offer.priceRappen, offer.unit)}</span>
          <Chevron className="bookx-offer-chev" />
        </button>
      ))}

      {contactPhone ? (
        <p className="bookx-direct-line">
          Fragen?{' '}
          <a
            href={waLink(contactPhone, 'ein Shooting')}
            target="_blank"
            rel="noopener noreferrer"
          >
            Schreib Sandro direkt auf WhatsApp
          </a>
          .
        </p>
      ) : null}
    </div>
  );
}

function DateStep({
  value,
  onPick,
  onBack,
  offerId,
}: {
  value: string;
  onPick: (d: string) => void;
  onBack: (() => void) | null;
  // null = keine Ausgebucht-Markierung (Anfrage-Modus).
  offerId: string | null;
}) {
  return (
    <div>
      <Calendar value={value} onSelect={onPick} offerId={offerId} />
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
function Calendar({
  value,
  onSelect,
  offerId,
}: {
  value: string;
  onSelect: (d: string) => void;
  offerId: string | null;
}) {
  const [today, setToday] = useState<Date | null>(null);
  const [view, setView] = useState<{ y: number; m: number } | null>(null);
  // Ausgebuchte Tage → durchgestrichen/gesperrt; geschlossene Tage (Wochentag
  // nicht verfügbar) → grau ausgedunkelt wie vergangene Tage. Während des
  // Ladens leer: Tage bleiben klickbar (die Zeitwahl fängt das ohnehin ab).
  const [volleTage, setVolleTage] = useState<Set<string>>(new Set());
  const [zuTage, setZuTage] = useState<Set<string>>(new Set());
  const [, startMonthLoad] = useTransition();

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

  // Ausgebuchte Tage des Monats laden (nur Termin-Modus, offerId gesetzt).
  const viewY = view?.y ?? null;
  const viewM = view?.m ?? null;
  useEffect(() => {
    if (!offerId || viewY === null || viewM === null) return;
    let abgebrochen = false;
    startMonthLoad(async () => {
      // Beim Monatswechsel zuerst zurücksetzen (keine veralteten Markierungen).
      setVolleTage(new Set());
      setZuTage(new Set());
      const res = await getMonthSlotAvailability(offerId, viewY, viewM + 1);
      if (!abgebrochen && 'volleTage' in res) {
        setVolleTage(new Set(res.volleTage));
        setZuTage(new Set(res.geschlosseneTage));
      }
    });
    return () => {
      abgebrochen = true;
    };
  }, [offerId, viewY, viewM]);

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
          // Ausgebucht: kein freier Slot mehr → durchgestrichen und gesperrt.
          const voll = !past && volleTage.has(ds);
          // Geschlossen (Wochentag nicht verfügbar): grau wie vergangene Tage.
          const zu = !past && !voll && zuTage.has(ds);
          const active = ds === value;
          const isToday = ds === todayStr;
          return (
            <button
              key={ds}
              type="button"
              className={`bookx-cal-day${active ? ' is-active' : ''}${isToday && !active ? ' is-today' : ''}${voll ? ' is-voll' : ''}`}
              disabled={past || voll || zu}
              aria-pressed={active}
              aria-label={`${d.getDate()}. ${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}${voll ? ' — ausgebucht' : zu ? ' — nicht verfügbar' : ''}`}
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
  // Vergebene Startzeiten: werden durchgestrichen angezeigt statt ausgeblendet.
  const [belegt, setBelegt] = useState<string[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [slotError, setSlotError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    setStatus('loading');
    setSlots([]);
    setBelegt([]);
    setSlotError(null);
    startTransition(async () => {
      const result = await getFreeSlots(offer.id, date);
      if ('error' in result) {
        setSlotError(result.error);
        setStatus('error');
      } else {
        setSlots(result.slots);
        setBelegt(result.belegt);
        setStatus('ready');
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Frei + vergeben gemischt in Zeit-Reihenfolge (wie eine echte Tagesagenda).
  const alleZeiten = [
    ...slots.map((t) => ({ time: t, frei: true })),
    ...belegt.map((t) => ({ time: t, frei: false })),
  ].sort((a, b) => a.time.localeCompare(b.time));

  return (
    <div>
      <Summary offer={offer} prefill={prefill} when={dateLabel(date)} />

      {status === 'loading' ? (
        <p className="bookx-hint">Freie Zeiten werden geladen …</p>
      ) : status === 'error' ? (
        <p className="bookx-hint err" role="alert">
          {slotError}
        </p>
      ) : alleZeiten.length === 0 ? (
        <p className="bookx-hint">Keine freien Zeiten an diesem Tag — bitte einen anderen Tag wählen.</p>
      ) : (
        <>
          <div className="bookx-times">
            {alleZeiten.map(({ time: slot, frei }) => {
              if (!frei) {
                // Vergeben: durchgestrichen, nicht klickbar.
                return (
                  <span
                    key={slot}
                    className="bookx-time is-taken"
                    aria-label={`${slot} — bereits vergeben`}
                  >
                    {slot}
                  </span>
                );
              }
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
          {slots.length === 0 ? (
            <p className="bookx-hint" style={{ marginTop: 10 }}>
              An diesem Tag ist schon alles vergeben — bitte wähle einen anderen Tag.
            </p>
          ) : null}
        </>
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
  anfrage,
  travelRule,
  contactPhone,
  date,
  time,
  formAction,
  pending,
  errorMsg,
  onBack,
}: {
  offer: Offer;
  prefill: BookingPrefill | null;
  anfrage: boolean;
  travelRule: TravelRule | null;
  contactPhone: string | null;
  date: string;
  time: string;
  formAction: (formData: FormData) => void;
  pending: boolean;
  errorMsg: string | null;
  onBack: () => void;
}) {
  const [showMsg, setShowMsg] = useState(false);
  const sf = resolveStandardFields(offer.standardFields);

  return (
    <form action={formAction}>
      <input type="hidden" name="offerId" value={offer.id} />
      {prefill ? <input type="hidden" name="token" value={prefill.token} /> : null}
      <input type="hidden" name="requestedDate" value={date} />
      <input type="hidden" name="requestedTime" value={time} />

      {/* Schneller Weg ganz oben: Wer lieber direkt schreibt/anruft, statt das
          Formular auszufüllen, findet hier prominent WhatsApp + Anruf. Das
          ausführliche Formular mit «Anfrage senden» bleibt unten erhalten. */}
      {anfrage && contactPhone ? (
        <div className="bookx-direct is-banner">
          <span className="bookx-direct-label">Lieber direkt bei Sandro melden?</span>
          <div className="bookx-direct-btns">
            <a
              className="bookx-btn bookx-btn-ghost"
              href={waLink(contactPhone, offer.name)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon />
              WhatsApp
            </a>
            <a className="bookx-btn bookx-btn-ghost" href={`tel:${contactPhone}`}>
              Anrufen
            </a>
          </div>
        </div>
      ) : null}

      <Summary
        offer={offer}
        prefill={prefill}
        when={anfrage ? `${dateLabel(date)} (Wunschtag)` : `${dateLabel(date)} · ${time}`}
      />

      {/* Bei Anfragen ohne Kalender ist die Beschreibung die wichtigste
          Orientierung (was ist drin, fuer wen) – Dauer gibt es hier nicht. */}
      {anfrage && offer.description ? (
        <p className="bookx-offer-desc">{offer.description}</p>
      ) : null}

      <div className="bookx-fields">
        {anfrage ? (
          <div className="bookx-field">
            <label htmlFor="message">Deine Idee — was für ein Shooting schwebt dir vor?</label>
            <textarea
              id="message"
              name="message"
              rows={4}
              required
              placeholder="Erzähl uns von deiner Idee: Art des Shootings, Ort, Anlass, Anzahl Personen …"
            />
          </div>
        ) : null}
        <div className="bookx-field">
          <label htmlFor="customerName">{sf.name.label}</label>
          <input id="customerName" name="customerName" type="text" required minLength={2} autoComplete="name" />
        </div>
        <div className="bookx-field">
          <label htmlFor="customerEmail">{sf.email.label}</label>
          <input id="customerEmail" name="customerEmail" type="email" required autoComplete="email" />
        </div>
        {sf.phone.visible ? (
          <div className="bookx-field">
            <label htmlFor="customerPhone">{sf.phone.label}</label>
            <input
              id="customerPhone"
              name="customerPhone"
              type="tel"
              required={sf.phone.required}
              minLength={6}
              autoComplete="tel"
            />
          </div>
        ) : null}
        {sf.location.visible ? (
          <div className="bookx-field">
            <label htmlFor="location">{sf.location.label}</label>
            {sf.location.mode === 'select' ? (
              <select id="location" name="location" required defaultValue="">
                <option value="" disabled>
                  Bitte wählen
                </option>
                {sf.location.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="location"
                name="location"
                type="text"
                autoComplete="off"
                placeholder={sf.location.placeholder}
              />
            )}
            {travelRule ? (
              <small className="bookx-travelnote">{travelRuleHint(travelRule)}</small>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="bookx-fields">
        <CustomFieldInputs fields={offer.customFields} wrapperClass="bookx-field" />
      </div>

      <div className="bookx-folds">
        {/* Im Anfrage-Modus ist das Ideen-Textfeld bereits sichtbar. */}
        {!anfrage && sf.message.visible ? (
          <div>
            <button
              type="button"
              className="bookx-fold-toggle"
              aria-expanded={showMsg}
              onClick={() => setShowMsg((v) => !v)}
            >
              <Chevron className="chev" />
              {sf.message.label}
            </button>
            {showMsg ? (
              <div className="bookx-fold-body">
                <textarea name="message" rows={2} placeholder={sf.message.placeholder} />
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Rabatt-Code nur ohne Einmal-Link anbieten (der hat schon einen Preis). */}
        {!prefill && sf.discount.visible ? (
          <DiscountCodeField offer={offer} label={sf.discount.label} />
        ) : null}
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

function DiscountCodeField({ offer, label }: { offer: Offer; label: string }) {
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
        {label}
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

// Im Termin-Modus wird kein persönlicher Rückruf versprochen: Der Termin gilt
// erst, wenn Sandro ihn bestätigt — dann kommt die Bestätigungs-Mail. Im
// Anfrage-Modus meldet sich Sandro persönlich; dort gibt es zusätzlich den
// direkten Draht (WhatsApp/Anruf), sofern CONTACT_PHONE gesetzt ist.
function SuccessStep({
  anfrage,
  offerName,
  contactPhone,
}: {
  anfrage: boolean;
  offerName: string | null;
  contactPhone: string | null;
}) {
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
        {anfrage
          ? 'Deine Anfrage ist angekommen. Sandro meldet sich in Kürze persönlich bei dir, um die Details zu besprechen.'
          : 'Deine Anfrage ist angekommen. Sobald Sandro deinen Wunschtermin bestätigt, erhältst du eine Bestätigung per E-Mail.'}
      </p>

      {anfrage && contactPhone ? (
        <div className="bookx-direct">
          <span className="bookx-direct-label">
            Du erreichst Sandro auch direkt unter {contactPhone}:
          </span>
          <div className="bookx-direct-btns">
            <a
              className="bookx-btn bookx-btn-ghost"
              href={waLink(contactPhone, offerName ?? 'ein Shooting')}
              target="_blank"
              rel="noopener noreferrer"
            >
              <WhatsAppIcon />
              WhatsApp
            </a>
            <a className="bookx-btn bookx-btn-ghost" href={`tel:${contactPhone}`}>
              Anrufen
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function WhatsAppIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12.04 2c-5.46 0-9.9 4.43-9.9 9.88 0 1.74.46 3.44 1.32 4.94L2 22l5.32-1.4c1.45.8 3.08 1.21 4.72 1.21 5.46 0 9.9-4.43 9.9-9.88 0-2.64-1.03-5.12-2.9-6.99A9.86 9.86 0 0 0 12.04 2Zm0 17.96c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.23 8.23 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.22-8.23 8.22Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.13-1.05-.39-2-1.23-.73-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.13-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.13.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.6.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.23-.16-.48-.29Z" />
    </svg>
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

'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';
import { useToast } from '@/components/ui/toast';
import { toggleDiscountAction, deleteDiscountAction } from '@/discounts/actions';
import { computeEffectivePrice, computeSaving } from '@/discounts/logic';
import { formatRappen } from '@/lib/money';
import type { Discount, Offer } from '@/db/schema';
import { CodeFormModal } from './code-form-modal';
import { LinkFormModal } from './link-form-modal';

interface DiscountsClientProps {
  codes: Discount[];
  links: Discount[];
  offers: Offer[];
}

// Wertbeschreibung wie „−25 %“ oder „−CHF 50“.
function valueLabel(d: Discount): string {
  if (d.valueType === 'percent') {
    return `−${d.value} %`;
  }
  return `−${formatRappen(d.value)}`;
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function DiscountsClient({ codes, links, offers }: DiscountsClientProps) {
  const { toast } = useToast();
  const [creatingCode, setCreatingCode] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [deleting, setDeleting] = useState<Discount | null>(null);

  // Origin erst clientseitig kennen (für vollständige Buchungs-URLs).
  // useSyncExternalStore liefert serverseitig '' und nach der Hydration den
  // echten Origin — ohne setState-im-Effect.
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  );

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(label);
    } catch {
      toast('Kopieren nicht möglich.');
    }
  }

  return (
    <>
      {/* ---- Rabatt-Codes ---- */}
      <div className="sec-head">
        <span className="ico" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M9 5H4a1 1 0 0 0-1 1v5l9.5 9.5a1.5 1.5 0 0 0 2 0l5-5a1.5 1.5 0 0 0 0-2L10 4" />
            <circle cx="7.5" cy="8.5" r="1.5" />
          </svg>
        </span>
        <div>
          <h2>Rabatt-Codes</h2>
          <div className="sub">
            Gutschein-Codes, die Kund:innen beim Buchen eingeben können.
          </div>
        </div>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => setCreatingCode(true)}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Code erstellen
        </button>
      </div>
      <div className="card">
        <div className="card-b" style={{ padding: '8px 22px' }}>
          {codes.length === 0 ? (
            <div className="empty">
              <h4>Noch keine Rabatt-Codes</h4>
              <p>Lege einen Gutschein-Code für die Buchungsstrecke an.</p>
            </div>
          ) : (
            <div className="codes">
              {codes.map((c) => (
                <CodeRow
                  key={c.id}
                  code={c}
                  offers={offers}
                  onCopy={copy}
                  onDelete={setDeleting}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ---- Persönliche Einmal-Links ---- */}
      <div className="sec-head">
        <span className="ico" aria-hidden="true">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
            <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
          </svg>
        </span>
        <div>
          <h2>Persönliche Einmal-Links</h2>
          <div className="sub">
            Individueller Buchungslink mit Sonderpreis für eine:n Kund:in — nur
            1× gültig.
          </div>
        </div>
        <div className="spacer" />
        <button className="btn btn-sm" onClick={() => setCreatingLink(true)}>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Link erstellen
        </button>
      </div>
      {links.length === 0 ? (
        <div className="card">
          <div className="card-b">
            <div className="empty">
              <h4>Noch keine Einmal-Links</h4>
              <p>Erstelle einen persönlichen Link mit individuellem Sonderpreis.</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="plinks">
          {links.map((l) => (
            <PlinkCard
              key={l.id}
              link={l}
              offers={offers}
              origin={origin}
              onCopy={copy}
              onDelete={setDeleting}
            />
          ))}
        </div>
      )}

      {creatingCode ? (
        <CodeFormModal offers={offers} onClose={() => setCreatingCode(false)} />
      ) : null}
      {creatingLink ? (
        <LinkFormModal offers={offers} onClose={() => setCreatingLink(false)} />
      ) : null}
      {deleting ? (
        <DeleteDiscountModal
          discount={deleting}
          onClose={() => setDeleting(null)}
        />
      ) : null}
    </>
  );
}

function CodeRow({
  code,
  offers,
  onCopy,
  onDelete,
}: {
  code: Discount;
  offers: Offer[];
  onCopy: (text: string, label: string) => void;
  onDelete: (d: Discount) => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const boundOffer = code.offerId
    ? offers.find((o) => o.id === code.offerId)
    : null;
  const bindingText = code.offerId
    ? boundOffer
      ? `Nur für ${boundOffer.name}`
      : 'Nur für ein bestimmtes Angebot'
    : 'Für alle Angebote';
  const validityText = code.validUntil
    ? `Gültig bis ${new Date(code.validUntil).toLocaleDateString('de-CH')}`
    : 'Unbegrenzt gültig';

  const limited = code.maxRedemptions != null;
  const pct = limited
    ? Math.min(100, Math.round((code.redemptionsUsed / code.maxRedemptions!) * 100))
    : 0;

  function handleToggle() {
    startTransition(async () => {
      const result = await toggleDiscountAction(code.id, !code.active);
      if ('ok' in result) {
        toast(code.active ? 'Code deaktiviert.' : 'Code aktiviert.');
      } else {
        toast(result.error);
      }
    });
  }

  return (
    <div className="code-row">
      <div className={`code-chip${code.active ? '' : ' off'}`}>
        {code.code}
        <button
          type="button"
          className="copy"
          onClick={() => onCopy(code.code ?? '', 'Code kopiert.')}
          aria-label="Code kopieren"
        >
          <CopyIcon />
        </button>
      </div>

      <div className="code-info">
        <div className="v">
          <span className="pct num">{valueLabel(code)}</span> Rabatt
        </div>
        <div className="s">
          {bindingText} · {validityText}
        </div>
      </div>

      <div className="redeem">
        <div className="lbl">
          <span>Eingelöst</span>
          <b className="num">
            {limited
              ? `${code.redemptionsUsed} / ${code.maxRedemptions}`
              : `${code.redemptionsUsed} ×`}
          </b>
        </div>
        <div className={`bar${code.active ? '' : ' off'}`}>
          <i style={{ width: limited ? `${pct}%` : '0%' }} />
        </div>
      </div>

      <div className="code-actions">
        <label className="toggle-wrap">
          <span className="switch">
            <input
              type="checkbox"
              checked={code.active}
              disabled={pending}
              onChange={handleToggle}
              aria-label={code.active ? 'Code deaktivieren' : 'Code aktivieren'}
            />
            <span className="slider" />
          </span>
          {code.active ? 'Aktiv' : 'Inaktiv'}
        </label>
        <button
          type="button"
          className="row-del"
          onClick={() => onDelete(code)}
          aria-label="Code löschen"
          title="Code löschen"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

function PlinkCard({
  link,
  offers,
  origin,
  onCopy,
  onDelete,
}: {
  link: Discount;
  offers: Offer[];
  origin: string;
  onCopy: (text: string, label: string) => void;
  onDelete: (d: Discount) => void;
}) {
  const offer = link.offerId ? offers.find((o) => o.id === link.offerId) : null;
  const redeemed = link.redemptionsUsed > 0;

  const effective = offer
    ? computeEffectivePrice(offer.priceRappen, {
        valueType: link.valueType,
        value: link.value,
      })
    : null;
  const saved = offer
    ? computeSaving(offer.priceRappen, {
        valueType: link.valueType,
        value: link.value,
      })
    : null;
  const savePct =
    offer && offer.priceRappen > 0 && saved != null
      ? Math.round((saved / offer.priceRappen) * 100)
      : null;

  const bookingUrl = link.token
    ? `${origin || ''}/book?l=${link.token}`
    : '';
  const displayUrl = bookingUrl.replace(/^https?:\/\//, '');

  return (
    <div className="plink">
      <div className="ph">
        <div className="grow">
          <div className="t">{link.label ?? 'Einmal-Link'}</div>
          <div className="s">{offer ? offer.name : 'Angebot nicht mehr verfügbar'}</div>
        </div>
        {redeemed ? (
          <span className="badge-status st-done">
            <span className="pip" />
            Eingelöst
          </span>
        ) : (
          <span className="badge-status st-new">
            <span className="pip" />
            Offen
          </span>
        )}
      </div>

      {offer && effective != null ? (
        <div className="pricing">
          <span className="old">{formatRappen(offer.priceRappen)}</span>
          <span className="arrow" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </span>
          <span className="new num">{formatRappen(effective)}</span>
          {savePct != null ? (
            <span className="save num">−{savePct} %</span>
          ) : null}
        </div>
      ) : null}

      <div className="urlbar">
        <svg
          viewBox="0 0 24 24"
          width="15"
          height="15"
          fill="none"
          stroke="var(--ink-3)"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
          <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
        </svg>
        <code>{displayUrl || 'Link wird geladen …'}</code>
        <button
          type="button"
          className="btn btn-sm"
          disabled={!bookingUrl}
          onClick={() => onCopy(bookingUrl, 'Link kopiert.')}
        >
          Kopieren
        </button>
      </div>

      <div className="foot">
        <span className="mut">
          {redeemed ? 'Link wurde verwendet' : 'Link 1× gültig'}
        </span>
        <button
          type="button"
          className="row-del"
          onClick={() => onDelete(link)}
          aria-label="Link löschen"
          title="Link löschen"
        >
          <TrashIcon />
        </button>
      </div>
    </div>
  );
}

function DeleteDiscountModal({
  discount,
  onClose,
}: {
  discount: Discount;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const isCode = discount.kind === 'code';
  const name = isCode
    ? (discount.code ?? 'Code')
    : (discount.label ?? 'Einmal-Link');
  const redeemed = discount.redemptionsUsed > 0;

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDiscountAction(discount.id);
      if ('ok' in result) {
        onClose();
        toast(isCode ? 'Code gelöscht.' : 'Link gelöscht.');
      } else {
        toast(result.error);
      }
    });
  }

  return (
    <div className="overlay">
      <div className="scrim" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true">
        <div className="modal-h">
          <div>
            <h3>{isCode ? 'Rabatt-Code löschen?' : 'Einmal-Link löschen?'}</h3>
            <div className="meta">{name}</div>
          </div>
          <button
            type="button"
            className="x"
            aria-label="Schliessen"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="modal-b">
          <p className="mut" style={{ fontSize: 13, lineHeight: 1.6 }}>
            {isCode
              ? 'Der Code wird endgültig entfernt und kann nicht mehr eingelöst werden.'
              : 'Der Link wird endgültig entfernt und ist nicht mehr aufrufbar.'}
          </p>
          {redeemed ? (
            <div className="note" style={{ marginTop: 12 }}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <path d="M12 9v4M12 17h.01" />
              </svg>
              <span>
                {isCode
                  ? `Dieser Code wurde bereits ${discount.redemptionsUsed}× eingelöst. `
                  : 'Dieser Link wurde bereits eingelöst. '}
                Der Einlöse-Verlauf geht verloren. Bereits getätigte Buchungen
                behalten ihren Preis, verlieren aber den Rabattbezug.
              </span>
            </div>
          ) : null}
        </div>

        <div className="modal-f">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClose}
            disabled={pending}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={handleDelete}
            disabled={pending}
          >
            {pending ? 'Wird gelöscht …' : 'Endgültig löschen'}
          </button>
        </div>
      </div>
    </div>
  );
}

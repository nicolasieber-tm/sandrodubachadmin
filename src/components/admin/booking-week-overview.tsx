'use client';

import { useEffect, useState, useTransition } from 'react';
import {
  getBookingWeekOverview,
  type WeekOverview,
  type WeekOverviewItem,
} from '@/bookings/week-overview-actions';
import { StatusBadge } from './status-badge';

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;

// Tag-Zahl ohne führende Null aus 'YYYY-MM-DD'.
function dayNum(iso: string): string {
  return String(Number(iso.split('-')[2]));
}

// Wochentag-Kürzel (Mo..So) aus einem ISO-Datum (App-Konvention 0=Montag).
function weekdayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return WD[(d.getDay() + 6) % 7];
}

interface Props {
  // Wunsch-/Termindatum der geöffneten Buchung (Anker für die Startwoche;
  // null bei Anfragen ohne Termin → aktuelle Woche).
  anchorDate: string | null;
}

// Kompakte Wochen-Belegung im Termin-Detail: Tagesleiste (Mo→So) mit
// Belegungs-Punkten + chronologische Terminliste der Woche. Vor/Zurück lädt die
// Nachbarwochen über eine read-only Server-Action nach. Zeigt die im Tool
// erfassten Termine – damit Sandro beim Telefonat sieht, wann er was hat und
// wo noch Platz ist.
export function BookingWeekOverview({ anchorDate }: Props) {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<WeekOverview | null>(null);
  const [pending, startLoad] = useTransition();

  useEffect(() => {
    startLoad(async () => {
      const res = await getBookingWeekOverview(anchorDate, offset);
      setData(res);
    });
  }, [anchorDate, offset]);

  // Buchungen pro Tag (für die Belegungs-Punkte in der Tagesleiste).
  const byDay = new Map<string, WeekOverviewItem[]>();
  if (data) {
    for (const it of data.items) {
      const list = byDay.get(it.date);
      if (list) list.push(it);
      else byDay.set(it.date, [it]);
    }
  }

  // Vor dem ersten Laden sieben Platzhalter-Spalten, damit das Layout nicht springt.
  const days = data?.days ?? Array.from({ length: 7 }, () => '');

  return (
    <div className="det-week">
      <div className="det-week-head">
        <span className="det-week-title">Wochenplan{data ? ` · ${data.rangeLabel}` : ''}</span>
        <span className="det-week-nav">
          <button
            type="button"
            onClick={() => setOffset((o) => o - 1)}
            disabled={pending}
            aria-label="Vorige Woche"
          >
            ‹
          </button>
          <button
            type="button"
            className="det-week-today"
            onClick={() => setOffset(0)}
            disabled={pending || offset === 0}
          >
            Heute
          </button>
          <button
            type="button"
            onClick={() => setOffset((o) => o + 1)}
            disabled={pending}
            aria-label="Nächste Woche"
          >
            ›
          </button>
        </span>
      </div>

      <div className={`det-week-bar${pending ? ' is-loading' : ''}`}>
        {days.map((day, i) => {
          const list = day ? byDay.get(day) ?? [] : [];
          const isToday = Boolean(data && day === data.today);
          return (
            <div
              key={day || i}
              className={`det-week-day${isToday ? ' is-today' : ''}${list.length ? ' is-busy' : ''}`}
            >
              <span className="wd">{WD[i]}</span>
              <span className="dn">{day ? dayNum(day) : '–'}</span>
              {list.length === 0 ? (
                <span className="free">frei</span>
              ) : (
                <span className="dots" aria-hidden="true">
                  {list.slice(0, 4).map((_, j) => (
                    <span key={j} className="dot" />
                  ))}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {data && data.items.length > 0 ? (
        <ul className="det-week-list">
          {data.items.map((it, i) => (
            <li key={`${it.date}-${it.time}-${i}`}>
              <span className="dwl-when num">
                {weekdayLabel(it.date)} {dayNum(it.date)}.{it.time ? ` · ${it.time}` : ''}
              </span>
              <span className="dwl-name">{it.name}</span>
              <StatusBadge status={it.status} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="det-week-none">
          {pending ? 'Lädt …' : 'Diese Woche sind keine Termine eingetragen.'}
        </p>
      )}
    </div>
  );
}

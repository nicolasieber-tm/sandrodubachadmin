'use client';

// Vollbild-Wochenplaner (/admin/planer): Zeitraster wie Google Calendar.
// - Termine als Blöcke (Farbe = Status), per Drag & Drop verschiebbar
//   (mit Bestätigung + optionaler Kunden-Mail).
// - Klick/Ziehen auf eine freie Fläche legt eine neue Buchung an
//   (NewBookingModal, Datum/Zeit vorbefüllt).
// - Planungsmodus (?booking=ID): eine Anfrage terminieren — Klick auf eine
//   freie Zeit schlägt den Slot vor, Bestätigung trägt ihn ein.
// - Graue Blöcke = Google-Belegung (nur Anzeige), Schattierung = ausserhalb
//   der Öffnungszeiten, rote Linie = jetzt.

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  getPlannerWeek,
  getPlannerBookingDetail,
  movePlannerBooking,
  finalizePlannedBooking,
  type PlannerWeek,
  type PlannerBooking,
  type PlannerBusy,
} from '@/bookings/planner-actions';
import type { BookingStatusValue } from '@/bookings/status';
import type { Booking, Offer } from '@/db/schema';
import { formatDauer } from '@/lib/duration';
import { useToast } from '@/components/ui/toast';
import { BookingDetailModal } from './booking-detail-modal';
import { NewBookingModal } from './new-booking-modal';

// Sichtbarer Zeitbereich und Raster. 1 Minute = 1px → 16 h = 960 px Grid.
const DAY_START = 6 * 60; // 06:00
const DAY_END = 22 * 60; // 22:00
const PX_PER_MIN = 1;
const SNAP = 15;
const DRAG_THRESHOLD_PX = 5;

const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] as const;
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'] as const;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toHHMM(min: number): string {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function snap(min: number): number {
  return Math.round(min / SNAP) * SNAP;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

// 'YYYY-MM-DD' → „Mi, 17. Jun".
function dayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${WD[(d.getDay() + 6) % 7]}, ${d.getDate()}. ${MONTHS[d.getMonth()]}`;
}

function statusClass(s: BookingStatusValue): string {
  if (s === 'bestaetigt') return 'pl-conf';
  if (s === 'erledigt') return 'pl-done';
  return 'pl-new';
}

// ----- Überlappungs-Layout: Spuren (lanes) pro Tag -----

interface DayItem {
  key: string;
  startMin: number;
  endMin: number;
  booking?: PlannerBooking; // ohne booking = Google-Belegung
}

interface LaidOutItem extends DayItem {
  lane: number;
  laneCount: number;
}

// Greedy-Spurzuteilung innerhalb transitiv überlappender Cluster, damit
// gleichzeitige Einträge nebeneinander statt übereinander liegen.
function layoutDay(items: DayItem[]): LaidOutItem[] {
  const sorted = [...items].sort(
    (a, b) => a.startMin - b.startMin || b.endMin - a.endMin,
  );
  const result: LaidOutItem[] = [];
  let cluster: LaidOutItem[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -1;

  function flush() {
    for (const it of cluster) it.laneCount = laneEnds.length;
    result.push(...cluster);
    cluster = [];
    laneEnds = [];
  }

  for (const it of sorted) {
    if (cluster.length > 0 && it.startMin >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= it.startMin);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(it.endMin);
    } else {
      laneEnds[lane] = it.endMin;
    }
    cluster.push({ ...it, lane, laneCount: 1 });
    clusterEnd = Math.max(clusterEnd, it.endMin);
  }
  flush();
  return result;
}

// ----- Komponente -----

// Im Planungsmodus zu terminierende Anfrage (vom Server aufgelöst).
export interface PlanningTarget {
  id: string;
  name: string;
  offerName: string;
  status: BookingStatusValue;
  date: string | null;
  time: string;
  // Aktuelle Gesamtdauer (Angebot + bestehende Zusatzminuten) — Default beim
  // einfachen Klick im Planungsmodus.
  durationMinutes: number;
  // Reine Angebotsdauer: Basis für die Zusatzminuten-Berechnung beim Aufziehen.
  baseDurationMinutes: number;
  // Vorbelegung für den Abschluss-Dialog (genauer Ort, interne Notizen).
  location: string;
  adminNote: string;
}

interface PlannerCalendarProps {
  initialWeek: PlannerWeek;
  // Anker der Woche (ISO) — bleibt fix, Navigation läuft über den Offset.
  anchor: string | null;
  offers: Offer[];
  planning: PlanningTarget | null;
}

interface DragState {
  id: string;
  name: string;
  status: BookingStatusValue;
  durationMinutes: number;
  grabOffsetMin: number;
  startClientX: number;
  startClientY: number;
  moved: boolean;
}

interface GhostState {
  dayIdx: number;
  startMin: number;
  durationMinutes: number;
}

interface PendingMove {
  id: string;
  name: string;
  status: BookingStatusValue;
  toDate: string;
  toTime: string;
  // Dauer des Blocks (Anzeige Von–Bis im Bestätigungs-Dialog).
  durationMinutes: number;
}

interface CreateDraft {
  date: string;
  time: string;
  endTime: string;
}

// Abschluss-Dialog des Planungsmodus: Zeit nochmals anpassbar, genauer Ort
// und interne Notizen — dann «Nur eintragen» oder «Eintragen & bestätigen».
interface FinalizeDraft {
  date: string;
  von: string;
  bis: string;
  ort: string;
  note: string;
  notify: boolean; // nur für bereits bestätigte Termine (Verschiebe-Mail)
}

export function PlannerCalendar({ initialWeek, anchor, offers, planning }: PlannerCalendarProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [offset, setOffset] = useState(0);
  const [week, setWeek] = useState<PlannerWeek>(initialWeek);
  const [loading, startLoad] = useTransition();
  const [saving, startSave] = useTransition();

  const [ghost, setGhost] = useState<GhostState | null>(null);
  // ID des gerade gezogenen Blocks (für das Ausgrauen der Quelle) — als State,
  // weil Refs während des Renderns nicht gelesen werden dürfen.
  const [dragId, setDragId] = useState<string | null>(null);
  const [selection, setSelection] = useState<GhostState | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [finalizeDraft, setFinalizeDraft] = useState<FinalizeDraft | null>(null);
  const [createDraft, setCreateDraft] = useState<CreateDraft | null>(null);
  const [detail, setDetail] = useState<Booking | null>(null);
  const [nowMin, setNowMin] = useState<number | null>(null);

  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const ghostRef = useRef<GhostState | null>(null);
  // Auswahl zusätzlich als Ref: der PointerUp-Handler liest sie synchron,
  // ohne Seiteneffekte in einen setState-Updater zu legen.
  const selectionRef = useRef<GhostState | null>(null);
  const createRef = useRef<{ dayIdx: number; anchorMin: number; moved: boolean; startClientY: number } | null>(null);

  function updateSelection(next: GhostState | null) {
    selectionRef.current = next;
    setSelection(next);
  }

  const loadWeek = useCallback(
    (nextOffset: number) => {
      startLoad(async () => {
        const data = await getPlannerWeek(anchor, nextOffset);
        setWeek(data);
      });
    },
    [anchor],
  );

  function goto(nextOffset: number) {
    setOffset(nextOffset);
    loadWeek(nextOffset);
  }

  // Jetzt-Linie: erst nach dem Mount (Browserzeit), dann minütlich nachführen.
  useEffect(() => {
    const update = () => {
      const d = new Date();
      setNowMin(d.getHours() * 60 + d.getMinutes());
    };
    const t = setTimeout(update, 0);
    const iv = setInterval(update, 60_000);
    return () => {
      clearTimeout(t);
      clearInterval(iv);
    };
  }, []);

  // Beim Start zu 08:00 scrollen (Arbeitsbeginn sichtbar statt 06:00).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = (8 * 60 - DAY_START) * PX_PER_MIN - 6;
  }, []);

  // ----- Geometrie-Helfer: Pointer-Position → Tag + Minuten -----

  function posFromPointer(clientX: number, clientY: number): { dayIdx: number; min: number } | null {
    const body = bodyRef.current;
    if (!body) return null;
    const rect = body.getBoundingClientRect();
    const dayW = rect.width / 7;
    const dayIdx = clamp(Math.floor((clientX - rect.left) / dayW), 0, 6);
    const min = DAY_START + (clientY - rect.top) / PX_PER_MIN;
    return { dayIdx, min };
  }

  // ----- Drag & Drop: bestehende Termine verschieben -----

  function onBlockPointerDown(e: React.PointerEvent, b: PlannerBooking) {
    if (b.status !== 'neu' && b.status !== 'bestaetigt') return;
    if (e.button !== 0) return;
    const pos = posFromPointer(e.clientX, e.clientY);
    if (!pos) return;
    dragRef.current = {
      id: b.id,
      name: b.name,
      status: b.status,
      durationMinutes: b.durationMinutes,
      grabOffsetMin: pos.min - toMinutes(b.time),
      startClientX: e.clientX,
      startClientY: e.clientY,
      moved: false,
    };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onBlockPointerMove(e: React.PointerEvent) {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved) {
      const dist = Math.hypot(e.clientX - drag.startClientX, e.clientY - drag.startClientY);
      if (dist < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      setDragId(drag.id);
    }
    const pos = posFromPointer(e.clientX, e.clientY);
    if (!pos) return;
    const startMin = clamp(
      snap(pos.min - drag.grabOffsetMin),
      DAY_START,
      DAY_END - drag.durationMinutes,
    );
    const next = { dayIdx: pos.dayIdx, startMin, durationMinutes: drag.durationMinutes };
    ghostRef.current = next;
    setGhost(next);
  }

  function onBlockPointerUp(b: PlannerBooking) {
    const drag = dragRef.current;
    const g = ghostRef.current;
    dragRef.current = null;
    ghostRef.current = null;
    setGhost(null);
    setDragId(null);
    if (!drag) return;

    if (!drag.moved) {
      // Klick: Termindetail öffnen.
      openDetail(b.id);
      return;
    }
    if (!g) return;
    const toDate = week.days[g.dayIdx];
    const toTime = toHHMM(g.startMin);
    if (toDate === b.date && toTime === b.time) return;
    setNotifyCustomer(drag.status === 'bestaetigt');
    setPendingMove({
      id: drag.id,
      name: drag.name,
      status: drag.status,
      toDate,
      toTime,
      durationMinutes: drag.durationMinutes,
    });
  }

  // ----- Klick/Ziehen auf freie Fläche: neue Buchung bzw. Anfrage planen -----

  function onColumnPointerDown(e: React.PointerEvent, dayIdx: number) {
    // Nur Termin-Blöcke fangen den Pointer selbst (Verschieben/Detail).
    // Google-Belegung und Schattierung sind reine Info: darüber darf frei
    // aufgezogen werden (volle Planungsfreiheit).
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('.pl-block')) return;
    const pos = posFromPointer(e.clientX, e.clientY);
    if (!pos) return;
    const anchorMin = clamp(snap(pos.min), DAY_START, DAY_END - SNAP);
    createRef.current = { dayIdx, anchorMin, moved: false, startClientY: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    updateSelection({
      dayIdx,
      startMin: anchorMin,
      durationMinutes: planning ? planning.durationMinutes : 60,
    });
  }

  function onColumnPointerMove(e: React.PointerEvent) {
    const cr = createRef.current;
    if (!cr) return;
    if (!cr.moved && Math.abs(e.clientY - cr.startClientY) < DRAG_THRESHOLD_PX) return;
    cr.moved = true;
    const pos = posFromPointer(e.clientX, e.clientY);
    if (!pos) return;
    const cur = clamp(snap(pos.min), DAY_START, DAY_END);
    const start = Math.min(cr.anchorMin, cur);
    const end = Math.max(cr.anchorMin, cur, start + SNAP);
    // Auch im Planungsmodus frei aufziehbar: die gezogene Länge bestimmt die
    // Termindauer (Mehrzeit landet beim Eintragen in den Zusatzminuten).
    updateSelection({
      dayIdx: cr.dayIdx,
      startMin: start,
      durationMinutes: end - start,
    });
  }

  function onColumnPointerUp() {
    const cr = createRef.current;
    createRef.current = null;
    const sel = selectionRef.current;
    updateSelection(null);
    if (!cr || !sel) return;

    const date = week.days[sel.dayIdx];
    const time = toHHMM(sel.startMin);
    if (planning) {
      // Planungsmodus: Abschluss-Dialog mit dem gewählten Slot öffnen
      // (Zeit dort nochmals anpassbar, plus genauer Ort und Notizen).
      setFinalizeDraft({
        date,
        von: time,
        bis: toHHMM(sel.startMin + sel.durationMinutes),
        ort: planning.location,
        note: planning.adminNote,
        notify: false,
      });
    } else {
      setCreateDraft({
        date,
        time,
        endTime: toHHMM(sel.startMin + sel.durationMinutes),
      });
    }
  }

  // ----- Aktionen -----

  function openDetail(id: string) {
    startLoad(async () => {
      const b = await getPlannerBookingDetail(id);
      if (b) setDetail(b);
      else toast('Buchung nicht gefunden.');
    });
  }

  // Blosses Verschieben per Drag & Drop (Dauer bleibt unangetastet).
  function confirmMove() {
    const move = pendingMove;
    if (!move) return;
    startSave(async () => {
      const res = await movePlannerBooking(move.id, move.toDate, move.toTime, notifyCustomer);
      if ('ok' in res) {
        setPendingMove(null);
        toast(
          notifyCustomer
            ? 'Termin verschoben – Kundin/Kunde wurde informiert.'
            : 'Termin verschoben (ohne Kunden-Mail).',
        );
        loadWeek(offset);
      } else {
        toast(res.error);
      }
    });
  }

  // Abschluss des Planungsmodus: eintragen, optional direkt bestätigen
  // (löst die Bestätigungs-Mail aus) bzw. Verschiebe-Mail für Bestätigte.
  function submitFinalize(confirm: boolean) {
    const draft = finalizeDraft;
    if (!draft || !planning) return;
    const mode = confirm ? 'save_confirm' : draft.notify ? 'save_notify' : 'save';
    startSave(async () => {
      const res = await finalizePlannedBooking(planning.id, {
        date: draft.date,
        vonTime: draft.von,
        bisTime: draft.bis,
        location: draft.ort,
        adminNote: draft.note,
        mode,
      });
      if ('ok' in res) {
        setFinalizeDraft(null);
        toast(
          confirm
            ? 'Termin bestätigt – Bestätigungs-Mail ist unterwegs.'
            : 'Termin eingetragen (noch nicht bestätigt).',
        );
        // Woche des neuen Termins direkt laden (der Anker-Prop ändert sich
        // erst mit dem Navigations-Rerender), dann Planungsmodus beenden.
        const data = await getPlannerWeek(draft.date, 0);
        setWeek(data);
        setOffset(0);
        router.replace(`/admin/planer?d=${draft.date}`);
      } else {
        toast(res.error);
      }
    });
  }

  // ----- Ableitungen fürs Rendering -----

  const gridHeight = (DAY_END - DAY_START) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = DAY_START; m < DAY_END; m += 60) hours.push(m);

  // Pro Tag: Blöcke (mit Zeit) + Google-Belegung in Spur-Layout.
  const laidOutByDay: LaidOutItem[][] = week.days.map((day, i) => {
    const items: DayItem[] = [];
    for (const b of week.bookings) {
      if (b.date !== day || b.time === '') continue;
      const start = toMinutes(b.time);
      items.push({
        key: `b-${b.id}`,
        startMin: start,
        endMin: start + b.durationMinutes,
        booking: b,
      });
    }
    const busy: PlannerBusy[] = week.googleBusy[day] ?? [];
    busy.forEach((iv, j) => {
      const start = toMinutes(iv.start);
      items.push({
        key: `g-${i}-${j}`,
        startMin: start,
        endMin: start + iv.durationMinutes,
      });
    });
    return layoutDay(items);
  });

  // Termine ohne Uhrzeit (Wunschtag) als Chips über dem Raster.
  const noTimeByDay: PlannerBooking[][] = week.days.map((day) =>
    week.bookings.filter((b) => b.date === day && b.time === ''),
  );
  const hasNoTimeRow = noTimeByDay.some((list) => list.length > 0);

  return (
    <div className="planner">
      {planning ? (
        <div className="planner-banner" role="status">
          <div className="planner-banner-text">
            <strong>Termin planen:</strong> {planning.name} · {planning.offerName}
            {planning.date ? (
              <span className="mut">
                {' '}
                — Wunsch: {dayLabel(planning.date)}
                {planning.time ? ` · ${planning.time}` : ''}
              </span>
            ) : null}
            <span className="planner-banner-hint">
              Klicke im Kalender auf eine freie Zeit, um den Termin zu setzen.
            </span>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => router.replace('/admin/planer')}
          >
            Planen beenden
          </button>
        </div>
      ) : null}

      <div className="planner-top">
        <div className="planner-range">
          <h1 className="planner-title">Planer</h1>
          <h2>{week.rangeLabel}</h2>
          {loading ? <span className="planner-loading">lädt…</span> : null}
        </div>
        <div className="planner-nav">
          <button type="button" onClick={() => goto(offset - 1)} aria-label="Vorige Woche">
            ‹
          </button>
          <button
            type="button"
            className="planner-nav-today"
            onClick={() => goto(0)}
            disabled={offset === 0}
          >
            Heute
          </button>
          <button type="button" onClick={() => goto(offset + 1)} aria-label="Nächste Woche">
            ›
          </button>
        </div>
      </div>

      <div className="planner-scroll" ref={scrollRef}>
        <div className="planner-inner">
          {/* Kopfzeile: Wochentage */}
          <div className="planner-headrow">
            <div className="planner-gutter-head" />
            {week.days.map((day, i) => {
              const isToday = day === week.today;
              return (
                <div key={day} className={`planner-dayhead${isToday ? ' is-today' : ''}`}>
                  <span className="wd">{WD[i]}</span>
                  <span className="dn num">{Number(day.split('-')[2])}</span>
                </div>
              );
            })}
          </div>

          {/* Chips: Termine ohne Uhrzeit */}
          {hasNoTimeRow ? (
            <div className="planner-allday">
              <div className="planner-gutter-head lbl">ohne Zeit</div>
              {week.days.map((day, i) => (
                <div key={day} className="planner-allday-col">
                  {noTimeByDay[i].map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      className={`planner-chip ${statusClass(b.status)}`}
                      title={`${b.name} · ${b.offerName} (ohne Zeit)`}
                      onClick={() => openDetail(b.id)}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ) : null}

          {/* Raster */}
          <div className="planner-bodyrow">
            <div className="planner-gutter" style={{ height: gridHeight }}>
              {hours.map((m) => (
                <span key={m} className="num" style={{ top: (m - DAY_START) * PX_PER_MIN }}>
                  {toHHMM(m)}
                </span>
              ))}
            </div>

            <div className="planner-body" ref={bodyRef} style={{ height: gridHeight }}>
              {week.days.map((day, dayIdx) => {
                const avail = week.availability[dayIdx];
                const isToday = day === week.today;
                const openMin = clamp(toMinutes(avail.startTime), DAY_START, DAY_END);
                const closeMin = clamp(toMinutes(avail.endTime), DAY_START, DAY_END);
                return (
                  <div
                    key={day}
                    className={`planner-col${isToday ? ' is-today' : ''}`}
                    onPointerDown={(e) => onColumnPointerDown(e, dayIdx)}
                    onPointerMove={onColumnPointerMove}
                    onPointerUp={onColumnPointerUp}
                  >
                    {/* Schattierung ausserhalb der Öffnungszeiten */}
                    {!avail.enabled ? (
                      <div className="pl-off" style={{ top: 0, height: gridHeight }} />
                    ) : (
                      <>
                        {openMin > DAY_START ? (
                          <div
                            className="pl-off"
                            style={{ top: 0, height: (openMin - DAY_START) * PX_PER_MIN }}
                          />
                        ) : null}
                        {closeMin < DAY_END ? (
                          <div
                            className="pl-off"
                            style={{
                              top: (closeMin - DAY_START) * PX_PER_MIN,
                              height: (DAY_END - closeMin) * PX_PER_MIN,
                            }}
                          />
                        ) : null}
                      </>
                    )}

                    {/* Blöcke: Termine + Google-Belegung */}
                    {laidOutByDay[dayIdx].map((it) => {
                      const top = (it.startMin - DAY_START) * PX_PER_MIN;
                      const height = Math.max((it.endMin - it.startMin) * PX_PER_MIN, 18);
                      const widthPct = 100 / it.laneCount;
                      const style: React.CSSProperties = {
                        top,
                        height,
                        left: `calc(${it.lane * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                      };
                      if (!it.booking) {
                        return (
                          <div key={it.key} className="pl-busy" style={style} title="Belegt (Google Kalender)">
                            {height >= 30 ? <span>Belegt</span> : null}
                          </div>
                        );
                      }
                      const b = it.booking;
                      const draggable = b.status === 'neu' || b.status === 'bestaetigt';
                      const isDragSource = dragId === b.id && ghost !== null;
                      return (
                        <div
                          key={it.key}
                          className={`pl-block ${statusClass(b.status)}${draggable ? ' is-draggable' : ''}${isDragSource ? ' is-dragging' : ''}`}
                          style={style}
                          title={`${b.time}–${toHHMM(it.endMin)} · ${b.name} · ${b.offerName}`}
                          onPointerDown={(e) => onBlockPointerDown(e, b)}
                          onPointerMove={onBlockPointerMove}
                          onPointerUp={() => onBlockPointerUp(b)}
                        >
                          <span className="t num">
                            {b.time}–{toHHMM(it.endMin)}
                          </span>
                          {height >= 34 ? <span className="n">{b.name}</span> : null}
                          {height >= 56 ? <span className="o">{b.offerName}</span> : null}
                        </div>
                      );
                    })}

                    {/* Ghost beim Verschieben */}
                    {ghost && ghost.dayIdx === dayIdx ? (
                      <div
                        className="pl-ghost"
                        style={{
                          top: (ghost.startMin - DAY_START) * PX_PER_MIN,
                          height: ghost.durationMinutes * PX_PER_MIN,
                        }}
                      >
                        <span className="num">
                          {toHHMM(ghost.startMin)}–{toHHMM(ghost.startMin + ghost.durationMinutes)}
                        </span>
                      </div>
                    ) : null}

                    {/* Auswahl beim Anlegen/Planen */}
                    {selection && selection.dayIdx === dayIdx ? (
                      <div
                        className="pl-select"
                        style={{
                          top: (selection.startMin - DAY_START) * PX_PER_MIN,
                          height: selection.durationMinutes * PX_PER_MIN,
                        }}
                      >
                        <span className="num">
                          {toHHMM(selection.startMin)}–
                          {toHHMM(selection.startMin + selection.durationMinutes)}
                        </span>
                      </div>
                    ) : null}

                    {/* Jetzt-Linie */}
                    {isToday && nowMin !== null && nowMin >= DAY_START && nowMin <= DAY_END ? (
                      <div
                        className="pl-now"
                        style={{ top: (nowMin - DAY_START) * PX_PER_MIN }}
                        aria-hidden="true"
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <p className="planner-legend mut">
        Ziehen verschiebt einen Termin · Klick auf eine freie Fläche legt einen neuen an ·
        grau = Google-Belegung / ausserhalb der Öffnungszeiten
      </p>

      {/* Bestätigung: Verschieben / Anfrage terminieren */}
      {pendingMove ? (
        <div className="overlay">
          <div className="scrim" onClick={() => setPendingMove(null)} />
          <div className="modal planner-confirm" role="dialog" aria-modal="true">
            <div className="modal-b">
              <h3 style={{ marginTop: 0 }}>Termin verschieben?</h3>
              <p style={{ fontSize: 14 }}>
                <strong>{pendingMove.name}</strong> auf{' '}
                <strong>
                  {dayLabel(pendingMove.toDate)} · {pendingMove.toTime}–
                  {toHHMM(toMinutes(pendingMove.toTime) + pendingMove.durationMinutes)}
                </strong>{' '}
                <span className="mut">({formatDauer(pendingMove.durationMinutes)})</span>
              </p>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
                <input
                  type="checkbox"
                  checked={notifyCustomer}
                  onChange={(e) => setNotifyCustomer(e.target.checked)}
                />
                Kundin/Kunde per E-Mail informieren
              </label>
            </div>
            <div className="modal-f">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={saving}
                onClick={() => setPendingMove(null)}
              >
                Abbrechen
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={saving}
                onClick={confirmMove}
              >
                Verschieben
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* Abschluss-Dialog des Planungsmodus: Zeit anpassen, genauer Ort,
          Notizen — dann nur eintragen oder direkt bestätigen (mit Mail). */}
      {finalizeDraft && planning ? (
        <div className="overlay">
          <div className="scrim" onClick={() => setFinalizeDraft(null)} />
          <div className="modal planner-finalize" role="dialog" aria-modal="true">
            <div className="modal-h">
              <div>
                <h3>{planning.name}</h3>
                <div className="meta">{planning.offerName} · Termin planen</div>
              </div>
              <button
                type="button"
                className="x"
                aria-label="Schliessen"
                onClick={() => setFinalizeDraft(null)}
              >
                ×
              </button>
            </div>
            <div className="modal-b">
              <div className="field">
                <label htmlFor="fin-date">Datum</label>
                <input
                  id="fin-date"
                  type="date"
                  value={finalizeDraft.date}
                  onChange={(e) =>
                    setFinalizeDraft({ ...finalizeDraft, date: e.target.value })
                  }
                />
              </div>
              <div className="field-2">
                <div className="field">
                  <label htmlFor="fin-von">Von</label>
                  <input
                    id="fin-von"
                    type="time"
                    value={finalizeDraft.von}
                    onChange={(e) =>
                      setFinalizeDraft({ ...finalizeDraft, von: e.target.value })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="fin-bis">Bis</label>
                  <input
                    id="fin-bis"
                    type="time"
                    value={finalizeDraft.bis}
                    onChange={(e) =>
                      setFinalizeDraft({ ...finalizeDraft, bis: e.target.value })
                    }
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="fin-ort">Genauer Ort</label>
                <input
                  id="fin-ort"
                  type="text"
                  placeholder="z. B. Studio Bern, Musterstrasse 12"
                  value={finalizeDraft.ort}
                  onChange={(e) =>
                    setFinalizeDraft({ ...finalizeDraft, ort: e.target.value })
                  }
                />
              </div>
              <div className="field">
                <label htmlFor="fin-note">Notizen (intern)</label>
                <textarea
                  id="fin-note"
                  rows={3}
                  placeholder="Nur für dich sichtbar — nie in Kundenmails."
                  value={finalizeDraft.note}
                  onChange={(e) =>
                    setFinalizeDraft({ ...finalizeDraft, note: e.target.value })
                  }
                />
              </div>
              {planning.status === 'bestaetigt' ? (
                <label
                  style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}
                >
                  <input
                    type="checkbox"
                    checked={finalizeDraft.notify}
                    onChange={(e) =>
                      setFinalizeDraft({ ...finalizeDraft, notify: e.target.checked })
                    }
                  />
                  Kundin/Kunde über die Änderung informieren
                </label>
              ) : null}
            </div>
            <div className="modal-f">
              <button
                type="button"
                className="btn btn-ghost"
                disabled={saving}
                onClick={() => setFinalizeDraft(null)}
              >
                Abbrechen
              </button>
              {planning.status === 'neu' ? (
                <>
                  <button
                    type="button"
                    className="btn"
                    disabled={saving}
                    onClick={() => submitFinalize(false)}
                  >
                    Nur eintragen
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={saving}
                    onClick={() => submitFinalize(true)}
                  >
                    Eintragen &amp; bestätigen
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={saving}
                  onClick={() => submitFinalize(false)}
                >
                  Speichern
                </button>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* Neue Buchung (Klick auf freie Fläche) */}
      {createDraft ? (
        <NewBookingModal
          offers={offers}
          defaultDate={createDraft.date}
          defaultTime={createDraft.time}
          defaultEndTime={createDraft.endTime}
          onClose={() => {
            setCreateDraft(null);
            loadWeek(offset);
          }}
        />
      ) : null}

      {/* Termindetail (Klick auf einen Block) */}
      {detail ? (
        <BookingDetailModal
          booking={detail}
          onClose={() => {
            setDetail(null);
            loadWeek(offset);
          }}
        />
      ) : null}
    </div>
  );
}

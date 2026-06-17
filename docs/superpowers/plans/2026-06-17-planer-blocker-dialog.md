# Planer-Blocker-Dialog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein einheitlicher Blocker-Dialog im Planer, in dem Sandro den Blocker benennen, die Zeit genauer eintragen und per Häkchen „Ganzer Tag" den ganzen Tag sperren kann.

**Architecture:** Reine Frontend-Erweiterung. Eine neue pure Helfer-Funktion baut aus dem Dialog-Entwurf den Action-Input (mit clientseitiger Bis-nach-Von-Prüfung); die bestehende Server-Action `createTimeBlockAction` und das Schema bleiben unverändert. Der Planer-Komponente werden ein `blockEditor`-State und ein Dialog hinzugefügt, die die bisherigen Sofort-Pfade (`chooseBlockRange`, `confirmDayBlock`/`pendingDayBlock`) ersetzen.

**Tech Stack:** Next.js 16 (Client Component), React 19, TypeScript, Zod 4, Vitest 4.

---

## File Structure

- **Create:** `src/time-blocks/editor.ts` — pure Funktion `buildBlockerInput(draft)`, baut den `TimeBlockInput` aus dem Dialog-Entwurf und validiert Bis>Von clientseitig.
- **Create:** `src/time-blocks/editor.test.ts` — Vitest-Tests für `buildBlockerInput`.
- **Modify:** `src/components/admin/planner-calendar.tsx` — `blockEditor`-State, Speicher-Handler, neuer Dialog, Datum-Klick & „Zeit blockieren" öffnen den Dialog, Balken zeigt `reason`. Entfernt `pendingDayBlock`/`confirmDayBlock` und die Sofort-Logik von `chooseBlockRange`.
- **Modify:** `src/app/globals.css` — dezentes Ausgrauen der deaktivierten Von/Bis-Felder.

---

## Task 1: Pure Helfer `buildBlockerInput`

**Files:**
- Create: `src/time-blocks/editor.ts`
- Test: `src/time-blocks/editor.test.ts`

- [ ] **Step 1: Write the failing test**

`src/time-blocks/editor.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildBlockerInput } from './editor';

describe('buildBlockerInput', () => {
  it('ganztägig: leere Zeiten, Name getrimmt', () => {
    const r = buildBlockerInput({ date: '2026-06-17', von: '09:00', bis: '17:00', name: '  Ferien  ', wholeDay: true });
    expect(r).toEqual({ ok: true, input: { blockDate: '2026-06-17', startTime: null, endTime: null, reason: 'Ferien' } });
  });

  it('ganztägig ohne Name: reason null', () => {
    const r = buildBlockerInput({ date: '2026-06-17', von: '09:00', bis: '17:00', name: '   ', wholeDay: true });
    expect(r).toEqual({ ok: true, input: { blockDate: '2026-06-17', startTime: null, endTime: null, reason: null } });
  });

  it('Zeitfenster: Von/Bis gesetzt, Name übernommen', () => {
    const r = buildBlockerInput({ date: '2026-06-17', von: '09:00', bis: '12:30', name: 'Arzt', wholeDay: false });
    expect(r).toEqual({ ok: true, input: { blockDate: '2026-06-17', startTime: '09:00', endTime: '12:30', reason: 'Arzt' } });
  });

  it('Zeitfenster mit Bis = Von: Fehler', () => {
    const r = buildBlockerInput({ date: '2026-06-17', von: '09:00', bis: '09:00', name: '', wholeDay: false });
    expect(r).toEqual({ ok: false, error: 'Die End-Zeit muss nach der Start-Zeit liegen.' });
  });

  it('Zeitfenster mit Bis vor Von: Fehler', () => {
    const r = buildBlockerInput({ date: '2026-06-17', von: '14:00', bis: '13:00', name: '', wholeDay: false });
    expect(r).toEqual({ ok: false, error: 'Die End-Zeit muss nach der Start-Zeit liegen.' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/time-blocks/editor.test.ts`
Expected: FAIL — `buildBlockerInput` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

`src/time-blocks/editor.ts`:

```ts
// Baut aus dem Blocker-Dialog-Entwurf den Action-Input. Pure (KEIN server-only):
// wird in der Client-Komponente genutzt. Spiegelt die Bis>Von-Regel des Schemas
// für eine frühe, klare Fehlermeldung; die Server-Action validiert erneut.
import { hhmmToMinutes } from './logic';
import type { TimeBlockInput } from './input';

export interface BlockerDraft {
  date: string;
  von: string;
  bis: string;
  name: string;
  wholeDay: boolean;
}

export type BuildResult = { ok: true; input: TimeBlockInput } | { ok: false; error: string };

export function buildBlockerInput(draft: BlockerDraft): BuildResult {
  const reason = draft.name.trim() === '' ? null : draft.name.trim();
  if (draft.wholeDay) {
    return { ok: true, input: { blockDate: draft.date, startTime: null, endTime: null, reason } };
  }
  if (hhmmToMinutes(draft.bis) <= hhmmToMinutes(draft.von)) {
    return { ok: false, error: 'Die End-Zeit muss nach der Start-Zeit liegen.' };
  }
  return { ok: true, input: { blockDate: draft.date, startTime: draft.von, endTime: draft.bis, reason } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/time-blocks/editor.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/time-blocks/editor.ts src/time-blocks/editor.test.ts
git commit -m "feat(time-blocks): buildBlockerInput — Dialog-Entwurf zu Action-Input"
```

---

## Task 2: Blocker-Dialog in der Planer-Komponente

**Files:**
- Modify: `src/components/admin/planner-calendar.tsx`

Diese Komponente ist eine Client Component mit Pointer-Logik; sie wird nicht über Vitest getestet (wie die bisherigen Planer-UI-Aufgaben). Verifikation erfolgt über `npm run build` (Task 3) und die manuelle Beta-Prüfung.

- [ ] **Step 1: Import des Helfers ergänzen**

In `src/components/admin/planner-calendar.tsx`, direkt nach dem bestehenden Import der Time-Block-Actions (Zeile 30):

```ts
import { createTimeBlockAction, deleteTimeBlockAction } from '@/time-blocks/actions';
import { buildBlockerInput, type BlockerDraft } from '@/time-blocks/editor';
```

- [ ] **Step 2: State umstellen — `blockEditor` statt `pendingDayBlock`**

Ersetze die Zeile (aktuell ~217):

```ts
  // Tag, für den „ganzer Tag blockieren?" bestätigt werden soll.
  const [pendingDayBlock, setPendingDayBlock] = useState<string | null>(null);
```

durch:

```ts
  // Blocker-Dialog (Aufziehen → „Zeit blockieren" ODER Datum-Klick).
  const [blockEditor, setBlockEditor] = useState<BlockerDraft | null>(null);
```

`const [blockChoice, setBlockChoice] = useState<CreateDraft | null>(null);` (Zeile ~215) bleibt unverändert.

- [ ] **Step 3: Handler `chooseBlockRange` → Dialog öffnen; `confirmDayBlock` ersetzen**

Ersetze die beiden bestehenden Funktionen `chooseBlockRange` (~437–455) und `confirmDayBlock` (~457–476) durch:

```ts
  // Auswahl „Zeit blockieren" → Blocker-Dialog mit der gezogenen Zeit öffnen.
  function chooseBlockRange() {
    const c = blockChoice;
    if (!c) return;
    setBlockChoice(null);
    setBlockEditor({ date: c.date, von: c.time, bis: c.endTime, name: '', wholeDay: false });
  }

  // Dialog speichern → bestehende Action mit dem gebauten Input.
  function submitBlock() {
    const draft = blockEditor;
    if (!draft) return;
    const built = buildBlockerInput(draft);
    if (!built.ok) {
      toast(built.error);
      return;
    }
    startSave(async () => {
      const res = await createTimeBlockAction(built.input);
      if ('ok' in res) {
        setBlockEditor(null);
        toast(draft.wholeDay ? 'Ganzer Tag blockiert.' : 'Zeit blockiert.');
        loadWeek(offset);
      } else {
        toast(res.error);
      }
    });
  }
```

- [ ] **Step 4: Datum-Klick öffnet den Dialog (ganztägig vorbelegt)**

Ersetze im Tages-Kopf (`planner-dayhead`, ~644) das `onClick`:

```ts
                  onClick={planning ? undefined : () => setPendingDayBlock(day)}
```

durch:

```ts
                  onClick={
                    planning
                      ? undefined
                      : () => setBlockEditor({ date: day, von: '09:00', bis: '17:00', name: '', wholeDay: true })
                  }
```

- [ ] **Step 5: Balken zeigt den Namen, falls gesetzt**

In der Blocker-Schleife (~724–756) das sichtbare Label um `reason` erweitern. Ersetze den `<span>{label}</span>` durch den Namen, wenn vorhanden, und nimm die Zeitspanne in den Tooltip. Konkret: ersetze den Block-Render (ab `const label = ...` bis zum schließenden `</div>` des `.pl-blocked`) durch:

```tsx
                      const label = blk.wholeDay
                        ? 'Ganzer Tag blockiert'
                        : `Blockiert ${blk.start}–${toHHMM(toMinutes(blk.start) + blk.durationMinutes)}`;
                      const shown = blk.reason ?? label;
                      return (
                        <div
                          key={`blk-${blk.id}`}
                          className="pl-blocked"
                          style={{ top, height }}
                          title={blk.reason ? `${blk.reason} · ${label}` : label}
                        >
                          <span>{shown}</span>
                          <button
                            type="button"
                            className="pl-blocked-x"
                            aria-label="Blocker entfernen"
                            disabled={saving}
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeBlock(blk.id);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      );
```

- [ ] **Step 6: Neuen Dialog rendern, alten `pendingDayBlock`-Dialog entfernen**

Ersetze den gesamten `pendingDayBlock`-Block (das JSX `{pendingDayBlock ? ( … ) : null}`, ~1060–1081) durch den neuen Blocker-Dialog:

```tsx
      {/* Blocker-Dialog: benennen, Zeit anpassen, ganzer Tag */}
      {blockEditor ? (
        <div className="overlay">
          <div className="scrim" onClick={() => setBlockEditor(null)} />
          <div className="modal planner-finalize" role="dialog" aria-modal="true">
            <div className="modal-h">
              <div>
                <h3>Zeit blockieren</h3>
                <div className="meta">{dayLabel(blockEditor.date)}</div>
              </div>
              <button type="button" className="x" aria-label="Schliessen" onClick={() => setBlockEditor(null)}>
                ×
              </button>
            </div>
            <div className="modal-b">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, marginBottom: 4 }}>
                <input
                  type="checkbox"
                  checked={blockEditor.wholeDay}
                  onChange={(e) => setBlockEditor({ ...blockEditor, wholeDay: e.target.checked })}
                />
                Ganzer Tag blockieren
              </label>
              <div className="field-2">
                <div className="field">
                  <label htmlFor="blk-von">Von</label>
                  <input
                    id="blk-von"
                    type="time"
                    value={blockEditor.von}
                    disabled={blockEditor.wholeDay}
                    onChange={(e) => setBlockEditor({ ...blockEditor, von: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="blk-bis">Bis</label>
                  <input
                    id="blk-bis"
                    type="time"
                    value={blockEditor.bis}
                    disabled={blockEditor.wholeDay}
                    onChange={(e) => setBlockEditor({ ...blockEditor, bis: e.target.value })}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="blk-name">Name (optional)</label>
                <input
                  id="blk-name"
                  type="text"
                  maxLength={200}
                  placeholder="z. B. Ferien, Arzttermin"
                  value={blockEditor.name}
                  onChange={(e) => setBlockEditor({ ...blockEditor, name: e.target.value })}
                />
              </div>
            </div>
            <div className="modal-f">
              <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setBlockEditor(null)}>
                Abbrechen
              </button>
              <button type="button" className="btn btn-primary" disabled={saving} onClick={submitBlock}>
                Sperren
              </button>
            </div>
          </div>
        </div>
      ) : null}
```

- [ ] **Step 7: Build prüfen**

Run: `npm run build`
Expected: Build erfolgreich, keine TypeScript-Fehler. (Die vorbestehenden `react-hooks/set-state-in-effect`-Lint-Warnungen in `booking-flow.tsx` sind unverändert und blockieren den Build nicht.)

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/planner-calendar.tsx
git commit -m "feat(planer): Blocker-Dialog — benennen, Zeit anpassen, ganzer Tag"
```

---

## Task 3: CSS für deaktivierte Felder + Abschluss-Check

**Files:**
- Modify: `src/app/globals.css`

- [ ] **Step 1: Deaktivierte Von/Bis-Felder dezent ausgrauen**

Suche in `src/app/globals.css` den Abschnitt mit den `.field input`-Stilen (Eingabefelder der Planer-Dialoge). Ergänze direkt danach folgende Regel (falls noch keine generische `:disabled`-Regel für diese Felder existiert):

```css
/* Blocker-Dialog: Von/Bis sind bei „Ganzer Tag" deaktiviert. */
.field input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

Falls bereits eine `input:disabled`-Regel mit gleichwertigem Effekt existiert, diesen Schritt überspringen und das im Commit vermerken.

- [ ] **Step 2: Tests + Build gesamthaft prüfen**

Run: `npx vitest run && npm run build`
Expected: Alle Tests grün (inkl. der 5 neuen aus Task 1), Build erfolgreich.

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "style(planer): deaktivierte Von/Bis-Felder im Blocker-Dialog ausgrauen"
```

---

## Self-Review (vom Plan-Autor durchgeführt)

**Spec-Abdeckung:**
- Blocker benennen → Task 1 (`reason`-Bau) + Task 2 (Name-Feld, Balken-Label). ✓
- Zeit genauer eintragen → Task 2 (Von/Bis-Felder, vorbefüllt aus Aufziehen). ✓
- Häkchen „Ganzer Tag" → Task 2 (Checkbox, deaktiviert Von/Bis) + Task 1 (leere Zeiten) + Task 3 (Ausgrauen). ✓
- Zwei Einstiegspunkte, ein Dialog → Task 2 (`chooseBlockRange` öffnet Dialog; Datum-Klick öffnet Dialog ganztägig). ✓
- Bis>Von-Validierung mit Fehler-Toast → Task 1 (`buildBlockerInput`) + Task 2 (`submitBlock` toastet). ✓
- Keine Server-/DB-Änderung → kein Task berührt Schema/Repository/Action. ✓

**Platzhalter:** keine.

**Typ-Konsistenz:** `BlockerDraft` (Task 1) wird in Task 2 identisch verwendet (`date/von/bis/name/wholeDay`); `buildBlockerInput` liefert `{ ok; input }`/`{ ok: false; error }`, in `submitBlock` so behandelt; `createTimeBlockAction` erhält den `TimeBlockInput` aus `built.input`. ✓

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

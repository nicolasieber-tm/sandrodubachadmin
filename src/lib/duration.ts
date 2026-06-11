// Formatiert eine Dauer in Minuten fuer die Anzeige (Admin + Buchungs-Widget),
// z. B. 45 -> «45 Min.», 60 -> «1 Std.», 90 -> «1 Std. 30 Min.».
// Ersetzt das frueher manuell gepflegte Freitext-Feld durationLabel.
export function formatDauer(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} Min.`;
  if (m === 0) return `${h} Std.`;
  return `${h} Std. ${m} Min.`;
}

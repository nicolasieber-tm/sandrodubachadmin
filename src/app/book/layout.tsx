import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Termin buchen · Sandro Dubach Fotografie',
};

/**
 * Schlanker Rahmen für die öffentliche Buchungsstrecke. Bewusst OHNE Admin-Shell
 * (kein Topbar, keine Tabs). Warmer, weicher Cremehintergrund, der die gesamte
 * Overlay-Innenfläche füllt und sauber in ein iframe auf der Hauptwebsite passt.
 *
 * minHeight 100dvh: Das iframe hat eine feste, bildschirmabhängige Höhe (siehe
 * embed.js). Bei kurzen Schritten (Uhrzeit, Erfolg) füllt der Cremehintergrund so
 * trotzdem den ganzen Frame – kein Farbbruch zum dahinterliegenden Body. Bei
 * langen Schritten wächst der Inhalt darüber hinaus und wird im iframe gescrollt.
 * boxSizing border-box: padding zählt in die 100dvh, sonst entstünde minimaler
 * Dauer-Scroll.
 */
export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        minHeight: '100dvh',
        boxSizing: 'border-box',
        padding: '22px 16px 30px',
        background: 'linear-gradient(180deg, #fdf6ee 0%, #fbf1e6 100%)',
      }}
    >
      {children}
    </div>
  );
}

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Termin buchen · Sandro Dubach Fotografie',
};

/**
 * Schlanker Rahmen für die öffentliche Buchungsstrecke. Bewusst OHNE Admin-Shell
 * (kein Topbar, keine Tabs). Warmer, weicher Cremehintergrund, der die gesamte
 * Overlay-Innenfläche füllt und sauber in ein iframe auf der Hauptwebsite passt.
 */
export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '22px 16px 30px',
        background: 'linear-gradient(180deg, #fdf6ee 0%, #fbf1e6 100%)',
      }}
    >
      {children}
    </div>
  );
}

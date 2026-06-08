import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Termin buchen · Sandro Dubach Fotografie',
};

/**
 * Schlanker Rahmen für die öffentliche Buchungsstrecke. Bewusst OHNE Admin-Shell
 * (kein Topbar, keine Tabs). Heller, transparenter Hintergrund, damit die Seite
 * auch sauber in ein iframe auf der Hauptwebsite passt.
 */
export default function BookLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        padding: '20px 16px 28px',
        background: 'transparent',
      }}
    >
      {children}
    </div>
  );
}

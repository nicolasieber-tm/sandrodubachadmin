import type { Metadata } from 'next';
import { Public_Sans } from 'next/font/google';
import './globals.css';

// Eine einzige Schrift für alles – wie auf sandrodubach.ch. Public Sans ist eine
// Variable Font, daher decken wir die ganze Gewichtsbreite (300–700) mit einer
// Weight-Range ab. CSS-Variable wird in globals.css überall referenziert.
const publicSans = Public_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-public-sans',
});

export const metadata: Metadata = { title: 'Sandro Dubach · Adminbereich' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={publicSans.variable}>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}

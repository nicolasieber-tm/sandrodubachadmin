'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV_ITEMS = [
  { label: 'Dashboard',         href: '/admin' },
  { label: 'Termine',           href: '/admin/termine' },
  { label: 'Planer',            href: '/admin/planer' },
  { label: 'Angebote & Preise', href: '/admin/angebote' },
  { label: 'Kalender',          href: '/admin/kalender' },
  { label: 'E-Mails',           href: '/admin/emails' },
] as const;

export function AdminTabs() {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === '/admin') return pathname === '/admin';
    return pathname.startsWith(href);
  }

  return (
    <nav
      className="tabs"
      aria-label="Hauptnavigation"
      style={{
        background: 'rgba(255,255,255,.86)',
        backdropFilter: 'saturate(1.4) blur(14px)',
        borderBottom: '1px solid var(--line)',
        padding: '0 28px',
        display: 'flex',
        gap: '2px',
        position: 'sticky',
        top: '64px',
        zIndex: 39,
      }}
    >
      {NAV_ITEMS.map(({ label, href }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            className={`tab${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
            style={{
              border: 'none',
              background: 'none',
              padding: '15px 16px 14px',
              fontSize: '14px',
              color: active ? 'var(--accent-deep)' : 'var(--ink-2)',
              fontWeight: active ? 600 : 500,
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              position: 'relative',
              marginBottom: '-1px',
              transition: 'color .18s var(--ease)',
              textDecoration: 'none',
            }}
          >
            {label}
            {/* Unterstrich-Indikator */}
            <span
              style={{
                position: 'absolute',
                left: '16px',
                right: '16px',
                bottom: '-1px',
                height: '2px',
                borderRadius: '2px 2px 0 0',
                background: 'var(--accent)',
                transform: active ? 'scaleX(1)' : 'scaleX(0)',
                transformOrigin: 'center',
                transition: 'transform .26s var(--ease-out)',
              }}
            />
          </Link>
        );
      })}
    </nav>
  );
}

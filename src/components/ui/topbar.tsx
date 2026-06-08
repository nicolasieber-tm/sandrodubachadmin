import { logoutAction } from '@/auth/actions';

interface TopbarProps {
  email: string;
}

function initials(email: string): string {
  // Nimm die ersten zwei Buchstaben vor dem @, Grossschreibung
  const name = email.split('@')[0] ?? email;
  const parts = name.split(/[.\-_]/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

export function Topbar({ email }: TopbarProps) {
  return (
    <header
      style={{
        height: '64px',
        background: 'rgba(255,255,255,.86)',
        backdropFilter: 'saturate(1.4) blur(14px)',
        borderBottom: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        position: 'sticky',
        top: 0,
        zIndex: 40,
      }}
    >
      {/* Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '13px' }}>
        <div
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '10px',
            flexShrink: 0,
            background: 'linear-gradient(150deg,#2a2e35,#15171b)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '13px',
            letterSpacing: '.03em',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.12),0 2px 8px -2px rgba(0,0,0,.4)',
          }}
        >
          SD
        </div>
        <div>
          <span style={{ fontWeight: 600, fontSize: '15.5px', letterSpacing: '-0.01em' }}>
            Sandro Dubach
          </span>
          <span style={{ color: 'var(--ink-4)', margin: '0 5px' }}>·</span>
          <span style={{ color: 'var(--ink-3)', fontSize: '12.5px', fontWeight: 500 }}>
            Adminbereich
          </span>
        </div>
      </div>

      {/* Rechts: Avatar + Abmelden */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        {/* Avatar */}
        <div
          title={email}
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '11px',
            flexShrink: 0,
            background: 'linear-gradient(150deg,#ef8a44,#d9631f)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 600,
            fontSize: '13px',
            boxShadow: 'inset 0 1px 0 rgba(255,255,255,.25),0 2px 8px -3px rgba(217,99,31,.6)',
          }}
        >
          {initials(email)}
        </div>

        {/* Logout via Server Action */}
        <form action={logoutAction}>
          <button
            type="submit"
            className="btn btn-ghost btn-sm"
          >
            Abmelden
          </button>
        </form>
      </div>
    </header>
  );
}
